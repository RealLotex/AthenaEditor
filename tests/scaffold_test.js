import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { load } from "./_load.js";

// Scaffolding sits on top of templates, storage and codegen: it decides what a
// new project folder holds, then hands main.js to the normal export path.
const A = await load([
  "core/util.js", "core/math.js", "core/shadowmath.js", "core/i18n.js", "core/components.js",
  "core/skybox.js", "codegen/skybox.js",
  "editor/assets.js",
  "core/project.js", "core/validate.js", "core/storage.js",
  "templates/assets.js",
  "templates/firstperson.js", "templates/thirdperson.js", "templates/sidescroller.js",
  "templates/topdown.js", "templates/registry.js",
  "codegen/emit.js", "codegen/resolve.js", "codegen/models.js", "codegen/lights.js",
  "codegen/sounds.js", "codegen/physics.js", "codegen/shadows.js", "codegen/uigen.js",
  "codegen/ctx.js", "codegen/index.js",
  "core/scaffold.js",
]);

const templateBy = (id) => A.PROJECT_TEMPLATES.find((t) => t.id === id);
const planFor = (id) => {
  const tpl = templateBy(id);
  return { tpl, project: A.migrateProject(tpl.make()), plan: A.planScaffold(A.migrateProject(tpl.make()), tpl) };
};

// ═══════════════════════════════════════════════════════════════════════
//  The plan
// ═══════════════════════════════════════════════════════════════════════

Deno.test("a scaffold creates every asset directory the project declares", () => {
  const { project, plan } = planFor("top-down");
  for (const dir of Object.values(project.dirs)) {
    assert(plan.dirs.includes(dir), `missing directory ${dir}`);
  }
  assertEquals(plan.dirs.length, new Set(plan.dirs).size, "a directory is listed twice");
});

Deno.test("athena.ini names main.js as the boot script", () => {
  const { plan } = planFor("empty");
  const ini = plan.files.find((f) => f.path === "athena.ini");
  assert(ini, "no athena.ini in the plan");
  // The ELF reads this at boot; naming anything else means the folder does
  // nothing when it starts.
  assertStringIncludes(ini.text, 'default_script = "main.js"');
});

Deno.test("the project file is written under its own name", () => {
  const tpl = templateBy("empty");
  const project = A.migrateProject(tpl.make());
  project.name = "My Game 2";
  const plan = A.planScaffold(project, tpl);
  const file = plan.files.find((f) => f.path.endsWith(".atheditor"));
  assertEquals(file.path, "my_game_2.atheditor");
  assertEquals(JSON.parse(file.text).name, "My Game 2");
});

Deno.test("a template's scripts land in the scripts folder", () => {
  const { plan } = planFor("top-down");
  const script = plan.files.find((f) => f.path === "scripts/TopDownController.js");
  assert(script, "the controller was not scaffolded");
  assertStringIncludes(script.text, "export function update(ctx, pad)");
});

Deno.test("a renamed scripts directory is honoured", () => {
  const tpl = templateBy("top-down");
  const project = A.migrateProject(tpl.make());
  project.dirs.scripts = "src";
  const plan = A.planScaffold(project, tpl);
  assert(plan.files.some((f) => f.path === "src/TopDownController.js"));
  assert(plan.dirs.includes("src"));
});

Deno.test("main.js is not in the plan — export owns generated code", () => {
  const { plan } = planFor("top-down");
  assert(!plan.files.some((f) => f.path === "main.js"),
    "scaffolding writing main.js would be a second place that can clobber it");
});

// ═══════════════════════════════════════════════════════════════════════
//  Placeholder meshes
// ═══════════════════════════════════════════════════════════════════════

Deno.test("every mesh a template names is scaffolded", () => {
  // A `needs` entry with no generator behind it is a promise the dialog makes
  // and the folder does not keep.
  for (const tpl of A.PROJECT_TEMPLATES) {
    const { plan } = planFor(tpl.id);
    for (const need of tpl.needs) {
      assert(plan.files.some((f) => f.path === need), `${tpl.id}: ${need} is promised but never written`);
    }
  }
});

Deno.test("the placeholders are valid OBJ that the editor can read back", () => {
  const plan = { files: A.PROJECT_TEMPLATES.flatMap((t) => planFor(t.id).plan.files) };
  for (const f of plan.files.filter((x) => x.path.endsWith(".obj"))) {
    const lines = f.text.split("\n").filter((l) => l.trim() && !l.startsWith("#"));
    const verts = lines.filter((l) => l.startsWith("v ")).length;
    const norms = lines.filter((l) => l.startsWith("vn ")).length;
    const uvs = lines.filter((l) => l.startsWith("vt ")).length;
    const faces = lines.filter((l) => l.startsWith("f "));
    assert(verts >= 3, `${f.path} has no geometry`);
    assert(faces.length >= 1, `${f.path} has no faces`);
    // Without texture coordinates a mesh cannot show a texture at all: the
    // viewport gives every vertex UV (0,0) and so does the engine
    // (mesh_loaders.c:48), so an assigned texture samples a single texel.
    assert(uvs >= 3, `${f.path} has no texture coordinates`);
    for (const face of faces) {
      const refs = face.slice(2).trim().split(/\s+/);
      assertEquals(refs.length, 3, `${f.path} has a non-triangular face: ${face}`);
      for (const ref of refs) {
        const [vi, ti, ni] = ref.split("/");
        assert(+vi >= 1 && +vi <= verts, `${f.path} references vertex ${vi} of ${verts}`);
        assert(+ti >= 1 && +ti <= uvs, `${f.path} references texture coord ${ti} of ${uvs}`);
        assert(+ni >= 1 && +ni <= norms, `${f.path} references normal ${ni} of ${norms}`);
      }
    }
    for (const l of lines.filter((x) => x.startsWith("vt "))) {
      for (const n of l.split(/\s+/).slice(1)) {
        assert(+n >= 0 && +n <= 1, `${f.path} has a UV outside 0..1: ${l}`);
      }
    }
    // Every literal reaches a float parser on hardware.
    for (const l of lines.filter((x) => /^v |^vn /.test(x))) {
      for (const n of l.split(/\s+/).slice(1)) assert(Number.isFinite(+n), `bad number in ${f.path}: ${l}`);
    }
  }
});

Deno.test("the player placeholder fits the collider the template gives it", () => {
  const { plan, project } = planFor("top-down");
  const obj = plan.files.find((f) => f.path.endsWith("player.obj")).text;
  const ys = obj.split("\n").filter((l) => l.startsWith("v "))
    .map((l) => parseFloat(l.split(/\s+/)[2]));
  const half = Math.max(Math.abs(Math.min(...ys)), Math.max(...ys));

  const player = project.scenes[0].objects.find((o) => o.name === "Player");
  const radius = player.components.rigidbody.radius;
  // Physics drives the sphere's centre and the RenderObject sits on it, so a
  // mesh taller than the collider stands with its feet through the floor.
  assert(Math.abs(half - radius) < 0.01, `mesh half-height ${half} vs collider radius ${radius}`);
});

Deno.test("the player placeholder is not rotationally symmetric", () => {
  // The Top Down controller turns the object to face travel. With a symmetric
  // placeholder there is no way to tell whether it works.
  const { plan } = planFor("top-down");
  const obj = plan.files.find((f) => f.path.endsWith("player.obj")).text;
  const zs = obj.split("\n").filter((l) => l.startsWith("v "))
    .map((l) => parseFloat(l.split(/\s+/)[3]));
  // Forward is +Z in model space: rotation.y = atan2(ix, -iz) is PI for "up".
  assert(Math.max(...zs) > -Math.min(...zs) + 0.02, "nothing marks the front of the player");
});

// ═══════════════════════════════════════════════════════════════════════
//  What the editor does with the plan
// ═══════════════════════════════════════════════════════════════════════

Deno.test("a box placeholder is closed and centred on its own origin", () => {
  // A GeomBox is centred on the geom's position, so a mesh whose origin sat on
  // its base would draw half its height out of step with the collider.
  for (const name of ["crate.obj", "platform.obj"]) {
    const text = A.templateAssetFiles(A.mkProject(), [name])[0].text;
    const verts = text.split("\n").filter((l) => l.startsWith("v "))
      .map((l) => l.split(/\s+/).slice(1).map(Number));
    assertEquals(verts.length, 8, `${name} is not a box`);
    for (const i of [0, 1, 2]) {
      const lo = Math.min(...verts.map((v) => v[i])), hi = Math.max(...verts.map((v) => v[i]));
      assert(Math.abs(lo + hi) < 1e-6, `${name} is off centre on axis ${i}: ${lo}..${hi}`);
    }
    // Six quads, two triangles each, and every corner used three times.
    const faces = text.split("\n").filter((l) => l.startsWith("f "));
    assertEquals(faces.length, 12, `${name} is not a closed box`);
    const used = new Map();
    for (const f of faces) {
      for (const ref of f.slice(2).trim().split(/\s+/)) {
        const v = ref.split("/")[0];
        used.set(v, (used.get(v) || 0) + 1);
      }
    }
    assertEquals(used.size, 8, `${name} leaves a corner unused`);
  }
});

Deno.test("the scaffolded meshes resolve at export with no missing-asset warnings", () => {
  for (const tpl of A.PROJECT_TEMPLATES) {
    const project = A.migrateProject(tpl.make());
    const assets = A.planScaffold(project, tpl).assets;
    const out = A.generateProject(project, assets);
    const missing = out.diagnostics.filter((d) => /not in the project folder/i.test(d.message));
    assertEquals(missing, [], `${tpl.id} reports missing assets when freshly scaffolded: ${JSON.stringify(missing)}`);
    assertEquals(out.diagnostics.filter((d) => d.level === "error"), [], `${tpl.id} exports with errors`);
  }
});

Deno.test("scaffolded assets are categorised the way a picked folder would be", () => {
  const tpl = templateBy("top-down");
  const project = A.migrateProject(tpl.make());
  for (const a of A.planScaffold(project, tpl).assets) {
    assertEquals(a.cat, "models");
    assertEquals(a.folder, project.dirs.models);
    assert(a.content.length > 0);
    assert(a.id, "an asset entry with no id cannot be selected in the Navigator");
  }
});

Deno.test("a scaffolded project boots to a font that is certainly there", () => {
  const tpl = templateBy("top-down");
  const project = A.migrateProject(tpl.make());
  const { main } = A.generateProject(project, A.planScaffold(project, tpl).assets);
  // Naming a font file the folder does not have kills the program on its
  // first lines; "default" is compiled into the ELF.
  assertStringIncludes(main, 'new Font("default")');
  assert(!/os\.chdir\("fonts"\)/.test(main));
});

Deno.test("the project file records the assets the scaffold wrote", () => {
  // The .atheditor on disk used to claim the folder was empty until the next
  // save, so reopening the project showed no assets at all.
  const { plan } = planFor("top-down");
  const saved = JSON.parse(plan.files.find((f) => f.path.endsWith(".atheditor")).text);
  const names = (saved._filesMeta || []).map((m) => m.name).sort();
  assertEquals(names, ["ground.obj", "player.obj"]);
  // Payloads stay out of the project file — they are tens of megabytes.
  assert(!saved._filesMeta.some((m) => m.content || m.dataUrl), "asset payloads leaked into the project file");
});
