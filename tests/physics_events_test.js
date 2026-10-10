import { assert, assertEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const A = await load();

function fixture(specs) {
  const p = A.mkProject(), s = p.scenes[0];
  s.physics.enabled = true;
  s.objects = specs.map(([name, mode, events = true, key = name]) => {
    const o = A.mkObject(name);
    o.components.rigidbody = { ...A.makeComponent("rigidbody"),
      mode, shape: "sphere", radius: 1, autoFit: false, collisionEvents: events, onCollide: key };
    return o;
  });
  return p;
}

// Execute the actual emitted lifecycle, detection and step, with engine calls stubbed.
function runtime(p, numeric = false) {
  const ir = A.resolveScene(p, p.scenes[0], []), setup = new A.Emitter(), step = new A.Emitter();
  A.emitPhysicsEvents(setup, ir);
  A.emitContactCallback(setup, ir);
  A.emitTriggerTables(setup, ir);
  A.emitPhysicsStep(step, ir);
  const geoms = ir.physics.bodies.map(b => ({ _id: b.obj.id, _name: b.obj.name, _ctxKey: b.ctxKey,
    _dynamic: b.isDynamic, _trigger: b.isTrigger,
    position: [0, 0, 0], reads: 0, getPosition() { this.reads++; return this.position; } }));
  const ctx = Object.fromEntries(ir.physics.bodies.filter(b => b.events).map(b => [b.ctxKey, {}]));
  let contacts = [], overlaps = [];
  const queries = [], calls = [];
  const hit = (a, d) => ({ geom1: numeric ? 1 : a, geom2: numeric ? 2 : d, normal: [0, 1, 0], position: [0, 0, 0] });
  const ODE = { geomCollide(a, d) {
    queries.push([a._name, d._name]);
    const list = ir.physics.bodies.find(b => b.obj.id === a._id).isTrigger ? overlaps : contacts;
    return list.some(([i, j]) => geoms[i] === a && geoms[j] === d || geoms[i] === d && geoms[j] === a) ? [hit(a, d), hit(a, d)] : [];
  } };
  const world = { stepWithContacts(_s, _g, _dt, cb) {
    calls.push("solve");
    if (cb) for (const [i, j] of contacts) { cb(hit(geoms[i], geoms[j])); cb(hit(geoms[i], geoms[j])); }
  } };
  const args = ["ODE", "ctx", "ode_world", "ode_space", "ode_contacts", ...ir.physics.bodies.map(b => b.geomVN)];
  const tick = new Function(...args, setup.toString() + `\nreturn function() { ${step.toString()} };`)(ODE, ctx, world, {}, {}, ...geoms);
  return { ctx, geoms, queries, calls, tick,
    contacts(v) { contacts = v; }, overlaps(v) { overlaps = v; } };
}

for (const numeric of [false, true]) Deno.test(`collision enter/exit deduplicate contacts and handle reentry (${numeric ? "numeric" : "JS"} geoms)`, () => {
  const r = runtime(fixture([["a", "dynamic"], ["b", "static"]]), numeric), events = [];
  for (const key of ["a", "b"]) {
    r.ctx[key].onCollisionEnter = e => { assertEquals(r.calls.at(-1), "solve"); events.push([key, "enter", e.otherId, [...e.normal]]); };
    r.ctx[key].onCollisionExit = e => events.push([key, "exit", e.otherId]);
  }
  r.contacts([[0, 1]]); r.tick(); r.tick();
  assertEquals(events, [["a", "enter", r.geoms[1]._id, [0, 1, 0]], ["b", "enter", r.geoms[0]._id, [-0, -1, -0]]]);
  assertEquals(r.ctx.a.lastHit, "b");
  r.contacts([]); r.tick(); r.tick();
  assertEquals(events.length, 4);
  r.contacts([[0, 1]]); r.tick();
  assertEquals(events.length, 6);
  if (!numeric) assertEquals(r.queries.length, 0, "JS geom callbacks need no extra collision queries");
  else assertEquals(r.queries.length, 3, "numeric recovery polls once per step with contacts, never on empty steps");
});

Deno.test("overlap callbacks track simultaneous occupants with equal names and notify both sides", () => {
  const r = runtime(fixture([["zone", "trigger"], ["ball", "dynamic", true, "first"], ["ball", "dynamic", true, "second"]]));
  const events = [], other = [];
  r.ctx.zone.onTriggerEnter = e => events.push(["enter", e.otherId]);
  r.ctx.zone.onTriggerExit = e => events.push(["exit", e.otherId]);
  r.ctx.first.onTriggerEnter = e => other.push(e.otherName);
  r.overlaps([[0, 1], [0, 2]]); r.tick(); r.tick();
  assertEquals(events, [["enter", r.geoms[1]._id], ["enter", r.geoms[2]._id]]);
  assertEquals(other, ["zone"]);
  assertEquals(r.ctx.zone.entered, false);
  r.overlaps([[0, 2]]); r.tick();
  assertEquals(events.at(-1), ["exit", r.geoms[1]._id]);
  assertEquals(r.ctx.zone.exited, false);
  assertEquals(r.ctx.zone.overlapping, "ball");
  r.overlaps([]); r.tick();
  assertEquals(events.at(-1), ["exit", r.geoms[2]._id]);
  assertEquals(r.ctx.zone.exited, true);
  assertEquals(r.ctx.zone.overlapping, null);
});

Deno.test("trigger filters omit far pairs, read each centre once, and follow moved static geoms", () => {
  const r = runtime(fixture([["zone", "trigger"], ["near", "static", false], ["far", "static", false]]));
  r.geoms[2].position = [100, 0, 0];
  r.overlaps([[0, 1]]); r.tick();
  assertEquals(r.queries, [["zone", "near"]]);
  assertEquals(r.geoms.map(g => g.reads), [1, 1, 1]);
  r.geoms[2].position = [0, 0, 0];
  r.queries.length = 0; r.overlaps([[0, 2]]); r.tick();
  assertEquals(r.queries, [["zone", "near"], ["zone", "far"]]);
  assertEquals(r.ctx.zone.overlapping, null, "legacy flags only summarize dynamic occupants");
});

Deno.test("unobserved triggers generate no polling or event lifecycle", () => {
  const { main } = A.generateProject(fixture([["zone", "trigger", false], ["body", "dynamic", false]]));
  assert(!main.includes("_updateTriggers"));
  assert(!main.includes("_odeEventStates"));
  assert(!main.includes("geomCollide"));
});

Deno.test("two observed triggers query their pair once and notify both sides without self-overlap", () => {
  const r = runtime(fixture([["a", "trigger"], ["b", "trigger"]])), events = [];
  r.ctx.a.onTriggerEnter = e => events.push(["a", e.otherId, e.normal]);
  r.ctx.b.onTriggerEnter = e => events.push(["b", e.otherId, e.position]);
  r.overlaps([[0, 1]]); r.tick();
  assertEquals(r.queries, [["a", "b"]]);
  assertEquals(events, [["a", r.geoms[1]._id, null], ["b", r.geoms[0]._id, null]]);
  assertEquals(r.ctx.a.overlapping, null);
});

Deno.test("blank event key follows the object's custom script state key", () => {
  const p = fixture([["player", "dynamic", true, ""]]);
  p.scenes[0].objects[0].components.script = { ...A.makeComponent("script"), ctxKey: "hero", file: "Hero.js" };
  p.scripts = [{ name: "Hero.js", content: "export function init(ctx) {}" }];
  const ir = A.resolveScene(p, p.scenes[0], []);
  assertEquals(ir.physics.bodies[0].ctxKey, "hero");
  const { main } = A.generateProject(p);
  assertEquals((main.match(/hero: \{\},/g) || []).length, 1);
});

Deno.test("event slots exist without an attached script; reserved and shared keys fail export early", () => {
  let p = fixture([["zone", "trigger"], ["body", "dynamic", false]]);
  assert(A.generateProject(p).main.includes("zone: {}"));
  p = fixture([["zone", "trigger", true, "physics"]]);
  assert(A.generateProject(p).diagnostics.some(d => d.level === "error" && d.message.includes("reserved ctx Key")));
  assert(A.validateScene(p.scenes[0]).some(d => d.level === "error" && d.message.includes("reserved ctx Key")));
  p = fixture([["a", "trigger", true, "shared"], ["b", "dynamic", true, "shared"]]);
  assert(A.generateProject(p).diagnostics.some(d => d.level === "error" && d.message.includes("distinct ctx Keys")));
  assert(A.validateScene(p.scenes[0]).some(d => d.level === "error" && d.message.includes("distinct ctx Keys")));
});
