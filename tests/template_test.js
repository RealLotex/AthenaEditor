import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { load, PURE_MODULES } from "./_load.js";

// Templates sit between core and the panels, so the pure set plus the
// template modules is exactly what they need.
const A = await load([
  "core/util.js", "core/math.js", "core/shadowmath.js", "core/i18n.js", "core/components.js",
  "core/skybox.js", "codegen/skybox.js",
  "core/project.js", "core/validate.js",
  "templates/assets.js",
  "templates/firstperson.js", "templates/thirdperson.js", "templates/sidescroller.js",
  "templates/topdown.js", "templates/registry.js",
  "codegen/emit.js", "codegen/resolve.js", "codegen/models.js", "codegen/lights.js",
  "codegen/sounds.js", "codegen/physics.js", "codegen/shadows.js", "codegen/uigen.js",
  "codegen/ctx.js", "codegen/index.js",
]);

const templateBy = (id) => A.PROJECT_TEMPLATES.find((t) => t.id === id);
const build = (id) => A.migrateProject(templateBy(id).make());
const topdown = () => build("top-down");

/** Templates that ship a controller — everything except Empty. */
const SCRIPTED = A.PROJECT_TEMPLATES.filter((t) => t.make().scripts?.length);

// ═══════════════════════════════════════════════════════════════════════
//  Every template
// ═══════════════════════════════════════════════════════════════════════

Deno.test("every template produces a current, valid project", () => {
  for (const tpl of A.PROJECT_TEMPLATES) {
    const p = A.migrateProject(tpl.make());
    assertEquals(p.version, 3, `${tpl.id} is not at the current version`);
    assert(p.scenes.length >= 1);
    assert(p.scenes.some((s) => s.id === p.startSceneId));
    assert(p.display && p.dirs);
  }
});

Deno.test("no template exports with errors", () => {
  for (const tpl of A.PROJECT_TEMPLATES) {
    const p = A.migrateProject(tpl.make());
    // A runnable template needs its shipped meshes, just as Create supplies
    // them in the browser. Export must reject missing payloads.
    const assets = A.templateAssetFiles(p, tpl.needs.map(path => path.split("/").pop()))
      .map(file => ({ name: file.path.split("/").pop(), cat: "models", content: file.text }));
    const problems = A.validateScene(p.scenes[0], [], p).filter((d) => d.level === "error");
    assertEquals(problems, [], `${tpl.id}: ${problems.map((d) => d.message).join("; ")}`);

    const out = A.generateProject(p, assets);
    const errs = out.diagnostics.filter((d) => d.level === "error");
    assertEquals(errs, [], `${tpl.id}: ${errs.map((d) => d.message).join("; ")}`);
  }
});

Deno.test("a template promises exactly the meshes its scene refers to", () => {
  // `needs` drives both the dialog's "Includes placeholders for" line and what
  // core/scaffold.js writes into a new folder. A scene that refers to a mesh
  // missing from the list scaffolds a project that opens with a warning.
  for (const tpl of A.PROJECT_TEMPLATES) {
    const p = A.migrateProject(tpl.make());
    const used = new Set();
    for (const scene of p.scenes) {
      for (const o of A.allObjects(scene.objects)) {
        const f = o.components?.model?.file;
        if (f) used.add(`${p.dirs.models}/${f}`);
      }
    }
    assertEquals([...used].sort(), [...tpl.needs].sort(), `${tpl.id}: needs does not match the scene`);
  }
});

Deno.test("every template ships every script its objects attach", () => {
  for (const tpl of A.PROJECT_TEMPLATES) {
    const p = A.migrateProject(tpl.make());
    const embedded = new Set((p.scripts || []).map((s) => s.name));
    for (const scene of p.scenes) {
      for (const o of A.allObjects(scene.objects)) {
        const f = o.components?.script?.file;
        if (f) assert(embedded.has(f), `${tpl.id} attaches ${f} but does not carry it`);
      }
    }
    // ...and carries nothing dead.
    const out = A.generateProject(p, []);
    assertEquals(out.scripts.length, (p.scripts || []).length, `${tpl.id} carries an unused script`);
  }
});

Deno.test("a controller resolves with nothing on disk", () => {
  for (const tpl of SCRIPTED) {
    const p = A.migrateProject(tpl.make());
    const out = A.generateProject(p, []);
    assert(out.scripts.length >= 1, `${tpl.id} generated no script`);
    for (const s of out.scripts) {
      assertStringIncludes(s.content, "export function init(ctx)");
      assertStringIncludes(s.content, "export function update(ctx, pad)");
      assert(!/not found when this project was exported/.test(s.content),
        `${tpl.id}: ${s.filename} fell back to the stub`);
    }
    assert(!out.diagnostics.some((d) => /is not in the project folder/.test(d.message) && /\.js/.test(d.message)),
      `${tpl.id} reports its own controller missing`);
  }
});

Deno.test("a file on disk overrides the embedded copy", () => {
  const p = topdown();
  const mine = "export function init(ctx){}\nexport function update(ctx,pad){/* mine */}\n";
  const out = A.generateProject(p, [{ name: "TopDownController.js", cat: "scripts", content: mine }]);
  assertEquals(out.scripts[0].content, mine);
});

// ═══════════════════════════════════════════════════════════════════════
//  The ctx contract
// ═══════════════════════════════════════════════════════════════════════
//
// A controller reaching for a handle the generator does not emit is the one
// mistake that unit tests can catch and a screenshot cannot: it is a
// TypeError on frame 1, on hardware, with no message anywhere. So rather than
// asserting on a hand-written list of strings, the emitted ctx literal is
// parsed and every path the controller mentions is looked up in it.

/** The text of a brace-delimited literal starting at `from`. */
function braced(src, from) {
  const open = src.indexOf("{", from);
  if (open < 0) return "";
  let depth = 0;
  for (let i = open; i < src.length; i++) {
    if (src[i] === "{") depth++;
    else if (src[i] === "}" && --depth === 0) return src.slice(open + 1, i);
  }
  return "";
}

/** The `const ctx = { ... }` literal out of a generated main.js. */
const ctxLiteral = (main) => braced(main, main.indexOf("const ctx = {"));

/** Does the emitted ctx carry this dotted path? */
function ctxHas(main, path) {
  let block = ctxLiteral(main);
  const parts = path.split(".");
  for (let i = 0; i < parts.length; i++) {
    const at = block.search(new RegExp(`^\\s*${parts[i]}:`, "m"));
    if (at < 0) return false;
    if (i === parts.length - 1) return true;
    block = braced(block, at);
  }
  return true;
}

// Containers the generator builds from scene contents. Anything else after
// `ctx.` is a per-object state slot, whose own fields are the script's to
// invent, so only the slot itself is checked.
const CTX_CONTAINERS = new Set([
  "RenderObjects", "RenderDatas", "textures", "animCollections",
  "lights", "sounds", "shadows", "physics", "ui",
]);

/** Every ctx path a script text depends on, deepest-meaningful first. */
function ctxPaths(src) {
  const out = new Set();
  for (const m of src.matchAll(/\bctx\.([A-Za-z_$][\w$]*)((?:\.[A-Za-z_$][\w$]*)*)/g)) {
    const head = m[1];
    const tail = m[2].split(".").filter(Boolean);
    if (head === "pad" || head === "dt" || head === "frame") { out.add(head); continue; }
    if (!CTX_CONTAINERS.has(head)) { out.add(head); continue; }
    // physics.bodies.player / RenderObjects.player — two levels of container
    // at most, then the object's own key.
    out.add([head, ...tail.slice(0, head === "physics" ? 2 : 1)].join("."));
  }
  return [...out];
}

Deno.test("every ctx path a controller uses is one the generator emits", () => {
  for (const tpl of SCRIPTED) {
    const p = A.migrateProject(tpl.make());
    const { main, scripts } = A.generateProject(p, []);
    for (const s of scripts) {
      const paths = ctxPaths(s.content);
      assert(paths.length > 0, `${tpl.id}: ${s.filename} touches nothing on ctx`);
      for (const path of paths) {
        assert(ctxHas(main, path), `${tpl.id}: ${s.filename} uses ctx.${path}, which is not emitted`);
      }
    }
  }
});

Deno.test("the ctx parser can tell a missing handle from a present one", () => {
  // A test that only ever passes proves nothing about the parser above.
  const { main } = A.generateProject(topdown(), []);
  assert(ctxHas(main, "physics.bodies.player"));
  assert(ctxHas(main, "RenderObjects.player"));
  assert(!ctxHas(main, "physics.bodies.nobody"));
  assert(!ctxHas(main, "RenderObjects.nobody"));
  assert(!ctxHas(main, "nosuchcontainer.player"));
});

Deno.test("a controller-driven scene never leaves the orbit rig on", () => {
  // The built-in left-stick rig and a script that writes the camera would both
  // run every frame, and the camera would jitter between the two.
  for (const tpl of SCRIPTED) {
    const p = A.migrateProject(tpl.make());
    assertEquals(p.scenes[0].defaultCameraRig, false, `${tpl.id} leaves the orbit rig on`);
    const { main } = A.generateProject(p, []);
    assert(!/Camera\.orbit/.test(main), `${tpl.id}: the orbit rig would fight the controller`);
    assert(!/Camera\.zoom/.test(main), `${tpl.id}: L2/R2 zoom would fight the controller`);
  }
});

Deno.test("the rig is still emitted for a scene that wants it", () => {
  const p = A.migrateProject(A.mkProject());
  assertStringIncludes(A.generateProject(p, []).main, "Camera.orbit(lx, ly);");
});

Deno.test("every controller targets the camera before it positions it", () => {
  // Camera.target() drags the camera by the target delta to preserve the view
  // vector (setCameraTarget, src/camera.c), so the other order leaves the eye
  // somewhere other than where the script put it. Measured on PCSX2 — see
  // docs/HARDWARE-NOTES.md and `deno task ps2run --sabotage`.
  for (const tpl of SCRIPTED) {
    for (const s of A.generateProject(A.migrateProject(tpl.make()), []).scripts) {
      const target = s.content.search(/Camera\.target\(/);
      const position = s.content.search(/Camera\.position\(/);
      if (target < 0 && position < 0) continue;
      assert(target >= 0 && position >= 0, `${tpl.id}: ${s.filename} sets one of target/position only`);
      assert(target < position, `${tpl.id}: ${s.filename} positions the camera before targeting it`);
    }
  }
});

Deno.test("a character body is frozen, and the sync leaves its rotation alone", () => {
  for (const tpl of SCRIPTED) {
    const p = A.migrateProject(tpl.make());
    const player = A.allObjects(p.scenes[0].objects).find((o) => o.name === "Player");
    assertEquals(player.components.rigidbody.freezeRotation, true, `${tpl.id}: the player can roll`);
    const { main } = A.generateProject(p, []);
    assertStringIncludes(main, "player_body.setAngularVel(0.0, 0.0, 0.0);");
    assert(!/player\.rotation = _odeEuler/.test(main),
      `${tpl.id}: the physics sync still overwrites rotation on a frozen body`);
  }
});

Deno.test("a jump is reachable from the ground", () => {
  // Every controller reads its own grounded flag off the contact normal, so a
  // template whose jump cannot clear its own geometry is a dead end that no
  // amount of string assertion would show.
  for (const tpl of SCRIPTED) {
    const p = A.migrateProject(tpl.make());
    const src = p.scripts[0].content;
    const jump = src.match(/s\.jumpSpeed = ([\d.]+)/);
    if (!jump) continue;
    const g = Math.abs(p.scenes[0].physics.gravity.y);
    const apex = (+jump[1]) ** 2 / (2 * g);
    assert(apex > 0.6, `${tpl.id}: a jump of ${apex.toFixed(2)} units is not worth having`);

    // The tallest step the level asks for, from one platform top to the next.
    const tops = A.allObjects(p.scenes[0].objects)
      .filter((o) => /^Platform/.test(o.name))
      .map((o) => o.components.transform.position.y + o.components.rigidbody.size.y / 2)
      .sort((a, b) => a - b);
    let previous = 0;   // the ground
    for (const top of tops) {
      assert(top - previous <= apex - 0.2,
        `${tpl.id}: a ${(top - previous).toFixed(2)} unit step is out of reach of a ${apex.toFixed(2)} unit jump`);
      previous = top;
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  Top Down
// ═══════════════════════════════════════════════════════════════════════

Deno.test("top-down ships its controller inside the project", () => {
  const p = topdown();
  assertEquals(p.scripts.length, 1);
  assertEquals(p.scripts[0].name, "TopDownController.js");
  // It must resolve without any file on disk — that is the whole point.
  const out = A.generateProject(p, []);
  assertEquals(out.scripts.length, 1);
  assertEquals(out.scripts[0].filename, "scripts/TopDownController.js");
  assertStringIncludes(out.scripts[0].content, "export function update(ctx, pad)");
  assert(!out.diagnostics.some((d) => /not in the project folder/.test(d.message) && /TopDownController/.test(d.message)));
});

Deno.test("the controller only uses ctx keys the generator actually emits", () => {
  const p = topdown();
  const out = A.generateProject(p, []);
  const src = out.scripts[0].content;
  // Each of these must exist in the generated ctx literal.
  for (const path of ["ctx.physics.bodies.player", "ctx.RenderObjects.player"]) {
    assert(src.includes(path), `controller does not use ${path}`);
  }
  assertStringIncludes(out.main, "player: player,");           // ctx.RenderObjects.player
  assertStringIncludes(out.main, "player: player_body,");      // ctx.physics.bodies.player
  assertStringIncludes(out.main, "player: {},");               // ctx.player state slot
  assertStringIncludes(out.main, "dt:");                       // ctx.dt, used for turn rate
});

Deno.test("freeze rotation stops physics from overwriting the visual rotation", () => {
  const p = topdown();
  const { main } = A.generateProject(p, []);
  assertStringIncludes(main, "player_body.setAngularVel(0.0, 0.0, 0.0);");
  assertStringIncludes(main, "player.position = {x: _p[0], y: _p[1], z: _p[2]};");
  // The sync must NOT write rotation for a frozen body.
  assert(!/player\.rotation = _odeEuler/.test(main),
    "the physics sync still overwrites rotation on a frozen body");
});

Deno.test("a normal dynamic body still gets its rotation synced", () => {
  const p = topdown();
  const scene = p.scenes[0];
  const crate = A.mkObject("Crate");
  crate.components.model = Object.assign(A.makeComponent("model"), { file: "crate.obj" });
  crate.components.rigidbody = Object.assign(A.makeComponent("rigidbody"), {
    mode: "dynamic", shape: "box", autoFit: false, freezeRotation: false,
  });
  scene.objects.push(crate);
  const { main } = A.generateProject(p, []);
  assertStringIncludes(main, "crate.rotation = _odeEuler(crate_body.getRotation());");
  assertStringIncludes(main, "function _odeEuler(a)");
});

Deno.test("the helper is dropped when nothing needs it", () => {
  // Only a frozen body means no rotation decoding anywhere.
  const { main } = A.generateProject(topdown(), []);
  assert(!/_odeEuler/.test(main), "_odeEuler emitted but never used");
});

Deno.test("the orbit rig is off so it cannot fight the controller", () => {
  const p = topdown();
  assertEquals(p.scenes[0].defaultCameraRig, false);
  const { main } = A.generateProject(p, []);
  assert(!/Camera\.orbit/.test(main), "the built-in orbit rig would fight the script");
  assert(!/Camera\.zoom/.test(main));
});

Deno.test("top-down physics is wired up", () => {
  const { main } = A.generateProject(topdown(), []);
  assertStringIncludes(main, "ode_world.setGravity(0, -9.81, 0);");
  assertStringIncludes(main, "ODE.GeomPlane(ode_space, 0.0, 1.0, 0.0, 0.0);");
  assertStringIncludes(main, "ODE.GeomSphere(ode_space, 0.5);");
  assertStringIncludes(main, "player_body.setMassSphere(5.0, 0.5);");
  assertStringIncludes(main, "stepWithContacts(ode_space, ode_contacts, 0.016);");
  assert(!main.includes("function ode_onCollide"), "top-down does not consume contact events");
});

Deno.test("embedded scripts do not trip the missing-asset warning", () => {
  const p = topdown();
  // With a folder loaded but no controller file in it, the embedded copy still counts.
  const files = [{ name: "player.obj", cat: "models" }, { name: "ground.obj", cat: "models" }];
  const problems = A.validateScene(p.scenes[0], files, p);
  assertEquals(problems.filter((d) => d.level === "error"), []);
  assert(!problems.some((d) => /TopDownController/.test(d.message)),
    "the embedded controller was reported as missing");
});

Deno.test("conventional meshes are reported once a folder is loaded without them", () => {
  const p = topdown();
  const problems = A.validateScene(p.scenes[0], [{ name: "something-else.obj", cat: "models" }], p);
  const names = problems.map((d) => d.message).join(" ");
  assertStringIncludes(names, "player.obj");
  assertStringIncludes(names, "ground.obj");
  // Still only warnings — the project is usable, it just needs meshes.
  assertEquals(problems.filter((d) => d.level === "error"), []);
});

// ═══════════════════════════════════════════════════════════════════════
//  First Person
// ═══════════════════════════════════════════════════════════════════════

Deno.test("the first-person player is a body with nothing to draw", () => {
  const p = build("first-person");
  const player = A.allObjects(p.scenes[0].objects).find((o) => o.name === "Player");
  assert(!player.components.model, "a first-person player mesh only gets clipped by the near plane");

  const out = A.generateProject(p, []);
  assertStringIncludes(out.main, "ODE.GeomSphere(ode_space, 0.4);");
  assertStringIncludes(out.main, "player_body.setMassSphere(5.0, 0.4);");
  // ...and the collider still has to reach the ctx the controller reads.
  assert(ctxHas(out.main, "physics.bodies.player"));
  assert(!ctxHas(out.main, "RenderObjects.player"));
});

Deno.test("a scripted body with no model is not reported as an oversight", () => {
  const out = A.generateProject(build("first-person"), []);
  assert(!out.diagnostics.some((d) => /draws nothing/.test(d.message)),
    "the first-person player is invisible on purpose");
});

Deno.test("an unscripted dynamic body with no model still is", () => {
  // The diagnostic has to stay able to fire, or the exemption above is just a
  // way of switching it off.
  const p = topdown();
  const ghost = A.mkObject("Ghost");
  ghost.components.rigidbody = Object.assign(A.makeComponent("rigidbody"), {
    mode: "dynamic", shape: "box", autoFit: false,
  });
  p.scenes[0].objects.push(ghost);
  const out = A.generateProject(p, []);
  assert(out.diagnostics.some((d) => /Ghost.*draws nothing/.test(d.message)));
});

Deno.test("first person opens the near plane so you can walk up to things", () => {
  const { main } = A.generateProject(build("first-person"), []);
  // The editor default of 1.0 would hide anything within a metre of the eye.
  assertStringIncludes(main, "Render.setView(65.0, 0.4, 2000.0);");
});

Deno.test("the crates share one RenderData", () => {
  // Four objects, one mesh, identical render settings: the expensive resource
  // is the geometry upload, and it should happen once.
  const out = A.generateProject(build("first-person"), []);
  assertEquals(out.stats.models, 5);        // ground + four crates
  assertEquals(out.stats.renderDatas, 2);   // ground.obj + crate.obj
});

// ═══════════════════════════════════════════════════════════════════════
//  Third Person
// ═══════════════════════════════════════════════════════════════════════

Deno.test("third person drives both the model and the camera", () => {
  const p = build("third-person");
  const out = A.generateProject(p, []);
  const src = out.scripts[0].content;
  // The model's facing and the camera's swing are separate angles: sharing one
  // would make the character moonwalk whenever the camera moved.
  assertStringIncludes(src, "s.angle");
  assertStringIncludes(src, "s.yaw");
  assert(ctxHas(out.main, "RenderObjects.player"));
  assert(ctxHas(out.main, "physics.bodies.player"));
  assertStringIncludes(out.main, "ODE.GeomSphere(ode_space, 0.5);");
  assertStringIncludes(out.main, "player_body.setMassSphere(5.0, 0.5);");
});

Deno.test("third person keeps the camera off the poles", () => {
  // At 90 degrees the view vector lines up with the camera's up vector and the
  // look-at matrix has no horizon left to build from.
  const src = build("third-person").scripts[0].content;
  const max = +src.match(/PITCH_MAX = ([\d.]+)/)[1];
  const min = +src.match(/PITCH_MIN = (-?[\d.]+)/)[1];
  assert(max < Math.PI / 2 - 0.15, `pitch may reach ${max}, which is within a whisker of straight down`);
  assert(min > -Math.PI / 2 + 0.15, `pitch may reach ${min}`);
  assertStringIncludes(src, "if (s.pitch > PITCH_MAX)");
  assertStringIncludes(src, "if (s.pitch < PITCH_MIN)");
});

// ═══════════════════════════════════════════════════════════════════════
//  Side Scroller
// ═══════════════════════════════════════════════════════════════════════

Deno.test("the side-scroller ground uses accurate clipping", () => {
  const p = build("side-scroller");
  const ground = A.allObjects(p.scenes[0].objects).find((o) => o.name === "Ground");
  assertEquals(ground.components.model.accurate_clipping, true);
  assertStringIncludes(A.generateProject(p, []).main, "ground_data.accurate_clipping = true;");
});

/** Run the emitted contact functions and the real template controller together. */
function sideScrollerRuntime() {
  const p = build("side-scroller");
  const { main, scripts } = A.generateProject(p, []);
  let velocity = [0, 0, 0], queries = 0, hits = [];
  const ctx = {
    dt: 0.016, player: {}, RenderObjects: { player: {} },
    physics: { bodies: { player: {
      getLinearVel: () => velocity,
    setLinearVel: (...v) => { velocity = v; },
      getPosition: () => [-6, 0.5, 0],
    } } },
  };
  const ground = { _name: "Ground" }, player = { _name: "Player", _ctxKey: "player", getPosition: () => [-6, 0.5, 0] };
  const contacts = new Function("ctx", "ODE", "_odeEventPairs", `
    let _odeLegacyContacts = false;
    const _odeBoundGeoms = [_odeEventPairs[0][1]], _odeBoundPositions = [], _odeBoundNumber = new Float64Array(1);
    const _odeEventBounds = [[0, -1, 0.502]];
    function ode_onCollide(c) { ${braced(main, main.indexOf("function ode_onCollide"))} }
    function _odePollContacts() { ${braced(main, main.indexOf("function _odePollContacts"))} }
    return { contact: ode_onCollide, poll: () => { if (_odeLegacyContacts) _odePollContacts(); } };
  `)(ctx, { geomCollide: () => { queries++; return hits; } }, [[ground, player]]);
  const Pads = { LEFT: 1, RIGHT: 2, CROSS: 4, DOWN: 8, UP: 16, R1: 32, SQUARE: 64 };
  const controller = new Function("Pads", "Camera", scripts[0].content.replace(/^export /gm, "") +
    "\nreturn { init, update };")(Pads, { target() {}, position() {} });
  controller.init(ctx);
  return {
    ctx, ground, player, ...contacts,
    setHits: (value) => { hits = value; },
    setVelocity: (value) => { velocity = value; },
    velocity: () => velocity, queries: () => queries,
    update: (jump) => controller.update(ctx, {
      lx: 0, ly: 0, pressed: (button) => jump && button === Pads.CROSS,
      justPressed: (button) => jump && button === Pads.CROSS,
    }),
    input: ({ lx = 0, ly = 0, held = [], pressed = [] } = {}) => controller.update(ctx, {
      lx, ly, pressed: (button) => held.some((key) => Pads[key] === button),
      justPressed: (button) => pressed.some((key) => Pads[key] === button),
    }),
    main,
  };
}

Deno.test("release ELF numeric contacts allow jumping from the ground and platforms", () => {
  const r = sideScrollerRuntime();
  r.contact({ geom1: 8042112, geom2: 8041008, normal: [0, 1, 0] });
  r.setHits([{ normal: [0, -1, 0], position: [-6, 0, 0], depth: 0.003 }]);
  r.poll();
  assertEquals(r.ctx.player.lastHit, "Ground");
  r.update(true);
  assertEquals(r.velocity()[1], 6.5);
  assertEquals(r.ctx.player.lastHitNormal, null);

  // Leaving the surface consumes the contact, so another press cannot jump in air.
  r.setHits([]);
  r.setVelocity([0, -2, 0]);
  r.poll();
  r.update(true);
  assertEquals(r.ctx.player.grounded, false);
  assert(r.velocity()[1] < -2);

  // A landing on a platform permits another jump; wall contacts do not.
  r.ground._name = "Platform1";
  r.setHits([{ normal: [1, 0, 0] }]);
  r.poll();
  r.update(true);
  assertEquals(r.ctx.player.grounded, false);
  assert(r.velocity()[1] < -2);
  r.setHits([{ normal: [0, 1, 0] }]);
  r.poll();
  r.update(true);
  assertEquals(r.ctx.player.events.jump, true);
  assertEquals(r.ctx.player.lastHit, "Platform1");
  assertEquals(r.velocity()[1], 6.5);
  assertStringIncludes(r.main, "[ground_geom, player_geom],");
  assertStringIncludes(r.main, "[player_geom, platform1_geom],");
  assert(r.main.indexOf("if (_odeLegacyContacts) _odePollContacts();") <
    r.main.indexOf("ode_world.stepWithContacts("), "poll before solving contacts");
});

Deno.test("newer JS geom contacts allow jumping without fallback queries", () => {
  const r = sideScrollerRuntime();
  r.contact({ geom1: r.player, geom2: r.ground, normal: [0, 1, 0] });
  r.poll();
  r.update(true);
  assertEquals(r.velocity()[1], 6.5);
  assertEquals(r.queries(), 0);
  assertEquals(r.ctx.player.lastHit, "Ground");
});

Deno.test("the side-scroller platforms are colliders the size of their mesh", () => {
  // platformObj() and the size below are the same 4 x 0.5 x 2 in two places.
  // If they drift, the character lands on air.
  const p = build("side-scroller");
  const mesh = A.templateAssetFiles(p, ["platform.obj"])[0].text;
  const axis = (i) => mesh.split("\n").filter((l) => l.startsWith("v "))
    .map((l) => parseFloat(l.split(/\s+/)[i]));
  const extent = (i) => Math.max(...axis(i)) - Math.min(...axis(i));

  const platform = A.allObjects(p.scenes[0].objects).find((o) => o.name === "Platform1");
  const size = platform.components.rigidbody.size;
  assertEquals([extent(1), extent(2), extent(3)], [size.x, size.y, size.z]);

  const { main } = A.generateProject(p, []);
  assertStringIncludes(main, "ODE.GeomBox(ode_space, 4.0, 0.5, 2.0);");
});

Deno.test("the side-scroller camera looks from +Z, or every control is mirrored", () => {
  // World +X reads as screen right only from the +Z side — the same mapping
  // tools/ps2shadow.js measures its cases against.
  const p = build("side-scroller");
  const cam = A.allObjects(p.scenes[0].objects).find((o) => o.name === "Main Camera");
  assert(cam.components.transform.position.z > 0, "the camera is on the wrong side of the play plane");
  assertStringIncludes(p.scripts[0].content, "Camera.position(cx, cy, PLANE_Z + s.camDistance);");
});

Deno.test("the side-scroller player is pinned to the play plane", () => {
  const src = build("side-scroller").scripts[0].content;
  // ODE has no 2D joint in this binding, so depth is held by the controller.
  assertStringIncludes(src, "body.setLinearVel(vx, vy, 0.0);");
  assertStringIncludes(src, "body.setPosition(p[0], p[1], PLANE_Z);");
});

Deno.test("side-scroller physics is wired up", () => {
  const { main } = A.generateProject(build("side-scroller"), []);
  assertStringIncludes(main, "ODE.GeomSphere(ode_space, 0.5);");
  assertStringIncludes(main, "player_body.setMassSphere(5.0, 0.5);");
  assertStringIncludes(main, "ODE.GeomPlane(ode_space, 0.0, 1.0, 0.0, 0.0);");
  assertStringIncludes(main, "stepWithContacts(ode_space, ode_contacts, 0.016, ode_onCollide)");
});
