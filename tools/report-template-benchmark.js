// Publish measured data without private staging paths or incomparable FPS samples.
import { fromFileUrl, join } from "jsr:@std/path@1";
const root = fromFileUrl(new URL("..", import.meta.url));
const [before = "baseline", after = "optimized"] = Deno.args;
if (![before, after].every(label => /^[a-z0-9-]{1,20}$/.test(label))) throw Error("Use short staged benchmark labels.");
const baseline = JSON.parse(await Deno.readTextFile(join(root, ".verification", `benchmark-${before}.json`)));
const optimized = JSON.parse(await Deno.readTextFile(join(root, ".verification", `benchmark-${after}.json`)));
const names = { empty: "Empty", "first-person": "First Person", "third-person": "Third Person", "side-scroller": "Side Scroller", "top-down": "Top Down" };
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const all = [...baseline, ...optimized];
const hashes = new Set(all.map(r => r.runtimeSha256));
if (baseline.length !== 15 || optimized.length !== 15 || new Set(all.map(r => r.runId)).size !== 30 || hashes.size !== 1) {
  throw Error("Expected 30 independent runs using the same ELF.");
}
for (const r of all) {
  if (r.samples !== 600 || r.warmup !== 120 || r.meanUs.length !== 4 || !r.meanUs.every(v => Number.isFinite(v) && v > 0) ||
      r.mode.psm !== 10 || r.mode.psmz !== 10 || !Number.isFinite(r.frameIntervalUs)) throw Error(`Invalid measurement: ${r.id}`);
}
const summary = Object.entries(names).map(([id, name]) => {
  const a = baseline.filter(r => r.id === id), b = optimized.filter(r => r.id === id);
  if ([a, b].some(rows => rows.length !== 3 || new Set(rows.map(r => r.trial)).size !== 3)) throw Error(`Missing trials: ${id}`);
  const metrics = rows => ({ meanUs: [0, 1, 2, 3].map(i => median(rows.map(r => r.meanUs[i]))),
    p95Us: median(rows.map(r => r.p95Us)), contactQueries: median(rows.map(r => r.contactQueries)),
    frameIntervalUs: median(rows.map(r => r.frameIntervalUs)),
    vramBytes: median(rows.map(r => r.vramStatic + r.vramDynamic)) });
  const old = metrics(a), current = metrics(b);
  return { id, name, before: old, after: current, reductionPercent: (1 - current.meanUs[3] / old.meanUs[3]) * 100 };
});
const fields = ["id", "trial", "revision", "workingCopy", "runtimeSha256", "programSha256", "runId", "stats", "samples", "warmup",
  "meanUs", "frameIntervalUs", "p95Us", "contactQueries", "ramUsed", "vramStatic", "vramDynamic", "mode"];
const clean = rows => rows.map(r => Object.fromEntries(fields.filter(key => r[key] !== undefined).map(key => [key, r[key]])));
const report = { date: "2026-10-02", emulator: "PCSX2 2.6.3", renderer: "Vulkan, 3x internal resolution",
  baselineRevision: baseline[0].revision, optimizedSource: "Working tree recorded by each generated program's SHA-256",
  runtimeSha256: all[0].runtimeSha256, units: "Emulated EE Timer microseconds",
  phases: ["controller logic and frame setup", "physics, contact events and transform sync", "camera, drawing submission and HUD", "complete measured callback"],
  methodology: { trialsPerTemplatePerVersion: 3, warmupFrames: 120, measuredFrames: 600,
    input: "300-frame cycle: 60 idle, 90 right, 60 diagonal, 60 camera, 30 idle; Cross at 90 and 180; reset body at cycle start",
    measurement: "After pad.update and injected input through the end of the frame callback, including fixed Timer/array instrumentation overhead",
    exclusions: ["input polling and injected pad setup", "frame clear, presentation and VSync wait", "GS/GPU completion", "host wall-clock performance"],
    aggregation: "Median of the three per-run means; p95 is the median of the three per-run 95th percentiles",
    limitation: "Deterministic emulated CPU work in these starter scenes; not a real PS2 hardware or larger-scene FPS certification" },
  summary, baseline: clean(baseline), optimized: clean(optimized) };
await Deno.mkdir(join(root, "docs", "verification"), { recursive: true });
await Deno.writeTextFile(join(root, "docs", "verification", "template-performance.json"), JSON.stringify(report, null, 2) + "\n");
for (const r of summary) console.log(`${r.name}: ${(r.before.meanUs[3] / 1000).toFixed(3)} -> ${(r.after.meanUs[3] / 1000).toFixed(3)} ms (${r.reductionPercent.toFixed(1)}% less); queries ${r.before.contactQueries} -> ${r.after.contactQueries}`);
