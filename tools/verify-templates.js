// Verify generated controllers against the shipped console player through Run.
// Each launch has isolated settings and output, and stops only its own process.
import { load, PURE_MODULES, shutdown } from "../tests/_load.js";
import { templateFixture, templateProbeScript, parseProbe, checkTemplate, probeValue } from "./ps2run.js";
import { createGameLauncher } from "./play.js";
import { fromFileUrl, join } from "jsr:@std/path@1";
const root = fromFileUrl(new URL("..", import.meta.url));
const A = await load([...PURE_MODULES, "templates/assets.js", "templates/firstperson.js",
  "templates/thirdperson.js", "templates/sidescroller.js", "templates/topdown.js", "templates/registry.js"]);
const token = crypto.randomUUID(), results = [];
await Deno.mkdir(join(root, ".verification"), { recursive: true });
const launcher = createGameLauncher(root, token, { configFile: join(root, ".verification", "templates-launch-settings.json") });
const request = async (action, body) => {
  const response = await launcher(new Request(`http://127.0.0.1/__play/${action}`, {
    method: body ? "POST" : "GET", headers: { "x-athena-launch-token": token }, body: body ? JSON.stringify(body) : undefined,
  }));
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
};
for (const id of ["first-person", "third-person", "side-scroller", "top-down"]) {
  const { project, meshes, spec } = templateFixture(A, id);
  const files = [{ name: "Probe.js", cat: "scripts", content: templateProbeScript() },
    ...A.templateAssetFiles(project, meshes).map(f => ({ name: f.path.split("/").pop(), cat: "models", content: f.text }))];
  const generated = A.generateProject(project, files);
  const errors = generated.diagnostics.filter(d => d.level === "error");
  if (errors.length) throw Error(JSON.stringify(errors));
  try {
    const { directory } = await request("launch", generated);
    let log = "";
    const deadline = Date.now() + 30000;
    while (Date.now() < deadline) {
      log = await Deno.readTextFile(join(directory, "probe.log")).catch(() => "");
      if (probeValue(parseProbe(log), "DONE")) break;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
    const records = parseProbe(log), checks = checkTemplate(records, spec);
    const evidence = { id, ok: !!probeValue(records, "DONE") && checks.every(([, pass]) => pass), checks, records, directory };
    results.push(evidence);
    console.log(JSON.stringify({ id, ok: evidence.ok, checks }));
  } finally { await request("stop", {}).catch(() => {}); }
}
await Deno.writeTextFile(join(root, ".verification", "production-templates.json"), JSON.stringify(results, null, 2));
await shutdown();
if (results.some(r => !r.ok)) throw Error("A generated controller failed its runtime checks.");
