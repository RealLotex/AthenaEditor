// Runs generated code in PCSX2 and asserts on what it did.
//
//   deno task ps2run                          stage the regression fixture, run, report
//   deno task ps2run --template top-down      run one project template instead
//   deno task ps2run --template all           run every template that ships a controller
//   deno task ps2run --keep                   leave the staged folder behind to poke at
//
// Why any of this exists: the unit tests assert the *shape* of emitted code.
// They cannot tell you that Camera.target() left the camera where the scene
// put it, because that is a fact about the engine, not about the string. This
// runs the program on the emulator and reads back what actually happened.
//
// ── how the pieces talk ───────────────────────────────────────────────────
//
// console.log is quickjs js_print to stdout (quickjs-libc.c:3476) and PCSX2
// captures none of it - the -logfile holds EE/IOP kernel output only. Writing
// through HostFS does work, so the program writes probe.log into its own
// folder, which is a real Windows directory, and this file reads it back.
//
// Screenshots go through PrintWindow(PW_RENDERFULLCONTENT) in ps2capture.ps1.
// PCSX2's own F8 needs the render window focused, and SetForegroundWindow is
// refused to a background process; fullscreen plus focus-stealing does work
// but hijacks the desktop and stops presenting when the window is minimised.

import { load, PURE_MODULES } from "../tests/_load.js";
import { resolve, parse } from "jsr:@std/path@1";

const HERE = new URL(".", import.meta.url);
const ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/^\//, "");

// ═══════════════════════════════════════════════════════════════════════
//  Boot path length
// ═══════════════════════════════════════════════════════════════════════

// Measured on PCSX2 2.6.3 with HostFs = true: the same athena.elf, athena.ini
// and main.js render from a 135-character folder and go black from a
// 136-character one. Files *inside* the folder are not affected - a
// 150-character asset path opens fine from a short folder - so the limit is on
// the boot directory, which is the cwd AthenaEnv reads with getcwd() into
// boot_path (reference/AthenaEnvSourceFiles/src/main.c:43).
//
// Keep the number here rather than a safety-margined guess: it is a measured
// boundary, and tests/ps2run_test.js pins both sides of it.
export const HOSTFS_MAX_BOOT_PATH = 135;

export function checkBootPath(dir) {
  const n = dir.length;
  if (n <= HOSTFS_MAX_BOOT_PATH) return { ok: true, message: "" };
  return {
    ok: false,
    message:
      `boot path is ${n} characters, over the ${HOSTFS_MAX_BOOT_PATH} that PCSX2's ` +
      `HostFS accepts:\n  ${dir}\n` +
      `AthenaEnv will not find main.js and the screen stays black with nothing ` +
      `in the log - the failure is completely silent. Stage somewhere shorter.`,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  probe.log
// ═══════════════════════════════════════════════════════════════════════

const PROBE_PREFIX = "[TEST]";

export function parseProbe(text) {
  const out = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith(PROBE_PREFIX)) continue;
    const rest = line.slice(PROBE_PREFIX.length).trim();
    if (!rest) continue;
    const [key, ...tail] = rest.split(/\s+/);
    const numbers = tail.map(Number).filter((n) => !Number.isNaN(n));
    out.push({ key, numbers, raw: line });
  }
  return out;
}

export function probeValue(records, key) {
  return records.find((r) => r.key === key) || null;
}

// ═══════════════════════════════════════════════════════════════════════
//  The camera assertion
// ═══════════════════════════════════════════════════════════════════════

// Camera.save() hands back JS_NewFloat32 values (ath_3dcamera.c:16), so the
// readback is single precision and exact equality is the wrong test.
const CAM_TOLERANCE = 1e-3;

export function checkCamera(records, expected) {
  const pos = probeValue(records, "cam.pos");
  const tgt = probeValue(records, "cam.tgt");
  if (!pos || !tgt) {
    return {
      ok: false,
      message: `camera readback missing from probe.log (cam.pos ${pos ? "present" : "absent"}, ` +
        `cam.tgt ${tgt ? "present" : "absent"}) - no reading is not a pass`,
    };
  }
  const off = (got, want) =>
    want.map((w, i) => Math.abs((got[i] ?? NaN) - w)).reduce((a, b) => Math.max(a, b), 0);

  const dp = off(pos.numbers, expected.position);
  const dt = off(tgt.numbers, expected.target);
  const fmt = (v) => `(${v.join(", ")})`;

  if (dp > CAM_TOLERANCE) {
    return {
      ok: false,
      message:
        `camera position is ${fmt(pos.numbers)}, expected ${fmt(expected.position)} ` +
        `(off by ${dp.toFixed(4)}). Camera.target() drags the position along to ` +
        `preserve the view vector, so the scene must target before it positions.`,
    };
  }
  if (dt > CAM_TOLERANCE) {
    return {
      ok: false,
      message: `camera target is ${fmt(tgt.numbers)}, expected ${fmt(expected.target)} ` +
        `(off by ${dt.toFixed(4)})`,
    };
  }
  return { ok: true, message: `camera at ${fmt(pos.numbers)} looking at ${fmt(tgt.numbers)}` };
}

// ═══════════════════════════════════════════════════════════════════════
//  Reading the PCSX2 log
// ═══════════════════════════════════════════════════════════════════════

// "BIOS rom1 module not found, skipping..." is on every boot. Matching it
// would make the harness cry wolf on a perfectly good run.
const LOG_ERRORS = [
  /\b(?:TypeError|ReferenceError|SyntaxError|RangeError|InternalError)\b.*/,
  /Failed to load .*/,
  /Unhandled promise rejection.*/,
];

export function findEngineErrors(logText) {
  const out = [];
  for (const line of String(logText).split(/\r?\n/)) {
    for (const re of LOG_ERRORS) {
      const m = line.match(re);
      if (m) { out.push(m[0].trim()); break; }
    }
  }
  return out;
}

export function summarise({ log = "", probe = "", frames = 0 } = {}) {
  const failures = [];
  const booted = /is executing\./.test(log);
  if (!booted) failures.push("the ELF never reached its entry point");

  for (const e of findEngineErrors(log)) failures.push(`engine error: ${e}`);

  const records = parseProbe(probe);
  if (records.length === 0) {
    failures.push("probe.log is empty - the script died before it wrote anything");
  } else if (!probeValue(records, "DONE")) {
    failures.push("probe.log has no DONE sentinel - the run hung or died part way");
  }

  return { ok: failures.length === 0, booted, records, frames, failures };
}

// ═══════════════════════════════════════════════════════════════════════
//  The probe, as a behaviour script
// ═══════════════════════════════════════════════════════════════════════

// Delivered through project.scripts[], which codegen/resolve.js falls back to
// when no file of that name is on disk. Nothing in src/codegen/ has to change
// to make a scene testable.
export function probeScript({ frames = 180 } = {}) {
  return `// Generated by tools/ps2run.js. Reports what the engine actually did.
//
// console.log goes to stdout and PCSX2 captures none of it, so this writes
// into probe.log next to main.js - over HostFS that is a real Windows file.

let _log = null;
let _n = 0;

function say(line) {
    if (_log === null) return;
    _log.puts(line + "\\n");
    _log.flush();          // the run usually ends by being killed
}

function v3(v) {
    return v.x + " " + v.y + " " + v.z;
}

export function init(ctx) {
    _log = std.open("probe.log", "w");
    say("[TEST] boot");

    // Camera.save() reads position and target back out of the engine
    // (ath_3dcamera.c:10), which is what makes the target()-drags-position
    // defect a number rather than a squint at a screenshot.
    const cam = Camera.save();
    say("[TEST] cam.pos " + v3(cam.position));
    say("[TEST] cam.tgt " + v3(cam.target));
}

export function update(ctx, pad) {
    _n++;
    if (_n === 1)   say("[TEST] frame 1");
    if (_n === 60)  say("[TEST] frame 60");
    if (_n === ${frames}) {
        say("[TEST] frames " + _n);
        say("[TEST] DONE");
        _log.close();
        _log = null;
    }
}
`;
}

// ═══════════════════════════════════════════════════════════════════════
//  The template probe
// ═══════════════════════════════════════════════════════════════════════
//
// A template's controller is the one part of the editor's output that unit
// tests can barely reach: it is a string until something runs it. This probe
// runs it, and does it with input, because a controller that reads the stick
// wrongly is otherwise indistinguishable from one that reads it at all.
//
// The trick is that Pads exposes lx/ly/rx/ry as SETTERS (ath_pads.c:643), so
// the probe can write the stick after pad.update() has refreshed it from the
// real (neutral) pad. The probe object is placed FIRST in the scene, so its
// update() runs before the controller's and the injected value is what the
// controller reads that frame. Its own samples are therefore one frame stale,
// which is why every sample is taken after the input has been held for a
// while rather than on the frame it changes.

export function templateProbeScript({ rest = 60, right = 150, forward = 240 } = {}) {
  return `// Generated by tools/ps2run.js. Drives the controller and reports the result.
//
// console.log goes to stdout and PCSX2 captures none of it, so this writes
// into probe.log next to main.js - over HostFS that is a real Windows file.

let _log = null;
let _n = 0;

function say(line) {
    if (_log === null) return;
    _log.puts(line + "\\n");
    _log.flush();          // the run usually ends by being killed
}

function a3(a) { return a[0] + " " + a[1] + " " + a[2]; }
function v3(v) { return v.x + " " + v.y + " " + v.z; }

// The body and the camera as the previous frame left them: this runs before
// the controller, so the two readings are a consistent pair.
function sample(ctx, tag) {
    const cam = Camera.save();
    say("[TEST] " + tag + ".body " + a3(ctx.physics.bodies.player.getPosition()));
    say("[TEST] " + tag + ".cam " + v3(cam.position));
    say("[TEST] " + tag + ".tgt " + v3(cam.target));
}

export function init(ctx) {
    _log = std.open("probe.log", "w");
    say("[TEST] boot");
}

export function update(ctx, pad) {
    _n++;

    // Fake stick input. pad.update() already ran this frame, so these survive
    // until the next one.
    if (_n === ${rest}) sample(ctx, "rest");
    if (_n > ${rest} && _n <= ${right}) pad.lx = 100;      // hold right
    if (_n === ${right}) sample(ctx, "right");
    if (_n > ${right} && _n <= ${forward}) { pad.lx = 0; pad.ly = -100; }   // hold up
    if (_n === ${forward}) {
        sample(ctx, "fwd");
        say("[TEST] frames " + _n);
        say("[TEST] DONE");
        _log.close();
        _log = null;
    }
}
`;
}

// What each template promises, as numbers the emulator can be asked for.
//
//  restY     where the body settles under gravity — half its own height
//  camera    the camera's relation to the body once it is at rest
//  right     what holding the stick right must do to the body
//  forward   what holding it up must do
//
// The camera relations are the controllers' own arithmetic, restated. That is
// deliberate: if the two ever disagree, one of them is wrong and the run says
// which reading the engine produced.
export const TEMPLATE_CASES = {
  "first-person": {
    restY: 0.4,
    camera: (cam, body) => ["cam.x", "cam.y", "cam.z"].map((n, i) =>
      [n, Math.abs(cam[i] - (body[i] + (i === 1 ? 1.25 : 0))), 0.05]),
    right: { axis: 0, sign: 1, min: 1.0 },
    forward: { axis: 2, sign: -1, min: 1.0 },
  },
  "third-person": {
    restY: 0.5,
    camera: (cam, body) => [
      // 8 units back along +Z at yaw 0, lifted by the starting pitch of 0.35.
      ["cam.x", Math.abs(cam[0] - body[0]), 0.05],
      ["cam.y", Math.abs(cam[1] - (body[1] + 1.5 + 8 * Math.sin(0.35))), 0.05],
      ["cam.z", Math.abs(cam[2] - (body[2] + 8 * Math.cos(0.35))), 0.05],
    ],
    right: { axis: 0, sign: 1, min: 1.0 },
    forward: { axis: 2, sign: -1, min: 1.0 },
  },
  "side-scroller": {
    restY: 0.5,
    camera: (cam, body) => [
      ["cam.x", Math.abs(cam[0] - body[0]), 0.05],
      ["cam.z", Math.abs(cam[2] - 11.0), 0.05],
    ],
    right: { axis: 0, sign: 1, min: 1.0 },
    // The left stick's vertical axis is not wired to anything, and z is pinned.
    forward: { axis: 2, sign: 0, max: 0.05 },
  },
  "top-down": {
    restY: 0.5,
    camera: (cam, body) => [
      ["cam.x", Math.abs(cam[0] - body[0]), 0.05],
      ["cam.y", Math.abs(cam[1] - (body[1] + 13.0)), 0.05],
      ["cam.z", Math.abs(cam[2] - (body[2] + 9.0)), 0.05],
    ],
    right: { axis: 0, sign: 1, min: 1.0 },
    forward: { axis: 2, sign: -1, min: 1.0 },
  },
};

/** Turn one template's probe records into named pass/fail checks. */
export function checkTemplate(records, spec) {
  const out = [];
  const at = (tag, what) => probeValue(records, `${tag}.${what}`)?.numbers || null;

  const rest = at("rest", "body");
  if (!rest) {
    return [["rest", false, "no rest.body sample — the controller never ran a full 60 frames"]];
  }

  out.push([
    "gravity",
    Math.abs(rest[1] - spec.restY) < 0.15,
    `body settled at y=${rest[1]}, expected ${spec.restY} +/- 0.15`,
  ]);

  const cam = at("rest", "cam");
  if (!cam) out.push(["camera", false, "no rest.cam sample"]);
  else {
    for (const [name, delta, tol] of spec.camera(cam, rest)) {
      out.push([name, delta <= tol, `off by ${delta.toFixed(4)} (tolerance ${tol})`]);
    }
  }

  for (const phase of ["right", "forward"]) {
    const want = spec[phase];
    const tag = phase === "right" ? "right" : "fwd";
    const from = phase === "right" ? rest : at("right", "body");
    const now = at(tag, "body");
    if (!now || !from) { out.push([phase, false, `no ${tag}.body sample`]); continue; }
    const moved = now[want.axis] - from[want.axis];
    const axis = "xyz"[want.axis];
    if (want.sign === 0) {
      out.push([phase, Math.abs(moved) <= want.max, `${axis} moved ${moved.toFixed(3)}, must stay put`]);
    } else {
      out.push([
        phase,
        moved * want.sign >= want.min,
        `${axis} moved ${moved.toFixed(3)}, wanted ${want.sign > 0 ? "+" : "-"}${want.min} or more`,
      ]);
    }
  }
  return out;
}

// ═══════════════════════════════════════════════════════════════════════
//  Staging and running
// ═══════════════════════════════════════════════════════════════════════

const RUNTIME_SRC = `${ROOT}/reference/AthenaEnvReleaseAndExamples`;

export async function stage(dir, { main, scripts, sceneFiles = [], assets = [] }, assetFiles = []) {
  dir = resolve(dir);
  const check = checkBootPath(dir);
  if (!check.ok) throw new Error(check.message);
  const marker = `${dir}/.athena-test-staging`;
  if (dir === parse(dir).root || resolve(ROOT).startsWith(`${dir}\\`) || dir === resolve(ROOT)) {
    throw Error("Choose a dedicated test output directory, not the repository or a drive root.");
  }
  let existing;
  try { existing = await Deno.lstat(dir); } catch (error) { if (!(error instanceof Deno.errors.NotFound)) throw error; }
  if (existing) {
    if (existing.isSymlink || await Deno.readTextFile(marker).catch(() => "") !== "AthEditor test staging\n") {
      throw Error(`Refusing to replace an existing directory that this test harness does not own: ${dir}`);
    }
    await Deno.remove(dir, { recursive: true });
  }
  await Deno.mkdir(`${dir}/scripts`, { recursive: true });
  await Deno.writeTextFile(marker, "AthEditor test staging\n");

  await Deno.copyFile(`${RUNTIME_SRC}/athena.elf`, `${dir}/athena.elf`);
  await Deno.copyFile(`${RUNTIME_SRC}/athena.ini`, `${dir}/athena.ini`);
  await Deno.writeTextFile(`${dir}/main.js`, main);
  for (const s of [...sceneFiles, ...scripts]) {
    await Deno.writeTextFile(`${dir}/${s.filename}`, s.content);
  }
  for(const asset of assets) {
    await Deno.mkdir(`${dir}/${asset.filename.split("/").slice(0,-1).join("/")}`,{recursive:true});
    if(asset.dataUrl)await Deno.writeFile(`${dir}/${asset.filename}`,Uint8Array.from(atob(asset.dataUrl.split(",")[1]),c=>c.charCodeAt(0)));
    else await Deno.writeTextFile(`${dir}/${asset.filename}`,asset.content);
  }
  for (const a of assetFiles) {
    await Deno.mkdir(`${dir}/${a.path.split("/").slice(0, -1).join("/")}`, { recursive: true });
    await Deno.writeTextFile(`${dir}/${a.path}`, a.text);
  }
  return dir;
}

export async function launch(dir, { seconds = 14, png }) {
  dir=dir.replaceAll("/", "\\");
  png=png.replaceAll("/", "\\");
  const ps1 = decodeURIComponent(new URL("ps2capture.ps1", HERE).pathname).replace(/^\//, "");
  const cmd = new Deno.Command("powershell", {
    args: [
      "-ExecutionPolicy", "Bypass", "-File", ps1,
      "-Elf", `${dir}\\athena.elf`,
      "-Log", `${dir}\\pcsx2.log`,
      "-Png", png,
      "-Seconds", String(seconds),
    ],
    stdout: "piped",
    stderr: "piped",
  });
  const out = await cmd.output();
  return new TextDecoder().decode(out.stdout) + new TextDecoder().decode(out.stderr);
}

const read = async (p) => await Deno.readTextFile(p).catch(() => "");

/**
 * Reintroduces the 2026-08-02 camera defect in the emitted source, so the
 * harness can be watched failing. A check that has only ever been green is not
 * evidence that it can go red.
 *
 * setCameraTarget (camera.c) subtracts the target delta from the position to
 * preserve the view vector, so running position() before target() leaves the
 * camera somewhere other than where the scene put it.
 */
export function sabotageCamera(main) {
  const target = main.match(/^Camera\.target\([^\n]*\);$/m);
  const position = main.match(/^Camera\.position\([^\n]*\);$/m);
  if (!target || !position) throw new Error("sabotage: camera calls not found in main.js");
  if (main.indexOf(target[0]) > main.indexOf(position[0])) {
    throw new Error("sabotage: position already precedes target - nothing to break");
  }
  return main
    .replace(target[0], "\0SWAP\0")
    .replace(position[0], target[0])
    .replace("\0SWAP\0", position[0]);
}

// ── the regression fixture ────────────────────────────────────────────────
// The four defects the 2026-08-02 PCSX2 run exposed, all since fixed and none
// since executed. See state.md.
function regressionProject(A) {
  const p = A.mkProject();
  const scene = p.scenes[0];
  scene.name = "Regression";
  scene.objects = [];

  const obj = (name, comps = {}, pos) => {
    const o = A.mkObject(name);
    for (const [k, patch] of Object.entries(comps)) {
      o.components[k] = Object.assign(A.makeComponent(k), patch);
    }
    if (pos) o.components.transform.position = pos;
    return o;
  };

  // The orbit rig would fight the camera every frame, and the readback would
  // then measure the rig rather than what the scene emitted.
  scene.defaultCameraRig = false;

  // The target must not sit at the origin. Camera.target() moves the camera by
  // the *delta* from the previous target, and the engine starts at (0,0,0), so
  // a scene aimed at the origin produces a zero delta and position-then-target
  // reads back identical to target-then-position. Aiming somewhere else is
  // what makes this check able to fail at all - see --sabotage.
  const cam = obj("Main Camera", { camera: { fov: 55, target: { x: 2, y: 1, z: -3 } } }, A.v3(0, 7, 9));

  // Light square to the +X side, low enough that the decal is noticeably
  // stretched: a shadow that is not turned onto the light's azimuth, or not
  // foreshortened by 1/sin(elevation), is obvious rather than arguable.
  const sun = obj("Sun", { light: { direction: A.v3(1, 0.6, 0) } });

  const ground = obj("Ground", { model: { file: "ground.obj" } });

  // playerObj() is asymmetric - it has a nose pointing +Z. A sphere or a cube
  // casts the same silhouette whichever way the decal is turned, which is
  // exactly how a rotated shadow shipped unnoticed.
  const caster = obj("Caster", {
    model: { file: "player.obj" },
    script: { file: "Probe.js" },
  }, A.v3(0, 0.5, 0));

  const shadow = obj("CasterShadow", {
    shadow: { caster: "Caster", lightSource: "Sun", follow: true, groundY: 0 },
  });

  scene.objects = [cam, sun, ground, caster, shadow];
  return {
    project: A.migrateProject(p),
    camera: { position: [0, 7, 9], target: [2, 1, -3] },
    meshes: ["player.obj", "ground.obj"],
  };
}

// ── the template fixture ──────────────────────────────────────────────────
// A template exactly as New Project would create it, plus a probe object at
// the head of the scene. Being first is what lets it fake stick input for the
// controller that runs after it.
export function templateFixture(A, id) {
  const tpl = A.PROJECT_TEMPLATES.find((t) => t.id === id);
  if (!tpl) throw new Error(`no template "${id}"`);
  const spec = TEMPLATE_CASES[id];
  if (!spec) throw new Error(`template "${id}" has no expectations in TEMPLATE_CASES`);

  const project = A.migrateProject(tpl.make());
  const scene = A.activeScene(project);
  const probe = A.mkObject("Probe");
  probe.components.script = Object.assign(A.makeComponent("script"), {
    file: "Probe.js", ctxKey: "probe",
  });
  scene.objects.unshift(probe);

  return { tpl, spec, project, meshes: tpl.needs.map((p) => p.split("/").pop()) };
}

/** Stage, launch, and read back. Shared by both fixtures. */
async function runOnce(dir, gen, assetFiles, { seconds }) {
  await stage(dir, gen, assetFiles);
  console.log(`staged  ${dir}  (${dir.length}/${HOSTFS_MAX_BOOT_PATH} chars)`);

  const png = `${dir}\\frame.png`;
  const runnerOut = await launch(dir, { seconds, png });
  console.log(runnerOut.trim().split(/\r?\n/).map((l) => `  ${l}`).join("\n"));

  return {
    png,
    probe: await read(`${dir}/probe.log`),
    log: await read(`${dir}/pcsx2.log`),
  };
}

function report(name, checks, s, png) {
  console.log("");
  for (const [label, ok, detail] of checks) {
    console.log(`  ${ok ? "PASS" : "FAIL"}  ${label.padEnd(8)} ${detail}`);
  }
  for (const f of s.failures) console.log(`  FAIL  run      ${f}`);
  const ok = s.ok && checks.every(([, c]) => c);
  console.log(`\n${ok ? "PASS" : "FAIL"} ${name} - screenshot at ${png}`);
  return ok;
}

const fatalDiagnostics = (gen) => {
  const fatal = gen.diagnostics.filter((d) => d.level === "error");
  for (const d of fatal) console.error(`codegen error: ${d.message}`);
  return fatal.length > 0;
};

async function runRegression(A, { dir, sabotage }) {
  const frames = 180;
  const { project, camera, meshes } = regressionProject(A);
  const modelDir = project.dirs?.models || "3dmodels";
  const assetFiles = A.templateAssetFiles(project, meshes);

  const gen = A.generateProject(project, [
    { name: "Probe.js", cat: "scripts", content: probeScript({ frames }) },
    ...assetFiles.map((file) => ({ name: file.path.split("/").pop(), cat: "models", folder: modelDir, content: file.text })),
  ]);
  if (fatalDiagnostics(gen)) return null;

  if (sabotage) {
    gen.main = sabotageCamera(gen.main);
    console.log("sabotage: emitting Camera.position() before Camera.target()");
  }

  const { png, probe, log } = await runOnce(dir, gen, assetFiles, { seconds: 16 });
  const s = summarise({ log, probe, frames });
  const cam = checkCamera(s.records, camera);

  return report("regression", [
    ["boot", s.booted, "the ELF reached its entry point"],
    ["probe", s.records.length > 0,
      `${s.records.length} probe records, DONE ${probeValue(s.records, "DONE") ? "yes" : "no"}`],
    ["camera", cam.ok, cam.message],
  ], s, png);
}

async function runTemplate(A, id, { dir }) {
  const frames = 240;
  const { spec, project, meshes } = templateFixture(A, id);
  const modelDir = project.dirs?.models || "3dmodels";
  const assetFiles = A.templateAssetFiles(project, meshes);

  const gen = A.generateProject(project, [
    { name: "Probe.js", cat: "scripts", content: templateProbeScript() },
    ...assetFiles.map((file) => ({ name: file.path.split("/").pop(), cat: "models", folder: modelDir, content: file.text })),
  ]);
  if (fatalDiagnostics(gen)) return null;

  console.log(`\n=== ${id} ===`);
  // 240 frames is 4 seconds of emulated time, and the boot costs a few more.
  const { png, probe, log } = await runOnce(dir, gen, assetFiles, { seconds: 24 });
  const s = summarise({ log, probe, frames });

  return report(id, [
    ["boot", s.booted, "the ELF reached its entry point"],
    ["probe", s.records.length > 0,
      `${s.records.length} probe records, DONE ${probeValue(s.records, "DONE") ? "yes" : "no"}`],
    ...checkTemplate(s.records, spec),
  ], s, png);
}

async function main() {
  const argv = Deno.args;
  const keep = argv.includes("--keep");
  const dirArg = argv.indexOf("--dir");
  // Short by default: the staging folder must stay under the HostFS limit,
  // and the OS temp directory on this machine is already over it.
  const dir = dirArg >= 0 ? argv[dirArg + 1] : "C:\\ps2run";

  const pre = checkBootPath(dir);
  if (!pre.ok) {
    console.error(`ps2run: ${pre.message}`);
    Deno.exit(2);
  }

  // templates/assets.js supplies the placeholder meshes, so the fixtures need
  // no binary art checked in anywhere.
  const A = await load([
    ...PURE_MODULES,
    "templates/assets.js",
    "templates/firstperson.js", "templates/thirdperson.js", "templates/sidescroller.js",
    "templates/topdown.js", "templates/registry.js",
  ]);

  const tArg = argv.indexOf("--template");
  let ok;
  if (tArg >= 0) {
    const want = argv[tArg + 1];
    const ids = want === "all" ? Object.keys(TEMPLATE_CASES) : [want];
    const results = [];
    for (const id of ids) results.push([id, await runTemplate(A, id, { dir })]);
    ok = results.every(([, r]) => r === true);
    if (ids.length > 1) {
      console.log("\n── summary ──");
      for (const [id, r] of results) console.log(`  ${r ? "PASS" : "FAIL"}  ${id}`);
    }
  } else {
    ok = await runRegression(A, { dir, sabotage: argv.includes("--sabotage") });
  }

  if (ok === null) Deno.exit(2);
  if (!keep && ok) await Deno.remove(dir, { recursive: true }).catch(() => {});
  Deno.exit(ok ? 0 : 1);
}

if (import.meta.main) await main();
