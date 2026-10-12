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
  "prepareWaterArrays", "advanceWaterArrays", "_updateWater", "_blobImagesReady",
  "advanceCachedWaterArrays","updateWaterPositionFallback","updateWaterUVFallback","waterCausticCacheValid","updateCachedCausticUVs",
  "flipbookFrame","createFlipbookUVState","applyFlipbookFrame","advanceFlipbookUVs","_updateTextureAnimations",
  "createParticleState","stepParticleState","updateParticleVertices","_updateParticleSystems",
  "matFromEuler",
  "createFogState","advanceFogArrays","_updateFog","_fogClock","_reflectionImagesReady",
  "canvas", "font", "gray", "pad", "lx", "ly", "ctx", "_nextScene", "goToScene",
  "_cinematicPlayerState", "_sceneEventsState", "_cinematicDialogueLines",
  "_cinematicModels", "_cinematicSounds", "_cinematicImages", "_cinematicAnims", "_cinematicDefaults", "_cinematicPools", "_cinematicFont", "_cinematicAdapter", "_cinematicExitPending", "_cinematicDrawUI", "_cinematicDrawParticles", "createCinematicPlayer", "createSceneEvents", "createCinematicAdapter", "cinematicLerp",
  "drawUI", "_mainCam", "_mainDraw", "_mainDepth", "_shadowPass", "_odeEuler",
  "ode_world", "ode_space", "ode_contacts", "ode_onCollide", "_disposePhysics", "_physicsDisposed", "_disposeShadows", "_releaseShadowProjectors", "_syncShadowReceivers", "_dt", "_hit",
  "_odeLegacyContacts", "_odeEventPairs", "_odePollContacts",
  "_odeBoundGeoms", "_odeBoundPositions", "_odeBoundNumber", "_odeEventBounds",
  "_odeEventStates", "_odeEventFrame", "_odeTouch", "_odeFinishPairs", "_odeFinishEvents",
  "_triggers", "_updateTriggers", "_triggerBoundGeoms", "_triggerBoundPositions",
  "_triggerBoundNumber", "_triggerEventBounds",
  "_runtimeObjects", "_pendingDestroy", "_isObjectAlive", "destroyObject", "_flushDestroyedObjects",
  "_isObjectEnabled", "setObjectGameplayEnabled", "_flowModels", "_flowSounds", "_flowAnimations", "_flowPlatform", "_eventFlowState", "_flowRulesByType", "_flowComplete", "flowEventType",
  "cinematicCurve", "cinematicValueLerp", "cinematicKeyframeValue", "cinematicClipOpacity",
  "cinematicAnimationWeight", "cinematicQuaternionLerp", "sampleCinematicPose", "CinematicPoseMixer", "_cinematicMixData", "_cinematicPoseMixer",
  "_hudFrame", "_hudText", "_hudMemory", "_hudDefaultFont", "_hudTime", "hudMotionValues",
];

function resolveScene(project, scene, files = []) {
  files=editorAssets(project,files);
  const names = new NameAllocator();
  names.reserve(...RESERVED_VARS);

  const diagnostics = [],waterGeneratedAssets=[];
  const problem = (level, message, obj, component) =>
    diagnostics.push({ level, message, objectId: obj?.id, objectName: obj?.name, component });

  const worlds = worldTransforms(scene.objects || []);
  const objects = exportableObjects(scene.objects || []);
  for(const object of [...objects])if(object.components?.water){
    const world=worlds.get(object.id),caustic=waterCausticObject(object,world);
    if(caustic){objects.push(caustic);worlds.set(caustic.id,{...world,scale:{x:1,y:1,z:1}});}
  }
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
  const camera = resolveSceneCamera(scene),camObj=camera.obj;
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
    let m = obj.components.model;
    if (!m.file) { problem("error", "Model has no mesh assigned — object skipped.", obj, "model"); continue; }
    if (files.length && !fileByName(m.file)) {
      problem("warn", `Mesh "${m.file}" is not in the project folder.`, obj, "model");
    }

    const water = obj.components.water ? normalizedWater(obj.components.water) : null;
    if(water){
      const mesh=waterMeshForQuality(fileByName(m.file),water,files),texture=waterTextureForQuality(fileByName(m.textureFile),water,files);
      for(const asset of [mesh,texture])if(asset&&!fileByName(asset.name)){files.push(asset);waterGeneratedAssets.push(asset);}
      m={...m,file:mesh?.name||m.file,textureFile:texture?.name||m.textureFile,textureFilter:water.textureFilter||m.textureFilter};
    }
    const particles=obj.components.particles?normalizedParticles(obj.components.particles):null;
    if(particles?.renderMode==='mesh'){const pool=particleMeshAssetForSettings(particles,files,obj.id);files.push(pool);waterGeneratedAssets.push(pool);m={...m,file:pool.name};}
    const flipbook=obj.components.textureAnimation?normalizedFlipbook(obj.components.textureAnimation):null;
    const reflection=obj.components.reflection;
    const mutableProfile=water ? `|water:${waterGeometryProfile(water)}` : particles?'|particles:'+obj.id+':'+JSON.stringify(particles):flipbook?'|flipbook:'+JSON.stringify(flipbook):'';
    const profile = mutableProfile+
      (reflection?'|reflection:'+JSON.stringify(reflection):'');
    const key = rdKeyOf(m) + profile;
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
          tex = { file: texFile, filter, asset:waterGeneratedAssets.find(a=>a.cat==='textures'&&a.name===texFile), imageSize:fileByName(texFile)?.image||fileByName(texFile)?.imageSize, vn: names.take(`${tbase}_tex`, "mesh_tex") };
          texByKey.set(tkey, tex);
          textures.push(tex);
        }
      }

      const waterFrames = [];
      if(water && tex)for(const asset of waterFrameAssets(fileByName(texFile),files)){
        const tkey=asset.name+'|'+tex.filter;let frame=texByKey.get(tkey);
        if(!frame){frame={file:asset.name,filter:tex.filter,vn:names.take(ident(asset.name)+'_tex','water_frame'),asset};texByKey.set(tkey,frame);textures.push(frame);}
        waterFrames.push(frame);
      }
      // The first RenderData over a given mesh+texture does the upload; any
      // later one that differs only in its settings clones it.
      // Animated water owns its vertex arrays. Material-only clones share those
      // arrays, so distinct water RenderDatas must load independent geometry.
      const upload = uploadKeyOf(m) + (water||particles||flipbook ? profile+rdKeyOf(m) : "");
      // Native clones share indexed skin/skeleton pointers; their destructor owns
      // those pointers. Keep GLTF variants independently owned to prevent double frees.
      const source = /\.obj$/i.test(m.file)?sourceByUpload.get(upload)||null:null;

      let refTex=null;
      if(reflection?.texture){
        const file=reflection.texture,filter=reflection.filter||'LINEAR',tkey=file+'|'+filter;
        refTex=texByKey.get(tkey);
        if(!refTex){refTex={file,filter,vn:names.take(ident(file)+'_reflection','reflection_tex')};texByKey.set(tkey,refTex);textures.push(refTex);}
      }
      rd = {
        key,
        model: m,
        refTex,
        vertexColors:fileByName(m.file)?.vertexColors||null,
        water, waterFrames, waterFrameRate: fileByName(texFile)?.waterMotion?.fps || 16,
        flipbook,flipbookVN:flipbook?names.take(base+'_flipbook','flipbook'):null,
        waterVN: water ? names.take(`${base}_water`,"water_state") : null,
        waterBuffersVN: water ? names.take(`${base}_waterBuffers`,"water_buffers") : null,
        dataVN: names.take(`${base}_data`, "mesh_data"),
        tex,
        texVN: tex?.vn || null,
        cloneOf: source ? source.dataVN : null,
      };
      if (!source) sourceByUpload.set(upload, rd);
      if(water&&fileByName(m.file)?.content){
        const cache=buildWaterGeometryCache(readMeshOBJ(fileByName(m.file).content),water,!!refTex);
        if(cache){
          const name=freeAssetName([...files,...waterGeneratedAssets],base+'_motion_'+renderDatas.length,'bin');
          waterGeneratedAssets.push({cat:'models',name,dataUrl:bytesDataURL(new Uint8Array(cache.buffer.buffer),'application/octet-stream')});
          const {buffer,...metadata}=cache;rd.waterCache={...metadata,file:name};
        }
      }
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

    models.push({ obj, vn: names.take(obj.name, "model"), rd, world, anim,particles,particleVN:particles?names.take(obj.name+'_particles','particle_state'):null });
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
  const ensureScript = (fname, forObj, defaultSource) => {
    if (!scriptByName.has(fname)) {
      const alias = ident(fname.replace(/\.js$/i, ""), "script");
      // A file on disk beats the copy carried inside the project, so editing
      // a template's controller externally just works.
      const uploaded = files.find((f) => f.name === fname && f.cat === "scripts");
      const embedded = (project.scripts || []).find((s) => s.name === fname);
      if (!uploaded && !embedded && !defaultSource) {
        problem("error", `Script "${fname}" is not in the project folder. Import it or remove its attachment.`, forObj, "script");
      }
      const entry = {
        name: fname,
        alias: `${alias}_${scriptByName.size}`,
        content: repairedEventPresetSource(uploaded?.content ?? embedded?.content ?? defaultSource ??
          `// ${fname} — not found when this project was exported.\n` +
          `export function init(ctx) { throw new Error("Missing script: ${jsStr(fname)}"); }\n` +
          `export function update(ctx, pad) {}\n`),
      };
      scriptByName.set(fname, entry);
      scriptFiles.push(entry);
    }
    return scriptByName.get(fname);
  };

  const ctxKeyOwner = new Map();
  for (const obj of objects) {
    if (!has(obj, "script")) continue;
    // AthenaEnv has one global Camera. Only the selected camera's controller
    // may drive it; inactive camera controllers would overwrite that view.
    if(has(obj,'camera')&&obj.id!==camObj?.id)continue;
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
        ctxKey: rb.collisionEvents ? physicsEventKey(obj) : null,
      });
    }
    if (!bodies.length) {
      problem("info", "Physics is enabled but no object has a Rigidbody — no ODE world is created.");
    }
  } else if (objects.some((o) => has(o, "rigidbody"))) {
    problem("warn", "Objects have Rigidbody components but scene physics is off — they will not be exported.", null, "rigidbody");
  }

  diagnostics.push(...physicsEventKeyProblems(bodies.map(b => b.obj)));
  for (const body of bodies) {
    if (body.events && PHYSICS_CTX_HANDLES.has(body.ctxKey)) {
      body.events = false;
      body.ctxKey = null;
    }
  }

  // ── shadows ──────────────────────────────────────────────────────────
  const shadows = [], shadowReceivers = [], receiverSets = new Map();
  for (const obj of objects) {
    if (!has(obj, "shadow")) continue;
    const sh = obj.components.shadow;
    const src = sh.source || "rendertarget";
    const world = worlds.get(obj.id);

    const wanted = (sh.caster || "").trim();
    const caster = obj._waterOwner ? models.find(m=>m.obj.id===obj._waterOwner) : wanted ? modelByName(wanted) : models.find((m) => m.obj.id === obj.id) || null;
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

    const receivers = sh.raycast ? shadowReceiverBodies(scene.objects || [], bodies, caster?.obj.id || obj.id).filter(b=>!obj._waterOwner||!b.isDynamic) : [];
    if (sh.raycast && !receivers.length) {
      problem("warn", "Shadow draping needs enabled physics and an exported solid receiver collider outside the caster — using Ground Y for this shadow.", obj, "shadow");
    }
    let receiverSet = null;
    if (receivers.length) {
      const key = JSON.stringify(receivers.map(b => b.obj.id));
      receiverSet = receiverSets.get(key);
      if (!receiverSet) {
        receiverSet = { vn: names.take(`${obj.name}_shadowSpace`, 'shadow_space'), bodies: receivers.map(b => ({ body: b, vn: names.take(`${obj.name}_${b.obj.name}_receiver`, 'shadow_receiver') })) };
        receiverSets.set(key, receiverSet); shadowReceivers.push(receiverSet);
      }
    }

    // Where the decal goes, how big it is and how far it turns — all of it
    // derived in one place, shared with the viewport overlay so what you aim
    // in the editor is what the PS2 draws. See src/core/shadowmath.js.
    const casterScale = caster?.world?.scale || { x: 1, y: 1, z: 1 };
    const casterBounds = caster ? fileByName(caster.obj.components.model.file)?.bounds : null;
    const proj = shadowProjection(sh, dir, casterBounds, casterScale, camera.near);
    for (const n of proj.notes) problem(n.level, `"${obj.name}": ${n.message}`, obj, "shadow");

    let blobTexture = null;
    if (src !== "rendertarget") {
      const key = `${sh.texture}|LINEAR`;
      blobTexture = texByKey.get(key);
      if (!blobTexture) {
        blobTexture = { file:sh.texture, filter:"LINEAR", vn:names.take(`${obj.name}_blobTex`,"shadow_texture") };
        texByKey.set(key,blobTexture); textures.push(blobTexture);
      }
    }
    const vn = names.take(`${obj.name}_shadow`, "shadow");
    shadows.push({
      obj, sh, src, caster, world,
      caustics: !!obj._waterOwner,
      causticClockVN: obj._waterOwner ? names.take(`${obj.name}_clock`,"caustic_clock") : null,
      vn,
      matrixVN: names.take(`${obj.name}_shadowMatrix`, "shadow_matrix"),
      rtVN: blobTexture?.vn || names.take(`${obj.name}_rt`, "shadow_rt"),
      rtPx: clamp(sh.rtSize || 128, 32, 512),
      proj,
      // The elevation-clamped light is what the engine is given, so everything
      // downstream agrees with what the decal was built for.
      lightDir: proj.L,
      raycast: !!receiverSet,
      receivers: receiverSet,
    });
  }
  const shadowPasses = shadows.filter((s) => s.src === "rendertarget");
  for(const shadow of shadows.filter(s=>s.caustics)){
    const baked=bakeWaterCausticMesh(shadow.caster,models,files,shadow.receivers?.bodies.map(b=>b.body)),file=freeAssetName([...files,...waterGeneratedAssets],shadow.caster.obj.name+'_caustics_surface','obj');
    waterGeneratedAssets.push({name:file,cat:'models',content:baked.mesh});
    shadow.cachedCaustics={file,receivers:baked.receivers,grid:baked.grid,dataVN:names.take(shadow.obj.name+'_cachedData','caustic_data'),vn:names.take(shadow.obj.name+'_cached','caustic_model'),stateVN:names.take(shadow.obj.name+'_cacheState','caustic_state')};
  }

  // VRAM is 4 MB total and locked render targets never come back.
  const rtBytes = shadowPasses.reduce(
    (n, s) => n + s.rtPx * s.rtPx * ((s.sh.rtBpp || 32) / 8), 0,
  );

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

  const fog=scene.environment?.fog?.enabled?normalizedSceneFog(scene.environment.fog):{enabled:false},fogMeshes=[],fogModels=[],fogFiles=new Map();
  if(fog.enabled)for(const m of models){
    const source=fileByName(m.obj.components.model.file);
    if(m.rd.water||m.particles||m.anim||m.obj.components.rigidbody?.mode==='dynamic'||!source?.content||!/\.obj$/i.test(source.name))continue;
    let mesh=fogFiles.get(source.name);
    if(!mesh){
      const parsed=readMeshOBJ(source.content);parsed.materialLibraries=[];parsed.materials=parsed.materials.map(()=> '');
      const name=freeAssetName([...files,...fogMeshes],source.name.replace(/\.[^.]+$/,'')+'_fog','obj');
      mesh={name,content:writeMeshOBJ(parsed,'Fog')};fogMeshes.push(mesh);fogFiles.set(source.name,mesh);
    }
    fogModels.push({model:m,mesh,stateVN:names.take(m.obj.name+'_fogState','fog_state'),dataVN:names.take(m.obj.name+'_fogData','fog_data'),vn:names.take(m.obj.name+'_fog','fog_model')});
  }
  const ir = {
    project, scene, names, diagnostics,
    skybox: resolveSkybox(scene, files, names, textures, problem),
    camera, overlayFont, textures, renderDatas, models, anims, lights, sounds,
    fog,fogMeshes,fogModels,waterGeneratedAssets,
    scripts: { files: scriptFiles, bindings },
    physics: {
      enabled: !!ph.enabled && bodies.length > 0,
      settings: ph,
      bodies,
      anyEvents: bodies.some((b) => b.events),
      anyDynamic: bodies.some((b) => b.isDynamic),
    },
    shadows, shadowPasses, shadowReceivers, rtBytes,
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
  ir.eventActions = resolveEventPresets(ir, ensureScript, names, problem);
  ir.canDestroy = ir.eventActions.some(a => a.preset === "destroyObject");
  ir.objects = objects;
  ir.eventFlows=resolveEventFlows(ir,names);
  ir.canDestroy ||= ir.eventFlows.enabled;
  ir.cinematics = typeof resolveCinematics === "function" ? resolveCinematics(ir, names, files) : {enabled:false};
  return ir;
}
