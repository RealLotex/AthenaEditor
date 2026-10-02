import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { load } from "./_load.js";

// ═══════════════════════════════════════════════════════════════════════
//  TEXTURES — the most expensive mistake with the least feedback
//
//  athena_load_image (src/image_loaders.c:135) allocates width * height * 4
//  bytes in main RAM with no ceiling and no complaint, then the upload takes
//  the same again out of 4 MB of VRAM. Nothing says the picture was too big:
//  the program just does not boot.
//
//  This came from a real project. Five meshes shared one texture named
//  "...512..." that was actually 2048x2048 — 16 MB each, uploaded five times,
//  because the generator emitted `new Image(file)` per RenderData.
// ═══════════════════════════════════════════════════════════════════════

const A = await load([
  "core/util.js", "core/math.js", "core/shadowmath.js", "core/imagesize.js",
  "core/skybox.js", "codegen/skybox.js",
  "core/components.js", "core/project.js", "core/validate.js",
  "codegen/emit.js", "codegen/resolve.js", "codegen/models.js", "codegen/lights.js",
  "codegen/sounds.js", "codegen/physics.js", "codegen/shadows.js", "codegen/uigen.js",
  "codegen/ctx.js", "codegen/index.js",
]);

// ── minimal encoders, so the fixtures are real files rather than mocks ──

function pngBytes(w, h) {
  const b = new Uint8Array(33);
  b.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  b.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);        // length + "IHDR"
  new DataView(b.buffer).setUint32(16, w);
  new DataView(b.buffer).setUint32(20, h);
  b[24] = 8; b[25] = 2;                                    // 8-bit truecolour
  return b;
}

function bmpBytes(w, h) {
  const b = new Uint8Array(54);
  b.set([0x42, 0x4d], 0);
  const dv = new DataView(b.buffer);
  dv.setUint32(14, 40, true);
  dv.setInt32(18, w, true);
  dv.setInt32(22, h, true);
  return b;
}

function jpegBytes(w, h) {
  // SOI, a JFIF APP0 to be walked over, then a baseline SOF0.
  const b = new Uint8Array([
    0xff, 0xd8,
    0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0, 1, 1, 0, 0, 1, 0, 1, 0, 0,
    0xff, 0xc0, 0x00, 0x11, 0x08, 0, 0, 0, 0, 3,
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const dv = new DataView(b.buffer);
  dv.setUint16(25, h);
  dv.setUint16(27, w);
  return b;
}

const dataUrl = (bytes) => {
  let s = "";
  for (const x of bytes) s += String.fromCharCode(x);
  return `data:image/x;base64,${btoa(s)}`;
};

// ── the parser ─────────────────────────────────────────────────────────

Deno.test("PNG dimensions come out of the IHDR", () => {
  assertEquals(A.imageSize(pngBytes(2048, 2048)), { width: 2048, height: 2048, format: "png" });
  assertEquals(A.imageSize(pngBytes(64, 128)).width, 64);
});

Deno.test("BMP dimensions come out of the DIB header", () => {
  assertEquals(A.imageSize(bmpBytes(256, 512)), { width: 256, height: 512, format: "bmp" });
});

Deno.test("a top-down BMP reports a positive height", () => {
  // A negative height means the rows are stored the other way up; it is not
  // a texture of negative size, and reporting one would make the cost negative.
  assertEquals(A.imageSize(bmpBytes(256, -512)).height, 512);
});

Deno.test("JPEG dimensions are found by walking to the first frame header", () => {
  assertEquals(A.imageSize(jpegBytes(320, 240)), { width: 320, height: 240, format: "jpeg" });
});

Deno.test("an unknown or truncated file is null, not a guess", () => {
  assertEquals(A.imageSize(new Uint8Array([1, 2, 3])), null);
  assertEquals(A.imageSize(new Uint8Array(32)), null);
  assertEquals(A.imageSize(null), null);
});

Deno.test("dimensions are read straight from a data URL", () => {
  const entry = { name: "t.png", dataUrl: dataUrl(pngBytes(1024, 512)) };
  assertEquals(A.imageSizeOfAsset(entry), { width: 1024, height: 512, format: "png" });
});

Deno.test("a malformed data URL does not throw", () => {
  assertEquals(A.imageSizeOfAsset({ name: "t.png", dataUrl: "data:image/png;base64,!!!" }), null);
  assertEquals(A.imageSizeOfAsset({ name: "t.png" }), null);
});

Deno.test("the texture cost is the surface the engine allocates", () => {
  assertEquals(A.textureBytes(2048, 2048), 16 * 1024 * 1024);
  assertEquals(A.textureBytes(256, 256), 256 * 1024);
});

// ── the rules ──────────────────────────────────────────────────────────

const scene = (models) => {
  const p = A.mkProject();
  const s = p.scenes[0];
  s.objects = models.map(([name, patch]) => {
    const o = A.mkObject(name);
    o.components.model = Object.assign(A.makeComponent("model"), patch);
    return o;
  });
  return A.migrateProject(p);
};

const tex = (name, w, h) => ({ name, cat: "textures", dataUrl: dataUrl(pngBytes(w, h)) });

Deno.test("a texture the GS cannot address is an error, with the size in it", () => {
  const p = scene([["A", { file: "a.obj", textureFile: "big.png" }]]);
  const problems = A.validateScene(p.scenes[0], [tex("big.png", 2048, 2048), { name: "a.obj", cat: "models" }], p);
  const err = problems.find((d) => d.level === "error");
  assert(err, "a 2048x2048 texture must not export quietly");
  assertStringIncludes(err.message, "2048x2048");
  assertStringIncludes(err.message, "1024");
  assertStringIncludes(err.message, "16.0 MB");
});

Deno.test("a texture within the GS limit passes", () => {
  const p = scene([["A", { file: "a.obj", textureFile: "ok.png" }]]);
  const problems = A.validateScene(p.scenes[0], [tex("ok.png", 512, 512), { name: "a.obj", cat: "models" }], p);
  assertEquals(problems.filter((d) => d.level === "error"), []);
});

Deno.test("a non-power-of-two texture is a warning", () => {
  const p = scene([["A", { file: "a.obj", textureFile: "odd.png" }]]);
  const problems = A.validateScene(p.scenes[0], [tex("odd.png", 300, 200), { name: "a.obj", cat: "models" }], p);
  assert(problems.some((d) => d.level === "warn" && /powers of two/.test(d.message)));
});

Deno.test("one texture on six meshes is reported once, not six times", () => {
  // The whole point of the dedup is that this costs one upload. Reporting it
  // per object would train people to ignore the panel.
  const p = scene(["A", "B", "C", "D", "E", "F"].map((n) => [n, { file: `${n}.obj`, textureFile: "shared.png" }]));
  const files = [tex("shared.png", 2048, 2048), ...["A", "B", "C", "D", "E", "F"].map((n) => ({ name: `${n}.obj`, cat: "models" }))];
  const errs = A.validateScene(p.scenes[0], files, p).filter((d) => d.level === "error");
  assertEquals(errs.length, 1);
});

Deno.test("the same texture at two filters is called out as a second copy", () => {
  // The filter belongs to the Image, so LINEAR and NEAREST really are two
  // uploads — which is what the sample project was paying for without knowing.
  const p = scene([
    ["A", { file: "a.obj", textureFile: "t.png", textureFilter: "LINEAR" }],
    ["B", { file: "b.obj", textureFile: "t.png", textureFilter: "NEAREST" }],
  ]);
  const files = [tex("t.png", 512, 512), { name: "a.obj", cat: "models" }, { name: "b.obj", cat: "models" }];
  const hit = A.validateScene(p.scenes[0], files, p).find((d) => /LINEAR and NEAREST/.test(d.message));
  assert(hit, "two filters on one file is a silent extra megabyte");
  assertStringIncludes(hit.message, "1.0 MB");
});

Deno.test("one filter everywhere says nothing", () => {
  const p = scene([
    ["A", { file: "a.obj", textureFile: "t.png", textureFilter: "LINEAR" }],
    ["B", { file: "b.obj", textureFile: "t.png", textureFilter: "LINEAR" }],
  ]);
  const files = [tex("t.png", 512, 512), { name: "a.obj", cat: "models" }, { name: "b.obj", cat: "models" }];
  assert(!A.validateScene(p.scenes[0], files, p).some((d) => /filtering/.test(d.message)));
});

Deno.test("the total is measured across unique uploads, not objects", () => {
  const p = scene(["A", "B", "C"].map((n) => [n, { file: `${n}.obj`, textureFile: "shared.png" }]));
  const files = [tex("shared.png", 1024, 1024), ...["A", "B", "C"].map((n) => ({ name: `${n}.obj`, cat: "models" }))];
  const problems = A.validateScene(p.scenes[0], files, p);
  // 4 MB once is over budget; 4 MB three times would have said 12.
  const total = problems.find((d) => /Textures come to/.test(d.message));
  assert(total);
  assertStringIncludes(total.message, "4.0 MB");
});

Deno.test("a texture with no dimensions known is not guessed at", () => {
  // Assets loaded from a project file carry no payload, so silence is right.
  const p = scene([["A", { file: "a.obj", textureFile: "unknown.png" }]]);
  const files = [{ name: "unknown.png", cat: "textures" }, { name: "a.obj", cat: "models" }];
  assert(!A.validateScene(p.scenes[0], files, p).some((d) => /Textures come to|cannot address/.test(d.message)));
});

Deno.test("a hidden object's texture is not counted", () => {
  const p = scene([["A", { file: "a.obj", textureFile: "big.png" }]]);
  p.scenes[0].objects[0].visible = false;
  const files = [tex("big.png", 2048, 2048), { name: "a.obj", cat: "models" }];
  assert(!A.validateScene(p.scenes[0], files, p).some((d) => /cannot address/.test(d.message)));
});
