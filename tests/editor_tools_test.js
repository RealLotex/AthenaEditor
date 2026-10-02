import {
  assert,
  assertAlmostEquals,
  assertEquals,
  assertRejects,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import { load, PURE_MODULES } from "./_load.js";
const vendor = await Deno.readTextFile(
  new URL("../vendor/three.js", import.meta.url),
);
const mod = { exports: {} };
new Function("module", "exports", vendor)(mod, mod.exports);
globalThis.THREE = mod.exports;
const A = await load([
  ...PURE_MODULES,
  "editor/palette.js",
  "editor/bake.js",
  "editor/bundle.js",
  "templates/assets.js",
  "templates/firstperson.js",
  "templates/thirdperson.js",
  "templates/sidescroller.js",
  "templates/topdown.js",
  "templates/registry.js",
  "core/storage.js",
  "core/fsaccess.js",
  "core/scaffold.js",
  "viewport/loaders.js",
]);
const quad =
  "v 0 0 0\nv 1 0 0\nv 1 1 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nf -4/-4 -3/-3 -2/-2 -1/-1\n";
const image = (w, h, color) => ({
  width: w,
  height: h,
  data: Uint8ClampedArray.from(
    Array.from({ length: w * h }, () => color).flat(),
  ),
});

Deno.test("UV edits reuse one working mesh and fork a shared mesh without changing another instance", () => {
  const p = A.mkProject(), sc = A.activeScene(p), obj = A.mkObject("Cube");
  obj.components.model = { ...A.makeComponent("model"), file: "cube.obj" };
  sc.objects.push(obj);
  A.putProjectAsset(p, A.textMeshAsset("cube.obj", quad));
  const first = A.applyEditorUV(p, obj.id, quad + "# first\n"),
    id = p.assets.find((f) => f.name === first).id;
  A.applyEditorUV(p, obj.id, quad + "# second\n");
  assertEquals(p.assets.length, 2);
  assertEquals(p.assets.find((f) => f.name === first).id, id);
  assertStringIncludes(
    p.assets.find((f) => f.name === first).content,
    "# second",
  );
  assertEquals(p.assets[0].content, quad);
  const duplicate = A.deepClone(obj);
  duplicate.id = A.uid();
  sc.objects.push(duplicate);
  const fork = A.applyEditorUV(p, obj.id, quad + "# third\n");
  assert(fork !== first);
  assertEquals(duplicate.components.model.file, first);
  assertEquals(p.assets.length, 3);
  A.applyEditorUV(p, obj.id, quad + "# fourth\n");
  assertEquals(p.assets.length, 3);
  const pf = A.deepClone(obj);
  p.prefabs.push(pf);
  assert(
    A.applyEditorUV(p, obj.id, quad + "# fifth\n") !== fork,
    "prefab definitions keep their mesh",
  );
});

Deno.test("asset folders group generated work and retain imported subfolders", () => {
  const files = [
    { name: "prototype_cube.obj", cat: "models", owned: true },
    { name: "cube_uv_2.obj", cat: "models", owned: true },
    { name: "hero.png", cat: "textures", sourcePath: "characters/hero.png" },
    { name: "a.png", cat: "textures", editKind: "atlas" },
  ];
  assertEquals(A.assetLibraryFolder(files[1]), "Models/Generated/UV");
  assertEquals(A.assetLibraryFolder(files[2]), "Textures/Imported/characters");
  const tree = A.assetFolderTree(files);
  assertEquals(tree.find((f) => f.path === "Models").count, 2);
  assertEquals(
    tree.find((f) => f.path === "Textures/Generated/Atlases").count,
    1,
  );
});

Deno.test("OBJ UV round trips preserve material assignments and inline comments", () => {
  const source = "mtllib palette.mtl\nusemtl blue\n" +
    quad.replace(
      "f -4/-4 -3/-3 -2/-2 -1/-1",
      "f -4/-4 -3/-3 -2/-2 -1/-1 # quad",
    );
  const next = A.readMeshOBJ(
    A.writeMeshOBJ(A.projectMeshUV(A.readMeshOBJ(source))),
  );
  assertEquals(next.materialLibraries, ["palette.mtl"]);
  assertEquals(next.materials, ["blue", "blue"]);
});

Deno.test("saving a linked prefab updates existing instances without losing overrides", () => {
  const p = A.mkProject(), sc = A.activeScene(p), source = A.mkObject("Group");
  source.components.model = A.makeComponent("model");
  source.components.model.file = "old.obj";
  sc.objects.push(source);
  const pf = A.savePrefab(p, source), instance = A.placePrefab(pf, sc.objects);
  sc.objects.push(instance);
  instance.components.model.textureFilter = "NEAREST";
  instance.components.transform.position.x = 4;
  source.components.model.file = "new.obj";
  A.savePrefab(p, source);
  assertEquals(p.prefabs.length, 1);
  assertEquals(instance.components.model.file, "new.obj");
  assertEquals(instance.components.model.textureFilter, "NEAREST");
  assertEquals(instance.components.transform.position.x, 4);
  const another = A.mkObject("Group");
  A.savePrefab(p, another);
  assertEquals(p.prefabs.length, 2);
});

Deno.test("prefab updates keep internal shadow references on the placed names", () => {
  const p = A.mkProject(),
    sc = A.activeScene(p),
    group = A.mkObject("Group"),
    caster = A.mkObject("Caster");
  group.children.push(caster);
  sc.objects.push(group);
  const pf = A.savePrefab(p, group), instance = A.placePrefab(pf, sc.objects);
  sc.objects.push(instance);
  const shadow = A.mkObject("Shadow");
  shadow.components.shadow = { ...A.makeComponent("shadow"), caster: "Caster" };
  group.children.push(shadow);
  A.savePrefab(p, group);
  const target = instance.children.find((n) => n._prefabNode === caster.id);
  assertEquals(
    instance.children.find((n) => n.components.shadow).components.shadow.caster,
    target.name,
  );
});

Deno.test("static bake shadows are occluded and moving bodies do not become blockers", async () => {
  const p = A.mkProject(),
    sc = A.activeScene(p),
    light = sc.objects[0].components.light;
  light.direction = { x: 0, y: 0, z: 1 };
  light.ambient = { r: .1, g: .1, b: .1 };
  light.diffuse = { r: .5, g: .5, b: .5 };
  const object = A.mkObject("Receiver");
  object.components.model = { ...A.makeComponent("model"), file: "quad.obj" };
  sc.objects.push(object);
  const blocker = A.mkObject("Blocker");
  blocker.components.model = { ...A.makeComponent("model"), file: "quad.obj" };
  blocker.components.transform.position.z = .5;
  sc.objects.push(blocker);
  const files = [{ name: "quad.obj", cat: "models", content: quad }];
  const baked = await A.bakeModelLighting(
    object,
    A.readMeshOBJ(quad),
    sc,
    files,
    { size: 32, shadows: true },
  );
  const colors = [];
  for (let i = 0; i < baked.image.data.length; i += 4) {
    if (baked.image.data[i + 3]) colors.push(baked.image.data[i]);
  }
  assert(colors.length > 0);
  assert(colors.every((c) => Math.abs(c - 26) <= 1));
  blocker.components.rigidbody = {
    ...A.makeComponent("rigidbody"),
    mode: "dynamic",
  };
  const unblocked = await A.bakeModelLighting(
    object,
    A.readMeshOBJ(quad),
    sc,
    files,
    { size: 32, shadows: true },
  );
  assert(Array.from(unblocked.image.data).some((v) => v === 153));
});

Deno.test("OBJ edits preserve negative indices, triangulated faces and normals", () => {
  const mesh = A.readMeshOBJ(quad);
  assertEquals(mesh.faces.length, 2);
  const read = A.readMeshOBJ(A.writeMeshOBJ(mesh));
  assertEquals(read.positions, mesh.positions);
  assertEquals(read.uvs, mesh.uvs);
  assertEquals(read.normals[0], [0, 0, 1]);
  assertThrows(() => A.readMeshOBJ("v 0 0 0\nf 1 2 3"), "Error");
});
Deno.test("packed triangle islands have unique UVs inside the image with gutters", () => {
  const packed = A.packMeshUV(A.readMeshOBJ(quad), 64, 2);
  assertEquals(packed.uvs.length, 6);
  assert(packed.uvs.every((p) => p.every((v) => v > 0 && v < 1)));
  assertThrows(() =>
    A.packMeshUV({ ...packed, faces: Array(100).fill(packed.faces[0]) }, 32)
  );
});
Deno.test("UV transform edits only selected coordinates and leaves original mesh intact", () => {
  const mesh = A.readMeshOBJ(quad),
    next = A.transformMeshUV(mesh, [0], { x: .25, y: .5 });
  assertEquals(next.uvs[0], [.25, .5]);
  assertEquals(next.uvs[1], mesh.uvs[1]);
  assertEquals(mesh.uvs[0], [0, 0]);
});
Deno.test("atlas UV remapping respects top-down pixel rectangles and rejects tiled UVs", () => {
  const mesh = A.readMeshOBJ(quad),
    next = A.remapAtlasUV(
      mesh,
      { x: 10, y: 20, width: 30, height: 40 },
      100,
      100,
    );
  assertAlmostEquals(next.uvs[0][0], .1);
  assertAlmostEquals(next.uvs[0][1], .4);
  assertAlmostEquals(next.uvs[2][1], .8);
  mesh.uvs[0][0] = 2;
  assertThrows(() =>
    A.remapAtlasUV(mesh, { x: 0, y: 0, width: 10, height: 10 }, 32, 32)
  );
});
Deno.test("all primitives have outward normals, finite UVs and an exportable owned mesh", () => {
  for (const kind of A.PROTOTYPE_KINDS) {
    const mesh = A.readMeshOBJ(A.prototypeOBJ(kind));
    assert(mesh.faces.length >= 2);
    assert(mesh.uvs.every((p) => p.every(Number.isFinite)));
    for (const f of mesh.faces) {
      const n = A.meshFaceNormal(mesh, f),
        p = f.map((c) => mesh.positions[c.v]);
      const center = p[0].map((_, k) =>
        p.reduce((sum, v) => sum + v[k], 0) / 3
      );
      if (kind !== "plane" && kind !== "torus") {
        assert(
          n.x * center[0] + n.y * center[1] + n.z * center[2] > -.001,
          kind,
        );
      }
    }
  }
  const p = A.mkProject(), obj = A.addPrototype(p, A.activeScene(p), "cube");
  assertEquals(p.assets.length, 4);
  assertEquals(p.assets[0].bounds.size, { x: 1, y: 1, z: 1 });
  assertStringIncludes(A.generateProject(p).main, obj.components.model.file);
  const saved = A.migrateProject(
    JSON.parse(A.projectToJSON(p, A.editorAssets(p))),
  );
  assertEquals(saved.assets, p.assets);
  assert(saved.assets[1].dataUrl.startsWith("data:image/png;base64,"));
});
Deno.test("downscaling samples consistently and quantization preserves transparency", () => {
  const src = {
    width: 2,
    height: 2,
    data: new Uint8ClampedArray([
      255,
      0,
      0,
      255,
      0,
      255,
      0,
      255,
      0,
      0,
      255,
      255,
      255,
      255,
      255,
      255,
    ]),
  };
  assertEquals(Array.from(A.resizeTexturePixels(src, 1, 1).data), [
    128,
    128,
    128,
    255,
  ]);
  const transparent = image(2, 1, [255, 0, 0, 0]);
  transparent.data.set([30, 50, 70, 255], 4);
  const out = A.quantizeTexture(transparent, 16);
  assertEquals(out.data.slice(0, 4), new Uint8ClampedArray(4));
  assertEquals(out.palette.length, 2);
  assertEquals(out.bitDepth, 4);
});
Deno.test("atlas packs pixels and extrudes gutters without changing input textures", () => {
  const red = { name: "red", ...image(4, 4, [255, 0, 0, 255]) },
    blue = { name: "blue", ...image(4, 4, [0, 0, 255, 255]) };
  const atlas = A.packTextureAtlas([red, blue], 16);
  for (const r of atlas.rectangles) {
    assertEquals(
      Array.from(
        atlas.data.slice(
          ((r.y - 1) * 16 + r.x - 1) * 4,
          ((r.y - 1) * 16 + r.x - 1) * 4 + 4,
        ),
      ),
      r.name === "red" ? [255, 0, 0, 255] : [0, 0, 255, 255],
    );
  }
  assertThrows(() => A.packTextureAtlas([red, blue], 8));
  assertEquals(red.width, 4);
});

async function decodePNG(bytes) {
  let offset = 8, idat = [], chunks = [];
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  while (offset < bytes.length) {
    const length = view.getUint32(offset),
      name = new TextDecoder().decode(bytes.slice(offset + 4, offset + 8)),
      data = bytes.slice(offset + 8, offset + 8 + length);
    assertEquals(
      A.pngCRC(bytes.slice(offset + 4, offset + 8 + length)),
      view.getUint32(offset + 8 + length),
    );
    chunks.push({ name, data });
    if (name === "IDAT") idat.push(data);
    offset += 12 + length;
  }
  const raw = new Uint8Array(
    await new Response(
      new Blob(idat).stream().pipeThrough(new DecompressionStream("deflate")),
    ).arrayBuffer(),
  );
  return { chunks, raw };
}
for (const colors of [16, 256]) {
  Deno.test(`indexed PNG ${colors} colours has valid CRCs, full CLUT and reversible indices`, async () => {
    const src = image(3, 2, [12, 34, 56, 255]);
    src.data.set([200, 210, 220, 0], 4);
    const q = A.quantizeTexture(src, colors),
      bytes = await A.indexedTexturePNG(q),
      { chunks, raw } = await decodePNG(bytes);
    const header = chunks.find((c) => c.name === "IHDR").data;
    assertEquals(header[8], colors === 16 ? 4 : 8);
    assertEquals(header[9], 3);
    assertEquals(chunks.find((c) => c.name === "PLTE").data.length, colors * 3);
    const stride = colors === 16 ? 2 : 3;
    for (let y = 0; y < 2; y++) {
      for (let x = 0; x < 3; x++) {
        const byte =
            raw[y * (stride + 1) + 1 + (colors === 16 ? Math.floor(x / 2) : x)],
          index = colors === 16 ? (byte >> (x % 2 ? 0 : 4)) & 15 : byte;
        assertEquals(index, q.indices[y * 3 + x]);
      }
    }
  });
}
Deno.test("prefab updates retain placement and overrides, update defaults and add children", () => {
  const p = A.mkProject(), sc = A.activeScene(p), source = A.mkObject("Group");
  source.components.model = A.makeComponent("model");
  source.components.model.file = "a.obj";
  source.children.push(A.mkObject("Child"));
  sc.objects.push(source);
  const pf = A.savePrefab(p, source), inst = A.placePrefab(pf, sc.objects);
  sc.objects.push(inst);
  const childId = inst.children[0].id;
  inst.components.transform.position.x = 7;
  inst.components.model.textureFilter = "NEAREST";
  pf.components.model.file = "b.obj";
  pf.components.model.textureFilter = "LINEAR";
  pf.children.push(A.prefabSnapshot(A.mkObject("Added")));
  const next = A.refreshPrefab(inst, pf, sc.objects);
  assertEquals(next.components.transform.position.x, 7);
  assertEquals(next.components.model.file, "b.obj");
  assertEquals(next.components.model.textureFilter, "NEAREST");
  assertEquals(next.children[0].id, childId);
  assertEquals(next.children.length, 2);
  assertEquals(next.name, inst.name);
  const reverted = A.refreshPrefab(next, pf, sc.objects, true);
  assertEquals(reverted.components.model.textureFilter, "LINEAR");
  assertEquals(reverted.components.transform.position.x, 7);
});
Deno.test("unmodified prefab children are removed while edited and instance-only children survive", () => {
  const p = A.mkProject(), sc = A.activeScene(p), source = A.mkObject("Group");
  source.children.push(A.mkObject("Clean"), A.mkObject("Edited"));
  const pf = A.savePrefab(p, source), inst = A.placePrefab(pf, sc.objects);
  inst.children[1].components.transform.position.y = 3;
  inst.children.push(A.mkObject("Local"));
  pf.children = [];
  const next = A.refreshPrefab(inst, pf, sc.objects);
  assertEquals(next.children.map((n) => n.name), ["Edited", "Local"]);
});
Deno.test("edited scripts win over disk copies and unattached scripts are exported", () => {
  const p = A.mkProject(), obj = A.mkObject("Player");
  obj.components.script = { ...A.makeComponent("script"), file: "Player.js" };
  A.activeScene(p).objects.push(obj);
  A.saveEditorScript(
    p,
    "Player.js",
    "export function init() {}\nexport function update() {}",
  );
  A.saveEditorScript(p, "Unused.js", "// keep this");
  const out = A.generateProject(p, [{
    name: "Player.js",
    cat: "scripts",
    content: "// stale",
  }]);
  assert(
    out.scripts.find((s) => s.filename === "scripts/Player.js").content
      .includes("export function"),
  );
  assertEquals(
    out.scripts.find((s) => s.filename === "scripts/Unused.js").content,
    "// keep this",
  );
  assertThrows(() => A.saveEditorScript(p, "../Bad.js", ""));
});
Deno.test("baked direct light is stored once and unlit viewport material avoids double lighting", async () => {
  const p = A.mkProject(),
    sc = A.activeScene(p),
    light = sc.objects[0].components.light;
  light.direction = { x: 0, y: 0, z: 1 };
  light.ambient = { r: .1, g: .1, b: .1 };
  light.diffuse = { r: .5, g: .5, b: .5 };
  const object = A.mkObject("Wall");
  object.components.model = A.makeComponent("model");
  sc.objects.push(object);
  const baked = await A.bakeModelLighting(object, A.readMeshOBJ(quad), sc, [], {
    size: 32,
    shadows: false,
  });
  const colors = [];
  for (let i = 0; i < baked.image.data.length; i += 4) {
    if (baked.image.data[i + 3]) colors.push(baked.image.data[i]);
  }
  assert(colors.length > 0);
  assert(colors.every((c) => Math.abs(c - 153) <= 1));
  const root = new THREE.Mesh(
    new THREE.BoxGeometry(),
    new THREE.MeshStandardMaterial(),
  );
  A.applyModelMaterial(root, { pipeline: "PL_NO_LIGHTS" }, []);
  assert(root.material.isMeshBasicMaterial);
  A.disposeObject(root);
  const controller = new AbortController();
  controller.abort();
  await assertRejects(
    () =>
      A.bakeModelLighting(object, A.readMeshOBJ(quad), sc, [], {
        size: 32,
        signal: controller.signal,
      }),
    Error,
    "cancelled",
  );
});
Deno.test("ZIP bundle retains binary assets and script subdirectories", async () => {
  const bytes = new Uint8Array(
    await A.exportBundle({
      main: "// game",
      scripts: [{ filename: "scripts/Player.js", content: "// player" }],
      assets: [{
        filename: "textures/p.png",
        dataUrl: "data:image/png;base64,AQID",
      }],
    }).arrayBuffer(),
  );
  let offset = 0, names = [];
  const view = new DataView(bytes.buffer);
  while (view.getUint32(offset, true) === 0x04034b50) {
    const length = view.getUint32(offset + 18, true),
      nameLength = view.getUint16(offset + 26, true),
      name = new TextDecoder().decode(
        bytes.slice(offset + 30, offset + 30 + nameLength),
      );
    names.push(name);
    const content = bytes.slice(
      offset + 30 + nameLength,
      offset + 30 + nameLength + length,
    );
    assertEquals(A.pngCRC(content), view.getUint32(offset + 14, true));
    if (name === "textures/p.png") {
      assertEquals(content, new Uint8Array([1, 2, 3]));
    }
    offset += 30 + nameLength + length;
  }
  assertEquals(names, [
    "main.js",
    "scripts/Player.js",
    "textures/p.png",
    "athena.ini",
  ]);
  assertEquals(view.getUint32(offset, true), 0x02014b50);
});

Deno.test("every creation template is ready to edit and export without importing a folder", () => {
  for (const template of A.PROJECT_TEMPLATES) {
    const project = A.createEditorProject(template, "  Example  ");
    assertEquals(project.name, "Example");
    assert(project.assets.some((f) => f.name === "Gradient_Pallete512.png"));
    assert(project.assets.some((f) => f.name === "Prototype_Checker.png"));
    const restored = A.migrateProject(
      JSON.parse(A.projectToJSON(project, A.editorAssets(project))),
    );
    const result = A.generateProject(restored);
    assertEquals(result.diagnostics.filter((d) => d.level === "error"), []);
    assert(
      !result.diagnostics.some((d) =>
        d.message.includes("not found") ||
        d.message.includes("not in the project")
      ),
      template.id,
    );
    for (const object of A.allObjects(A.activeScene(restored).objects)) {
      if (object.components.model?.file) {
        assert(
          restored.assets.some((f) =>
            f.name === object.components.model.file && f.content
          ),
        );
      }
    }
  }
});

Deno.test("smooth downscaling does not bleed colours from transparent pixels", () => {
  const result = A.resizeTexturePixels(
    {
      width: 2,
      height: 1,
      data: new Uint8ClampedArray([255, 0, 0, 255, 0, 0, 255, 0]),
    },
    1,
    1,
  );
  assertEquals(Array.from(result.data), [255, 0, 0, 128]);
});
