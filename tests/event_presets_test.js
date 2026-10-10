import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { load } from "./_load.js";
const A = await load();

Deno.test('unmodified sound preset copies are repaired on load/export while user edits are preserved',()=>{
  const current=A.eventPresetScript(A.EVENT_ACTION_PRESETS.find(p=>p.id==='playSound'));
  const old=current.replace('action.sound.pause(); action.sound.play(); action.sound.rewind();','action.sound.rewind(); action.sound.play();');
  assertEquals(A.repairedEventPresetSource(old),current);assertEquals(A.repairedEventPresetSource(old+'// user edit'),old+'// user edit');
  const {p,scene,obj}=fixture();A.attachEventPreset(p,scene,obj,'playSound');obj.components.rigidbody.eventAudio='voice.wav';p.scripts[0].content=old;
  assertEquals(A.resolveScene(p,scene).scripts.files[0].content,current);
  A.migrateProject(p);assertEquals(p.scripts[0].content,current);
});

function fixture() {
  const p = A.mkProject(), scene = p.scenes[0], obj = A.mkObject("zone");
  scene.objects = [obj];
  obj.components.rigidbody = { ...A.makeComponent("rigidbody"), mode: "trigger", autoFit: false };
  return { p, scene, obj, rb: obj.components.rigidbody };
}

Deno.test("selecting a preset attaches an editable independent script, enables physics and preserves controllers", () => {
  const { p, scene, obj, rb } = fixture();
  obj.components.script = { ...A.makeComponent("script"), file: "Controller.js", ctxKey: "hero" };
  A.attachEventPreset(p, scene, obj, "destroyObject");
  assertEquals(obj.components.script.file, "Controller.js");
  assertEquals(scene.physics.enabled, true);
  assertEquals(rb.collisionEvents, true);
  assertEquals(rb.eventScript, "Event_DestroyObject.js");
  assertEquals(p.scripts[0].eventPreset, "destroyObject");
  assert(p.scripts[0].content.includes("ctx.destroyObject"));
  const ir = A.resolveScene(p, scene, []);
  assertEquals(ir.scripts.bindings.length, 2);
  assertEquals(ir.eventActions[0].body.ctxKey, "hero");
  A.saveEditorScript(p, rb.eventScript, "// edited preset");
  A.attachEventPreset(p, scene, obj, "destroyObject");
  assertEquals(p.scripts.length, 1);
  assertEquals(p.scripts[0].content, "// edited preset");
  A.attachEventPreset(p, scene, obj, "");
  assertEquals(rb.eventScript, "");
  assertEquals(p.scripts[0].content, "// edited preset", "detaching keeps the user's file");
});

Deno.test("preset attachments avoid unrelated script names and allocate distinct event keys for equal object names", () => {
  const { p, scene, obj, rb } = fixture();
  p.scripts.push({ name: "Event_DestroyObject.js", content: "// user file" });
  const other = A.mkObject("zone");
  other.components.rigidbody = { ...A.makeComponent("rigidbody"), collisionEvents: true };
  scene.objects.push(other);
  A.attachEventPreset(p, scene, obj, "destroyObject");
  assertEquals(rb.eventScript, "Event_DestroyObject_2.js");
  assertEquals(p.scripts[0].content, "// user file");
  assert(A.physicsEventKey(obj) !== A.physicsEventKey(other));
});

function scriptRuntime(id, patch = {}) {
  const preset = A.EVENT_ACTION_PRESETS.find(p => p.id === id), calls = [];
  const action = { preset: id, key: "zone", geom: {}, objectId: "zone-id", phase: "enter", otherId: "player-id", ...patch };
  const ctx = { zone: { onTriggerEnter() { calls.push("previous"); } }, eventActions: [action],
    goToScene(id) { calls.push(["scene", id]); }, destroyObject(id) { calls.push(["destroy", id]); } };
  const init = new Function(A.eventPresetScript(preset).replace(/^export /gm, "") + "\nreturn init;")();
  init(ctx);
  return { ctx, action, calls };
}

Deno.test("presets compose with custom callbacks and filter using stable object IDs", () => {
  const r = scriptRuntime("changeScene", { sceneId: "destination" });
  r.ctx.zone.onTriggerEnter({ otherId: "unrelated" });
  assertEquals(r.calls, ["previous"]);
  r.ctx.zone.onTriggerEnter({ otherId: "player-id" });
  assertEquals(r.calls, ["previous", "previous", ["scene", "destination"]]);
  r.action.geom._destroyed = true;
  r.ctx.zone.onTriggerEnter({ otherId: "player-id" });
  assertEquals(r.calls.length, 3);
});

Deno.test("sound oneshot disables looping and restarts once; animation uses selected clip and loop", () => {
  const audio = [], sound = { loop: true, pause() { audio.push('pause'); }, rewind() { audio.push("rewind"); }, play() { audio.push("play"); } };
  const r = scriptRuntime("playSound", { sound });
  r.ctx.zone.onCollisionEnter({ otherId: "player-id" });
  assertEquals(sound.loop, false);
  assertEquals(audio, ["pause", "play", "rewind"]);
  const clip = {}, calls = [];
  const a = scriptRuntime("playAnimation", { animations: { Open: clip }, clip: "Open", loop: true,
    model: { playAnim(...args) { calls.push(args); } } });
  a.ctx.zone.onTriggerEnter({ otherId: "player-id" });
  assertEquals(calls, [[clip, true]]);
  assertThrows(() => scriptRuntime("playAnimation", { animations: {}, clip: "Missing" }), Error, "Unknown animation clip: Missing");
});

Deno.test("destroy preset supports self and other on exit", () => {
  const r = scriptRuntime("destroyObject", { phase: "exit", target: "other" });
  assertEquals(r.ctx.zone.onCollisionEnter, undefined);
  r.ctx.zone.onCollisionExit({ otherId: "player-id" });
  assertEquals(r.calls, [["destroy", "player-id"]]);
  r.action.target = "self";
  r.ctx.zone.onTriggerExit({ otherId: "player-id" });
  assertEquals(r.calls.at(-1), ["destroy", "zone-id"]);
});

Deno.test("destroy requests are idempotent, cascade to children and free native handles after dispatch", () => {
  const calls = [], geom = { free() { calls.push("geom"); } }, body = { free() { calls.push("body"); } }, visual = {};
  const objects = new Map([["parent", { alive: true, geom, body, visuals: [visual], sounds: [], children: ["child"] }],
    ["child", { alive: true, geom: null, body: null, visuals: [], sounds: [{ pause() { calls.push("pause"); } }], children: [] }]]);
  const rt = new Function("_runtimeObjects", "_pendingDestroy", A.OBJECT_LIFETIME_RUNTIME +
    "\nreturn {destroyObject, alive:_isObjectAlive, flush:_flushDestroyedObjects};")(objects, new Set());
  assertEquals(rt.destroyObject("parent"), true);
  assertEquals(rt.destroyObject("parent"), false);
  assertEquals(rt.alive("child"), false);
  assertEquals(visual._destroyed, true);
  assertEquals(calls, []);
  rt.flush(); rt.flush();
  assertEquals(calls, ["geom", "body", "pause"]);
});

Deno.test("generated presets deduplicate modules/resources and emit scene-ID destinations", () => {
  const { p, scene, obj, rb } = fixture();
  const destination = A.mkScene("Next"), duplicate = A.mkObject("second");
  p.scenes.push(destination);
  duplicate.components.rigidbody = { ...rb };
  scene.objects.push(duplicate);
  for (const o of [obj, duplicate]) { A.attachEventPreset(p, scene, o, "changeScene"); o.components.rigidbody.eventSceneId = destination.id; }
  const result = A.generateProject(p);
  assertEquals(result.scripts.filter(s => s.filename.endsWith("Event_ChangeScene.js")).length, 1);
  assertEquals((result.main.match(/^init_.*\(ctx\);$/gm) || []).length, 1);
  assert(result.main.includes(`name === "${destination.id}"`));
  assert(!result.main.includes("_runtimeObjects"), "lifetime machinery is emitted only for destruction");
  assertEquals(result.diagnostics.filter(d => d.level === "error"), []);
});

Deno.test("oneshot streams and animation collections are loaded once for matching presets", () => {
  const { p, scene, obj, rb } = fixture(), other = A.mkObject("second");
  other.components.rigidbody = { ...rb }; scene.objects.push(other);
  for (const o of [obj, other]) { A.attachEventPreset(p, scene, o, "playSound"); o.components.rigidbody.eventAudio = "hit.adp"; }
  let ir = A.resolveScene(p, scene, []);
  assertEquals(ir.sounds.length, 1);
  assertEquals(ir.eventActions[0].sound, ir.eventActions[1].sound);
  obj.components.model = { ...A.makeComponent("model"), file: "mesh.obj" };
  obj.components.animator = { ...A.makeComponent("animator"), file: "clips.glb", defaultAnim: "Open" };
  A.attachEventPreset(p, scene, obj, "playAnimation");
  ir = A.resolveScene(p, scene, []);
  assertEquals(ir.anims.length, 1);
  assertEquals(ir.eventActions.find(a => a.preset === "playAnimation").anim.vn, ir.models[0].anim.vn);
});

Deno.test("scene transitions dispose native physics before reloading", () => {
  const { p, scene, obj, rb } = fixture();
  const destination = A.mkScene("Next"); p.scenes.push(destination);
  A.attachEventPreset(p, scene, obj, "changeScene"); rb.eventSceneId = destination.id;
  const { main } = A.generateProject(p);
  assert(main.includes("if (_nextScene !== null) { _disposePhysics(); std.reload(_nextScene); }"));
  const cleanup = main.slice(main.indexOf("function _disposePhysics()"), main.indexOf("//", main.indexOf("function _disposePhysics()")));
  assert(cleanup.indexOf("zone_geom.free();") < cleanup.indexOf("ode_space.free();"));
  assert(cleanup.indexOf("ode_space.free();") < cleanup.indexOf("ode_world.destroyWorld();"));
});
