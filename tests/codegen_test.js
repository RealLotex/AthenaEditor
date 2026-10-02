import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const A = await load();

// ── fixtures ───────────────────────────────────────────────────────────
function project(build) {
  const p = A.mkProject();
  const scene = p.scenes[0];
  scene.objects = [];
  build(scene, p);
  return A.migrateProject(p);
}

const obj = (name, comps = {}) => {
  const o = A.mkObject(name);
  for (const [k, patch] of Object.entries(comps)) {
    o.components[k] = Object.assign(A.makeComponent(k), patch);
  }
  return o;
};

const gen = (p, files = []) => A.generateProject(p, files);

Deno.test("HUD uses the configured font folder and clamps PS2 alpha", () => {
  const p = project((s, p) => {
    p.dirs.fonts = "typefaces";
    const text = A.mkUIEl("Text"), panel = A.mkUIEl("Panel");
    text.fontFile = "score.ttf";
    text.textColor = { r: 255, g: 100, b: 0, a: 200 };
    panel.bgColor = { r: 30, g: 40, b: 50, a: -10 };
    s.uiElements = [text, panel];
  });
  const { main } = gen(p);
  assertStringIncludes(main, 'new Font("typefaces/score.ttf")');
  assertStringIncludes(main, "Color.new(255, 100, 0, 128)");
  assertStringIncludes(main, "Color.new(30, 40, 50, 0)");
});

/** Every `const NAME` / `let NAME` at any indentation, for collision checks. */
function declaredNames(src) {
  return [...src.matchAll(/^\s*(?:const|let)\s+([A-Za-z_$][\w$]*)\s*=/gm)].map((m) => m[1]);
}

/** Line index of the first line matching a pattern, or -1. */
const lineOf = (src, re) => src.split("\n").findIndex((l) => re.test(l));

// ═══════════════════════════════════════════════════════════════════════
//  Structure
// ═══════════════════════════════════════════════════════════════════════

Deno.test("output parses as a JS module", () => {
  const p = project((s) => {
    s.objects.push(obj("Player", { model: { file: "player.obj", textureFile: "skin.png" } }));
    s.objects.push(obj("Sun", { light: {} }));
    s.objects.push(obj("Cam", { camera: {} }));
  });
  const { main } = gen(p);
  // The engine's globals do not exist here, so only check that it parses.
  new Function(`return (async () => { ${main.replace(/^import .*$/gm, "")} })`);
});

Deno.test("no duplicate declarations when objects share a name", () => {
  const p = project((s) => {
    s.objects.push(obj("Box", { model: { file: "a.obj" } }));
    s.objects.push(obj("Box", { model: { file: "b.obj" } }));
    s.objects.push(obj("Box", { light: {} }));
  });
  const names = declaredNames(gen(p).main);
  assertEquals(names.length, new Set(names).size, `duplicates: ${names.filter((n, i) => names.indexOf(n) !== i)}`);
});

Deno.test("nothing is declared inside the frame loop", () => {
  const p = project((s) => {
    s.objects.push(obj("Player", { model: { file: "p.obj" } }));
    s.uiElements = [A.mkUIEl("Text"), A.mkUIEl("Button"), A.mkUIEl("ProgressBar")];
  });
  const { main } = gen(p);
  const lines = main.split("\n");
  const start = lines.findIndex((l) => l.trim() === "Screen.display(() => {");
  assert(start > 0, "no frame loop emitted");
  const body = lines.slice(start).join("\n");
  // `new Font(...)` inside the loop was the old memory leak.
  assert(!/new Font\(/.test(body), "a Font is allocated inside the frame loop");
  assert(!/new Image\(/.test(body), "an Image is allocated inside the frame loop");
  assert(!/^\s*function /m.test(body), "a function is declared inside the frame loop");
  // Only block-scoped temporaries (_p, _c, _mainCam...) may be const in there.
  for (const n of declaredNames(body)) {
    assert(n.startsWith("_") || n === "hits" || n === "t", `unexpected declaration "${n}" inside the loop`);
  }
});

Deno.test("drawUI is defined before the loop that calls it", () => {
  const p = project((s) => { s.uiElements = [A.mkUIEl("Text")]; });
  const { main } = gen(p);
  const def = lineOf(main, /^function drawUI\(\)/);
  const call = lineOf(main, /^\s+drawUI\(\);/);
  assert(def >= 0 && call >= 0, "drawUI missing");
  assert(def < call, "drawUI() is called before it is defined");
});

Deno.test("nested children are exported with baked world transforms", () => {
  const p = project((s) => {
    const parent = obj("Parent", { model: { file: "p.obj" } });
    parent.components.transform.position = A.v3(10, 0, 0);
    const child = obj("Child", { model: { file: "c.obj" } });
    child.components.transform.position = A.v3(0, 5, 0);
    parent.children.push(child);
    s.objects.push(parent);
  });
  const { main, stats } = gen(p);
  assertEquals(stats.models, 2, "the nested child was dropped from the export");
  assertStringIncludes(main, "{x: 10, y: 5, z: 0}");
});

Deno.test("hidden parents hide their subtree", () => {
  const p = project((s) => {
    const parent = obj("Parent", { model: { file: "p.obj" } });
    parent.visible = false;
    parent.children.push(obj("Child", { model: { file: "c.obj" } }));
    s.objects.push(parent);
  });
  assertEquals(gen(p).stats.models, 0);
});

Deno.test("identical meshes share one RenderData", () => {
  const p = project((s) => {
    for (const n of ["A", "B", "C"]) s.objects.push(obj(n, { model: { file: "tree.obj" } }));
    s.objects.push(obj("D", { model: { file: "tree.obj", pipeline: "PL_NO_LIGHTS" } }));
  });
  const { stats } = gen(p);
  assertEquals(stats.models, 4);
  assertEquals(stats.renderDatas, 2, "different render settings must not share a RenderData");
});

// ═══════════════════════════════════════════════════════════════════════
//  ODE — argument orders verified against src/js_api/ath_ode.c
// ═══════════════════════════════════════════════════════════════════════

const physicsProject = (patch = {}) =>
  project((s) => {
    s.physics.enabled = true;
    const ground = obj("Ground", { rigidbody: { mode: "static", shape: "plane", planeY: 0 } });
    const ball = obj("Ball", {
      model: { file: "ball.obj" },
      rigidbody: { mode: "dynamic", shape: "sphere", radius: 0.5, mass: 2, autoFit: false, ...patch },
    });
    ball.components.transform.position = A.v3(0, 5, 0);
    s.objects.push(ground, ball);
  });

Deno.test("stepWithContacts is called as (space, group, dt)", () => {
  const { main } = gen(physicsProject());
  assertStringIncludes(main, "ode_world.stepWithContacts(ode_space, ode_contacts, 0.016");
  // The old generator passed (dt, space, group), which made ODE read a number
  // as a space pointer and silently disabled the whole simulation.
  assert(!/stepWithContacts\(\s*[\d.]/.test(main), "stepWithContacts still receives dt first");
});

Deno.test("geom constructors take the space first", () => {
  const p = project((s) => {
    s.physics.enabled = true;
    s.objects.push(obj("Box", { rigidbody: { shape: "box", autoFit: false } }));
    s.objects.push(obj("Ball", { rigidbody: { shape: "sphere", autoFit: false } }));
    s.objects.push(obj("Floor", { rigidbody: { shape: "plane" } }));
    s.objects.push(obj("Mesh", { model: { file: "level.obj" }, rigidbody: { shape: "mesh" } }));
  });
  const { main } = gen(p);
  assertStringIncludes(main, "ODE.GeomBox(ode_space,");
  assertStringIncludes(main, "ODE.GeomSphere(ode_space,");
  assertStringIncludes(main, "ODE.GeomPlane(ode_space, 0.0, 1.0, 0.0,");
  assertStringIncludes(main, "ODE.GeomRenderObject(ode_space, ");
  assert(!/GeomRenderObject\([a-z_]+, ode_space\)/.test(main), "GeomRenderObject arguments are reversed");
});

Deno.test("the contact callback matches the engine's single-argument shape", () => {
  const p = physicsProject({ collisionEvents: true, onCollide: "ball" });
  const { main } = gen(p);
  assertStringIncludes(main, "function ode_onCollide(c) {");
  assertStringIncludes(main, "c.geom1");
  // space.collide(cb) and stepWithContacts(..., cb) both pass ONE contact
  // object. The old two-parameter form threw on the first contact.
  assert(!/function ode_onCollide\(\w+,\s*\w+\)/.test(main), "callback still takes two geoms");
  assertStringIncludes(main, "stepWithContacts(ode_space, ode_contacts, 0.016, ode_onCollide)");
});

Deno.test("the broad phase runs once per frame", () => {
  const p = physicsProject({ collisionEvents: true, onCollide: "ball" });
  const { main } = gen(p);
  assert(!/ode_space\.collide\(/.test(main), "space.collide() duplicates the broad phase stepWithContacts already runs");
});

Deno.test("dynamic bodies drive both position and rotation", () => {
  const { main } = gen(physicsProject());
  assertStringIncludes(main, ".getPosition()");
  assertStringIncludes(main, "_odeEuler(");
  assertStringIncludes(main, ".getRotation()");
  assertStringIncludes(main, "function _odeEuler(a)");
});

Deno.test("triggers are created outside the stepped space so they cannot block", () => {
  const p = project((s) => {
    s.physics.enabled = true;
    s.objects.push(obj("Zone", { rigidbody: { mode: "trigger", shape: "box", autoFit: false, collisionEvents: true, onCollide: "zone" } }));
    const ball = obj("Ball", { model: { file: "b.obj" }, rigidbody: { mode: "dynamic", shape: "sphere", autoFit: false } });
    s.objects.push(ball);
  });
  const { main } = gen(p);
  assertStringIncludes(main, "ODE.GeomBox(null,");
  assertStringIncludes(main, "function _updateTriggers()");
  assertStringIncludes(main, "ODE.geomCollide(t.geom");
});

Deno.test("impossible bodies are rejected with an explanation", () => {
  const p = project((s) => {
    s.physics.enabled = true;
    s.objects.push(obj("Bad", { model: { file: "m.obj" }, rigidbody: { mode: "dynamic", shape: "mesh" } }));
  });
  const { diagnostics, stats } = gen(p);
  assertEquals(stats.bodies, 0);
  assert(diagnostics.some((d) => d.level === "error" && /dynamic mesh/i.test(d.message)));
});

Deno.test("rigidbodies are skipped, with a warning, when scene physics is off", () => {
  const p = project((s) => {
    s.physics.enabled = false;
    s.objects.push(obj("Box", { rigidbody: { shape: "box" } }));
  });
  const { main, diagnostics } = gen(p);
  assert(!/ODE\./.test(main));
  assert(diagnostics.some((d) => /physics is off/i.test(d.message)));
});

// ═══════════════════════════════════════════════════════════════════════
//  Shadows — verified against src/shadows.c and bin/shadows.js
// ═══════════════════════════════════════════════════════════════════════

const shadowProject = (patch = {}) =>
  project((s) => {
    s.objects.push(obj("Hero", { model: { file: "hero.obj" } }));
    s.objects.push(obj("HeroShadow", { shadow: { caster: "Hero", ...patch } }));
  });

Deno.test("raycast shadows without colliders never reference a missing ODE space", () => {
  const p = shadowProject({ raycast: true });
  p.scenes[0].physics.enabled = true;
  const { main, diagnostics } = gen(p);
  assert(!main.includes("enableRaycast("));
  assert(!main.includes("ode_space"));
  assert(diagnostics.some((d) => d.level === "error" && /exported collider/.test(d.message)));
});

Deno.test("texture shadows can follow their named caster", () => {
  const { main } = gen(shadowProject({ source: "texture", texture: "blob.png", follow: true }));
  const loop = main.slice(main.indexOf("Screen.display(() =>"));
  assertStringIncludes(loop, "const _c = hero.position");
  assertStringIncludes(loop, "heroshadow_shadow.setTransform(heroshadow_shadowmatrix)");
  assert(!main.includes("function _shadowPass()"));
});

Deno.test("setColor precedes the last geometry rebuild", () => {
  const { main } = gen(shadowProject());
  const color = lineOf(main, /setColor\(/);
  const grid = lineOf(main, /setGrid\(/);
  assert(color >= 0 && grid >= 0, "shadow calls missing");
  // rebuild_geometry() bakes the vertex colours; setColor afterwards is a no-op.
  assert(color < grid, "setColor is emitted after setGrid, so the colour never takes effect");
});

Deno.test("position is assigned after the last rebuild", () => {
  const { main } = gen(shadowProject({ follow: false }));
  const grid = lineOf(main, /setGrid\(/);
  const pos = lineOf(main, /_shadow\.setTransform\(/);
  assert(pos > grid, "assigning position before setGrid double-applies the transform");
});

Deno.test("enableRaycast is (space, enable, length)", () => {
  const p = project((s) => {
    s.physics.enabled = true;
    s.objects.push(obj("Floor", { rigidbody: { shape: "plane" } }));
    s.objects.push(obj("Hero", { model: { file: "hero.obj" } }));
    s.objects.push(obj("HeroShadow", { shadow: { caster: "Hero", raycast: true, rayLength: 12 } }));
  });
  const { main } = gen(p);
  assertStringIncludes(main, "enableRaycast(ode_space, 1, 12.0)");
});

Deno.test("the shadow pass is generated AND called, and the frame is still cleared", () => {
  const { main } = gen(shadowProject());
  assertStringIncludes(main, "function _shadowPass()");
  const call = lineOf(main, /^\s+_shadowPass\(\);/);
  assert(call > 0, "_shadowPass is never called");
  // Enabling a shadow used to suppress the main clear entirely, leaving the
  // framebuffer full of last frame's garbage.
  const clear = lineOf(main, /^Screen\.clearColor\(gray\);/);
  assert(clear > 0, "the frame is never cleared");
  assert(clear < call, "the clear must happen before the offscreen pass");
  // The projector itself must be drawn or the whole component does nothing.
  assertStringIncludes(main, "_shadow.render();");
});

Deno.test("the offscreen target is cleared with Draw.rect, not Screen.clear", () => {
  const { main } = gen(shadowProject());
  const pass = main.slice(main.indexOf("function _shadowPass()"), main.indexOf("Screen.display(() =>"));
  assertStringIncludes(pass, "Draw.rect(0, 0, 128, 128,");
  // Screen.clear rasterises main-framebuffer-sized pages and would write past
  // the end of a 128x128 target.
  assert(!/Screen\.clear\(/.test(pass), "Screen.clear inside the offscreen pass overruns the target");
  assertStringIncludes(pass, "Screen.switchContext();");
  assertStringIncludes(pass, "Camera.save()");
  assertStringIncludes(pass, "Camera.restore(_mainCam)");
  // The viewport is square and its FOV is the shadow's own, not the scene's.
  assertStringIncludes(pass, "Render.setView(20.0, 1.0, 4000.0, 128, 128)");
});

Deno.test("the silhouette camera sits on the light, and the decal turns to match", () => {
  // The geometry is proved in tests/shadowmath_test.js against a transcription
  // of the engine's matrix code. What matters here is that the generator emits
  // the camera and the matching decal rotation, rather than dropping either.
  const { main } = gen(shadowProject({ lightDir: A.v3(1, 1, 1) }));
  const pass = main.slice(main.indexOf("function _shadowPass()"), main.indexOf("Screen.display(() =>"));

  const cam = pass.match(/Camera\.position\(([^)]*)\)/);
  assert(cam, "no camera placement in the shadow pass");
  const [x, y, z] = cam[1].split(",").map((s) => s.trim());
  // A light at (1,1,1) has an X and a Z component, so the camera has to be
  // offset on all three axes — straight overhead would be the old bug.
  assert(/^_c\.x \+ [\d.]+$/.test(x), `camera should be offset along the light on X, got ${x}`);
  assert(/^_c\.y \+ [\d.]+$/.test(y), `camera should be above the caster, got ${y}`);
  assert(/^_c\.z \+ [\d.]+$/.test(z), `camera should be offset along the light on Z, got ${z}`);

  assert(/_shadow\.setTransform\(/.test(main), "the decal has no world matrix");
  assert(!/_shadow\.(rotation|scale|position)\s*=/.test(main), "property setters replace the matrix");
});

Deno.test("a shadow cast straight down needs no rotation at all", () => {
  const { main } = gen(shadowProject({ lightDir: A.v3(0, 1, 0) }));
  // Multiplying by one and adding zero every frame, on a 300 MHz CPU, for a
  // rotation of nothing.
  assert(!/_shadow\.rotation/.test(main), "an unrotated decal should not emit a rotation");
  assert(!/_shadow\.scale/.test(main), "an unrotated decal should not emit a scale");
  assert(!/setUVRect/.test(main), "no fold, so no UV flip");
  const pass = main.slice(main.indexOf("function _shadowPass()"), main.indexOf("Screen.display(() =>"));
  // Straight down is degenerate — cross(up, forward) is the zero vector.
  assert(/Camera\.position\(_c\.x, _c\.y \+ [\d.]+, _c\.z \+ 0?\.\d+\)/.test(pass),
    "a plan-view camera needs its nudge");
});

Deno.test("a light from behind rotates the matrix without flipping UVs", () => {
  const { main } = gen(shadowProject({ lightDir: A.v3(0, 1, -1) }));
  assert(!/setUVRect/.test(main));
  assert(/shadowmatrix = \[-1, 0, 0, 0/.test(main));
});

Deno.test("the silhouette camera is placed before the target moves it", () => {
  // setCameraTarget (src/camera.c) subtracts the target delta from the camera
  // position to preserve the view vector. Calling target() second therefore
  // drags the position that was just set.
  const { main } = gen(shadowProject());
  const target = lineOf(main, /Camera\.target\(_c\.x/);
  const position = lineOf(main, /Camera\.position\(_c\.x/);
  assert(target >= 0 && position >= 0, "shadow camera calls missing");
  assert(target < position, "Camera.target must run before Camera.position");

  // Same rule for the scene's own camera at startup.
  const bootTarget = lineOf(main, /^Camera\.target\(/);
  const bootPos = lineOf(main, /^Camera\.position\(/);
  assert(bootTarget >= 0 && bootPos >= 0 && bootTarget < bootPos, "boot camera sets position first");
});

Deno.test("the decal extent matches the light camera's frustum", () => {
  // The decal maps the whole texture onto setSize(), so the silhouette is only
  // 1:1 with the world when extent == 2 * dist * tan(fov/2). They used to be
  // independent fields, so any shadow was the wrong size until hand-tuned.
  const { main } = gen(shadowProject({
    autoFit: false, size: { x: 3, z: 3 }, camFov: 30, lightDir: A.v3(0, 1, 0),
  }));
  assertStringIncludes(main, "setSize(3.0, 3.0)");
  const dist = parseFloat(main.match(/Camera\.position\(_c\.x, _c\.y \+ ([\d.]+)/)[1]);
  const extent = 2 * dist * Math.tan((30 * Math.PI) / 360);
  assert(Math.abs(extent - 3) < 0.01, `frustum covers ${extent}, decal is 3`);
});

Deno.test("the decal is stretched along the light by the foreshortening", () => {
  // A directional shadow lengthens as 1/sin(elevation). Only the length
  // changes; the width across the light is the frustum's, unprojected.
  const { main } = gen(shadowProject({
    autoFit: false, size: { x: 2, z: 2 }, lightDir: A.v3(0, 1, 1),   // 45 degrees
  }));
  const size = main.match(/setSize\(([\d.]+), ([\d.]+)\)/);
  assertEquals(size[1], "2.0", "the width across the light must not change");
  assert(Math.abs(parseFloat(size[2]) - 2 * Math.SQRT2) < 0.01,
    `a 45-degree light should stretch by sqrt(2), got ${size[2]}`);
});

Deno.test("Max Stretch caps a low sun and says so", () => {
  const { main, diagnostics } = gen(shadowProject({
    autoFit: false, size: { x: 2, z: 2 }, maxStretch: 3, lightDir: A.v3(0, 0.05, 1),
  }));
  const size = main.match(/setSize\(([\d.]+), ([\d.]+)\)/);
  assert(Math.abs(parseFloat(size[2]) - 6) < 0.02, `expected the 3x cap, got ${size[2]}`);
  assert(diagnostics.some((d) => /stretch/i.test(d.message)), "the user is not told the light was raised");
});

Deno.test("the decal follows its caster onto the ground, not under it", () => {
  // With the sun off vertical the shadow sits away from the feet, by the
  // caster's height over tan(elevation). Emitting the caster's own XZ was the
  // plan-view shortcut.
  const { main } = gen(shadowProject({ follow: true, lightDir: A.v3(0, 1, 1) }));
  const loop = main.slice(main.indexOf("Screen.display(() =>"));
  assertStringIncludes(loop, "const _t = (_c.y - ");
  assert(/\[14\] = _c\.z - [\d.]+ \* _t/.test(loop), "the decal never slides down the light");
});

Deno.test("slope limit and bias are only emitted when draping is on", () => {
  const draped = (patch) =>
    project((s) => {
      s.physics.enabled = true;
      s.objects.push(obj("Floor", { rigidbody: { shape: "plane" } }));
      s.objects.push(obj("Hero", { model: { file: "hero.obj" } }));
      s.objects.push(obj("HeroShadow", { shadow: { caster: "Hero", raycast: true, ...patch } }));
    });
  // The engine enables the filter for any value > -0.5, so -1 must stay unset.
  assert(!/setSlopeLimit/.test(gen(draped({ slopeLimit: -1 })).main));
  assertStringIncludes(gen(draped({ slopeLimit: 0.5 })).main, "setSlopeLimit(0.5)");
  // Both only reach the output through the raycast hit path in
  // shadow_projector_render, so without draping they are dead calls.
  const flat = gen(shadowProject({ raycast: false, slopeLimit: 0.5, bias: -0.05 })).main;
  assert(!/setSlopeLimit|setBias/.test(flat), "bias and slope limit do nothing without draping");
});

Deno.test("ground Y compensates the engine's unscaled light offset", () => {
  // shadow_projector_render does `world[1] -= lightDir[1]`, so the emitted Y
  // must add it back for "Ground Y" to land where the user asked.
  const { main } = gen(shadowProject({ follow: true, groundY: 0, lightDir: A.v3(0, 1, 0) }));
  assertStringIncludes(main, "shadowmatrix = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 1, 0, 1]");
});

Deno.test("an unresolvable caster is an error, not silent output", () => {
  const p = project((s) => {
    s.objects.push(obj("Shadow", { shadow: { caster: "DoesNotExist" } }));
  });
  const { main, diagnostics } = gen(p);
  assert(diagnostics.some((d) => d.level === "error" && /caster/i.test(d.message)));
  assert(!/new Shadows\.Projector/.test(main));
});

Deno.test("blob shadows need no offscreen pass", () => {
  const p = project((s) => {
    s.objects.push(obj("Blob", { shadow: { source: "texture", texture: "blob.png" } }));
  });
  const { main } = gen(p);
  assert(!/_shadowPass/.test(main));
  assert(!/Screen\.initBuffers/.test(main));
  assertStringIncludes(main, "new Shadows.Projector(");
  assertStringIncludes(main, "_shadow.render();");
});

Deno.test("physics is declared before the shadow that raycasts into it", () => {
  const p = project((s) => {
    s.physics.enabled = true;
    s.objects.push(obj("Floor", { rigidbody: { shape: "plane" } }));
    s.objects.push(obj("Hero", { model: { file: "h.obj" } }));
    s.objects.push(obj("HeroShadow", { shadow: { caster: "Hero", raycast: true } }));
  });
  const { main } = gen(p);
  assert(lineOf(main, /const ode_space/) < lineOf(main, /enableRaycast/));
});

// ═══════════════════════════════════════════════════════════════════════
//  Strings, names and numbers
// ═══════════════════════════════════════════════════════════════════════

Deno.test("quotes and newlines in UI text cannot break out of the literal", () => {
  const p = project((s) => {
    const t = A.mkUIEl("Text");
    t.text = 'He said "hi"\nand left \\ now';
    s.uiElements = [t];
  });
  const { main } = gen(p);
  assertStringIncludes(main, String.raw`text: "He said \"hi\"\nand left \\ now",`);
  new Function(`return (() => { ${main.replace(/^import .*$/gm, "")} })`);
});

Deno.test("non-ASCII object names become legal identifiers", () => {
  const p = project((s) => {
    s.objects.push(obj("Café Ñandú", { model: { file: "a.obj" } }));
    s.objects.push(obj("敵キャラ", { model: { file: "b.obj" } }));
    s.objects.push(obj("123", { model: { file: "c.obj" } }));
  });
  const { main } = gen(p);
  for (const n of declaredNames(main)) {
    assert(/^[A-Za-z_$][\w$]*$/.test(n), `illegal identifier "${n}"`);
  }
});

Deno.test("an object named like an engine global does not shadow it", () => {
  const p = project((s) => {
    s.objects.push(obj("Screen", { model: { file: "a.obj" } }));
    s.objects.push(obj("Camera", { model: { file: "b.obj" } }));
    s.objects.push(obj("ctx", { model: { file: "c.obj" } }));
  });
  const names = declaredNames(gen(p).main);
  // Objects must never claim a name the engine or the generator owns.
  for (const reserved of ["Screen", "Camera", "ctx", "Render", "Color", "Image"]) {
    assert(!names.includes(reserved), `an object was allowed to declare "${reserved}"`);
  }
  // And the generator's own variables appear exactly once.
  for (const own of ["gray", "font", "canvas"]) {
    assertEquals(names.filter((n) => n === own).length, 1, `"${own}" is declared more than once`);
  }
});

Deno.test("float literals are always valid", () => {
  const p = project((s) => {
    const o = obj("O", { model: { file: "a.obj" } });
    o.components.transform.position = { x: 40.5, y: 40, z: -0.0001 };
    s.objects.push(o);
  });
  const { main } = gen(p);
  assert(!/\d+\.\d+\.\d/.test(main), "produced a malformed float literal");
  assert(!/NaN|Infinity/.test(main), "emitted NaN or Infinity");
});

Deno.test("NaN and undefined coordinates degrade to 0 instead of corrupting output", () => {
  const p = project((s) => {
    const o = obj("O", { model: { file: "a.obj" } });
    o.components.transform.position = { x: NaN, y: undefined, z: Infinity };
    s.objects.push(o);
  });
  const { main } = gen(p);
  // `undefined` appears legitimately in generated guards, so only the numeric
  // literals and interpolated-undefined paths are checked here.
  assert(!/NaN|Infinity/.test(main));
  assert(!/[:{,]\s*undefined/.test(main), "an undefined value reached a literal");
});

Deno.test("missing scripts report an error and cannot silently run empty behaviour", () => {
  const p = project((s) => {
    s.objects.push(obj("Player", { model: { file: "p.obj" }, script: { file: "Player.js" } }));
  });
  const { main, scripts, diagnostics } = gen(p);
  assertEquals(scripts.length, 1);
  assertEquals(scripts[0].filename, "scripts/Player.js");
  assertStringIncludes(main, 'from "./scripts/Player.js"');
  assertStringIncludes(main, "init_player_0(ctx);");
  assert(diagnostics.some((d) => d.level === "error" && /not in the project folder/.test(d.message)));
  assertStringIncludes(scripts[0].content, 'throw new Error("Missing script: Player.js")');
});

Deno.test("uploaded script content is passed through untouched", () => {
  const p = project((s) => {
    s.objects.push(obj("Player", { model: { file: "p.obj" }, script: { file: "Player.js" } }));
  });
  const body = "export function init(ctx){ctx.player.hp=3;}\nexport function update(ctx,pad){}\n";
  const { scripts } = gen(p, [{ name: "Player.js", cat: "scripts", content: body }]);
  assertEquals(scripts[0].content, body);
});

Deno.test("no object literal in ctx has duplicate keys", () => {
  // Two objects sharing a name used to emit `crate: a, crate: b` inside
  // ctx.physics.bodies, where JS silently keeps only the last one.
  const p = project((s) => {
    s.physics.enabled = true;
    s.objects.push(obj("Hero", { model: { file: "h.obj" }, script: { file: "H.js" } }));
    for (let i = 0; i < 3; i++) {
      s.objects.push(obj("Crate", {
        model: { file: "c.obj" },
        rigidbody: { mode: "dynamic", shape: "box", autoFit: false },
      }));
      s.objects.push(obj("Lamp", { light: {} }));
      s.objects.push(obj("Beep", { sound: { file: "b.adp" } }));
    }
  });
  const { main } = gen(p);

  // Walk each `{ ... }` block that is a plain key: value map and check its keys.
  const keyRe = /^\s{4,}([A-Za-z_$][\w$]*):\s/;
  const stack = [];
  for (const line of main.split("\n")) {
    const open = /^\s*(?:const ctx = |ctx\.ui = )?\{$|:\s*\{$/.test(line);
    const close = /^\s*\},?;?$/.test(line);
    if (open) stack.push({ keys: new Set(), indent: line.search(/\S/) });
    else if (close) stack.pop();
    else if (stack.length) {
      const m = line.match(keyRe);
      if (m) {
        const top = stack[stack.length - 1];
        assert(!top.keys.has(m[1]), `duplicate key "${m[1]}" in a generated object literal`);
        top.keys.add(m[1]);
      }
    }
  }
});

Deno.test("objects sharing a ctx key are reported", () => {
  const p = project((s) => {
    s.objects.push(obj("Enemy", { model: { file: "e.obj" }, script: { file: "E.js" } }));
    s.objects.push(obj("Enemy", { model: { file: "e.obj" }, script: { file: "E.js" } }));
  });
  assert(gen(p).diagnostics.some((d) => /share one state slot/.test(d.message)));
});

Deno.test("an empty scene still produces a runnable program", () => {
  const { main, diagnostics } = gen(project(() => {}));
  assertStringIncludes(main, "Screen.display(() => {");
  assertStringIncludes(main, "Screen.clearColor(gray);");
  assert(!main.includes("Screen.flip();"), "Screen.display already clears and presents each frame");
  assert(!diagnostics.some((d) => d.level === "error"));
  new Function(`return (() => { ${main} })`);
});

Deno.test("fit-to-caster derives the whole light pass from the mesh", () => {
  const bounds = { size: { x: 1.4, y: 1.6, z: 0.5 }, center: { x: 0, y: 0, z: 0 } };
  // Straight down, so the camera's offset is readable as a single distance.
  const p = shadowProject({ autoFit: true, lightDir: A.v3(0, 1, 0) });
  const { main, diagnostics } = gen(p, [{ name: "hero.obj", cat: "models", bounds }]);

  // The camera looks from wherever the light is, so the extent has to wrap the
  // caster's bounding sphere — a footprint would clip a tall caster seen from
  // the side.
  const size = parseFloat(main.match(/setSize\(([\d.]+),/)[1]);
  const radius = Math.hypot(1.4, 1.6, 0.5) / 2;
  assert(size >= radius * 2, `extent ${size} would clip a caster of radius ${radius}`);
  assert(size < radius * 3, `extent ${size} wastes most of the render target`);

  // And the camera must clear the caster, or it renders from inside the mesh.
  const dist = parseFloat(main.match(/Camera\.position\(_c\.x, _c\.y \+ ([\d.]+)/)[1]);
  assert(dist > radius, `camera at ${dist} is inside a caster of radius ${radius}`);
  assertEquals(diagnostics.filter((d) => d.level === "warn"), []);

  // The pair still has to satisfy extent = 2 * dist * tan(fov/2).
  const fov = parseFloat(main.match(/Render\.setView\(([\d.]+), [\d.]+, [\d.]+, 128, 128\)/)[1]);
  assert(Math.abs(2 * dist * Math.tan((fov * Math.PI) / 360) - size) < 0.02);
});

Deno.test("a light camera stuck inside its caster is reported", () => {
  // A wide FOV pulls the camera in close; past a point it is inside the model
  // and the silhouette is whatever the inside of the mesh looks like.
  const bounds = { size: { x: 1, y: 6, z: 1 }, center: { x: 0, y: 0, z: 0 } };
  const { diagnostics } = gen(
    shadowProject({ autoFit: false, size: { x: 2, z: 2 }, camFov: 120 }),
    [{ name: "hero.obj", cat: "models", bounds }],
  );
  assert(diagnostics.some((d) => /inside it/.test(d.message)), "no warning for a camera inside the caster");
});

Deno.test("the emitted placement arithmetic agrees with the shared derivation", () => {
  // shadowmath_test proves the geometry against a transcription of the engine's
  // matrix code. This proves the generator transcribes THAT correctly — a
  // swapped sign in the emitted expression would pass every other test here.
  for (const light of [A.v3(1, 1, 1), A.v3(-2, 3, 0.5), A.v3(0, 1, -1), A.v3(0, 1, 0)]) {
    const { main } = gen(shadowProject({ follow: true, groundY: 0.05, lightDir: light }));

    // Take the placement block out of the frame loop and run it. A character
    // scan, not a line scan: the block collapses to a one-liner when the light
    // is straight overhead and there is nothing to rotate.
    const draws = main.slice(main.indexOf("// Shadow decals"));
    const at = draws.indexOf("const _c = hero.position;");
    assert(at > 0, "no follow placement emitted");
    const open = draws.lastIndexOf("{", at);
    let depth = 0, close = open;
    for (; close < draws.length; close++) {
      if (draws[close] === "{") depth++;
      else if (draws[close] === "}" && --depth === 0) break;
    }
    const block = draws.slice(open + 1, close);

    const casterPos = { x: 4, y: 3.25, z: -2.5 };
    const initial = main.match(/const (\w+_shadowmatrix) = (\[[^;]+\]);/);
    assert(initial, "no reusable matrix allocated at setup");
    const matrix = JSON.parse(initial[2]);
    const sink = { setTransform(value) { this.matrix = value; } };
    new Function("hero", "heroshadow_shadow", initial[1], block)({ position: casterPos }, sink, matrix);

    const proj = A.shadowProjection(
      { source: "rendertarget", autoFit: false, size: { x: 2, z: 2 }, camFov: 20, maxStretch: 4 },
      light,
    );
    const want = A.shadowMatrixFor(proj, A.shadowGroundPoint(proj, casterPos, 0.05), 0.05);

    for (let i = 0; i < 16; i++) {
      assert(Math.abs(sink.matrix[i] - want[i]) < 1e-4,
        `light ${JSON.stringify(light)} matrix[${i}]: ${sink.matrix[i]} vs ${want[i]}`);
    }
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  Nothing is uploaded twice
//
//  VRAM is 4 MB and an uploaded texture never returns to the pool, so a
//  scene of a handful of objects could exhaust it. Two costs were being
//  paid needlessly: `new Image(file)` ran once per RenderData rather than
//  once per file, and a mesh that two objects wanted to shade differently
//  was loaded twice. RenderData.clone() (ath_render.c:1067) shares the
//  vertex buffers AND the texture pointers, which is exactly the case.
// ═══════════════════════════════════════════════════════════════════════

const countOf = (src, re) => (src.match(re) || []).length;

Deno.test("one Image per texture file, however many meshes use it", () => {
  const p = project((s) => {
    s.objects.push(obj("A", { model: { file: "a.obj", textureFile: "atlas.png" } }));
    s.objects.push(obj("B", { model: { file: "b.obj", textureFile: "atlas.png" } }));
    s.objects.push(obj("C", { model: { file: "c.obj", textureFile: "atlas.png" } }));
  });
  const { main } = gen(p);
  // Three different meshes genuinely need three uploads...
  assertEquals(countOf(main, /new RenderData\(/g), 3);
  // ...but the atlas they share must reach VRAM exactly once. It is opened
  // from two candidate folders, hence two `new Image` calls in one branch
  // each — what matters is that there is a single texture variable.
  assertEquals(countOf(main, /^let \w+_tex = null;$/gm), 1);
  const tex = main.match(/^let (\w+_tex) = null;$/m)[1];
  for (const mesh of ["a.obj", "b.obj", "c.obj"]) {
    assertStringIncludes(main, `new RenderData("${mesh}", ${tex})`);
  }
});

Deno.test("two filters on one file are two Images, because filter is the Image's", () => {
  const p = project((s) => {
    s.objects.push(obj("A", { model: { file: "a.obj", textureFile: "t.png", textureFilter: "LINEAR" } }));
    s.objects.push(obj("B", { model: { file: "b.obj", textureFile: "t.png", textureFilter: "NEAREST" } }));
  });
  assertEquals(countOf(gen(p).main, /^let (?!_nextScene)\w+ = null;$/gm), 2);
});

Deno.test("a mesh reused with different settings is cloned, not reloaded", () => {
  const p = project((s) => {
    s.objects.push(obj("Smooth", { model: { file: "rock.obj", textureFile: "rock.png" } }));
    s.objects.push(obj("Flat", {
      model: { file: "rock.obj", textureFile: "rock.png", shade_model: "SHADE_FLAT" },
    }));
  });
  const { main } = gen(p);
  assertEquals(countOf(main, /new RenderData\(/g), 1, "the same mesh was uploaded twice");
  assertEquals(countOf(main, /\.clone\(\);$/gm), 1);
  // The clone still gets its own settings — that is the whole reason it exists.
  assertStringIncludes(main, "shade_model = 0;");
  assertStringIncludes(main, "shade_model = 1;");
});

Deno.test("identical objects still share one RenderData outright", () => {
  const p = project((s) => {
    for (const n of ["A", "B", "C"]) {
      s.objects.push(obj(n, { model: { file: "crate.obj", textureFile: "crate.png" } }));
    }
  });
  const { main, stats } = gen(p);
  assertEquals(stats.renderDatas, 1);
  assertEquals(countOf(main, /new RenderData\(/g), 1);
  assertEquals(countOf(main, /\.clone\(\)/g), 0, "a clone for an identical object is pure waste");
  assertEquals(countOf(main, /new RenderObject\(/g), 3);
});

Deno.test("a clone never re-runs the embedded-texture filter", () => {
  // getTexture(0) on a clone reaches the source's texture, which has already
  // been filtered. Setting it again is a no-op that reads like a second one.
  const p = project((s) => {
    s.objects.push(obj("A", { model: { file: "m.glb" } }));
    s.objects.push(obj("B", { model: { file: "m.glb", face_culling: "CULL_FACE_NONE" } }));
  });
  const { main } = gen(p);
  assertEquals(countOf(main, /getTexture\(_i\)/g), 1);
  assertEquals(countOf(main, /\.clone\(\)/g), 1);
});

Deno.test("a clone is declared after the data it clones", () => {
  const p = project((s) => {
    s.objects.push(obj("Flat", { model: { file: "r.obj", shade_model: "SHADE_FLAT" } }));
    s.objects.push(obj("Smooth", { model: { file: "r.obj" } }));
  });
  const { main } = gen(p);
  const source = lineOf(main, /new RenderData\(/);
  const clone = lineOf(main, /\.clone\(\)/);
  assert(source >= 0 && clone > source, "a clone of a name declared below it is a TDZ crash");
});

// ═══════════════════════════════════════════════════════════════════════
//  Audio — the controls have to do what they say
//
//  Both of the Sound component's switches were decorative: the emitter never
//  wrote `loop`, and `volume` could not have worked at all, because
//  Sound.Stream has no per-stream volume binding — the only one in the module
//  is the global Sound.setVolume (ath_sound.c:284).
// ═══════════════════════════════════════════════════════════════════════

Deno.test("a looping sound is emitted as looping", () => {
  const p = project((s) => {
    s.objects.push(obj("Music", { sound: { file: "theme.adp", loop: true, playOnStart: true } }));
  });
  const { main } = gen(p);
  assertStringIncludes(main, `const music_snd = Sound.Stream("sounds/theme.adp");`);
  assertStringIncludes(main, "music_snd.loop = true;");
  // ...and the order matters: looping has to be set before it starts.
  assert(main.indexOf("music_snd.loop") < main.indexOf("music_snd.play()"));
});

Deno.test("a one-shot sound says nothing about looping", () => {
  const p = project((s) => {
    s.objects.push(obj("Hit", { sound: { file: "hit.adp", loop: false, playOnStart: false } }));
  });
  const { main } = gen(p);
  assert(!/\.loop/.test(main), "loop was emitted for a sound that does not loop");
  assert(!/hit_snd\.play\(\)/.test(main), "a sound with Play On Start off must not play");
});

Deno.test("the master volume is emitted once, before anything plays", () => {
  const p = project((s) => {
    s.objects.push(obj("A", { sound: { file: "a.adp", playOnStart: true } }));
    s.objects.push(obj("B", { sound: { file: "b.adp", playOnStart: true } }));
  });
  p.audio.volume = 60;
  const { main } = gen(p);
  assertEquals((main.match(/Sound\.setVolume\(/g) || []).length, 1, "volume is global, so once");
  assertStringIncludes(main, "Sound.setVolume(60);");
  assert(main.indexOf("Sound.setVolume") < main.indexOf(".play()"));
});

Deno.test("the default volume emits nothing", () => {
  // 100 is the engine's own default; emitting it would be noise.
  const p = project((s) => s.objects.push(obj("A", { sound: { file: "a.adp" } })));
  assert(!/setVolume/.test(gen(p).main));
});

Deno.test("volume is clamped to the range the binding takes", () => {
  const p = project((s) => s.objects.push(obj("A", { sound: { file: "a.adp" } })));
  p.audio.volume = 500;
  assertStringIncludes(gen(p).main, "Sound.setVolume(100);");
  p.audio.volume = -20;
  assertStringIncludes(gen(p).main, "Sound.setVolume(0);");
});

Deno.test("a volume with no sounds still reaches the program", () => {
  // Turning the whole game down is a legitimate thing to do before adding audio.
  const p = project(() => {});
  p.audio.volume = 0;
  assertStringIncludes(gen(p).main, "Sound.setVolume(0);");
});
