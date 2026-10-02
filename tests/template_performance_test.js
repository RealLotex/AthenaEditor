import { assert, assertEquals, assertAlmostEquals } from "jsr:@std/assert@1";
import { load, PURE_MODULES } from "./_load.js";
const A = await load([...PURE_MODULES, "templates/assets.js", "templates/firstperson.js",
  "templates/thirdperson.js", "templates/sidescroller.js", "templates/topdown.js", "templates/registry.js"]);
const Pads = Object.fromEntries(["LEFT", "RIGHT", "UP", "DOWN", "CROSS", "SQUARE", "L1", "R1"].map((key, i) => [key, 1 << i]));

function controller(id) {
  const project = A.PROJECT_TEMPLATES.find(t => t.id === id).make();
  let position = [0, .5, 0], velocity = [0, 0, 0], rotation = { x: 0, y: 0, z: 0 };
  const allocations = new Set(), camera = {}, calls = { trig: 0, turns: 0 };
  const body = { getPosition: () => position, getLinearVel: () => velocity,
    setLinearVel: (...v) => { velocity = v; }, setPosition: (...p) => { position = p; } };
  const view = { get position() { return { x: position[0], y: position[1], z: position[2] }; },
    set rotation(value) { allocations.add(value); calls.turns++; rotation = { ...value }; } };
  const math = Object.create(Math);
  for (const key of ["sin", "cos", "atan2"]) math[key] = (...args) => { calls.trig++; return Math[key](...args); };
  const ctx = { dt: .016, player: {}, physics: { bodies: { player: body } }, RenderObjects: { player: view } };
  const module = new Function("Pads", "Camera", "Math", project.scripts[0].content.replace(/^export /gm, "") + "\nreturn {init,update};")(Pads,
    { target: (...p) => { camera.target = p; }, position: (...p) => { camera.position = p; } }, math);
  module.init(ctx);
  return { ctx, calls, allocations, camera, velocity: () => velocity, rotation: () => rotation,
    setPosition: p => { position = p; }, setVelocity: v => { velocity = v; },
    tick: ({ lx = 0, ly = 0, rx = 0, ry = 0, held = [], pressed = [], ground = false, ceiling = false } = {}) => {
      ctx.player.lastHitNormal = ground || ceiling ? [0, 1, 0] : null;
      ctx.player.lastHitPosition = ground ? [0, 0, 0] : ceiling ? [0, 1, 0] : null;
      module.update(ctx, { lx, ly, rx, ry, pressed: b => held.includes(b), justPressed: b => pressed.includes(b) });
    } };
}

Deno.test("top-down stick and D-pad move and face screen-up, with bounded diagonal speed", () => {
  const r = controller("top-down");
  for (const input of [{ ly: -127 }, { held: [Pads.UP] }]) {
    for (let i = 0; i < 80; i++) r.tick(input);
    assertAlmostEquals(r.velocity()[2], -6);
    assert(Math.cos(r.rotation().y) < -.999);
  }
  r.tick({ lx: 128, ly: -128 });
  assertAlmostEquals(Math.hypot(r.velocity()[0], r.velocity()[2]), 6);
});

Deno.test("camera-relative controllers clamp stick extremes and cache steady camera trigonometry", () => {
  for (const id of ["first-person", "third-person"]) {
    const r = controller(id);
    r.tick({ lx: 128 });
    const count = r.calls.trig;
    for (let i = 0; i < 100; i++) r.tick({ lx: 128 });
    assertEquals(r.calls.trig, count, id);
    assertAlmostEquals(Math.hypot(r.velocity()[0], r.velocity()[2]), r.ctx.player.speed);
    r.ctx.player.yaw = Math.PI / 2;
    r.tick({ ly: -127 });
    assert(r.velocity()[0] < -4, id);
    assert(r.calls.trig > count);
    if (id === "third-person") {
      r.ctx.player.camDistance = 12;
      r.tick();
      assertAlmostEquals(Math.hypot(...r.camera.position.map((v, i) => v - r.camera.target[i])), 12);
    }
  }
});

Deno.test("third-person and top-down settle their turn and reuse one rotation object", () => {
  for (const id of ["third-person", "top-down"]) {
    const r = controller(id);
    for (let i = 0; i < 100; i++) r.tick({ lx: 127 });
    assertAlmostEquals(r.rotation().y, Math.PI / 2, .0011);
    const turns = r.calls.turns, trig = r.calls.trig;
    for (let i = 0; i < 100; i++) r.tick({ lx: 127 });
    assertEquals(r.calls.turns, turns, id);
    assertEquals(r.calls.trig, trig, id);
    assertEquals(r.allocations.size, 1, id);
    for (let i = 0; i < 100; i++) r.tick({ lx: -127 });
    assertAlmostEquals(r.rotation().y, -Math.PI / 2, .0011);
  }
});

Deno.test("first/third-person jumps buffer landing, tolerate an edge and reject ceiling/double jumps", () => {
  for (const id of ["first-person", "third-person"]) {
    const r = controller(id);
    r.tick({ pressed: [Pads.CROSS] });
    assertEquals(r.velocity()[1], 0);
    r.tick({ ground: true });
    assertEquals(r.velocity()[1], r.ctx.player.jumpSpeed, id);
    r.tick({ ground: true, pressed: [Pads.CROSS] });
    assertEquals(r.ctx.player.grounded, false, id);
    assertEquals(r.ctx.player.coyote, 0);
    r.setVelocity([0, 0, 0]);
    r.ctx.player.jumping = false; r.ctx.player.jumpBuffer = 0;
    r.tick({ ground: true }); r.tick();
    r.tick({ pressed: [Pads.CROSS] });
    assertEquals(r.velocity()[1], r.ctx.player.jumpSpeed, id);
    const ceiling = controller(id);
    ceiling.tick({ ceiling: true, pressed: [Pads.CROSS] });
    assertEquals(ceiling.velocity()[1], 0, id);
  }
});

Deno.test("side-scroller only rebuilds its rotation when facing changes", () => {
  const r = controller("side-scroller");
  for (let i = 0; i < 100; i++) r.tick({ ground: true, lx: 127 });
  assertEquals(r.calls.turns, 1);
  for (let i = 0; i < 100; i++) r.tick({ ground: true, lx: -127 });
  assertEquals(r.calls.turns, 2);
  assertEquals(r.allocations.size, 1);
  assertEquals(r.ctx.player.facing, -1);
});

function contactRuntime(project) {
  const ir = A.resolveScene(project, project.scenes[0], []), e = new A.Emitter();
  A.emitContactCallback(e, ir);
  const geoms = Object.fromEntries(ir.physics.bodies.map(b => [b.geomVN,
    { _name: b.obj.name, _ctxKey: b.ctxKey, position: [b.world.position.x, b.world.position.y, b.world.position.z],
      getPosition() { return this.position; } }]));
  const queries = [], ctx = { player: {} };
  const runtime = new Function("ODE", "ctx", ...Object.keys(geoms), e.toString() +
    "\nreturn {poll:_odePollContacts,contact:ode_onCollide};")({ geomCollide(a, b) {
      queries.push([a._name, b._name]);
      return [{ normal: [0, 1, 0], position: [0, 0, 0] }];
    } }, ctx, ...Object.values(geoms));
  return { ...runtime, geoms, queries, ctx };
}

Deno.test("contact bounds omit far crates but follow live moved colliders and retain floor contacts", () => {
  const r = contactRuntime(A.templateFirstPerson());
  r.geoms.player_geom.position = [0, .4, 4];
  r.poll();
  assertEquals(r.queries, [["Ground", "Player"]]);
  r.queries.length = 0;
  r.geoms.crate1_geom.position = [0, .5, 4];
  r.poll();
  assert(r.queries.some(pair => pair.includes("Crate1")));
  r.queries.length = 0;
  r.geoms.player_geom.position = [0, 10, 4];
  r.poll();
  assertEquals(r.queries, []);
});

Deno.test("unknown mesh/ray contact bounds retain unconditional queries", () => {
  const p = A.templateFirstPerson();
  p.scenes[0].objects.find(o => o.name === "Crate1").components.rigidbody.shape = "mesh";
  const r = contactRuntime(p);
  r.geoms.player_geom.position = [100, 100, 100];
  r.poll();
  assertEquals(r.queries, [["Player", "Crate1"]]);
});

Deno.test("FPS-disabled output drops the unused overlay, and Empty needs no per-frame 3D work", () => {
  const p = A.mkProject();
  p.display.frameCounter = false;
  let main = A.generateProject(p, []).main;
  assert(!main.includes("new Font(")); assert(!main.includes("font.print"));
  p.display.debugHUD = true;
  main = A.generateProject(p, []).main;
  assert(main.includes("new Font(")); assert(main.includes("_hudMemory"));
  const frame = main.slice(main.indexOf("Screen.display(() => {"));
  assert(!frame.includes("Camera.update()"));
  assert(!frame.includes("Screen.setParam("));
});

Deno.test("placeholder character uses smooth side normals with unchanged triangle count", () => {
  const mesh = A.playerObj(), faces = mesh.split("\n").filter(l => l.startsWith("f "));
  assertEquals(faces.length, 50);
  const normals = faces[0].slice(2).split(" ").map(ref => ref.split("/")[2]);
  assertEquals(new Set(normals).size, 2);
});

Deno.test("downloadable controllers exactly match the scripts new projects receive", async () => {
  for (const template of A.PROJECT_TEMPLATES) for (const script of template.make().scripts) {
    assertEquals(await Deno.readTextFile(new URL(`../examples/controllers/${script.name}`, import.meta.url)), script.content);
  }
});
