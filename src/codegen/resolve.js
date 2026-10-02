// ═══════════════════════════════════════════════════════════════════════
//  RESOLVE — scene  ->  intermediate representation
//
//  Every variable name in the generated program is allocated here, once, so
//  the emitters cannot disagree about what an object is called. The previous
//  generator stashed names on the live project objects (`obj._vn = ...`),
//  which mutated React state during export and leaked into saved files.
//
//  Nothing in this file writes code. It resolves references, bakes world
//  transforms, dedups resources and records diagnostics.
// ═══════════════════════════════════════════════════════════════════════

/** Names the generated program defines itself; objects must not collide. */
const RESERVED_VARS = [
  "canvas", "font", "gray", "pad", "lx", "ly", "ctx", "_nextScene", "goToScene",
  "drawUI", "_mainCam", "_mainDraw", "_mainDepth", "_shadowPass", "_odeEuler",
  "ode_world", "ode_space", "ode_contacts", "ode_onCollide", "_dt", "_hit",
  "_odeLegacyContacts", "_odeEventPairs", "_odePollContacts",
];

function resolveScene(project, scene, files = []) {
  files=editorAssets(project,files);
  const names = new NameAllocator();
  names.reserve(...RESERVED_VARS);

  const diagnostics = [];
  const problem = (level, message, obj, component) =>
    diagnostics.push({ level, message, objectId: obj?.id, objectName: obj?.name, component });

  const worlds = worldTransforms(scene.objects || []);
  const objects = exportableObjects(scene.objects || []);
  const has = (o, k) => !!o.components?.[k];
  const fileByName = (n) => files.find((f) => f.name === n) || null;

  // ── the FPS overlay's font ───────────────────────────────────────────
  // `new Font("default")` is the one compiled into the ELF and is always
  // there. A named file is only worth emitting when the folder really has it,
  // otherwise a fresh project dies on its first line.
  const fontDir = project.dirs?.fonts || "fonts";
  const overlayFont = files.find(
    (f) => f.cat === "fonts" && (!f.folder || f.folder.toLowerCase() === fontDir.toLowerCase()),
  )?.name || null;

  // ── camera ───────────────────────────────────────────────────────────
  const camObjs = objects.filter((o) => has(o, "camera"));
  if (camObjs.length > 1) {
    problem("warn", `${camObjs.length} cameras in this scene — only "${camObjs[0].name}" is exported.`, camObjs[1], "camera");
  }
  const camObj = camObjs[0] || null;
  const camWorld = camObj ? worlds.get(camObj.id) : null;
  // A Camera object wins; otherwise the scene's own camera defaults apply.
  const sceneCam = scene.camera || { fov: 60, near: 1, far: 4000 };
  const camera = {
    obj: camObj,
    position: camWorld ? camWorld.position : { x: 0, y: 2, z: 10 },
    target: camObj ? camObj.components.camera.target : { x: 0, y: 0, z: 0 },
    fov: camObj ? (camObj.components.camera.fov ?? sceneCam.fov) : sceneCam.fov,
    near: camObj ? (camObj.components.camera.near ?? sceneCam.near) : sceneCam.near,
    far: camObj ? (camObj.components.camera.far ?? sceneCam.far) : sceneCam.far,
  };
  if (!camObj) problem("info", "No Camera object — using the scene's camera defaults at (0, 2, 10).");

  // ── models, textures and RenderData dedup ────────────────────────────
  //
  // Three things are deduplicated here, and they are deduplicated separately
  // because they are three different costs on a console with 4 MB of VRAM and
  // 32 MB of RAM:
  //
  //  1. TEXTURES. One Image per unique file+filter, shared by every RenderData
  //     that wants it. `new Image("stone.png")` uploads a copy to VRAM every
  //     time it is called, so three models sharing one atlas used to cost
  //     three copies of it.
  //  2. GEOMETRY. One `new RenderData(mesh)` per unique mesh+texture. A second
  //     RenderData over the same mesh — needed when two objects want different
  //     shading or culling — is emitted as `.clone()`, which shares the vertex
  //     buffers and the texture pointers and copies only the materials
  //     (athena_renderdata_clone, ath_render.c:1067). The clone keeps a
  //     `__source` reference so the geometry outlives it.
  //  3. RENDERDATA OBJECTS. Objects whose mesh AND settings all match share
  //     one outright, as before.
  //
  // What still costs a full upload is a genuinely different mesh, which is the
  // only case where it is unavoidable.

  /** Everything that makes two RenderDatas behave differently. */
  const rdKeyOf = (m) =>
    [m.file, m.textureFile || "", m.textureFilter || "LINEAR", m.pipeline || "PL_DEFAULT",
      m.face_culling || "CULL_FACE_BACK", m.shade_model || "SHADE_GOURAUD",
      m.texture_mapping !== false, !!m.accurate_clipping].join("|");

  /** Everything that has to be uploaded. Two of these can share by cloning. */
  const uploadKeyOf = (m) => [m.file, m.textureFile || "", m.textureFilter || "LINEAR"].join("|");

  const renderDatas = [];
  const rdByKey = new Map();
  const textures = [];
  const texByKey = new Map();
  const sourceByUpload = new Map();
  const animByFile = new Map();
  const anims = [];
  const models = [];

  for (const obj of objects) {
    if (!has(obj, "model")) continue;
    const m = obj.components.model;
    if (!m.file) { problem("error", "Model has no mesh assigned — object skipped.", obj, "model"); continue; }
    if (files.length && !fileByName(m.file)) {
      problem("warn", `Mesh "${m.file}" is not in the project folder.`, obj, "model");
    }

    const key = rdKeyOf(m);
    let rd = rdByKey.get(key);
    if (!rd) {
      const base = ident(m.file.replace(/\.[^.]+$/, ""), "mesh");

      // One Image per file+filter, however many meshes ask for it. The filter
      // is part of the key because it is a property of the Image itself, so
      // two meshes wanting the same picture filtered differently genuinely do
      // need two of them.
      const texFile = m.textureFile?.trim() || "";
      let tex = null;
      if (texFile) {
        const filter = m.textureFilter || "LINEAR";
        const tkey = `${texFile}|${filter}`;
        tex = texByKey.get(tkey);
        if (!tex) {
          const tbase = ident(texFile.replace(/\.[^.]+$/, ""), "tex");
          tex = { file: texFile, filter, vn: names.take(`${tbase}_tex`, "mesh_tex") };
          texByKey.set(tkey, tex);
          textures.push(tex);
        }
      }

      // The first RenderData over a given mesh+texture does the upload; any
      // later one that differs only in its settings clones it.
      const upload = uploadKeyOf(m);
      const source = sourceByUpload.get(upload) || null;

      rd = {
        key,
        model: m,
        dataVN: names.take(`${base}_data`, "mesh_data"),
        tex,
        texVN: tex?.vn || null,
        cloneOf: source ? source.dataVN : null,
      };
      if (!source) sourceByUpload.set(upload, rd);
      rdByKey.set(key, rd);
      renderDatas.push(rd);
    }

    let anim = null;
    const a = obj.components.animator;
    if (a?.file) {
      if (!animByFile.has(a.file)) {
        const vn = names.take(`${ident(a.file.replace(/\.[^.]+$/, ""), "clip")}_anims`, "anims");
        animByFile.set(a.file, vn);
        anims.push({ file: a.file, vn });
      }
      anim = { file: a.file, vn: animByFile.get(a.file), clip: a.defaultAnim || "", loop: !!a.loop };
      if (!anim.clip) problem("warn", "Animator has no clip name — nothing will play.", obj, "animator");
    } else if (a) {
      problem("warn", "Animator has no clip file assigned.", obj, "animator");
    }

    const world = worlds.get(obj.id);
    if (world?.lossy) {
      problem(
        "warn",
        `"${obj.name}" is nested under a parent with non-uniform scale and is rotated — ` +
        `the baked world transform is approximate.`,
        obj, "transform",
      );
    }

    models.push({ obj, vn: names.take(obj.name, "model"), rd, world, anim });
  }
  const modelByName = (n) => models.find((e) => e.obj.name === String(n).trim()) || null;

  // ── lights ───────────────────────────────────────────────────────────
  const lights = objects.filter((o) => has(o, "light")).map((obj) => ({
    obj, vn: names.take(`${obj.name}_light`, "light"), light: obj.components.light,
  }));
  if (lights.length > 4) {
    problem("warn", `${lights.length} lights — AthenaEnv supports 4. The rest are created but unused.`, lights[4].obj, "light");
  }

  // ── sounds ───────────────────────────────────────────────────────────
  const sounds = [];
  for (const obj of objects) {
    if (!has(obj, "sound")) continue;
    const s = obj.components.sound;
    if (!s.file) { problem("error", "Sound has no audio file assigned.", obj, "sound"); continue; }
    sounds.push({ obj, vn: names.take(`${obj.name}_snd`, "snd"), sound: s });
  }

  // ── behaviour scripts ────────────────────────────────────────────────
  const scriptFiles = [];
  const scriptByName = new Map();
  const bindings = [];
  const ensureScript = (fname, forObj) => {
    if (!scriptByName.has(fname)) {
      const alias = ident(fname.replace(/\.js$/i, ""), "script");
      // A file on disk beats the copy carried inside the project, so editing
      // a template's controller externally just works.
      const uploaded = files.find((f) => f.name === fname && f.cat === "scripts");
      const embedded = (project.scripts || []).find((s) => s.name === fname);
      if (!uploaded && !embedded) {
        problem("error", `Script "${fname}" is not in the project folder. Import it or remove its attachment.`, forObj, "script");
      }
      const entry = {
        name: fname,
        alias: `${alias}_${scriptByName.size}`,
        content: uploaded?.content ?? embedded?.content ??
          `// ${fname} — not found when this project was exported.\n` +
          `export function init(ctx) { throw new Error("Missing script: ${jsStr(fname)}"); }\n` +
          `export function update(ctx, pad) {}\n`,
      };
      scriptByName.set(fname, entry);
      scriptFiles.push(entry);
    }
    return scriptByName.get(fname);
  };

  const ctxKeyOwner = new Map();
  for (const obj of objects) {
    if (!has(obj, "script")) continue;
    const sc = obj.components.script;
    if (!sc.file) { problem("error", "Script component has no module assigned.", obj, "script"); continue; }
    const entry = ensureScript(sc.file, obj);
    const model = models.find((m) => m.obj.id === obj.id) || null;
    const key = ident((sc.ctxKey || "").trim() || obj.name, "target");
    if (ctxKeyOwner.has(key)) {
      problem("warn",
        `"${obj.name}" and "${ctxKeyOwner.get(key)}" both use ctx.${key}, so they share one ` +
        `state slot. Set a distinct ctx Key if that is not intended.`, obj, "script");
    } else ctxKeyOwner.set(key, obj.name);
    bindings.push({
      obj, entry,
      ctxKey: key,
      modelVN: model?.vn || null,
    });
  }

  // ── physics ──────────────────────────────────────────────────────────
  const ph = scene.physics || {};
  const bodies = [];
  if (ph.enabled) {
    for (const obj of objects) {
      if (!has(obj, "rigidbody")) continue;
      const rb = obj.components.rigidbody;
      const world = worlds.get(obj.id);
      const model = models.find((m) => m.obj.id === obj.id) || null;
      const shape = rb.shape || "box";
      const mode = rb.mode || "static";

      if (mode === "dynamic" && (shape === "plane" || shape === "mesh")) {
        problem("error",
          `"${obj.name}" is a dynamic ${shape} body. ODE cannot simulate that — ` +
          `use a box or sphere collider. Skipped.`, obj, "rigidbody");
        continue;
      }
      if (shape === "mesh" && !model) {
        problem("error", `"${obj.name}" uses a mesh collider but has no exported Model. Skipped.`, obj, "rigidbody");
        continue;
      }

      // Collider extents: from the mesh bounds when auto-fitting, else explicit.
      let size = { ...(rb.size || { x: 1, y: 1, z: 1 }) };
      let radius = rb.radius ?? 0.5;
      const bounds = model ? fileByName(model.obj.components.model.file)?.bounds : null;
      if (rb.autoFit && bounds) {
        size = {
          x: Math.max(0.01, bounds.size.x * Math.abs(world.scale.x)),
          y: Math.max(0.01, bounds.size.y * Math.abs(world.scale.y)),
          z: Math.max(0.01, bounds.size.z * Math.abs(world.scale.z)),
        };
        radius = Math.max(size.x, size.y, size.z) / 2;
      } else if (rb.autoFit && !bounds && (shape === "box" || shape === "sphere")) {
        problem("info", `"${obj.name}" auto-fits its collider but the mesh is not loaded — using the manual size.`, obj, "rigidbody");
      }

      // Prefer the model's identifier so an object's mesh and its collider
      // read as a pair (hero / hero_body / hero_geom) instead of drifting
      // apart (hero / hero_2_body).
      const base = model ? model.vn : names.take(obj.name, "body");
      // Reserve the derived names too, so a later object cannot claim them.
      const bodyVN = mode === "dynamic" ? names.take(`${base}_body`, "body") : null;
      const geomVN = names.take(`${base}_geom`, "geom");
      bodies.push({
        obj, rb, world, model, shape, mode, size, radius,
        isDynamic: mode === "dynamic",
        isTrigger: mode === "trigger",
        freezeRotation: mode === "dynamic" && !!rb.freezeRotation,
        bodyVN,
        geomVN,
        events: !!rb.collisionEvents,
        ctxKey: rb.collisionEvents ? ident((rb.onCollide || "").trim() || obj.name, "target") : null,
      });
    }
    if (!bodies.length) {
      problem("info", "Physics is enabled but no object has a Rigidbody — no ODE world is created.");
    }
  } else if (objects.some((o) => has(o, "rigidbody"))) {
    problem("warn", "Objects have Rigidbody components but scene physics is off — they will not be exported.", null, "rigidbody");
  }

  // ── shadows ──────────────────────────────────────────────────────────
  const shadows = [];
  for (const obj of objects) {
    if (!has(obj, "shadow")) continue;
    const sh = obj.components.shadow;
    const src = sh.source || "rendertarget";
    const world = worlds.get(obj.id);

    const wanted = (sh.caster || "").trim();
    const caster = wanted ? modelByName(wanted) : models.find((m) => m.obj.id === obj.id) || null;
    if (src === "rendertarget") {
      if (!caster) {
        problem("error",
          wanted
            ? `Shadow caster "${wanted}" is not an exported model — shadow skipped.`
            : `Shadow has no caster and "${obj.name}" has no Model — shadow skipped.`,
          obj, "shadow");
        continue;
      }
    } else if (!(sh.texture || "").trim()) {
      problem("error", "Blob shadow has no texture — shadow skipped.", obj, "shadow");
      continue;
    }

    // Light direction: a referenced Light wins over the manual vector.
    let dir = sh.lightDir || { x: 0, y: 1, z: 1 };
    if ((sh.lightSource || "").trim()) {
      const le = lights.find((l) => l.obj.name === sh.lightSource.trim());
      if (le) dir = le.light.direction;
      else problem("error", `Shadow references light "${sh.lightSource}", which does not exist.`, obj, "shadow");
    }

    if (sh.raycast && (!ph.enabled || !bodies.length)) {
      problem("error", "Shadow draping needs enabled physics and an exported collider — draping disabled for this shadow.", obj, "shadow");
    }

    // Where the decal goes, how big it is and how far it turns — all of it
    // derived in one place, shared with the viewport overlay so what you aim
    // in the editor is what the PS2 draws. See src/core/shadowmath.js.
    const casterScale = caster?.world?.scale || { x: 1, y: 1, z: 1 };
    const casterBounds = caster ? fileByName(caster.obj.components.model.file)?.bounds : null;
    const proj = shadowProjection(sh, dir, casterBounds, casterScale, camera.near);
    for (const n of proj.notes) problem(n.level, `"${obj.name}": ${n.message}`, obj, "shadow");

    const vn = names.take(`${obj.name}_shadow`, "shadow");
    shadows.push({
      obj, sh, src, caster, world,
      vn,
      matrixVN: names.take(`${obj.name}_shadowMatrix`, "shadow_matrix"),
      rtVN: names.take(`${obj.name}_rt`, "shadow_rt"),
      rtPx: clamp(sh.rtSize || 128, 32, 512),
      proj,
      // The elevation-clamped light is what the engine is given, so everything
      // downstream agrees with what the decal was built for.
      lightDir: proj.L,
      raycast: !!sh.raycast && !!ph.enabled && bodies.length > 0,
    });
  }
  const shadowPasses = shadows.filter((s) => s.src === "rendertarget");

  // VRAM is 4 MB total and locked render targets never come back.
  const rtBytes = shadowPasses.reduce(
    (n, s) => n + s.rtPx * s.rtPx * ((s.sh.rtBpp || 32) / 8), 0,
  );
  if (rtBytes > 1024 * 1024) {
    problem("warn",
      `Shadow render targets lock ${(rtBytes / 1048576).toFixed(2)} MB of the PS2's 4 MB of VRAM. ` +
      `Lower the target size or switch some shadows to blob textures.`);
  }

  // ── UI ───────────────────────────────────────────────────────────────
  const uiEls = [...(scene.uiElements || [])]
    .filter((e) => e.visible !== false)
    .sort((a, b) => (a.zindex || 0) - (b.zindex || 0))
    .map((el) => ({
      el,
      vn: names.take(el.name || el.type, "ui"),
      imageVN: el.type === "Image" && el.image ? names.take(`${el.name || "ui"}_img`, "ui_img") : null,
    }));

  for (const u of uiEls) {
    if (u.el.script?.file) {
      const entry = ensureScript(u.el.script.file, null);
      bindings.push({
        obj: { id: u.el.id, name: u.el.name },
        entry,
        ctxKey: ident((u.el.script.ctxKey || "").trim() || u.el.name || u.el.type, "ui"),
        modelVN: null,
        isUI: true,
      });
    }
    if (u.el.type === "Image" && !u.el.image) {
      problem("warn", `UI element "${u.el.name}" is an Image with no picture assigned.`, null, "ui");
    }
  }

  return {
    project, scene, names, diagnostics,
    skybox: resolveSkybox(scene, files, names, textures, problem),
    camera, overlayFont, textures, renderDatas, models, anims, lights, sounds,
    scripts: { files: scriptFiles, bindings },
    physics: {
      enabled: !!ph.enabled && bodies.length > 0,
      settings: ph,
      bodies,
      anyEvents: bodies.some((b) => b.events),
      anyDynamic: bodies.some((b) => b.isDynamic),
    },
    shadows, shadowPasses, rtBytes,
    ui: uiEls,
    // Asset directories are project-wide as of v3 — one program, one layout.
    dirs: {
      models: project.dirs?.models || "3dmodels",
      textures: project.dirs?.textures || "textures",
      sounds: project.dirs?.sounds || "sounds",
      fonts: project.dirs?.fonts || "fonts",
      scripts: project.dirs?.scripts || "scripts",
    },
  };
}
