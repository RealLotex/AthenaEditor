// Exercise actual generated Destroy Object and Change Scene presets in PCSX2.
import { load, shutdown } from "../tests/_load.js";
import { runConsoleFixture } from "./run-console-fixture.js";
import { assert } from "jsr:@std/assert@1";
const A = await load();

function fixture(preset) {
  const p = A.mkProject("Event preset verification"), s = p.scenes[0];
  s.objects = []; s.physics.gravity = { x: 0, y: 0, z: 0 }; s.defaultCameraRig = false;
  const zone = A.mkObject("zone"), player = A.mkObject("player"), far = A.mkObject("far");
  for (const [o, mode, x] of [[zone, "trigger", 0], [player, "dynamic", 0], [far, "static", 20]]) {
    o.components.rigidbody = { ...A.makeComponent("rigidbody"), mode, shape: "sphere", radius: 1, autoFit: false };
    o.components.transform.position.x = x;
    s.objects.push(o);
  }
  A.attachEventPreset(p, s, zone, preset);
  zone.components.rigidbody.eventOtherId = player.id;
  return { p, s, zone, player };
}
function probe(p, scene, name, content) {
  const o = A.mkObject("probe");
  o.components.script = { ...A.makeComponent("script"), file: name };
  scene.objects.push(o); p.scripts.push({ name, content });
}
async function verify(p) {
  const generated = A.generateProject(p);
  const guard = text => text.replace("Screen.display(() => {", "Screen.display(() => { try {")
    .replace(/\}\);\s*$/, `} catch (error) {
      const file = std.open("probe.log", "a");
      file.puts(JSON.stringify({tag:"ERROR", message:String(error), stack:String(error.stack)}) + "\\n");
      file.close(); throw error;
    } });`);
  generated.main = guard(generated.main);
  for (const file of generated.sceneFiles) file.content = guard(file.content);
  const log = await runConsoleFixture(generated, { complete: text => text.includes('"tag":"DONE"') || text.includes('"tag":"ERROR"') });
  const records = log.trim().split("\n").map(line => JSON.parse(line));
  assert(records.some(r => r.tag === "DONE"), JSON.stringify(records));
  return records;
}
try {
  const destroy = fixture("destroyObject");
  destroy.zone.components.rigidbody.eventTarget = "other";
  probe(destroy.p, destroy.s, "DestroyProbe.js", `
export function update(ctx) {
    if (ctx.frame === 30) {
        const file = std.open("probe.log", "w");
        file.puts(JSON.stringify({ tag: "DONE", destroyed: !!ctx.physics.geoms.player._destroyed,
            bodyDestroyed: !!ctx.physics.bodies.player._destroyed }) + "\\n"); file.close();
    }
}`);
  const destruction = await verify(destroy.p);
  assert(destruction.at(-1).destroyed && destruction.at(-1).bodyDestroyed, "Preset did not destroy the collider/body");
  const change = fixture("changeScene"), destination = A.mkScene("Destination");
  change.p.scenes.push(destination);
  change.zone.components.rigidbody.eventSceneId = destination.id;
  probe(change.p, destination, "DestinationProbe.js", `
export function init(ctx) {
    const file = std.open("probe.log", "w");
    file.puts(JSON.stringify({tag:"DONE", destination:true}) + "\\n"); file.close();
}`);
  const transition = await verify(change.p);
  assert(transition.at(-1).destination, "Preset did not change the scene");
  await Deno.mkdir(".verification", { recursive: true });
  await Deno.writeTextFile(".verification/event-presets.json", JSON.stringify({ passed: true, destruction, transition }, null, 2));
  console.log(JSON.stringify({ passed: true, destruction, transition }));
} finally { await shutdown(); }
