// Verify pair lifetimes and nested numeric-contact recovery in the shipped ELF.
import { load, shutdown } from "../tests/_load.js";
import { runConsoleFixture } from "./run-console-fixture.js";
import { assert } from "jsr:@std/assert@1";

const A = await load(), p = A.mkProject("Physics events verification"), scene = p.scenes[0];
scene.objects = [];
scene.physics.enabled = true;
scene.defaultCameraRig = false;
for (const [name, mode, shape, events] of [
  ["ground", "static", "plane", false], ["player", "dynamic", "sphere", true], ["zone", "trigger", "sphere", true],
]) {
  const o = A.mkObject(name);
  o.components.rigidbody = { ...A.makeComponent("rigidbody"), mode, shape,
    autoFit: false, radius: name === "zone" ? 2 : .5, collisionEvents: events, onCollide: name };
  o.components.transform.position.y = name === "ground" ? 0 : .45;
  scene.objects.push(o);
}
const probe = A.mkObject("probe");
probe.components.script = { ...A.makeComponent("script"), file: "EventProbe.js" };
scene.objects.push(probe);
p.scripts = [{ name: "EventProbe.js", content: `
let log, collisionEnter = 0, collisionExit = 0, triggerEnter = 0, triggerExit = 0;
function write(tag, event) {
    log.puts(JSON.stringify({ tag: tag, other: event.otherName, id: event.otherId }) + "\\n");
    log.flush();
}
export function init(ctx) {
    log = std.open("probe.log", "w");
    ctx.player.onCollisionEnter = function(e) { collisionEnter++; write("collisionEnter", e); };
    ctx.player.onCollisionExit = function(e) { collisionExit++; write("collisionExit", e); };
    ctx.zone.onTriggerEnter = function(e) { if (e.otherName === "player") { triggerEnter++; write("triggerEnter", e); } };
    ctx.zone.onTriggerExit = function(e) { if (e.otherName === "player") { triggerExit++; write("triggerExit", e); } };
}
export function update(ctx) {
    if (ctx.frame === 30 || ctx.frame === 60) {
        const body = ctx.physics.bodies.player;
        body.setPosition(ctx.frame === 30 ? 10.0 : 0.0, .45, 0.0);
        body.setLinearVel(0.0, 0.0, 0.0);
    }
    if (ctx.frame === 90) {
        log.puts(JSON.stringify({ tag: "DONE", collisionEnter: collisionEnter, collisionExit: collisionExit,
            triggerEnter: triggerEnter, triggerExit: triggerExit }) + "\\n");
        log.close();
        // Stop callbacks before the closed log can be touched.
        ctx.player.onCollisionEnter = ctx.player.onCollisionExit = null;
        ctx.zone.onTriggerEnter = ctx.zone.onTriggerExit = null;
    }
}` }];
try {
  const generated = A.generateProject(p);
  // Capture errors thrown in frame callbacks as well as setup failures.
  generated.main = generated.main.replace("Screen.display(() => {", "Screen.display(() => { try {")
    .replace(/\}\);\s*$/, `} catch (error) {
        const file = std.open("probe.log", "a");
        file.puts(JSON.stringify({ tag: "ERROR", message: String(error), stack: String(error.stack) }) + "\\n");
        file.close(); throw error;
    } });`);
  const log = await runConsoleFixture(generated, { complete: text => text.includes('"tag":"DONE"') || text.includes('"tag":"ERROR"') });
  const records = log.trim().split("\n").map(line => JSON.parse(line));
  const done = records.find(r => r.tag === "DONE");
  assert(done, JSON.stringify(records));
  assert(done.collisionEnter >= 1 && done.collisionExit >= 1, "Missing collision lifecycle");
  assert(done.triggerEnter === 2 && done.triggerExit === 1, "Trigger entry/exit/reentry was duplicated or lost");
  await Deno.mkdir(".verification", { recursive: true });
  await Deno.writeTextFile(".verification/physics-events.json", JSON.stringify({ passed: true, records }, null, 2));
  console.log(JSON.stringify({ passed: true, ...done }));
} finally {
  await shutdown();
}
