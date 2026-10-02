// Exercise actual scene reloads through the same owned PCSX2 launcher as Run.
import { load } from "../tests/_load.js";
import { createGameLauncher } from "./play.js";
import { fromFileUrl, join } from "jsr:@std/path@1";
const root = fromFileUrl(new URL("..", import.meta.url));
await Deno.mkdir(join(root, ".verification"), { recursive: true });
const A = await load(), project = A.mkProject("Scene transition verification");
const first = project.scenes[0], second = A.mkScene("Second level");
project.scenes.push(second);
first.transitions = [{ name: "Next", targetSceneId: second.id }];
second.transitions = [{ name: "Return", targetSceneId: first.id }];
for (const [scene, name] of [[first, "First"], [second, "Second"]]) {
  const probe = A.mkObject("Probe");
  probe.components.script = { ...A.makeComponent("script"), file: `${name}.js` };
  scene.objects.push(probe);
  project.scripts.push({ name: `${name}.js`, content: `
export function init(ctx) {
  const file = std.open("levels.log", "a");
  file.puts("${name}\\n"); file.close();
}
export function update(ctx) {
  if (ctx.frame === 30) ctx.goToScene("${name === "First" ? "Next" : "Return"}");
}
` });
}
const result = A.generateProject(project);
const observeErrors = source => {
  const imports = source.match(/^import .*;$/gm) || [];
  return imports.join("\n") + "\ntry {\n" + source.replace(/^import .*;$/gm, "") +
    '\n} catch (error) { const f = std.open("runtime-error.log", "a"); f.puts(String(error) + "\\n" + String(error.stack)); f.close(); throw error; }';
};
result.main = observeErrors(result.main);
for (const file of result.sceneFiles) file.content = observeErrors(file.content);
if (result.diagnostics.some(d => d.level === "error")) throw Error(JSON.stringify(result.diagnostics));
const token = crypto.randomUUID();
const launcher = createGameLauncher(root, token, { configFile: join(root, ".verification", "levels-launch-settings.json") });
const request = async (action, body) => {
  const response = await launcher(new Request(`http://127.0.0.1/__play/${action}`, {
    method: body ? "POST" : "GET", headers: { "x-athena-launch-token": token }, body: body ? JSON.stringify(body) : undefined,
  }));
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
};
let directory;
try {
  const started = await request("launch", result);
  directory = started.directory;
  let log = "";
  const deadline = Date.now() + 30000;
  while (Date.now() < deadline) {
    log = await Deno.readTextFile(join(directory, "levels.log")).catch(() => "");
    if (log.trim().split(/\s+/).length >= 10) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  const samples = log.trim().split(/\s+/);
  const evidence = { ok: samples.length >= 10 && samples.every((name, i) => name === (i % 2 ? "Second" : "First")), levels: samples, directory,
    error: await Deno.readTextFile(join(directory, "runtime-error.log")).catch(() => "") };
  await Deno.writeTextFile(join(root, ".verification", "production-levels.json"), JSON.stringify(evidence, null, 2));
  console.log(JSON.stringify(evidence));
  if (!evidence.ok) throw Error("The exported game did not complete repeated level transitions.");
} finally {
  await request("stop", {}).catch(() => {});
}
