// Verify the editor's imported font export with the actual AthenaEnv player.
// Uses the existing isolated Run launcher; never captures/input-controls Windows
// or stops emulator processes owned by somebody else.
import { load, PURE_MODULES } from "../tests/_load.js";
import { createGameLauncher } from "./play.js";
import { join } from "jsr:@std/path@1";

const A = await load([...PURE_MODULES, "editor/fonts.js"]);
const fontPath = Deno.args[0] || "C:/Windows/Fonts/arial.ttf";
const bytes = await Deno.readFile(fontPath);
const extension = A.inspectFontBytes(bytes.buffer);
const project = A.mkProject("HUD Font Verification"), scene = A.activeScene(project);
scene.defaultCameraRig = false;
const imported = A.mkUIEl("Text"), builtin = A.mkUIEl("Text");
const text = "AthEditor 012345 WMWM iii";
Object.assign(imported, { name: "Imported Font", text, x: 35, y: 90, width: 550, height: 50, fontSize: 28 });
Object.assign(builtin, { name: "Built In Font", text, x: 35, y: 170, width: 550, height: 50, fontSize: 28 });
scene.uiElements.push(imported, builtin);
const asset = A.attachHUDfont(project, scene.id, imported.id, {
  name: `imported_font.${extension}`, cat: "fonts", size: bytes.length,
  dataUrl: `data:font/${extension};base64,${btoa(Array.from(bytes, (byte) => String.fromCharCode(byte)).join(""))}`,
});
const probe = A.mkObject("Font Probe");
probe.components.script = { ...A.makeComponent("script"), file: "FontProbe.js" };
scene.objects.push(probe);
A.saveEditorScript(project, "FontProbe.js", `
let log = null, frame = 0;
function record(key, value) { if(log) { log.puts(key + " " + JSON.stringify(value) + "\\n"); log.flush(); } }
export function init(ctx) {
  log = std.open("font-probe.log", "w");
  record("boot", true);
  const keys = Object.keys(ctx.ui).filter(key => ctx.ui[key] && ctx.ui[key].font);
  for(const key of keys) record("font", {key, text:ctx.ui[key].text, size:ctx.ui[key].font.getTextSize(ctx.ui[key].text)});
}
export function update(ctx, pad) {
  frame++;
  if(frame === 120) { record("renderedFrames", frame); record("DONE", true); log.close(); log = null; }
}
`);
const result = A.generateProject(project);
const errors = result.diagnostics.filter((diagnostic) => diagnostic.level === "error");
if (errors.length) throw Error(JSON.stringify(errors));
const exported = result.assets.find((file) => file.filename.endsWith(`/${asset.name}`));
if (!exported) throw Error("The generated game omitted the imported font.");

const token = "isolated-font-verification";
const launcher = createGameLauncher(Deno.cwd(), token);
const call = async (action, body) => {
  const response = await launcher(new Request(`http://127.0.0.1/__play/${action}`, {
    method: body === undefined ? "GET" : "POST",
    headers: { "x-athena-launch-token": token, "content-type": "application/json" },
    ...(body === undefined ? {} : { body: JSON.stringify(body) }),
  }));
  const data = await response.json();
  if (!response.ok) throw Error(data.error);
  return data;
};
const evidence = { fontPath, extension, exportedPath: exported.filename, ok: false };
const hash = async (data) => Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256", data)), byte => byte.toString(16).padStart(2, "0")).join("");
let running = false;
try {
  const run = await call("launch", result);
  running = true;
  evidence.directory = run.directory;
  evidence.sourceHash = await hash(bytes);
  evidence.exportedHash = await hash(await Deno.readFile(join(run.directory, exported.filename)));
  console.log(JSON.stringify({ stage: "running", directory: run.directory, pid: run.pid }));
  const end = Date.now() + 35000;
  let probeLog = "";
  while (Date.now() < end) {
    probeLog = await Deno.readTextFile(join(run.directory, "font-probe.log")).catch(() => "");
    if (probeLog.includes("DONE true")) break;
    if (!(await call("status")).running) break;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  evidence.probeLog = probeLog;
  evidence.measures = probeLog.split(/\r?\n/).filter(line => line.startsWith("font ")).map(line => JSON.parse(line.slice(5)));
  const sizes = evidence.measures.map(measure => measure.size);
  evidence.ok = evidence.sourceHash === evidence.exportedHash && probeLog.includes("renderedFrames 120") &&
    probeLog.includes("DONE true") && sizes.length === 2 && sizes.every(size => size.width > 0 && size.height > 0) &&
    (sizes[0].width !== sizes[1].width || sizes[0].height !== sizes[1].height);
  // Keep the successful run visible briefly for optional inspection through the
  // normal Computer Use tool. No custom Windows screenshot/input helpers.
  if (evidence.ok) await new Promise(resolve => setTimeout(resolve, 12000));
} catch (error) { evidence.error = error.message; }
finally {
  if (running) await call("stop", {}).catch(() => {});
  await Deno.mkdir(".verification", { recursive: true });
  await Deno.writeTextFile(".verification/hud-font-runtime.json", JSON.stringify(evidence, null, 2));
}
console.log(JSON.stringify(evidence, null, 2));
if (!evidence.ok) Deno.exit(1);
