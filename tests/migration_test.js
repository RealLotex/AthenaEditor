import { assert, assertEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const A = await load();

/**
 * A v2 project as the editor used to write them: every scene carrying its own
 * copy of the render settings, and `linkedScenes` holding raw ids.
 */
function v2Project() {
  // One model, so the lifted models directory is actually exercised by codegen.
  const box = {
    id: "oA", name: "Box", children: [], visible: true, exportEnabled: true, ctxEnabled: true,
    components: {
      transform: { type: "transform", position: { x: 0, y: 0, z: 0 }, rotation: { x: 0, y: 0, z: 0 }, scale: { x: 1, y: 1, z: 1 } },
      model: { type: "model", file: "box.obj" },
    },
  };
  const sceneA = {
    id: "sA", name: "Level1", objects: [box], uiElements: [], linkedScenes: ["sB"],
    modelsDir: "meshes", texturesDir: "tex",
    background: { r: 10, g: 20, b: 30, a: 128 },
    psm: "CT32_Z24", psmCustomColor: "Screen.CT32", psmCustomDepth: "Screen.Z24",
    showDebugInfo: true,
    alphaTestEnable: true, alphaTestMethod: "ALPHA_LESS", alphaTestRef: 90,
    alphaTestFail: "ALPHA_FAIL_FB_ONLY", pixelAlphaBlend: false,
    physics: { enabled: true, gravity: { x: 0, y: -20, z: 0 }, cfm: 1e-4, erp: 0.5, iterations: 20, stepSize: 0.02, stepMethod: "quickStep" },
  };
  const sceneB = {
    ...structuredClone(sceneA),
    id: "sB", name: "Level2", linkedScenes: [],
    // deliberately divergent — this is what the migration must report
    psm: "CT16S_Z16S",
    showDebugInfo: false,
    modelsDir: "other_meshes",
  };
  return { name: "OldGame", scenes: [sceneA, sceneB], activeSceneId: "sA", prefabs: [] };
}

Deno.test("v2 render settings are lifted onto the project", () => {
  const p = A.migrateProject(v2Project());

  assertEquals(p.version, 3);
  assertEquals(p.display.psm, "CT32_Z24");
  assertEquals(p.display.psmCustomColor, "Screen.CT32");
  assertEquals(p.display.debugHUD, true);
  assertEquals(p.display.alphaTest.enabled, true);
  assertEquals(p.display.alphaTest.method, "ALPHA_LESS");
  assertEquals(p.display.alphaTest.ref, 90);
  assertEquals(p.display.alphaTest.onFail, "ALPHA_FAIL_FB_ONLY");
  assertEquals(p.display.alphaTest.pixelBlend, false);
  assertEquals(p.dirs.models, "meshes");
  assertEquals(p.dirs.textures, "tex");
  // Fields that never existed in v2 get their defaults.
  assertEquals(p.dirs.sounds, "sounds");
  assertEquals(p.display.mode, "");
});

Deno.test("lifted settings are removed from every scene", () => {
  const p = A.migrateProject(v2Project());
  for (const s of p.scenes) {
    for (const key of ["psm", "psmCustomColor", "psmCustomDepth", "showDebugInfo",
      "alphaTestEnable", "alphaTestMethod", "alphaTestRef", "alphaTestFail",
      "pixelAlphaBlend", "modelsDir", "texturesDir", "linkedScenes"]) {
      assert(!(key in s), `scene "${s.name}" still carries "${key}"`);
    }
  }
});

Deno.test("per-scene settings survive the lift", () => {
  const p = A.migrateProject(v2Project());
  const a = p.scenes[0];
  assertEquals(a.background, { r: 10, g: 20, b: 30, a: 128 });
  assertEquals(a.physics.gravity.y, -20);
  assertEquals(a.physics.stepSize, 0.02);
  assertEquals(a.physics.iterations, 20);
  // stepMethod was never a real engine concept — stepWithContacts does it all.
  assert(!("stepMethod" in a.physics));
});

Deno.test("divergent scenes are reported, not silently overwritten", () => {
  const notes = [];
  A.migrateProject(v2Project(), notes);
  assert(notes.length > 1, "expected a summary plus one note per divergence");
  const body = notes.join("\n");
  // Level2 disagreed about three settings; each should be named.
  assert(/Level2/.test(body));
  assert(/framebuffer format/.test(body), body);
  assert(/debug HUD/.test(body), body);
  assert(/models directory/.test(body), body);
  // And it should say which value won.
  assert(/Level1/.test(body), body);
});

Deno.test("a project with no divergence produces no notes", () => {
  const src = v2Project();
  src.scenes[1] = { ...structuredClone(src.scenes[0]), id: "sB", name: "Level2", linkedScenes: [] };
  const notes = [];
  A.migrateProject(src, notes);
  assertEquals(notes, []);
});

Deno.test("linkedScenes become named transitions", () => {
  const p = A.migrateProject(v2Project());
  const a = p.scenes.find((s) => s.name === "Level1");
  assertEquals(a.transitions.length, 1);
  assertEquals(a.transitions[0].targetSceneId, "sB");
  assertEquals(a.transitions[0].name, "level2");
  assert(a.transitions[0].id);
  assertEquals(p.scenes.find((s) => s.name === "Level2").transitions, []);
});

Deno.test("transitions pointing at deleted scenes are dropped", () => {
  const src = v2Project();
  src.scenes[0].linkedScenes = ["sB", "ghost"];
  const p = A.migrateProject(src);
  assertEquals(p.scenes[0].transitions.length, 1);
});

Deno.test("startSceneId defaults to the first scene", () => {
  const p = A.migrateProject(v2Project());
  assertEquals(p.startSceneId, "sA");
  assertEquals(p.activeSceneId, "sA");
});

Deno.test("migration is idempotent", () => {
  const once = A.migrateProject(v2Project());
  const snapshot = JSON.stringify(once);
  const twice = A.migrateProject(once, []);
  assertEquals(JSON.stringify(twice), snapshot);
});

Deno.test("re-migrating a v3 project produces no notes", () => {
  const p = A.migrateProject(v2Project());
  const notes = [];
  A.migrateProject(p, notes);
  assertEquals(notes, []);
});

Deno.test("garbage input still yields a usable project", () => {
  for (const junk of [null, undefined, 42, "nope", {}, { scenes: [] }, { scenes: "no" }]) {
    const p = A.migrateProject(junk);
    assert(p.scenes.length >= 1);
    assert(p.display && p.dirs);
    assertEquals(p.version, 3);
    assert(p.scenes.some((s) => s.id === p.activeSceneId));
    assert(p.scenes.some((s) => s.id === p.startSceneId));
  }
});

Deno.test("a fresh project is already current", () => {
  const notes = [];
  const p = A.migrateProject(A.mkProject(), notes);
  assertEquals(notes, []);
  assertEquals(p.version, 3);
  assertEquals(p.startSceneId, p.scenes[0].id);
});

// ── the settings actually reach the generated program ──────────────────

Deno.test("project display settings drive the emitted code", () => {
  const p = A.migrateProject(v2Project());
  const { main } = A.generateProject(p);
  assertStringIncludesAll(main, [
    "canvas.psm  = Screen.CT32;",
    "canvas.psmz = Screen.Z24;",
    "Screen.setParam(Screen.ALPHA_TEST_METHOD, Screen.ALPHA_LESS);",
    "Screen.setParam(Screen.ALPHA_TEST_REF, 90);",
    "Screen.setParam(Screen.PIXEL_ALPHA_BLEND_ENABLE, false);",
    'os.chdir("meshes");',      // dirs.models, was scene.modelsDir
    "VRAM static",              // debugHUD lifted from scene.showDebugInfo
  ]);
});

Deno.test("video mode is only emitted when explicitly chosen", () => {
  const p = A.mkProject();
  assert(!/canvas\.mode/.test(A.generateProject(p).main), "default must not touch the video mode");
  p.display.mode = "PAL";
  assertStringIncludesAll(A.generateProject(p).main, ["canvas.mode = Screen.PAL;"]);
});

Deno.test("scene camera defaults apply when no Camera object exists", () => {
  const p = A.mkProject();
  const s = p.scenes[0];
  s.objects = s.objects.filter((o) => !o.components.camera);
  s.camera = { fov: 75, near: 0.5, far: 900 };
  assertStringIncludesAll(A.generateProject(p).main, ["Render.setView(75.0, 0.5, 900.0);"]);
});

Deno.test("a Camera object overrides the scene defaults entirely", () => {
  // A Camera component always carries all three values, so it wins outright
  // rather than falling back field by field. That is what the Scene panel says.
  const p = A.mkProject();
  const s = p.scenes[0];
  s.camera = { fov: 75, near: 0.5, far: 900 };
  const cam = s.objects.find((o) => o.components.camera).components.camera;
  cam.fov = 30;
  assertStringIncludesAll(A.generateProject(p).main, [`Render.setView(30.0, ${A.fl(cam.near)}, ${A.fl(cam.far)});`]);
});

Deno.test("asset folders are configurable and reach every loader", () => {
  const p = A.mkProject();
  p.dirs = { models: "mdl", textures: "tex", sounds: "sfx", fonts: "fnt", scripts: "src" };
  const s = p.scenes[0];
  const snd = A.mkObject("Music");
  snd.components.sound = Object.assign(A.makeComponent("sound"), { file: "bgm.adp" });
  s.objects.push(snd);
  const player = A.mkObject("Player");
  player.components.model = Object.assign(A.makeComponent("model"), { file: "p.obj" });
  player.components.script = Object.assign(A.makeComponent("script"), { file: "Hero.js" });
  s.objects.push(player);

  // The overlay font is only read off disk when the folder actually has one.
  const out = A.generateProject(p, [{ name: "px.ttf", cat: "fonts", folder: "fnt" }]);
  assertStringIncludesAll(out.main, [
    'os.chdir("fnt");',
    'new Font("px.ttf")',
    'Sound.Stream("sfx/bgm.adp")',
    'from "./src/Hero.js"',
  ]);
  assertEquals(out.scripts[0].filename, "src/Hero.js");
  // A missing dirs entry used to reach the output as the literal path
  // "undefined/". Note `!== undefined` is legitimate JS elsewhere in the file.
  assert(!/undefined\//.test(out.main), "a directory resolved to undefined");
  assert(!out.scripts.some((f) => f.filename.startsWith("undefined")));
});

function assertStringIncludesAll(haystack, needles) {
  for (const n of needles) {
    assert(haystack.includes(n), `expected output to contain:\n  ${n}`);
  }
}
