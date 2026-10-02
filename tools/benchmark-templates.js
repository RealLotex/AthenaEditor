// Measures the generated frame callback inside the bundled Athena ELF.
// Stage both revisions before comparing; run sequentially to avoid host contention.
// No screenshots, global emulator settings, or other PCSX2 processes are touched.
import { load, PURE_MODULES, shutdown } from "../tests/_load.js";
import { join, fromFileUrl } from "jsr:@std/path@1";

const root = fromFileUrl(new URL("..", import.meta.url));
const templates = ["empty", "first-person", "third-person", "side-scroller", "top-down"];
const modules = [...PURE_MODULES, "templates/assets.js", "templates/firstperson.js",
  "templates/thirdperson.js", "templates/sidescroller.js", "templates/topdown.js", "templates/registry.js"];

export function instrumentTemplate(main, playerPosition) {
  const warmup = 120, samples = 600;
  const setup = `
const _benchLog = std.open("benchmark.json", "w");
const _benchTimer = Timer.new();
const _benchTimes = [new Float64Array(${samples}), new Float64Array(${samples}), new Float64Array(${samples}), new Float64Array(${samples})];
const _benchIntervals = new Float64Array(${samples});
let _benchFrame = 0, _benchStart = 0, _benchMark = 0, _benchQueries = 0;
let _benchPrevious = 0;
function _benchCollide(a, b) { if (_benchFrame > ${warmup}) _benchQueries++; return ODE.geomCollide(a, b); }
function _benchSample(slot) {
    const now = Timer.getTime(_benchTimer);
    if (_benchFrame > ${warmup} && _benchFrame <= ${warmup + samples}) _benchTimes[slot][_benchFrame - ${warmup + 1}] = now - _benchMark;
    _benchMark = now;
}
function _benchFinish() {
    const now = Timer.getTime(_benchTimer);
    if (_benchFrame > ${warmup} && _benchFrame <= ${warmup + samples}) _benchTimes[3][_benchFrame - ${warmup + 1}] = now - _benchStart;
    if (_benchFrame !== ${warmup + samples}) return;
    const sums = new Float64Array(4);
    for (let i = 0; i < 4; i++) for (let j = 0; j < ${samples}; j++) sums[i] = sums[i] + _benchTimes[i][j];
    const sorted = Array.from(_benchTimes[3]).sort((a,b) => a-b);
    const interval = new Float64Array(1);
    for (let i = 0; i < ${samples}; i++) interval[0] = interval[0] + _benchIntervals[i];
    _benchLog.puts(JSON.stringify({ runId: _benchRun, samples: ${samples}, warmup: ${warmup}, meanUs: Array.from(sums).map(v => v / ${samples}),
        frameIntervalUs: interval[0] / ${samples},
        p95Us: sorted[${Math.floor(samples * .95)}], contactQueries: _benchQueries,
        ramUsed: System.getMemoryStats().used, vramStatic: Screen.getMemoryStats(Screen.VRAM_USED_STATIC),
        vramDynamic: Screen.getMemoryStats(Screen.VRAM_USED_DYNAMIC), mode: Screen.getMode(), fps: Screen.getFPS(60) }));
    _benchLog.flush(); _benchLog.close();
}
`;
  const input = playerPosition ? `
    // Reset outside the measured interval, replay the same 300-frame input cycle.
    const _phase = (_benchFrame - 1) % 300;
    if (_phase === 0) {
        player_body.setPosition(${playerPosition.join(", ")}); player_body.setLinearVel(0, 0, 0);
        ctx.player.lastHitNormal = null;
    }
    pad.lx = _phase >= 60 && _phase < 210 ? 100 : 0;
    pad.ly = _phase >= 150 && _phase < 210 ? -100 : 0;
    pad.rx = _phase >= 210 && _phase < 270 ? 70 : 0; pad.ry = 0;
    pad.old_btns = 0; pad.btns = _phase === 90 || _phase === 180 ? Pads.CROSS : 0;
` : "";
  main = main.replaceAll("ODE.geomCollide(", "_benchCollide(");
  main = main.replace("Screen.display(() => {", `Screen.display(() => {\n    _benchFrame++;`);
  main = main.replace("    pad.update();", `    pad.update();${input}\n    _benchStart = _benchMark = Timer.getTime(_benchTimer);\n    if (_benchFrame > ${warmup} && _benchFrame <= ${warmup + samples}) _benchIntervals[_benchFrame - ${warmup + 1}] = _benchStart - _benchPrevious;\n    _benchPrevious = _benchStart;`);
  // Phase boundaries also exist for Empty, which has no behaviours or physics.
  const physics = main.indexOf("    // Physics step");
  const camera = main.indexOf("    // Rendering") >= 0 ? main.indexOf("    // Rendering") : main.indexOf("    Camera.update();");
  if (physics >= 0) main = main.slice(0, physics) + "    _benchSample(0);\n" + main.slice(physics);
  else main = main.slice(0, camera) + "    _benchSample(0);\n" + main.slice(camera);
  if (main.includes("    // Rendering")) main = main.replace("    // Rendering", "    _benchSample(1);\n    // Rendering");
  else main = main.replace("    Camera.update();", "    _benchSample(1);\n    Camera.update();");
  const close = main.lastIndexOf("});");
  main = main.slice(0, close) + "    _benchSample(2);\n    _benchFinish();\n" + main.slice(close);
  return 'const _benchRun = std.loadFile("run-id.txt");\n' + setup + main;
}

async function stage(label, ref) {
  if (ref && !/^[0-9a-f]{7,40}$/.test(ref)) throw Error("Stage a revision using its Git commit hash.");
  const git = async args => {
    const result = await new Deno.Command("git", { args, cwd: root }).output();
    if (!result.success) throw Error(new TextDecoder().decode(result.stderr));
    return new TextDecoder().decode(result.stdout);
  };
  const revision = (await git(["rev-parse", ref || "HEAD"])).trim();
  const A = await load(modules, ref ? { readSource: rel => git(["show", `${revision}:src/${rel}`]) } : {});
  const runtimeBytes = await Deno.readFile(join(root, "reference/AthenaEnvReleaseAndExamples/athena.elf"));
  const runtimeSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", runtimeBytes)), b => b.toString(16).padStart(2, "0")).join("");
  for (const id of templates) {
    const template = A.PROJECT_TEMPLATES.find(t => t.id === id), project = template.make();
    const files = A.templateAssetFiles(project, template.needs.map(n => n.split("/").pop()))
      .map(f => ({ name: f.path.split("/").pop(), cat: "models", content: f.text }));
    const generated = A.generateProject(project, files);
    if (generated.diagnostics.some(d => d.level === "error")) throw Error(JSON.stringify(generated.diagnostics));
    const programBytes = new TextEncoder().encode([generated.main, ...generated.scripts.map(f => f.content), ...generated.assets.map(f => f.content)].join("\n"));
    const programSha256 = Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", programBytes)), b => b.toString(16).padStart(2, "0")).join("");
    const player = A.allObjects(project.scenes[0].objects).find(o => o.name === "Player");
    const position = player?.components.transform.position;
    const dir = join(root, ".verification", `bench-${label}-${id}`);
    if (dir.length > 135) throw Error("Benchmark boot directory exceeds Athena's path limit.");
    await Deno.mkdir(dir, { recursive: true });
    await Deno.copyFile(join(root, "reference/AthenaEnvReleaseAndExamples/athena.elf"), join(dir, "athena.elf"));
    await Deno.writeTextFile(join(dir, "athena.ini"), 'boot_logo = false\ndefault_script = "main.js"\naudsrv = true\n');
    await Deno.writeTextFile(join(dir, "source-main.js"), generated.main);
    await Deno.writeTextFile(join(dir, "main.js"), instrumentTemplate(generated.main, position && [position.x, position.y, position.z]));
    await Deno.writeTextFile(join(dir, "source.json"), JSON.stringify({ revision, workingCopy: !ref, runtimeSha256, programSha256, id, stats: generated.stats, project }, null, 2));
    for (const f of [...generated.scripts, ...generated.assets]) {
      const path = join(dir, f.filename);
      await Deno.mkdir(join(path, ".."), { recursive: true });
      await Deno.writeTextFile(path, f.content);
    }
  }
  await shutdown();
}

async function run(label, repeat, emulator, resume = false) {
  const reportPath = join(root, ".verification", `benchmark-${label}.json`);
  const results = resume ? JSON.parse(await Deno.readTextFile(reportPath)) : [];
  for (let trial = 0; trial < repeat; trial++) for (const id of templates) {
    if (results.some(r => r.id === id && r.trial === trial + 1)) continue;
    const dir = join(root, ".verification", `bench-${label}-${id}`);
    const runId = crypto.randomUUID();
    await Deno.writeTextFile(join(dir, "run-id.txt"), runId);
    await Deno.remove(join(dir, "benchmark.json")).catch(e => { if (!(e instanceof Deno.errors.NotFound)) throw e; });
    const child = new Deno.Command(emulator, { args: ["-batch", "-fastboot", "-logfile", join(dir, "pcsx2.log"), "--", join(dir, "athena.elf")], cwd: dir, stdout: "null", stderr: "null" }).spawn();
    let ended = false, measurement;
    const status = child.status.then(() => { ended = true; });
    try {
      const deadline = Date.now() + 90000;
      while (!ended && Date.now() < deadline) {
        try { measurement = JSON.parse(await Deno.readTextFile(join(dir, "benchmark.json"))); break; } catch {}
        await new Promise(r => setTimeout(r, 250));
      }
      if (!measurement || measurement.runId !== runId) throw Error(`${id}: ${ended ? "PCSX2 closed" : "timed out"} before reporting this run. Inspect pcsx2.log in the staged directory.`);
      const source = JSON.parse(await Deno.readTextFile(join(dir, "source.json")));
      const result = { id, trial: trial + 1, revision: source.revision, workingCopy: source.workingCopy, runtimeSha256: source.runtimeSha256, programSha256: source.programSha256, stats: source.stats, ...measurement };
      results.push(result); console.log(JSON.stringify({ id, trial: trial + 1, meanUs: measurement.meanUs[3], p95Us: measurement.p95Us, contactQueries: measurement.contactQueries }));
      await Deno.writeTextFile(reportPath, JSON.stringify(results, null, 2));
    } finally {
      if (!ended) { try { child.kill("SIGTERM"); } catch {} }
      await status;
    }
  }
}

if (import.meta.main) {
  const [action, label, repeats = "3", emulator = "C:/Program Files/PCSX2/pcsx2-qt.exe"] = Deno.args;
  if (!/^[a-z0-9-]{1,20}$/.test(label || "")) throw Error("Use a short benchmark label, for example baseline or optimized.");
  if (action === "stage") await stage(label, Deno.args[2]);
  else if (["run", "resume"].includes(action) && Number.isInteger(+repeats) && +repeats >= 1 && +repeats <= 10) await run(label, +repeats, emulator, action === "resume");
  else throw Error("Usage: stage label [commit] | run/resume label [repeats] [pcsx2.exe]");
}
