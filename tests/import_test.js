import { assert, assertEquals } from "jsr:@std/assert@1";

const modules = [
  "core/util.js",
  "core/math.js",
  "core/project.js",
  "core/imagesize.js",
  "core/fsaccess.js",
  "editor/mesh.js",
  "editor/assets.js",
  "editor/import.js",
];
const source = (await Promise.all(
  modules.map((path) =>
    Deno.readTextFile(new URL(`../src/${path}`, import.meta.url))
  ),
)).join("\n");
const A = new Function(
  "FileReader",
  source +
    `\nreturn { captureDroppedFiles, readImportedAssets, importProjectAssets, assetLibraryFolder };`,
)(
  class {
    readAsDataURL(file) {
      file.arrayBuffer().then((buffer) => {
        this.result = `data:${file.type || "application/octet-stream"};base64,${
          btoa(String.fromCharCode(...new Uint8Array(buffer)))
        }`;
        this.onload();
      }, () => this.onerror());
    }
  },
);
const mesh = new File(["v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"], "cube.obj");
const script = new File(["export function update() {}"], "Player.js");
const dir = (name, children) => ({
  kind: "directory",
  name,
  entries: async function* () {
    for (const child of children) yield [child.name, child];
  },
});
const handle = (file) => ({
  kind: "file",
  name: file.name,
  getFile: async () => file,
});

Deno.test("modern drop captures handles before its event expires and recursively preserves folder paths", async () => {
  let live = true, calls = 0;
  const folder = dir("Art", [dir("Props", [handle(mesh)]), handle(script)]);
  const pending = A.captureDroppedFiles({
    items: [{
      kind: "file",
      getAsFileSystemHandle() {
        assert(live);
        calls++;
        return Promise.resolve(folder);
      },
    }],
  });
  live = false;
  assertEquals(calls, 1);
  const files = await pending;
  assertEquals(files.map((entry) => entry.path), [
    "Art/Props/cube.obj",
    "Art/Player.js",
  ]);
  assertEquals((await A.readImportedAssets(files)).assets.length, 2);
});

Deno.test("legacy dropped folders exhaust paged directory readers and rejected modern handles fall back", async () => {
  const entry = (file) => ({
    isFile: true,
    name: file.name,
    file: (resolve) => resolve(file),
  });
  let page = 0;
  const folder = {
    isFile: false,
    name: "Legacy",
    createReader: () => ({
      readEntries: (resolve) =>
        resolve([[entry(mesh)], [entry(script)], []][page++]),
    }),
  };
  const files = await A.captureDroppedFiles({
    items: [{
      kind: "file",
      getAsFileSystemHandle: () => Promise.reject(Error("Unsupported")),
      webkitGetAsEntry: () => folder,
    }],
  });
  assertEquals(files.map((entry) => entry.path), [
    "Legacy/cube.obj",
    "Legacy/Player.js",
  ]);
  assertEquals(page, 3);
  assertEquals((await A.captureDroppedFiles({ files: [mesh] }))[0].file, mesh);
});

Deno.test("dropped assets embed supported files, reject invalid meshes and never execute scripts", async () => {
  const image = new File([Uint8Array.of(1, 2, 3)], "reference.png", {
    type: "image/png",
  });
  const { assets, rejected } = await A.readImportedAssets([
    mesh,
    script,
    image,
    new File(["not a mesh"], "bad.obj"),
    new File(["x"], "scene.atheditor"),
    new File(["x"], "notes.txt"),
  ].map((file) => ({ file })));
  assertEquals(assets.length, 3);
  assertEquals(assets[1].content, "export function update() {}");
  assertEquals(assets[2].dataUrl, "data:image/png;base64,AQID");
  assertEquals(rejected, ["bad.obj", "scene.atheditor", "notes.txt"]);
  const project = {
    assets: [],
    scripts: [],
    dirs: { models: "3dmodels", textures: "textures" },
  };
  const imported = A.importProjectAssets(project, assets).imported;
  assertEquals(imported.length, 3);
  assert(imported.every((asset) => asset.owned));
  assertEquals(
    JSON.parse(JSON.stringify(project)).assets[2].dataUrl,
    assets[2].dataUrl,
  );
});

Deno.test("drop destination controls the library folder, keeps category boundaries and never overwrites existing names", async () => {
  const { assets } = await A.readImportedAssets([{
    file: mesh,
    path: "Art/Props/cube.obj",
  }, { file: script }]);
  const project = { assets: [], scripts: [], dirs: { models: "meshes" } };
  const first = A.importProjectAssets(project, assets, "Models/Prototypes");
  assertEquals(first.imported.length, 1);
  assertEquals(first.rejected, ["Player.js"]);
  assertEquals(A.assetLibraryFolder(first.imported[0]), "Models/Prototypes");
  const duplicate = A.importProjectAssets(project, [assets[0]]).imported[0];
  assertEquals(duplicate.name, "cube_2.obj");
  assertEquals(A.assetLibraryFolder(duplicate), "Models/Imported/Art/Props");
  assertEquals(project.assets[0].name, "cube.obj");
  assertEquals(duplicate.folder, "meshes");
});
