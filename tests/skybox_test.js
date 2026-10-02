import { assert, assertAlmostEquals, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { load } from "./_load.js";
const A = await load();

Deno.test("ten offline presets are distinct, opaque 2:1 PNG panoramas with matching seams", async () => {
  assertEquals(A.SKYBOX_PRESETS.length, 10);
  const images = new Set();
  for (const preset of A.SKYBOX_PRESETS) {
    const asset = A.skyboxPresetAsset(preset.id);
    images.add(asset.dataUrl);
    const binary = atob(asset.dataUrl.split(",")[1]), bytes = Uint8Array.from(binary, c => c.charCodeAt(0));
    assertEquals(A.imageSize(bytes), { width: 512, height: 256, format: "png" });
    const chunks = []; let at = 8;
    while (at < bytes.length) {
      const view = new DataView(bytes.buffer), size = view.getUint32(at), type = new TextDecoder().decode(bytes.subarray(at + 4, at + 8));
      assertEquals(A.pngCRC(bytes.subarray(at + 4, at + 8 + size)), view.getUint32(at + 8 + size));
      if (type === "IDAT") chunks.push(bytes.subarray(at + 8, at + 8 + size));
      at += size + 12;
    }
    const pixels = new Uint8Array(await new Response(new Blob(chunks).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
    assertEquals(pixels.length, (512 * 4 + 1) * 256);
    for (let y = 0; y < 256; y++) {
      const start = y * 2049 + 1;
      assertEquals(pixels.slice(start, start + 4), pixels.slice(start + 511 * 4, start + 512 * 4), `${preset.id} seam at row ${y}`);
      for (let x = 0; x < 512; x++) assertEquals(pixels[start + x * 4 + 3], 255);
    }
    if (["clouds", "sunset", "dusk", "aurora", "storm"].includes(preset.id)) {
      const zenith = pixels.slice(1, 5);
      for (let x = 1; x < 512; x++) assertEquals(pixels.slice(1 + x * 4, 5 + x * 4), zenith, `${preset.id} zenith must have one colour in every longitude`);
    }
  }
  assertEquals(images.size, 10);
});

Deno.test("older built-in skies upgrade in place while custom and edited textures keep their pixels", () => {
  const p = A.mkProject(), original = A.skyboxPresetAsset("clouds");
  p.assets = [{ ...original, id: "keep-id", name: "skybox_clouds_2.png", skyboxRevision: 1, dataUrl: "old" },
    { ...original, id: "edited", name: "edited.png", editKind: "optimize", dataUrl: "edited" },
    { name: "my-sky.png", cat: "textures", editKind: "skybox", dataUrl: "custom", owned: true }];
  A.activeScene(p).skybox = { enabled: true, texture: "skybox_clouds_2.png", rotation: 80, brightness: .9, preset: "clouds" };
  const upgraded = A.migrateProject(p);
  assertEquals(upgraded.assets[0].dataUrl, original.dataUrl);
  assertEquals(upgraded.assets[0].id, "keep-id"); assertEquals(upgraded.assets[0].name, "skybox_clouds_2.png");
  assertEquals(upgraded.assets[1].dataUrl, "edited"); assertEquals(upgraded.assets[2].dataUrl, "custom");
  assertEquals(A.activeScene(upgraded).skybox.rotation, 80);
});

Deno.test("selection preserves controls, deduplicates images, avoids filename collisions and survives save", () => {
  const p = A.mkProject(), sc = A.activeScene(p), asset = A.skyboxPresetAsset("aurora");
  const disk = [{ name: asset.name, cat: "textures", dataUrl: "data:image/png;base64,AA==" }];
  A.applySkybox(p, sc, { enabled: true, rotation: 405, brightness: .65, preset: "aurora" }, asset, disk);
  assertEquals(sc.skybox.texture, "skybox_aurora_2.png");
  A.applySkybox(p, sc, sc.skybox, asset, disk);
  assertEquals(p.assets.length, 1);
  const restored = A.migrateProject(JSON.parse(JSON.stringify(p)));
  assertEquals(A.activeScene(restored).skybox, { enabled: true, rotation: 45, brightness: .65, preset: "aurora", texture: "skybox_aurora_2.png" });
  assertEquals(A.normalizedSkybox({ rotation: Infinity, brightness: NaN }).rotation, 0);
  assertEquals(A.normalizedSkybox({ brightness: 9 }).brightness, 1);
  assertEquals(A.mkScene().skybox.enabled, false);
});

Deno.test("export bundles panorama and UV sphere, follows the camera, restores clipping and draws before objects", () => {
  const p = A.mkProject(), sc = A.activeScene(p);
  A.applySkybox(p, sc, { enabled: true, preset: "sunset", rotation: 90, brightness: .7 }, A.skyboxPresetAsset("sunset"));
  const snapshot = JSON.stringify(p), result = A.generateProject(p);
  assertEquals(JSON.stringify(p), snapshot, "export must not mutate the project");
  assert(result.assets.some(f => f.filename === "textures/skybox_sunset.png" && f.dataUrl));
  const meshAsset = result.assets.find(f => f.filename === "3dmodels/atheditor_skybox.obj");
  assert(meshAsset);
  const mesh = A.readMeshOBJ(meshAsset.content);
  assertEquals(mesh.faces.length, 960);
  for (const pos of mesh.positions) assertAlmostEquals(Math.hypot(...pos), 1, 1e-6);
  assertStringIncludes(result.main, "skybox_object.position = Camera.save().position");
  assertStringIncludes(result.main, "skybox_data.pipeline = Render.PL_NO_LIGHTS");
  assertStringIncludes(result.main, "skybox_data.face_culling = Render.CULL_FACE_NONE");
  const draw = result.main.indexOf("skybox_object.render()"), depth = result.main.indexOf("Screen.setParam(Screen.DEPTH_TEST_ENABLE, true)", draw);
  assert(draw > result.main.indexOf("Screen.clear(gray)")); assert(depth > draw);
  assert(result.main.indexOf("Render.setView(60.0, 1.0, 4000.0)", draw) > draw);
  A.applySkybox(p, sc, { ...sc.skybox, enabled: false });
  assert(!A.generateProject(p).main.includes("skybox_object"));
});

Deno.test("a missing or oversized sky reports an error and export skips it", () => {
  const p = A.mkProject(), sc = A.activeScene(p);
  sc.skybox = { enabled: true, texture: "gone.png" };
  assert(A.validateScene(sc, [], p).some(d => d.level === "error" && d.message.includes("sky image")));
  assert(A.generateProject(p).diagnostics.some(d => d.level === "error" && d.component === "skybox"));
  assert(!A.generateProject(p).main.includes("skybox_object"));
  A.applySkybox(p, sc, { enabled: true }, A.skyboxPresetAsset("clear"));
  const bytes = Uint8Array.from(atob(p.assets[0].dataUrl.split(",")[1]), c => c.charCodeAt(0));
  new DataView(bytes.buffer).setUint32(16, 2048);
  p.assets[0].dataUrl = A.bytesDataURL(bytes);
  assert(A.skyboxAssetProblems(sc, A.editorAssets(p)).some(d => d.level === "error"));
});

Deno.test("sky masks depth writes in CT16S and shares one buffer initialization with live shadows", () => {
  const p=A.mkProject(),sc=A.activeScene(p);
  A.applySkybox(p,sc,{enabled:true},A.skyboxPresetAsset("desert"));
  const caster=A.mkObject("Caster"); caster.components.model={...A.makeComponent("model"),file:"cube.obj"};
  caster.components.shadow=A.makeComponent("shadow"); sc.objects.push(caster);
  const result=A.generateProject(p,[{name:"cube.obj",cat:"models",content:"v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"}]);
  assertEquals((result.main.match(/Screen\.initBuffers\(\)/g)||[]).length,1);
  assertEquals((result.main.match(/const _mainDepth =/g)||[]).length,1);
  assertStringIncludes(result.main,"canvas.psm  = Screen.CT16S");
  const ir={skybox:{objectVN:"sky"},camera:{fov:20,near:1,far:4000}},e=new A.Emitter();
  A.emitSkyboxDraw(e,ir);
  let mask=0,enabled=false,method=2,drawn=false,view;
  const depth={};
  const Screen={DEPTH_BUFFER:1,DEPTH_TEST_ENABLE:2,DEPTH_TEST_METHOD:3,DEPTH_ALWAYS:1,
    setBuffer(type,buffer,value){assertEquals(type,1);assertEquals(buffer,depth);mask=value;},
    setParam(type,value){if(type===2)enabled=value;else method=value;}};
  const Render={setView(...args){view=args;}},Camera={save(){return {position:{x:1,y:2,z:3}};}},sky={render(){assertEquals(mask,1);assert(enabled);assertEquals(method,1);drawn=true;}};
  new Function("Screen","Render","Camera","sky","_mainDepth",e.toString())(Screen,Render,Camera,sky,depth);
  assert(drawn); assertEquals(mask,0); assertEquals(view,[20,1,4000]);
});

Deno.test("sky and models share a single texture upload when the filter matches", () => {
  const p = A.mkProject(), sc = A.activeScene(p);
  A.applySkybox(p, sc, { enabled: true }, A.skyboxPresetAsset("clear"));
  const obj = A.mkObject("Skybox object", "model");
  obj.components.model = { ...A.makeComponent("model"), file: "cube.obj", textureFile: sc.skybox.texture, textureFilter: "LINEAR" };
  sc.objects.push(obj);
  const result = A.generateProject(p);
  assertEquals((result.main.match(/new Image\("skybox_clear.png"\)/g) || []).length, 2, "one Image in each of the mutually exclusive lookup branches");
  assert(!result.main.includes("const skybox_texture = new Image"));
});

Deno.test("custom skies validate format and shape, flatten alpha, and resize before entering the project", async () => {
  const previous = { Image: globalThis.Image, document: globalThis.document, FileReader: globalThis.FileReader };
  let width = 4096, height = 2048, decodeFailure = false;
  const operations = [], output = A.skyboxPresetAsset("clear").dataUrl;
  globalThis.Image = class {
    naturalWidth = width; naturalHeight = height;
    set src(value) { queueMicrotask(() => decodeFailure ? this.onerror() : this.onload()); }
  };
  globalThis.document = { createElement() { return { width: 0, height: 0, getContext() { return {
    set fillStyle(value) { operations.push(value); }, fillRect(...args) { operations.push(["flatten", ...args]); }, drawImage(image, ...args) { operations.push(["resize", ...args]); },
  }; }, toDataURL(type) { assertEquals(type, "image/png"); return output; } }; } };
  globalThis.FileReader = class { result = output; readAsDataURL() { queueMicrotask(() => this.onload()); } };
  try {
    const asset = await A.importSkyboxTexture({ name: "My panorama.webp", type: "image/webp", size: 4096 });
    assertEquals(asset.image, { width: 512, height: 256, bpp: 32, format: "png" });
    assertEquals(asset.skyboxLabel, "My panorama"); assertEquals(asset.editKind, "skybox");
    assertEquals(operations, ["#000", ["flatten", 0, 0, 512, 256], ["resize", 0, 0, 512, 256]]);
    const rejects = async (file, text) => { let error; try { await A.importSkyboxTexture(file); } catch (e) { error = e; } assert(error); assertStringIncludes(error.message, text); };
    await rejects({ name: "fake.png", type: "text/html", size: 5 }, "PNG");
    await rejects({ name: "huge.png", type: "image/png", size: 33 * 1024 * 1024 }, "32 MB");
    width = height = 1024;
    await rejects({ name: "square.jpg", type: "image/jpeg", size: 5 }, "2:1");
    decodeFailure = true;
    await rejects({ name: "broken.png", type: "image/png", size: 5 }, "Could not open");
  } finally { for (const [key, value] of Object.entries(previous)) { if (value === undefined) delete globalThis[key]; else globalThis[key] = value; } }
});
