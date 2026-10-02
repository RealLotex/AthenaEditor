// ═══════════════════════════════════════════════════════════════════════
//  PROJECT MODEL
//
//  A PROJECT is the shippable program. It owns everything decided once for
//  the whole executable: video mode, framebuffer format, alpha test defaults,
//  asset directories, prefabs, and the list of scenes.
//
//  A SCENE is one loadable level. It owns what legitimately differs between
//  levels: its objects, its HUD, its clear colour, its camera defaults, its
//  physics world, and where it can transition to.
//
//  Before v3 these were mixed: every scene carried `psm`, `alphaTest*`,
//  `modelsDir` and `showDebugInfo`, which is meaningless per-scene because a
//  PS2 program calls Screen.setMode exactly once. New Scene copied a dozen
//  render settings and they drifted apart. migrateProject() lifts them.
//
//  Everything that walks the object tree goes through the helpers here — the
//  original editor filtered `scene.objects` directly, so any object nested
//  under a parent was silently dropped from the export.
// ═══════════════════════════════════════════════════════════════════════

const PROJECT_VERSION = 3;

let _objSeq = 0;
let _sceneSeq = 0;

const mkObject = (name, type = "empty") => ({
  id: uid(),
  name: name || `Object_${++_objSeq}`,
  type,
  children: [],
  visible: true,
  exportEnabled: true,
  ctxEnabled: true,
  expanded: true,
  components: { transform: makeComponent("transform") },
});

const mkUIEl = (type) => ({
  id: uid(),
  name: `${type}_${++_objSeq}`,
  type,
  x: 60, y: 40,
  width: type === "Panel" ? 200 : type === "Button" ? 120 : 160,
  height: type === "Panel" ? 80 : type === "Button" ? 36 : 22,
  text: type === "Text" ? "Hello World" : type === "Button" ? "Button" : "",
  fontSize: 14,
  fontFile: "default",
  textColor: { r: 200, g: 200, b: 200, a: 128 },
  bgColor: { r: 50, g: 50, b: 80, a: 128 },
  barColor: { r: 0, g: 200, b: 100, a: 128 },
  barBgColor: { r: 30, g: 30, b: 30, a: 128 },
  progress: 0.6,
  interactive: false,
  image: "", imageFilter: "LINEAR",
  visible: true, zindex: 0,
  script: { file: "", ctxKey: "" },
});

// ── scene ──────────────────────────────────────────────────────────────

const mkScene = (name) => ({
  id: uid(),
  name: name || `Scene_${++_sceneSeq}`,
  objects: [],
  uiElements: [],
  background: { r: 40, g: 40, b: 40, a: 128 },
  skybox: { enabled: false, preset: "", texture: "", rotation: 0, brightness: 1 },
  // Used when the scene has no Camera object. A Camera object overrides it.
  camera: { fov: 60, near: 1.0, far: 4000.0 },
  // The built-in orbit rig on the left stick. Turn it off when a script owns
  // the camera, otherwise the two fight over it every frame.
  defaultCameraRig: true,
  physics: {
    enabled: false,
    gravity: { x: 0, y: -9.81, z: 0 },
    cfm: 1e-5,
    erp: 0.8,
    iterations: 10,
    stepSize: 0.016,
  },
  // Named exits exposed to behaviour scripts through ctx.goToScene(name).
  transitions: [],
});

// ── project ────────────────────────────────────────────────────────────

const mkDisplay = () => ({
  // "" means "leave the console's current mode alone" — the generator emits
  // nothing, which is exactly what the editor did before this field existed.
  mode: "",
  psm: "CT16S_Z16S",
  psmCustomColor: "Screen.CT16S",
  psmCustomDepth: "Screen.Z16S",
  vsync: true,
  frameCounter: true,
  debugHUD: false,
  alphaTest: {
    enabled: true,
    method: "ALPHA_GREATER",
    ref: 0,
    // 0, not 50. With ALPHA_GREATER this discards only fully transparent
    // pixels. The old 50 threw away everything below 50 of 128 — about 39%
    // opacity — so a soft shadow or a gentle fade vanished with no hint why.
    // Clipping is still available, deliberately, through the cutout preset.
    onFail: "ALPHA_FAIL_NO_UPDATE",
    // PABE, and it must stay off. `PIXEL_ALPHA_BLEND_ENABLE` does not enable
    // alpha blending — it writes the GS PABE register (graphics.c:479), which
    // makes blending happen ONLY where the source alpha's MSB is set. PS2
    // alpha stores 128 as fully opaque, so with this on the only alpha that
    // blends is the one that is already opaque and every translucent surface
    // is written straight through. Measured on PCSX2: off, darkening tracks
    // alpha 1:1; on, it is all-or-nothing. See docs/HARDWARE-NOTES.md.
    // Ordinary blending needs ABE, which is already on by default
    // (gsGlobal->PrimAlphaEnable, render.c:383).
    pixelBlend: false,
  },
});

// ── transparency, as outcomes rather than GS registers ─────────────────
//
// Three registers decide how a see-through surface is drawn, and the wrong
// combination makes every one of them solid without saying so. Nobody should
// have to know that to get a soft shadow, so they are offered as named
// outcomes; the raw fields stay available behind "Custom" for anyone who
// wants them. The user-facing text here deliberately contains no GS jargon —
// `tests/transparency_test.js` fails if any leaks in.

/** The PS2's alpha scale runs 0..128, not 0..255. 128 is fully opaque. */
const ALPHA_REF_MAX = 128;

const TRANSPARENCY_PRESETS = [
  {
    id: "smooth",
    label: "Smooth — fades and soft shadows",
    help: "See-through surfaces mix with whatever is behind them, so a shadow can be " +
      "faint and a fade can be gradual. Choose this unless you need the speed.",
    settings: { enabled: true, method: "ALPHA_GREATER", ref: 0, onFail: "ALPHA_FAIL_NO_UPDATE", pixelBlend: false },
  },
  {
    id: "cutout",
    label: "Hard edges — each pixel is on or off",
    help: "A pixel is either fully drawn or skipped entirely, with nothing in between. " +
      "Cheaper to draw, and the right choice for leaves, fences and grass.",
    settings: { enabled: true, method: "ALPHA_GREATER", ref: 64, onFail: "ALPHA_FAIL_NO_UPDATE", pixelBlend: false },
  },
  {
    id: "solid",
    label: "Solid — ignore see-through entirely",
    help: "Everything is drawn opaque no matter what. The fastest option, and the one " +
      "to pick if your game has nothing see-through in it.",
    settings: { enabled: false, method: "ALPHA_GREATER", ref: 0, onFail: "ALPHA_FAIL_NO_UPDATE", pixelBlend: false },
  },
];

/** Which preset a display's settings correspond to, or "custom". */
function transparencyPresetOf(display) {
  const at = display?.alphaTest || {};
  const hit = TRANSPARENCY_PRESETS.find((p) =>
    Object.entries(p.settings).every(([k, v]) => at[k] === v)
  );
  return hit ? hit.id : "custom";
}

/** Write a preset's settings into a display object, in place. */
function applyTransparencyPreset(display, id) {
  const preset = TRANSPARENCY_PRESETS.find((p) => p.id === id);
  if (!preset || !display) return display;
  display.alphaTest = { ...display.alphaTest, ...preset.settings };
  return display;
}

// The engine exposes exactly one volume control and it is global
// (Sound.setVolume, ath_sound.c:284), so this is a project setting. 100 is the
// engine default and emits nothing.
const mkAudio = () => ({ volume: 100 });

const mkDirs = () => ({
  models: "3dmodels",
  textures: "textures",
  sounds: "sounds",
  fonts: "fonts",
  scripts: "scripts",
});

const mkProject = (name) => {
  const scene = mkScene("MainScene");
  const sun = mkObject("Sun");
  sun.components.light = makeComponent("light");
  const cam = mkObject("Main Camera");
  cam.components.camera = makeComponent("camera");
  cam.components.transform.position = v3(0, 2, 10);
  scene.objects = [sun, cam];
  return {
    id: uid(),
    name: name || "MyPS2Game",
    version: PROJECT_VERSION,
    template: "empty",
    display: mkDisplay(),
    audio: mkAudio(),
    dirs: mkDirs(),
    // Scripts carried inside the project rather than read from disk. Templates
    // ship their controller this way. A file of the same name in the loaded
    // asset folder wins, so a user can take one over by editing it on disk.
    // Edits from the Scripts workspace are marked edited and override disk copies.
    scripts: [],
    prefabs: [],
    assets: [],
    scenes: [scene],
    startSceneId: scene.id,   // which scene main.js boots
    activeSceneId: scene.id,  // which scene is open in the editor
  };
};

const activeScene = (project) =>
  project.scenes.find((s) => s.id === project.activeSceneId) || project.scenes[0];

const startScene = (project) =>
  project.scenes.find((s) => s.id === project.startSceneId) || project.scenes[0];

// ── traversal ──────────────────────────────────────────────────────────

/** Depth-first over an object tree. fn(obj, parents[]) — parents is root-first. */
function walk(objects, fn, parents = []) {
  for (const o of objects || []) {
    fn(o, parents);
    if (o.children?.length) walk(o.children, fn, [...parents, o]);
  }
}

/** Every object in the tree, flattened, in outliner order. */
function allObjects(objects) {
  const out = [];
  walk(objects, (o) => out.push(o));
  return out;
}

/** Selected roots only: selecting a parent already includes its children. */
function selectionRoots(objects, ids) {
  const selected = new Set(ids);
  const roots = [];
  walk(objects, (o, parents) => {
    if (selected.has(o.id) && !parents.some((p) => selected.has(p.id))) roots.push(o);
  });
  return roots;
}

/** Objects that will actually reach the generated program. */
function exportableObjects(objects) {
  const out = [];
  const rec = (list, parentOk) => {
    for (const o of list || []) {
      const ok = parentOk && o.visible !== false && o.exportEnabled !== false;
      if (ok) out.push(o);
      // A hidden parent hides its whole subtree — matching what the viewport shows.
      rec(o.children, ok);
    }
  };
  rec(objects, true);
  return out;
}

const findObj = (objects, id) => {
  let hit = null;
  walk(objects, (o) => { if (!hit && o.id === id) hit = o; });
  return hit;
};

const findParent = (objects, id) => {
  let hit = null;
  walk(objects, (o, parents) => { if (!hit && o.id === id) hit = parents[parents.length - 1] || null; });
  return hit;
};

/** Look an object up by name within a scene. Used by caster/light references. */
const findByName = (scene, name) => {
  if (!scene || !name) return null;
  const want = String(name).trim();
  let hit = null;
  walk(scene.objects, (o) => { if (!hit && o.name === want) hit = o; });
  return hit;
};

/** Rename explicit scene references together with their unique target. */
function renameObject(scene, id, name) {
  const obj = findObj(scene.objects, id);
  if (!obj || obj.name === name) return;
  const old = obj.name;
  const unique = allObjects(scene.objects).filter((o) => o.name === old).length === 1;
  obj.name = name;
  if (unique) walk(scene.objects, (o) => {
    const sh = o.components.shadow;
    if (!sh) return;
    for (const key of ["caster", "lightSource"]) {
      if (sh[key]?.trim() === old) sh[key] = name;
    }
  });
}

/** Mutate one object in place. Returns true if it was found. */
function mutObj(objects, id, fn) {
  const o = findObj(objects, id);
  if (!o) return false;
  fn(o);
  return true;
}

/** Remove a set of ids from the tree, returning the pruned array. */
function removeObjects(objects, ids) {
  const kill = new Set(ids);
  const rec = (list) =>
    (list || []).filter((o) => {
      if (kill.has(o.id)) return false;
      o.children = rec(o.children);
      return true;
    });
  return rec(objects);
}

/** True when `maybeAncestorId` is at or above `id` — reparenting guard. */
function isAncestor(objects, maybeAncestorId, id) {
  let found = false;
  walk(objects, (o, parents) => {
    if (o.id === id && parents.some((p) => p.id === maybeAncestorId)) found = true;
  });
  return found || maybeAncestorId === id;
}

const uniqueName = (base, objects) => {
  const taken = new Set(allObjects(objects).map((o) => o.name));
  if (!taken.has(base)) return base;
  let i = 2;
  while (taken.has(`${base}_${i}`)) i++;
  return `${base}_${i}`;
};

/** Fresh ids for a subtree — used by duplicate, paste and prefab instancing. */
function reassignIds(obj) {
  obj.id = uid();
  (obj.children || []).forEach(reassignIds);
  return obj;
}

/** Copy a set of subtrees, keeping named references within that copied set. */
function cloneObjects(sources, existing) {
  const copies = sources.map((o) => reassignIds(deepClone(o)));
  const taken = allObjects(existing).map((o) => ({ name: o.name }));
  const renamed = new Map();
  walk(copies, (o) => {
    const old = o.name;
    o.name = uniqueName(old, taken);
    taken.push({ name: o.name });
    renamed.set(old, renamed.has(old) ? null : o.name);
  });
  walk(copies, (o) => {
    const sh = o.components.shadow;
    if (!sh) return;
    for (const key of ["caster", "lightSource"]) {
      const name = renamed.get(sh[key]?.trim());
      if (name) sh[key] = name;
    }
  });
  return copies;
}

// ── world transforms ───────────────────────────────────────────────────
//
// AthenaEnv's RenderObject has no parent link: every object's position is
// world space. Nesting in the editor is therefore baked at export time by
// composing the ancestor chain into a single matrix.

/** Compose an object's local transform with all of its ancestors. */
function worldTransform(obj, parents = []) {
  const local = (o) => {
    const t = o.components?.transform || makeComponent("transform");
    return matFromTRS(t.position, t.rotation, t.scale);
  };
  // Row-vector convention: child first, then each parent outward.
  let m = local(obj);
  for (let i = parents.length - 1; i >= 0; i--) m = matMul(m, local(parents[i]));
  return trsFromMat(m);
}

/** Map of object id -> baked world TRS for a whole scene. */
function worldTransforms(objects) {
  const map = new Map();
  walk(objects, (o, parents) => map.set(o.id, worldTransform(o, parents)));
  return map;
}

// ── migration ──────────────────────────────────────────────────────────

// Settings that lived on every scene before v3 and now live on the project.
// [sceneKey, projectPath, label]
const LIFTED_DISPLAY = [
  ["psm", "display.psm", "framebuffer format"],
  ["psmCustomColor", "display.psmCustomColor", "custom colour PSM"],
  ["psmCustomDepth", "display.psmCustomDepth", "custom depth PSM"],
  ["showDebugInfo", "display.debugHUD", "debug HUD"],
  ["alphaTestEnable", "display.alphaTest.enabled", "alpha test"],
  ["alphaTestMethod", "display.alphaTest.method", "alpha test method"],
  ["alphaTestRef", "display.alphaTest.ref", "alpha test reference"],
  ["alphaTestFail", "display.alphaTest.onFail", "alpha test failure mode"],
  ["pixelAlphaBlend", "display.alphaTest.pixelBlend", "pixel alpha blending"],
  ["modelsDir", "dirs.models", "models directory"],
  ["texturesDir", "dirs.textures", "textures directory"],
];

const setPath = (root, path, value) => {
  const parts = path.split(".");
  let ref = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (ref[parts[i]] === undefined || ref[parts[i]] === null) ref[parts[i]] = {};
    ref = ref[parts[i]];
  }
  ref[parts[parts.length - 1]] = value;
};

/** Fill in keys added to a template since a file was written. Recurses into plain objects. */
function fillDefaults(target, template) {
  for (const [k, v] of Object.entries(template)) {
    if (target[k] === undefined) {
      target[k] = deepClone(v);
    } else if (v && typeof v === "object" && !Array.isArray(v) &&
               target[k] && typeof target[k] === "object" && !Array.isArray(target[k])) {
      fillDefaults(target[k], v);
    }
  }
  return target;
}

/**
 * Bring a project loaded from disk up to the current shape. Runs on every
 * load and is safe to run twice.
 *
 * @param notes  optional array; receives human-readable strings describing
 *               anything the migration changed, so the editor can tell the
 *               user instead of silently rewriting their settings.
 */
/**
 * Does this parsed JSON even claim to be an AthenaEnv project?
 *
 * migrateProject is deliberately permissive — its job is to bring an old
 * project forward, and refusing one over a missing key would be worse than
 * backfilling it. But permissive all the way down meant ANY json loaded:
 * `[1,2,3]` became a project called "Untitled" with one empty scene, and a
 * package.json became a project called "my-app". The user got a green
 * "Loaded my-app" while their real work left memory, left undo, and was
 * overwritten in the autosave four seconds later.
 *
 * So there is one gate, and it only asks whether the format is recognisable
 * at all: a scenes array, or a version number. Everything past that stays as
 * forgiving as it was.
 */
function looksLikeProject(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  return Array.isArray(value.scenes) || typeof value.version === "number";
}

function migrateProject(project, notes = []) {
  if (!project || typeof project !== "object") return mkProject();

  project.scenes = Array.isArray(project.scenes) ? project.scenes : [];
  if (!project.scenes.length) project.scenes = [mkScene("MainScene")];
  project.assets = Array.isArray(project.assets) ? project.assets : [];
  // Refresh only untouched built-in skies from earlier editor revisions.
  // Custom uploads and images edited by the texture tools keep their pixels.
  if (typeof SKYBOX_PRESET_IMAGES !== "undefined") {
    project.assets = project.assets.map(asset => {
      if (asset.editKind !== "skybox" || !asset.owned || !SKYBOX_PRESET_IMAGES[asset.skyboxPreset] ||
        (asset.skyboxRevision || 0) >= SKYBOX_TEXTURE_REVISION) return asset;
      return { ...asset, ...skyboxPresetAsset(asset.skyboxPreset), id: asset.id, name: asset.name, folder: asset.folder };
    });
  }
  project.prefabs = Array.isArray(project.prefabs) ? project.prefabs : [];
  project.scripts = Array.isArray(project.scripts) ? project.scripts : [];
  if (!project.name) project.name = "Untitled";
  if (!project.id) project.id = uid();

  const fromVersion = project.version || 2;

  // ── v2 -> v3: lift program-wide settings off the scenes ──────────────
  if (fromVersion < 3) {
    project.display = project.display || mkDisplay();
    project.dirs = project.dirs || mkDirs();

    const first = project.scenes[0];
    for (const [sceneKey, path, label] of LIFTED_DISPLAY) {
      if (first[sceneKey] === undefined) continue;
      setPath(project, path, first[sceneKey]);

      // Scenes that disagreed are about to lose their value. Say so.
      const divergent = project.scenes
        .slice(1)
        .filter((s) => s[sceneKey] !== undefined && s[sceneKey] !== first[sceneKey]);
      for (const s of divergent) {
        notes.push(
          `"${s.name}" had a different ${label} (${JSON.stringify(s[sceneKey])}). ` +
          `That setting is now project-wide and uses "${first.name}" value ` +
          `(${JSON.stringify(first[sceneKey])}).`,
        );
      }
    }

    for (const s of project.scenes) {
      // linkedScenes -> named transitions
      if (Array.isArray(s.linkedScenes) && !s.transitions) {
        s.transitions = s.linkedScenes
          .map((tid) => {
            const target = project.scenes.find((x) => x.id === tid);
            return target ? { id: uid(), name: ident(target.name, "scene"), targetSceneId: tid } : null;
          })
          .filter(Boolean);
      }
      for (const [sceneKey] of LIFTED_DISPLAY) delete s[sceneKey];
      delete s.linkedScenes;
      if (s.physics) delete s.physics.stepMethod;
    }

    if (notes.length) {
      notes.unshift(
        "Render settings moved from each scene to the project, where they belong — " +
        "a PS2 program sets its video mode once.",
      );
    }
  }

  project.display = fillDefaults(project.display || {}, mkDisplay());
  project.dirs = fillDefaults(project.dirs || {}, mkDirs());
  project.audio = fillDefaults(project.audio || {}, mkAudio());

  // PABE was on by default until it was measured on hardware. Left alone, an
  // existing project keeps every translucent surface opaque — shadows, HUD,
  // anything blended — for a reason nothing in the editor would reveal. It is
  // forced off rather than merely defaulted, because no project ever chose it
  // deliberately and the setting only ever made things worse. See the comment
  // on mkDisplay() and docs/HARDWARE-NOTES.md.
  if (project.display.alphaTest) project.display.alphaTest.pixelBlend = false;
  if (!project.template) project.template = "empty";

  // ── scenes ───────────────────────────────────────────────────────────
  const sceneTemplate = mkScene("_t");
  for (const scene of project.scenes) {
    if (!scene.id) scene.id = uid();
    if (!scene.name) scene.name = "Scene";
    scene.objects = Array.isArray(scene.objects) ? scene.objects : [];
    scene.uiElements = Array.isArray(scene.uiElements) ? scene.uiElements : [];
    scene.transitions = Array.isArray(scene.transitions) ? scene.transitions : [];
    for (const k of Object.keys(sceneTemplate)) {
      if (k === "id" || k === "name" || k === "objects" || k === "uiElements" || k === "transitions") continue;
      if (scene[k] === undefined) scene[k] = deepClone(sceneTemplate[k]);
    }
    fillDefaults(scene.physics, sceneTemplate.physics);
    fillDefaults(scene.camera, sceneTemplate.camera);

    // Transitions pointing at deleted scenes are dead weight.
    scene.transitions = scene.transitions.filter((t) => project.scenes.some((s) => s.id === t.targetSceneId));

    walk(scene.objects, (o) => {
      if (!o.id) o.id = uid();
      if (!o.name) o.name = `Object_${++_objSeq}`;
      if (!Array.isArray(o.children)) o.children = [];
      if (o.expanded === undefined) o.expanded = true;
      o.components = o.components || {};
      if (!o.components.transform) o.components.transform = makeComponent("transform");
      // Drop the stale export-time scratch field the old generator wrote onto
      // live project state.
      delete o._vn;
      for (const key of Object.keys(o.components)) {
        if (!COMPONENTS[key]) { delete o.components[key]; continue; }
        migrateComponent(key, o.components[key]);
      }
    });

    const uiTemplate = mkUIEl("Text");
    for (const el of scene.uiElements) {
      if (!el.id) el.id = uid();
      for (const k of Object.keys(uiTemplate)) if (el[k] === undefined) el[k] = deepClone(uiTemplate[k]);
    }
  }

  if (!project.scenes.some((s) => s.id === project.activeSceneId)) {
    project.activeSceneId = project.scenes[0].id;
  }
  if (!project.scenes.some((s) => s.id === project.startSceneId)) {
    project.startSceneId = project.scenes[0].id;
  }

  project.version = PROJECT_VERSION;
  if(typeof upgradeTerrainGeometry === "function")upgradeTerrainGeometry(project);
  return project;
}

function editorAssets(project, external = []) {
  const byName=new Map(external.map((f)=>[f.name,f]));
  for(const f of project.assets||[])if(f.owned !== false || !byName.has(f.name))byName.set(f.name,f);
  for(const s of project.scripts||[])if(s.edited||!byName.has(s.name))byName.set(s.name,{id:`script:${s.name}`,cat:"scripts",size:s.content.length,...s});
  return [...byName.values()];
}
