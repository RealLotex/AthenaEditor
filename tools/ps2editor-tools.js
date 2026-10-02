// Exercise owned meshes, both indexed texture formats and baked unlit materials.
import { load, PURE_MODULES } from "../tests/_load.js";
import { launch, probeScript, stage, summarise } from "./ps2run.js";
const module = { exports: {} };
new Function(
  "module",
  "exports",
  await Deno.readTextFile(new URL("../vendor/three.js", import.meta.url)),
)(module, module.exports);
globalThis.THREE = module.exports;
const A = await load([
  ...PURE_MODULES,
  "editor/palette.js",
  "editor/bake.js",
  "templates/assets.js",
  "viewport/loaders.js",
]);
const project = A.mkProject("Editor Tools"), scene = A.activeScene(project);
scene.defaultCameraRig = false;
const camera = scene.objects.find((o) => o.components.camera);
camera.components.transform.position = A.v3(0, 3, 7);
camera.components.camera.target = A.v3(0, 0, 0);
for (
  const [kind, x, colors] of [["cube", -1.5, 16], ["sphere", 0, 256], [
    "ramp",
    1.5,
    256,
  ]]
) {
  const object = A.addPrototype(project, scene, kind);
  object.components.transform.position.x = x;
  const mesh = A.readMeshOBJ(
    project.assets.find((f) => f.name === object.components.model.file).content,
  );
  // A procedural image avoids DOM decoding in the command-line fixture.
  object.components.model.textureFile = "";
  const baked = await A.bakeModelLighting(object, mesh, scene, [], {
    size: 128,
    shadows: false,
  });
  const texture = await A.textureOutputAsset(
    baked.image,
    `${kind}_lighting.png`,
    colors,
  );
  A.putProjectAsset(project, texture);
  const file = `${kind}_baked.obj`;
  A.putProjectAsset(
    project,
    A.textMeshAsset(file, A.writeMeshOBJ(baked.mesh, kind)),
  );
  Object.assign(object.components.model, {
    file,
    textureFile: texture.name,
    pipeline: "PL_NO_LIGHTS",
    textureFilter: "NEAREST",
  });
}
const probe = A.mkObject("Probe");
probe.components.script = { ...A.makeComponent("script"), file: "Probe.js" };
scene.objects.push(probe);
A.saveEditorScript(project, "Probe.js", probeScript({ frames: 180 }));
const result = A.generateProject(project);
if (result.diagnostics.some((d) => d.level === "error")) {
  throw Error(JSON.stringify(result.diagnostics));
}
const base = (Deno.env.get("TEMP") || "C:/Temp").replaceAll("\\", "/"),
  dir = `${base}/athena-tools-ps2-${Date.now()}`;
if (!dir.startsWith(base + "/athena-tools-ps2-") || dir.includes("..")) {
  throw Error("Invalid staging directory");
}
await stage(dir, result);
const root = decodeURIComponent(new URL("..", import.meta.url).pathname)
    .replace(/^\//, ""),
  png = `${root}/.verification/editor-tools-ps2.png`;
const launchLog = await launch(dir, { seconds: 18, png });
const log = await Deno.readTextFile(`${dir}/pcsx2.log`).catch(() => ""),
  probeLog = await Deno.readTextFile(`${dir}/probe.log`).catch(() => ""),
  summary = summarise({ log, probe: probeLog, frames: 180 });
await Deno.writeTextFile(
  `${root}/.verification/editor-tools-ps2.json`,
  JSON.stringify({ dir, ...summary, launchLog }, null, 2),
);
console.log(
  JSON.stringify({ ok: summary.ok, dir, failures: summary.failures, png }),
);
if (!summary.ok) Deno.exit(1);
