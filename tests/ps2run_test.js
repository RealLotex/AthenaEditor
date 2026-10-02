import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  HOSTFS_MAX_BOOT_PATH,
  checkBootPath,
  parseProbe,
  probeValue,
  checkCamera,
  checkTemplate,
  findEngineErrors,
  probeScript,
  templateProbeScript,
  TEMPLATE_CASES,
  summarise,
  sabotageCamera,
  stage,
} from "../tools/ps2run.js";

Deno.test("test staging refuses to replace a directory it does not own", async () => {
  const dir = await Deno.makeTempDir({ prefix: "athena-stage-" });
  try {
    await Deno.writeTextFile(`${dir}/keep.txt`, "existing data");
    let error;
    try { await stage(dir, { main: "", scripts: [] }); } catch (e) { error = e; }
    assert(error);
    assertStringIncludes(error.message, "does not own");
    assertEquals(await Deno.readTextFile(`${dir}/keep.txt`), "existing data");
  } finally { await Deno.remove(dir, { recursive: true }); }
});

// ═══════════════════════════════════════════════════════════════════════
//  Boot path length
//
//  Measured on PCSX2 2.6.3 with HostFs: an identical ELF, athena.ini and
//  main.js render from C:\ps2t and from a 135-character folder, and go
//  black from a 136-character one. Files *inside* the folder are not
//  subject to it - a 150-character asset path opens fine from a short
//  folder - so the limit is on the boot directory, i.e. the cwd AthenaEnv
//  reads with getcwd() into boot_path (main.c:43).
//
//  It fails silently: no log line, no error screen, just black. A harness
//  that stages into a long temp path tests nothing and says nothing, which
//  is exactly what happened while writing this file.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("the measured HostFS boot path limit is 135 characters", () => {
  assertEquals(HOSTFS_MAX_BOOT_PATH, 135);
});

Deno.test("a short boot path is accepted", () => {
  const r = checkBootPath("C:\\ps2t");
  assert(r.ok, r.message);
});

Deno.test("a boot path at exactly the limit is accepted", () => {
  const dir = "C:\\" + "a".repeat(HOSTFS_MAX_BOOT_PATH - 3);
  assertEquals(dir.length, HOSTFS_MAX_BOOT_PATH);
  assert(checkBootPath(dir).ok, "135 characters renders on real PCSX2");
});

Deno.test("a boot path one character over the limit is refused", () => {
  const dir = "C:\\" + "a".repeat(HOSTFS_MAX_BOOT_PATH - 2);
  assertEquals(dir.length, HOSTFS_MAX_BOOT_PATH + 1);
  const r = checkBootPath(dir);
  assert(!r.ok, "136 characters goes black on real PCSX2");
  assertStringIncludes(r.message, "136");
});

Deno.test("the refusal explains the failure is silent", () => {
  const r = checkBootPath("C:\\" + "a".repeat(200));
  assert(!r.ok);
  assertStringIncludes(r.message.toLowerCase(), "black");
});

// ═══════════════════════════════════════════════════════════════════════
//  probe.log
//
//  console.log does not reach PCSX2's -logfile: it is quickjs js_print to
//  stdout, and nothing captures it. HostFS writes do work, though, so the
//  program writes probe.log into its own folder and the harness reads it
//  back as a plain Windows file.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("probe lines are parsed into key/value records", () => {
  const rec = parseProbe([
    "[TEST] boot",
    "[TEST] cam.pos 0 7 9",
    "[TEST] frame 60",
    "[TEST] DONE",
  ].join("\n"));
  assertEquals(rec.length, 4);
  assertEquals(rec[0].key, "boot");
  assertEquals(rec[1].key, "cam.pos");
  assertEquals(rec[1].numbers, [0, 7, 9]);
});

Deno.test("non-probe noise in the file is ignored", () => {
  const rec = parseProbe("engine chatter\n[TEST] boot\n\nmore chatter\n");
  assertEquals(rec.length, 1);
  assertEquals(rec[0].key, "boot");
});

Deno.test("a trailing partial line does not become a record", () => {
  // The program is killed mid-flush often enough that this matters.
  const rec = parseProbe("[TEST] boot\n[TEST] cam.pos 0 7");
  assertEquals(rec.length, 2);
  assertEquals(rec[1].numbers, [0, 7]);
});

Deno.test("probeValue finds a record by key", () => {
  const rec = parseProbe("[TEST] cam.pos 1 2 3\n[TEST] cam.tgt 4 5 6");
  assertEquals(probeValue(rec, "cam.tgt").numbers, [4, 5, 6]);
  assertEquals(probeValue(rec, "nope"), null);
});

Deno.test("CRLF is handled, because the file crosses HostFS", () => {
  const rec = parseProbe("[TEST] boot\r\n[TEST] DONE\r\n");
  assertEquals(rec.length, 2);
  assertEquals(rec[1].key, "DONE");
});

// ═══════════════════════════════════════════════════════════════════════
//  The camera assertion
//
//  Camera.target() drags the position along to preserve the view vector
//  (camera.c), so position-then-target leaves the camera somewhere else.
//  Camera.save() reads position and target back (ath_3dcamera.c:10), which
//  turns the 2026-08-02 defect into a numeric check rather than a squint
//  at a screenshot.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("a camera that landed where it was put passes", () => {
  const rec = parseProbe("[TEST] cam.pos 0 7 9\n[TEST] cam.tgt 0 0 0");
  const r = checkCamera(rec, { position: [0, 7, 9], target: [0, 0, 0] });
  assert(r.ok, r.message);
});

Deno.test("float32 rounding does not fail the camera check", () => {
  // Camera.save() returns JS_NewFloat32 values, so exact equality is wrong.
  const rec = parseProbe("[TEST] cam.pos 0 6.9999995 9.0000005\n[TEST] cam.tgt 0 0 0");
  assert(checkCamera(rec, { position: [0, 7, 9], target: [0, 0, 0] }).ok);
});

Deno.test("a camera dragged by target() fails", () => {
  // What position-then-target produces: target() moved the camera by the
  // target delta instead of leaving it at (0,7,9).
  const rec = parseProbe("[TEST] cam.pos 0 14 18\n[TEST] cam.tgt 0 0 0");
  const r = checkCamera(rec, { position: [0, 7, 9], target: [0, 0, 0] });
  assert(!r.ok, "a camera 7 units off must not pass");
  assertStringIncludes(r.message, "position");
});

Deno.test("a missing camera record fails rather than passing vacuously", () => {
  const r = checkCamera(parseProbe("[TEST] boot"), { position: [0, 7, 9], target: [0, 0, 0] });
  assert(!r.ok, "no reading is not a pass");
  assertStringIncludes(r.message.toLowerCase(), "missing");
});

// ═══════════════════════════════════════════════════════════════════════
//  Reading the PCSX2 log
// ═══════════════════════════════════════════════════════════════════════

Deno.test("a clean log reports no errors", () => {
  const log = [
    "[    3,5968] ELF host:C:\\ps2t\\athena.elf with entry point at 0x00107C90 is executing.",
    "[    4,1945] UpdateVSyncRate: Mode Changed to NTSC.",
    "[    0,4132] BIOS rom1 module not found, skipping...",
  ].join("\n");
  assertEquals(findEngineErrors(log), []);
});

Deno.test("the BIOS rom module notice is not an error", () => {
  // It appears on every single boot; treating it as an error makes the
  // harness cry wolf and get ignored.
  assertEquals(findEngineErrors("BIOS rom2 module not found, skipping..."), []);
});

Deno.test("a QuickJS exception is reported", () => {
  const errs = findEngineErrors("TypeError: cannot read property 'puts' of null");
  assertEquals(errs.length, 1);
  assertStringIncludes(errs[0], "TypeError");
});

Deno.test("the ELF failing to load is reported", () => {
  const errs = findEngineErrors("Failed to load ELF host:C:\\ps2t\\athena.elf");
  assertEquals(errs.length, 1);
});

Deno.test("confirming the ELF executed is separate from finding errors", () => {
  const log = "[    4,1945] UpdateVSyncRate: Mode Changed to NTSC.";
  const s = summarise({ log, probe: "", frames: 0 });
  assert(!s.booted, "no 'is executing' line means the ELF never ran");
});

Deno.test("a run that never wrote probe.log is a failure, not a pass", () => {
  const log = "[    3,5968] ELF host:C:\\ps2t\\athena.elf with entry point at 0x00107C90 is executing.";
  const s = summarise({ log, probe: "", frames: 0 });
  assert(s.booted);
  assert(!s.ok, "an empty probe.log means the script died before writing");
  assertStringIncludes(s.failures.join(" "), "probe.log");
});

Deno.test("a run missing its DONE sentinel is a failure", () => {
  const log = "ELF host:C:\\ps2t\\athena.elf with entry point at 0x0 is executing.";
  const s = summarise({ log, probe: "[TEST] boot\n[TEST] frame 60", frames: 60 });
  assert(!s.ok, "no DONE means it hung or died mid-run");
  assertStringIncludes(s.failures.join(" "), "DONE");
});

Deno.test("a complete run passes", () => {
  const log = "ELF host:C:\\ps2t\\athena.elf with entry point at 0x0 is executing.";
  const s = summarise({
    log,
    probe: "[TEST] boot\n[TEST] cam.pos 0 7 9\n[TEST] cam.tgt 0 0 0\n[TEST] DONE",
    frames: 180,
  });
  assert(s.ok, s.failures.join("; "));
});

// ═══════════════════════════════════════════════════════════════════════
//  The probe script
//
//  It goes in as a behaviour script, so nothing in src/codegen/ changes to
//  make a scene testable.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("the probe script writes probe.log and stops on its own", () => {
  const src = probeScript({ frames: 180 });
  assertStringIncludes(src, 'std.open("probe.log", "w")');
  assertStringIncludes(src, "[TEST] DONE");
  assertStringIncludes(src, "180");
});

Deno.test("the probe script exports the init/update pair codegen imports", () => {
  const src = probeScript({ frames: 60 });
  assertStringIncludes(src, "export function init");
  assertStringIncludes(src, "export function update");
});

Deno.test("the probe script flushes, because the run ends by being killed", () => {
  assertStringIncludes(probeScript({ frames: 60 }), "flush()");
});

Deno.test("the probe script reads the camera back through Camera.save", () => {
  assertStringIncludes(probeScript({ frames: 60 }), "Camera.save()");
});

// ═══════════════════════════════════════════════════════════════════════
//  The template probe
//
//  A controller is a string until something runs it. The template probe runs
//  it WITH INPUT: Pads exposes lx/ly as setters (ath_pads.c:643), and the
//  probe object is first in the scene, so it can write the stick after
//  pad.update() and before the controller reads it.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("the template probe fakes stick input and samples three times", () => {
  const src = templateProbeScript({ rest: 60, right: 150, forward: 240 });
  assertStringIncludes(src, "pad.lx = 100");
  assertStringIncludes(src, "pad.ly = -100");
  for (const tag of ['sample(ctx, "rest")', 'sample(ctx, "right")', 'sample(ctx, "fwd")']) {
    assertStringIncludes(src, tag);
  }
  assertStringIncludes(src, "[TEST] DONE");
  assertStringIncludes(src, "flush()");
});

Deno.test("the template probe reads the body and the camera together", () => {
  const src = templateProbeScript();
  assertStringIncludes(src, "ctx.physics.bodies.player.getPosition()");
  assertStringIncludes(src, "Camera.save()");
});

// A run of the Top Down template as it should come back: the body at rest on
// the ground, the camera 13 up and 9 back, and the stick moving it.
const GOOD_TOPDOWN = [
  "[TEST] boot",
  "[TEST] rest.body 0 0.5 0",
  "[TEST] rest.cam 0 13.5 9",
  "[TEST] rest.tgt 0 0.5 0",
  "[TEST] right.body 8.9 0.5 0",
  "[TEST] right.cam 8.9 13.5 9",
  "[TEST] right.tgt 8.9 0.5 0",
  "[TEST] fwd.body 8.9 0.5 -8.9",
  "[TEST] DONE",
].join("\n");

Deno.test("a template run that did everything right passes", () => {
  const checks = checkTemplate(parseProbe(GOOD_TOPDOWN), TEMPLATE_CASES["top-down"]);
  const bad = checks.filter(([, ok]) => !ok);
  assertEquals(bad, [], bad.map(([n, , d]) => `${n}: ${d}`).join("; "));
});

Deno.test("a character that fell through the floor fails", () => {
  const probe = parseProbe(GOOD_TOPDOWN.replace("rest.body 0 0.5 0", "rest.body 0 -42 0"));
  const checks = checkTemplate(probe, TEMPLATE_CASES["top-down"]);
  assert(checks.some(([n, ok]) => n === "gravity" && !ok), "a body at y=-42 is not standing on anything");
});

Deno.test("a camera that ignored the controller fails", () => {
  // What a script that threw on its first line would leave behind: the camera
  // still where the scene put it while the body moved on without it.
  const probe = parseProbe(GOOD_TOPDOWN.replace("right.cam 8.9 13.5 9", "right.cam 0 13.5 9"));
  const checks = checkTemplate(probe, TEMPLATE_CASES["top-down"]);
  // rest.cam is what the camera check reads, so move the body instead.
  const shifted = parseProbe(GOOD_TOPDOWN.replace("rest.cam 0 13.5 9", "rest.cam 0 3 0"));
  assert(checkTemplate(shifted, TEMPLATE_CASES["top-down"]).some(([n, ok]) => n.startsWith("cam") && !ok));
  assert(checks.length > 0);
});

Deno.test("a character that did not move when the stick was held fails", () => {
  const probe = parseProbe(GOOD_TOPDOWN.replace("right.body 8.9 0.5 0", "right.body 0 0.5 0"));
  const checks = checkTemplate(probe, TEMPLATE_CASES["top-down"]);
  assert(checks.some(([n, ok]) => n === "right" && !ok), "holding right for 90 frames must move the body");
});

Deno.test("a character that moved the wrong way fails", () => {
  // The sign of the stick, the forward vector and the rotation convention all
  // land here: right must be +X, not -X.
  const probe = parseProbe(GOOD_TOPDOWN.replace("right.body 8.9 0.5 0", "right.body -8.9 0.5 0"));
  assert(checkTemplate(probe, TEMPLATE_CASES["top-down"]).some(([n, ok]) => n === "right" && !ok));
});

Deno.test("a side-scroller that drifted off the play plane fails", () => {
  const probe = parseProbe([
    "[TEST] rest.body -6 0.5 0",
    "[TEST] rest.cam -6 2.5 11",
    "[TEST] right.body 2 0.5 0",
    "[TEST] fwd.body 2 0.5 -3",      // z must stay pinned
    "[TEST] DONE",
  ].join("\n"));
  const checks = checkTemplate(probe, TEMPLATE_CASES["side-scroller"]);
  assert(checks.some(([n, ok]) => n === "forward" && !ok), "z drift breaks a 2D game");
});

Deno.test("a run with no samples at all fails rather than passing vacuously", () => {
  const checks = checkTemplate(parseProbe("[TEST] boot"), TEMPLATE_CASES["top-down"]);
  assert(checks.length > 0);
  assert(checks.every(([, ok]) => !ok));
});

Deno.test("every template with a controller has expectations to check", () => {
  // A template added without a case here would run on the emulator and be
  // reported as passing on the strength of booting alone.
  for (const id of ["first-person", "third-person", "side-scroller", "top-down"]) {
    assert(TEMPLATE_CASES[id], `${id} has no TEMPLATE_CASES entry`);
    assert(typeof TEMPLATE_CASES[id].camera === "function");
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  Sabotage
//
//  A check that has only ever been green is not evidence that it can go
//  red. --sabotage puts the 2026-08-02 defect back into the emitted source
//  so the camera check can be watched failing on the emulator.
// ═══════════════════════════════════════════════════════════════════════

const MAIN = [
  "Render.init();",
  "Camera.target(2, 1, -3);",
  "Camera.position(0, 7, 9);",
  "Camera.update();",
].join("\n");

Deno.test("sabotage swaps the camera calls and nothing else", () => {
  const out = sabotageCamera(MAIN).split("\n");
  assertEquals(out[0], "Render.init();");
  assertEquals(out[1], "Camera.position(0, 7, 9);");
  assertEquals(out[2], "Camera.target(2, 1, -3);");
  assertEquals(out[3], "Camera.update();");
});

Deno.test("sabotage refuses when the calls are already the wrong way round", () => {
  // Otherwise a future emitter change would silently make --sabotage a no-op
  // and the negative test would 'pass' by testing nothing.
  let threw = false;
  try { sabotageCamera(sabotageCamera(MAIN)); } catch { threw = true; }
  assert(threw, "sabotaging an already-broken main.js must be an error");
});

Deno.test("sabotage refuses when there are no camera calls to swap", () => {
  let threw = false;
  try { sabotageCamera("Render.init();"); } catch { threw = true; }
  assert(threw);
});
