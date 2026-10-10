// ═══════════════════════════════════════════════════════════════════════
//  VALIDATE — everything wrong with a scene, before it reaches hardware
//
//  Feeds the Problems panel. Each entry is
//    { level, message, objectId?, objectName?, component?, fix? }
//  where `fix` names a one-click repair the panel knows how to apply.
// ═══════════════════════════════════════════════════════════════════════

const LEVEL_RANK = { error: 0, warn: 1, info: 2 };

const PHYSICS_CTX_HANDLES = new Set(["particles","emitParticles","pad", "dt", "frame", "goToScene", "RenderObjects", "RenderDatas",
  "textures", "animCollections", "lights", "sounds", "shadows", "physics", "ui", "eventActions", "destroyObject", "events", "cinematics", "eventFlows", "variables", "setGameplayEnabled", "isGameplayEnabled", "__proto__", "constructor", "prototype"]);

function physicsEventKey(obj) {
  return ident((obj.components.rigidbody.onCollide || "").trim() ||
    (obj.components.script?.ctxKey || "").trim() || obj.name, "target");
}

/** Shared by live Problems and export; never let an event slot replace ctx handles. */
function physicsEventKeyProblems(objects) {
  const owners = new Map(), problems = [];
  for (const obj of objects) {
    if (!obj.components?.rigidbody?.collisionEvents) continue;
    const key = physicsEventKey(obj);
    const message = PHYSICS_CTX_HANDLES.has(key)
      ? `"${obj.name}" uses reserved ctx Key "${key}" for physics events. Choose another key.`
      : owners.has(key) ? `"${obj.name}" and "${owners.get(key)}" both report physics events to ctx.${key}. Set distinct ctx Keys.` : null;
    if (message) problems.push({ level: "error", message, objectId: obj.id, objectName: obj.name, component: "rigidbody" });
    else owners.set(key, obj.name);
  }
  return problems;
}

// Export must contain the bytes it references. A missing dependency is not a
// usable game, even when an empty asset library hides it in ordinary editing.
function exportAssetProblems(scene, files, project) {
  const problems = [], seen = new Set();
  const requireAsset = (cat, name, object, component) => {
    if (!name || (cat === "fonts" && name === "default")) return;
    const key = `${object?.id || "scene"}:${cat}:${name}`;
    if (seen.has(key)) return;
    seen.add(key);
    const file = files.find(f => f.cat === cat && f.name === name);
    if (!file || file.error || (file.content === undefined && !file.dataUrl)) {
      problems.push({ level: "error", message: `"${name}" is missing. Import the file before exporting.`, objectId: object?.id, objectName: object?.name, component });
    }
  };
  for (const object of exportableObjects(scene.objects || [])) {
    for (const [key, comp] of Object.entries(object.components || {})) {
      for (const field of COMPONENTS[key]?.fields || []) {
        if (field.type === "asset" && (!field.when || field.when(comp, object, scene))) requireAsset(field.cat, comp[field.key], object, key);
      }
    }
  }
  for (const el of scene.uiElements || []) {
    if (el.visible === false) continue;
    if (["Text", "Button"].includes(el.type)) requireAsset("fonts", el.fontFile, el, "hud");
    requireAsset("textures", el.image, el, "hud");
    requireAsset("scripts", el.script?.file, el, "hud");
  }
  const sky = normalizedSkybox(scene.skybox);
  if (sky.enabled) requireAsset("textures", sky.texture, null, "skybox");
  if (sky.enabled) for (const tile of sky.tiles) requireAsset("textures", tile, null, "skybox");
  return problems;
}

function validateScene(scene, files = [], project = null) {
  const out = [];
  if (!scene) return out;
  if(scene.activeCameraId&&!resolveSceneCamera(scene).cameras.some(o=>o.id===scene.activeCameraId))out.push({level:'error',component:'camera',message:'The active camera is missing or excluded from export. Choose an active camera in Scene settings.'});
  if(project)files=editorAssets(project,files);
  if (typeof cinematicProblems === "function") out.push(...cinematicProblems(scene, files));
  if (typeof eventFlowProblems === "function") out.push(...eventFlowProblems(scene,files,project));
  const add = (level, message, obj, component, fix) =>
    out.push({ level, message, objectId: obj?.id, objectName: obj?.name, component, fix });

  const objects = allObjects(scene.objects || []);
  const exported = new Set(exportableObjects(scene.objects || []).map((o) => o.id));
  if(scene.environment?.fog?.enabled){
    const fog=scene.environment.fog;
    if(!Number.isFinite(fog.start)||!Number.isFinite(fog.end)||fog.start<0||fog.end<=fog.start)add('error','Fog end distance must be greater than its start distance.',null,'environment');
    const unsupported=objects.filter(o=>exported.has(o.id)&&o.components?.model&&!o.components.water&&!o.components.particles&&(o.components.animator||o.components.rigidbody?.mode==='dynamic'||!/\.obj$/i.test(o.components.model.file)));
    if(unsupported.length)add('info','Native fog affects static OBJ surfaces. Animated models and water keep their own materials.',null,'environment');
    add('info','Fog adds an untextured draw and independent geometry/color buffers for each static OBJ object; it adds no texture VRAM.',null,'environment');
  }
  for(const obj of objects.filter(o=>exported.has(o.id))){
    const asset=files.find(f=>f.name===obj.components?.model?.file);
    const water=obj.components?.water,textureAnimation=obj.components?.textureAnimation,particles=obj.components?.particles;
    if(water&&asset?.content){
      const corners=readMeshOBJ(asset.content).faces.length*3;
      const settings=normalizedWater(water),layout=waterGeometryCacheLayout(corners,settings,!!obj.components.reflection);
      if((settings.waveHeight||settings.flow.x||settings.flow.z||settings.rippleStrength)&&!layout.bytes)add('warn',`This water mesh exceeds the 8 MB animation cache limit. Mesh waves and Texture movement use the slower dynamic path; reduce their quality or simplify the mesh.`,obj,'water');
    }
    if(textureAnimation||particles?.flipbook){
      const animation=textureAnimation||particles,cols=animation.columns,rows=animation.rows,texture=files.find(f=>f.name===obj.components.model.textureFile),image=texture?.image||texture?.imageSize;
      if(image&&(image.width%cols||image.height%rows))add('error','Sprite sheet dimensions must divide evenly into its columns and rows.',obj,textureAnimation?'textureAnimation':'particles');
      if(!obj.components.model.textureFile||obj.components.model.texture_mapping===false)add('error','Assign a sprite sheet to the Model texture and enable texture mapping.',obj,textureAnimation?'textureAnimation':'particles');
      if(textureAnimation&&asset?.content){
        const corners=readMeshOBJ(asset.content).faces.length*3,bytes=corners*16*cols*rows;
        if(bytes>8*1024*1024)add('error','This mesh and atlas need more than 8 MB of cached UVs. Use a simpler sprite mesh or fewer atlas frames.',obj,'textureAnimation');
        else if(corners>768)add('warn','Texture animation on dense geometry increases memory and CPU work. A simple sprite plane is faster.',obj,'textureAnimation');
      }
    }
    if(obj.components?.particles&&asset?.content&&/\.obj$/i.test(asset.name)){
      let capacity=0;try{capacity=readMeshOBJ(asset.content).faces.length/2;}catch{}
      if(capacity<obj.components.particles.count)add('error','This sprite mesh has too few particle quads. Create an emitter through Add / Particle effects.',obj,'particles');
    }
    if(asset?.vertexColors){
      let count=0;try{count=readMeshOBJ(asset.content).faces.length*9;}catch{}
      if(!Array.isArray(asset.vertexColors)||asset.vertexColors.length!==count||asset.vertexColors.some(v=>!Number.isFinite(v)||v<0||v>1))add('error','Baked vertex colors no longer match this mesh. Restore original colors and apply Lighting again.',obj,'model');
    }
  }
  if (scene.physics?.enabled) out.push(...physicsEventKeyProblems(objects.filter(o => exported.has(o.id))));
  for (const obj of objects.filter(o => exported.has(o.id))) {
    const rb = obj.components?.rigidbody;
    if (!rb?.collisionEvents || !rb.eventPreset) continue;
    if (!EVENT_ACTION_PRESETS.some(p => p.id === rb.eventPreset)) add("error", "Choose a valid event script preset.", obj, "rigidbody");
    if(rb.eventPreset==="playSequence"&&!scene.sequences?.some(s=>s.id===rb.eventSequenceId))add("error","Choose a Sequence for Play Cinematic.",obj,"rigidbody");
    if (rb.eventOtherId && !objects.some(o => exported.has(o.id) && o.id === rb.eventOtherId && o.id !== obj.id && o.components.rigidbody)) {
      add("error", "Only With must reference another exported collider.", obj, "rigidbody");
    }
    if (rb.eventPreset === "changeScene" && rb.eventSceneId && project && !project.scenes.some(s => s.id === rb.eventSceneId)) {
      add("error", "The selected Scene no longer exists.", obj, "rigidbody");
    }
    if (rb.eventPreset === "playAnimation" && (!obj.components.model || obj.ctxEnabled === false)) {
      add("error", "Play Animation needs a Model available to scripts on this object.", obj, "rigidbody");
    }
  }
  const assetNames = new Set(files.map((f) => f.name));
  const haveFiles = files.length > 0;
  out.push(...skyboxAssetProblems(scene, files));
  // Scripts carried inside the project resolve without a file on disk.
  const embeddedScripts = new Set((project?.scripts || []).map((s) => s.name));
  const resolves = (field, value) =>
    assetNames.has(value) || (field.cat === "scripts" && embeddedScripts.has(value));

  // ── PABE ─────────────────────────────────────────────────────────────
  // `Blend Pixels` writes the GS PABE register, which blends only where the
  // source alpha's MSB is set. PS2 alpha stores 128 as fully opaque, so the
  // only alpha it lets through is the one that needed no blending — every
  // translucent surface in the project comes out solid. Measured on PCSX2:
  // off, opacity tracks alpha 1:1; on, it is all-or-nothing.
  if (project?.display?.alphaTest?.pixelBlend) {
    add(
      "warn",
      "Blend Pixels (the GS PABE register) is on. It blends only where alpha is " +
      "already fully opaque, so every semi-transparent surface — shadows, HUD, " +
      "blended materials — renders opaque on hardware. Turn it off unless you " +
      "specifically want that per-pixel cutout.",
      null,
      null,
      { path: "display.alphaTest.pixelBlend", value: false, label: "Turn Blend Pixels off" },
    );
  }

  // ── duplicate names ──────────────────────────────────────────────────
  // Names become ctx keys and reference targets, so collisions are ambiguous
  // even though the generator keeps the emitted identifiers unique.
  const byName = new Map();
  for (const o of objects) {
    if (!byName.has(o.name)) byName.set(o.name, []);
    byName.get(o.name).push(o);
  }
  for (const [name, list] of byName) {
    if (list.length > 1) {
      add("warn", `${list.length} objects are named "${name}". References by name are ambiguous.`, list[1], null, "renameDuplicates");
    }
  }

  // ── per component ────────────────────────────────────────────────────
  const counts = {};
  const overLimit = {};
  for (const obj of objects) {
    for (const [key, comp] of Object.entries(obj.components || {})) {
      const def = COMPONENTS[key];
      if (!def) continue;
      if (exported.has(obj.id)) {
        counts[key] = (counts[key] || 0) + 1;
        // Remember the first one PAST the limit, so the budget warning below
        // can point at the component that is being ignored rather than at the
        // scene in general. "7 lights, 4 are used" is not actionable until you
        // know which one to delete.
        if (def.limit && counts[key] === def.limit + 1) overLimit[key] = obj;
      }

      // required fields
      for (const f of def.fields || []) {
        if (!f.required) continue;
        if (f.when && !f.when(comp, obj, scene)) continue;
        const v = comp[f.key];
        if (v === undefined || v === null || v === "") {
          add("error", `"${f.label}" is required.`, obj, key);
        } else if (f.type === "asset" && haveFiles && !resolves(f, v)) {
          add("warn", `"${v}" is not in the project folder.`, obj, key);
        }
      }
      // non-required asset references still need to resolve if set
      for (const f of def.fields || []) {
        if (f.type !== "asset" || f.required) continue;
        const v = comp[f.key];
        if (v && haveFiles && !resolves(f, v)) {
          add("warn", `"${v}" is not in the project folder.`, obj, key);
        }
      }
      // component-specific rules
      if (def.validate) {
        for (const d of def.validate(comp, obj, scene)) {
          add(d.level, d.msg, obj, key, d.fix);
        }
      }
      // dependencies
      for (const dep of def.requires || []) {
        if (!obj.components[dep]) {
          add("error", `${def.label} needs a ${COMPONENTS[dep]?.label || dep} component on the same object.`, obj, key, `add:${dep}`);
        }
      }
    }

    if (obj.exportEnabled === false && obj.visible !== false) {
      add("info", `"${obj.name}" is excluded from export.`, obj);
    }
  }

  // ── textures ─────────────────────────────────────────────────────────
  // The most expensive mistake in the editor, and the one with the least
  // feedback: athena_load_image (src/image_loaders.c:135) allocates
  // width * height * 4 bytes in main RAM with no ceiling and no complaint,
  // then uploads the same again into 4 MB of VRAM. Nothing anywhere says the
  // picture was too big — the program simply does not boot.
  const sky = normalizedSkybox(scene.skybox);
  const skyObjects = sky.enabled ? (sky.tiles.length ? sky.tiles : [sky.texture]).map((texture, i) => ({ id: `__skybox_budget_${i}__`, name: "Skybox", components: { model: { textureFile: texture, textureFilter: sky.textureFilter } } })) : [];
  for (const d of validateTextures([...objects, ...skyObjects], new Set([...exported, ...skyObjects.map(o=>o.id)]), files)) {
    if (skyObjects.some(o=>o.id === d.objectId)) { delete d.objectId; d.component = "skybox"; }
    out.push(d);
  }

  // Portable exports flatten asset folders. External .gltf references cannot
  // safely follow that change; require a self-contained model instead.
  const gltfSeen = new Set();
  for (const obj of objects) {
    if (!exported.has(obj.id)) continue;
    const f = obj.components?.model?.file;
    if (!f || !/\.gltf$/i.test(f) || gltfSeen.has(f)) continue;
    gltfSeen.add(f);
    const asset = files.find(a => a.name === f);
    if (!asset?.content && !asset?.dataUrl) continue;
    try {
      const text = asset.content ?? new TextDecoder().decode(Uint8Array.from(atob(asset.dataUrl.split(",")[1]), c => c.charCodeAt(0)));
      const model = JSON.parse(text);
      if ([...(model.buffers || []), ...(model.images || [])].some(item => item.uri && !item.uri.startsWith("data:"))) {
        add("error", `"${f}" references external files. Export the model as a self-contained .glb, then import it and replace this model.`, obj, "model");
      }
    } catch {
      add("error", `"${f}" is not a readable glTF model. Re-export it as .glb and import it again.`, obj, "model");
    }
  }

  // ── engine budgets ───────────────────────────────────────────────────
  for (const [key, def] of Object.entries(COMPONENTS)) {
    if (def.limit && counts[key] > def.limit) {
      add("warn", `${counts[key]} ${def.label} components — ${def.limitMessage}`, overLimit[key], key);
    }
  }

  // ── scene-level ──────────────────────────────────────────────────────
  if (!counts.camera) {
    add("info", "No Camera in this scene — the export falls back to a default view.");
  }
  if (!counts.model) {
    add("info", "No visible models in this scene.");
  }
  if (scene.physics?.enabled && !counts.rigidbody) {
    add("info", "Physics is enabled but nothing has a Rigidbody.");
  }
  const step = scene.physics?.stepSize;
  if (scene.physics?.enabled && step && (step > 0.05 || step < 0.001)) {
    add("warn", `Physics step of ${step}s is outside the stable range — keep it near 0.016.`, null, "rigidbody");
  }

  // ── project-level ────────────────────────────────────────────────────
  // These live on the project as of v3, but they surface here so the user
  // sees one list rather than hunting across two panels.
  if (project) {
    const D = project.display || {};
    if (D.psm === "custom") {
      for (const [key, label] of [["psmCustomColor", "colour"], ["psmCustomDepth", "depth"]]) {
        const v = D[key];
        if (!v || !/^Screen\.[A-Z0-9_]+$/.test(v)) {
          add("error", `Custom ${label} PSM "${v || ""}" is not a Screen.* constant.`, null, null);
        }
      }
    }
    const dirs = project.dirs || {};
    for (const [key, label] of [["models", "Models"], ["textures", "Textures"], ["sounds", "Sounds"], ["fonts", "Fonts"]]) {
      const v = dirs[key];
      if (!v || !/^[A-Za-z0-9_.\-]+$/.test(v)) {
        add("error", `${label} directory "${v || ""}" is not a usable folder name.`, null, null);
      }
    }
    if (project.scenes?.length > 1 && !project.scenes.some((s) => s.id === project.startSceneId)) {
      add("warn", "No start scene is set — the first scene will be used.", null, null);
    }
  }

  out.push(...sceneVRAMProblems(scene, files, project));

  out.sort((a, b) => LEVEL_RANK[a.level] - LEVEL_RANK[b.level]);
  return out;
}

/**
 * Everything a scene's textures cost, and everything wrong with them.
 *
 * Kept apart from validateScene's per-component walk because these are facts
 * about the SET of textures — the same picture used by six objects is one
 * upload, and the same picture at two filters is two.
 */
function validateTextures(objects, exported, files) {
  const out = [];
  const add = (level, message, obj, fix) =>
    out.push({ level, message, objectId: obj?.id, objectName: obj?.name, component: "model", fix });

  // Unique texture uploads, keyed the way codegen/resolve.js keys them.
  const uploads = new Map();
  const filtersByFile = new Map();

  for (const obj of objects) {
    if (!exported.has(obj.id)) continue;
    const m = obj.components?.model;
    const file = m?.textureFile?.trim();
    if (!file) continue;
    const filter = m.textureFilter || "LINEAR";
    if (!filtersByFile.has(file)) filtersByFile.set(file, new Map());
    filtersByFile.get(file).set(filter, obj);
    const key = `${file}|${filter}`;
    if (!uploads.has(key)) uploads.set(key, { file, filter, obj });
  }
  if (!uploads.size) return out;

  const seenFile = new Set();
  for (const { file, filter, obj } of uploads.values()) {
    const entry = files.find((f) => f.name === file);
    const size = imageSizeOfAsset(entry);
    if (!size || !size.width || !size.height) continue;
    const { width, height } = size;
    const bytes = textureVRAMBytes(entry) ?? textureBytes(width, height);

    if (width > GS_MAX_TEXTURE || height > GS_MAX_TEXTURE) {
      add(
        "error",
        `"${file}" is ${width}x${height}. The PS2 cannot address a texture larger than ` +
        `${GS_MAX_TEXTURE}x${GS_MAX_TEXTURE}, and this one needs ${fmtBytes(bytes)} of the ` +
        `console's 32 MB of RAM before it is even uploaded into 4 MB of video memory. ` +
        `Resize it to ${GS_MAX_TEXTURE} or less — the program will not boot as it is.`,
        obj,
      );
    } else if (!seenFile.has(file) && (!isPowerOfTwo(width) || !isPowerOfTwo(height))) {
      add(
        "warn",
        `"${file}" is ${width}x${height}. The GS addresses textures in powers of two, ` +
        `so a size like this is rounded up and the difference is wasted memory.`,
        obj,
      );
    }
    seenFile.add(file);
  }

  // The same picture at two filters is genuinely two copies in memory, because
  // the filter belongs to the Image the engine uploads, not to the mesh.
  for (const [file, byFilter] of filtersByFile) {
    if (byFilter.size < 2) continue;
    const entry = files.find((f) => f.name === file);
    const size = imageSizeOfAsset(entry);
    const cost = size ? ` — an extra ${fmtBytes(textureVRAMBytes(entry) ?? textureBytes(size.width, size.height))}` : "";
    add(
      "warn",
      `"${file}" is used with ${[...byFilter.keys()].join(" and ")} filtering. ` +
      `The filter belongs to the loaded image rather than to the mesh, so each one is a ` +
      `separate copy in memory${cost}. Use one filter for the whole texture if you can.`,
      [...byFilter.values()][1],
    );
  }

  return out;
}

// ═══════════════════════════════════════════════════════════════════════
//  One-click fixes
//
//  A diagnostic's `fix` comes in three shapes:
//
//    "renameDuplicates"        a named repair the Problems panel implements
//    "add:model"               add a missing dependency component
//    { path, value, label }    set one path to one value
//
//  The third crashed the panel it was shown in. `p.fix?.startsWith(...)`
//  guards null but not an object, so a diagnostic carrying one threw
//  "p.fix.startsWith is not a function" and unmounted the Problems panel —
//  which is precisely where you go when something is wrong. It was never
//  applied either: `FIXES[{...}]` keys as "[object Object]".
//
//  These live here rather than in panels/problems.jsx so they are reachable
//  from tests/ — the shape dispatch is pure logic and needs no DOM.
// ═══════════════════════════════════════════════════════════════════════

const isPathFix = (fix) => !!fix && typeof fix === "object" && typeof fix.path === "string";

const fixKey = (fix) => (typeof fix === "string" ? fix : null);

/**
 * Apply a { path, value } fix.
 *
 * `display.*` and `dirs.*` address the project; `components.<key>.<field>`
 * addresses the object the diagnostic came from. Anything else is refused
 * rather than guessed at — a fix that writes somewhere unintended is worse
 * than no fix at all.
 */
function applyPathFix(p, draft, sceneId) {
  if (!isPathFix(p?.fix) || !draft) return false;
  const path = p.fix.path;
  if (path.startsWith("components.")) {
    const scene = draft.scenes?.find((s) => s.id === sceneId);
    const obj = scene && findObj(scene.objects, p.objectId);
    if (!obj) return false;
    writePath(obj, path, p.fix.value);
    return true;
  }
  if (path.startsWith("display.") || path.startsWith("dirs.")) {
    writePath(draft, path, p.fix.value);
    return true;
  }
  return false;
}

const countByLevel = (list) => {
  const n = { error: 0, warn: 0, info: 0 };
  for (const d of list || []) n[d.level] = (n[d.level] || 0) + 1;
  return n;
};
