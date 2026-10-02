import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { load, PURE_MODULES } from "./_load.js";
import { playFiles } from "../tools/play.js";
const A = await load([...PURE_MODULES, "core/storage.js", "core/fsaccess.js", "core/scaffold.js", "editor/bundle.js"]);

function levels() {
  const project = A.mkProject("Levels"), first = project.scenes[0], second = A.mkScene(first.name);
  project.scenes.push(second);
  project.activeSceneId = second.id;
  first.transitions = [{ name: 'Exit "A"', targetSceneId: second.id }];
  second.transitions = [{ name: "Return", targetSceneId: first.id }];
  const probe = A.mkObject("Probe");
  probe.components.script = { ...A.makeComponent("script"), file: "Probe.js" };
  first.objects.push(probe);
  project.scripts = [{ name: "Probe.js", content: "export function init(ctx) {}\nexport function update(ctx) {}" }];
  return project;
}

Deno.test("export boots the start scene, Run can boot the open scene, and duplicate level names stay distinct", () => {
  const project = levels(), result = A.generateProject(project);
  assertEquals(result.sceneFiles.length, 2);
  assertEquals(new Set(result.sceneFiles.map(f => f.filename)).size, 2);
  assertStringIncludes(result.main, "init_probe_0(ctx)");
  assertEquals(A.generateProject(project, [], { sceneId: project.activeSceneId }).main, result.sceneFiles[1].content);
  assertEquals(result.main, result.sceneFiles[0].content);
  assertEquals(result.diagnostics.filter(d => d.level === "error"), []);
  for (const file of result.sceneFiles) new Function(file.content.replace(/^import .*;$/gm, ""));
  assertEquals(playFiles(result).filter(f => f.filename.startsWith("scene_")).length, 2);
});

Deno.test("named exits queue the exported destination and reload only outside the behaviour call stack", () => {
  const result = A.generateProject(levels());
  const source = result.main.match(/function goToScene\(name\) \{[\s\S]*?^\}/m)[0];
  const transition = new Function(`let _nextScene = null; ${source}; return { goToScene, destination: () => _nextScene };`)();
  assertEquals(transition.goToScene('Exit "A"'), true);
  assertEquals(transition.destination(), result.sceneFiles[1].filename);
  assertEquals(transition.goToScene("Unknown"), false);
  assert(!source.includes("std.reload"));
  assertStringIncludes(result.main, "if (_nextScene !== null) std.reload(_nextScene)");
  assertStringIncludes(result.main, "goToScene,");
});

Deno.test("invalid exits and missing assets in a closed scene prevent a misleading successful export", () => {
  const project = levels(), second = project.scenes[1], object = A.mkObject("Missing mesh");
  object.components.model = { ...A.makeComponent("model"), file: "missing.obj" };
  second.objects.push(object);
  second.transitions.push({ name: "Removed", targetSceneId: "gone" });
  const errors = A.generateProject(project).diagnostics.filter(d => d.level === "error");
  assert(errors.some(d => d.sceneId === second.id && d.objectId === object.id && d.message.includes("missing.obj")));
  assert(errors.some(d => d.message.includes("no longer exists")));
  project.scenes[0].transitions.push({ ...project.scenes[0].transitions[0] });
  assert(A.generateProject(project).diagnostics.some(d => /Two exits/.test(d.message)));
  project.scenes[0].transitions[0].name = "";
  assert(A.generateProject(project).diagnostics.some(d => /exit has no name/.test(d.message)));
});

Deno.test("portable saves retain binary assets and imported scripts without mutating the open project", () => {
  const project = A.mkProject("Portable"), before = JSON.stringify(project);
  const files = [{ name: "texture.png", cat: "textures", dataUrl: "data:image/png;base64,AQID", mesh: { transient: true } },
    { name: "Logic.js", cat: "scripts", content: "export function init() {}\nexport function update() {}" }];
  const saved = JSON.parse(A.projectToJSON(project, files));
  assertEquals(saved.assets[0].dataUrl, files[0].dataUrl);
  assertEquals(saved.assets[0].mesh, undefined);
  assertEquals(saved.scripts[0].content, files[1].content);
  assertEquals(JSON.stringify(project), before);
  assertEquals(A.editorAssets(A.migrateProject(saved)).length, 2);
});

Deno.test("the ZIP includes every executable scene exactly once", async () => {
  const result = A.generateProject(levels()), bytes = new Uint8Array(await A.exportBundle(result).arrayBuffer());
  const view = new DataView(bytes.buffer), names = [];
  let offset = 0;
  while (view.getUint32(offset, true) === 0x04034b50) {
    const size = view.getUint32(offset + 18, true), length = view.getUint16(offset + 26, true);
    names.push(new TextDecoder().decode(bytes.slice(offset + 30, offset + 30 + length)));
    offset += 30 + length + size;
  }
  for (const scene of result.sceneFiles) assertEquals(names.filter(name => name === scene.filename).length, 1);
  assertEquals(names.filter(name => name === "main.js").length, 1);
});

Deno.test("ambiguous imported basenames and unsafe export directories are rejected", () => {
  const project = A.mkProject();
  const files = [{ name: "hero.obj", cat: "models", content: "first", sourcePath: "a/hero.obj" },
    { name: "hero.obj", cat: "models", content: "second", sourcePath: "b/hero.obj" }];
  assert(A.generateProject(project, files).diagnostics.some(d => d.level === "error" && d.message.includes("More than one asset")));
  project.assets = [files[0]];
  for (const folder of ["../models", "C:/models", "CON", "models."]) {
    project.dirs.models = folder;
    assert(A.generateProject(project).diagnostics.some(d => d.level === "error" && d.message.includes("usable filename")), folder);
  }
});

Deno.test("glTF exports require embedded dependencies and report corrupt JSON", () => {
  const project = A.mkProject(), scene = A.activeScene(project), object = A.mkObject("Model");
  object.components.model = { ...A.makeComponent("model"), file: "model.gltf" };
  scene.objects.push(object);
  const problems = content => A.generateProject(project, [{ name: "model.gltf", cat: "models", content }]).diagnostics;
  assert(problems('{"buffers":[{"uri":"mesh.bin"}]}').some(d => d.level === "error" && /external files/.test(d.message)));
  assert(problems("{").some(d => d.level === "error" && /not a readable/.test(d.message)));
  assert(!problems('{"buffers":[{"uri":"data:application/octet-stream;base64,AQID"}]}').some(d => /external files|not a readable/.test(d.message)));
});

Deno.test("portable disk backups yield to refreshed disk files while editor working copies keep precedence", () => {
  const project = A.mkProject(), old = { name: "hero.obj", cat: "models", content: "old" };
  const saved = A.migrateProject(JSON.parse(A.projectToJSON(project, [old])));
  assertEquals(A.editorAssets(saved)[0].content, "old");
  assertEquals(A.editorAssets(saved, [{ ...old, content: "new" }])[0].content, "new");
  saved.assets[0].owned = true;
  assertEquals(A.editorAssets(saved, [{ ...old, content: "new" }])[0].content, "old");
  const script = { name: "helper.js", cat: "scripts", content: "export const value = 1;" };
  const restored = A.migrateProject(JSON.parse(A.projectToJSON(project, [script])));
  assertEquals(A.editorAssets(restored, [{ ...script, content: "export const value = 2;" }])[0].content, "export const value = 2;");
  assert(A.generateProject(restored).scripts.some(f => f.filename === "scripts/helper.js"), "unattached imported helper modules must still ship");
});
