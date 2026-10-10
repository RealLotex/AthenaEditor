// ═══════════════════════════════════════════════════════════════════════
//  SHADOWS — Shadows.Projector
//
//  A projector is a tesselated quad that samples a texture and blends it over
//  the ground. The texture is either a static blob or, in "rendertarget"
//  mode, an offscreen buffer holding the caster's silhouette rendered from
//  the light.
//
//  Geometry is shared with the viewport in core/shadowmath.js. A direct
//  matrix keeps rotation and world translation independent.
//
//  Three things about the offscreen pass come from the engine's own
//  bin/shadows.js and are load-bearing:
//
//   1. It uses Screen.switchContext(), not a save/restore of the draw buffer.
//      The GS has two contexts, each with its own FRAME and ZBUF registers, so
//      context 2 can be pointed at the render target once during setup and
//      simply switched to each frame.
//
//   2. The target is cleared with Draw.rect, never Screen.clear. clearScreen
//      rasterises pages sized from the *main* framebuffer, so clearing a
//      128x128 target would write far past the end of it.
//
//   3. Render.setView takes optional width/height — Render.setView(fov, near,
//      far, w, h) — to size the projection to the target.
//
//  Ordering rules, all from src/shadows.c and all easy to get wrong:
//
//   * setColor() must precede the LAST call that rebuilds geometry
//     (setGrid / setUVRect). Vertex colours are baked during the rebuild.
//   * Call setTransform after the last rebuild. A rebuild runs
//     new_render_object (src/render.c:247) and copies p->transform into
//     obj.transform — and
//     obj.transform is uploaded to VU1 and applied to vertices the projector
//     has already placed in world space. Set the matrix first and the decal is
//     transformed twice.
//   * enableRaycast is (space, enable, rayLength) — ath_shadows.c:169 reads
//     argv[1] as the enable flag and argv[2] as the length.
//   * Camera.target() drags the camera position with it (src/camera.c:63), so
//     the silhouette camera is aimed before it is placed.
// ═══════════════════════════════════════════════════════════════════════

function emitShadowSetup(e, ir) {
  if (!ir.shadows.length) return;

  const passes = ir.shadowPasses;

  e.section("Shadows");
  emitShadowReceivers(e, ir);
  if (passes.length) {
    e.comment(
      `${passes.length} offscreen target(s), ${(ir.rtBytes / 1024).toFixed(0)} KB of VRAM locked.`,
      "Context 2 is aimed at the render target; the main frame keeps context 1.",
    );
  }

  if(ir.shadows.some(s=>s.src!=='rendertarget'))e.w('let _blobImagesReady = false;');
  const lockedBlobs = new Set();
  for (const s of ir.shadows) {
    const sh = s.sh;
    e.comment(`${s.obj.name}${s.caster ? ` — casting ${s.caster.obj.name}` : " — blob"}`);
    if (s.src === "rendertarget") {
      const px = il(s.rtPx);
      e.w(`const ${s.rtVN} = new Image();`);
      e.w(`${s.rtVN}.filter     = LINEAR;`);
      e.w(`${s.rtVN}.renderable = true;`);
      e.w(`${s.rtVN}.bpp        = ${il(sh.rtBpp || 32)};`);
      e.w(`${s.rtVN}.texWidth   = ${px};  ${s.rtVN}.texHeight = ${px};`);
      e.w(`${s.rtVN}.width      = ${px};  ${s.rtVN}.height    = ${px};`);
      e.w(`${s.rtVN}.endx       = ${px};  ${s.rtVN}.endy      = ${px};`);
      e.w(`${s.rtVN}.lock();`);
    } else if (!lockedBlobs.has(s.rtVN)) {
      e.w(`${s.rtVN}.filter = LINEAR;`);
      lockedBlobs.add(s.rtVN);
    }
    e.nl();
  }

  if (passes.length) {
    e.comment("Configure context 2 once: no depth test, z-writes masked off.");
    e.w(`Screen.switchContext();`);
    e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 1);`);
    e.w(`Screen.setParam(Screen.DEPTH_TEST_ENABLE, false);`);
    e.w(`Screen.switchContext();`);
    e.nl();
  }

  for (const s of ir.shadows) {
    const sh = s.sh;
    const p = s.proj;
    const grid = sh.grid || { x: 12, z: 12 };
    const col = sh.color || { r: 0, g: 0, b: 0, a: 0.65 };

    e.w(`${s.raycast ? 'let' : 'const'} ${s.vn} = new Shadows.Projector(${s.rtVN});`);
    if (s.src === "rendertarget") {
      e.comment(
        `Extent ${fl(p.extent)} across the light, ${fl(p.sizeZ)} along it — the ${fl(p.stretch)}x`,
        `foreshortening of a light ${f3((Math.asin(clamp(p.L.y, -1, 1)) * 180) / Math.PI)} degrees above the horizon.`,
      );
    }
    e.w(`${s.vn}.setSize(${fl(p.sizeX)}, ${fl(p.sizeZ)});`);
    e.comment("setColor before the last rebuild — vertex colours are baked there");
    e.w(`${s.vn}.setColor(${fl(col.r)}, ${fl(col.g)}, ${fl(col.b)}, ${fl(col.a)});`);
    e.w(`${s.vn}.setGrid(${il(Math.max(2, grid.x | 0))}, ${il(Math.max(2, grid.z | 0))});`);
    if (s.caustics) {
      e.w(`const ${s.causticClockVN} = new Float64Array([0,0.1]);`);
      e.w(`${s.vn}.setUVRect(0, 0, ${fl(s.caster.rd.water.tiling)}, ${fl(s.caster.rd.water.tiling)});`);
    }
    e.w(`${s.vn}.setLightDir(${f6(p.L.x)}, ${f6(p.L.y)}, ${f6(p.L.z)});`);
    e.w(`${s.vn}.setLightOffset(${fl(sh.lightOffset ?? 0)});`);
    if (s.raycast) {
      // Bias only reaches the output through the raycast hit path in
      // shadow_projector_render, so there is no point emitting it otherwise.
      e.w(`${s.vn}.setBias(${fl(sh.bias ?? -0.02)});`);
      // The engine treats any value > -0.5 as "filter enabled", so only emit it
      // when the user actually wants a slope limit.
      if ((sh.slopeLimit ?? -1) > -0.5) e.w(`${s.vn}.setSlopeLimit(${fl(sh.slopeLimit)});`);
      e.comment("enableRaycast(space, enable, rayLength) — enable is the middle argument");
      e.w(`${s.vn}.enableRaycast(${s.receivers.vn}, 1, ${fl(Math.max(0.01, num(sh.rayLength, 12)))});`);
    }
    e.w(`${s.vn}.setBlend(Shadows.${sh.blend || "SHADOW_BLEND_DARKEN"});`);

    const groundY = sh.groundY ?? 0;
    const origin = sh.follow && s.caster ? s.caster.world.position : s.world.position;
    const ground = shadowGroundPoint(p, origin, groundY);
    const matrix = s.raycast ? shadowRayMatrixFor(p, origin, sh.rayLength) : shadowMatrixFor(p, ground, groundY);
    e.w(`const ${s.matrixVN} = [${matrix.map(f6).join(", ")}];`);
    e.w(`${s.vn}.setTransform(${s.matrixVN});`);
    e.nl();
  }

  if (passes.length) emitShadowPass(e, ir);
  if (ir.shadowReceivers.length) emitShadowDisposal(e, ir);
}

/** Native Projector creates its ray inside the supplied space (shadows.c:175).
 * Keep that space out of the solver, and omit the caster's entire physics actor.
 * Identical receiver sets share their space and its collider proxies. */
function emitShadowReceivers(e, ir) {
  for (const group of ir.shadowReceivers) {
    e.w(`const ${group.vn} = ODE.Space();`);
    for (const {body: b, vn} of group.bodies) {
      emitColliderGeometry(e, b, group.vn, vn);
      if (b.isDynamic) e.w(`${vn}.setBody(${b.bodyVN});`);
      else if (b.shape !== 'plane') e.w(`${vn}.setPosition(${f3(b.world.position.x)}, ${f3(b.world.position.y)}, ${f3(b.world.position.z)});`);
    }
  }
  if (!ir.shadowReceivers.length) return;
  e.w(`function _syncShadowReceivers() {`);
  e.block(b => {
    for (const group of ir.shadowReceivers) for (const {body: source, vn} of group.bodies) {
      b.w(`if (!${vn}._destroyed) {`);
      b.block(x => {
        if (ir.canDestroy) {
          x.w(`if (${source.geomVN}._destroyed) { ${vn}.free(); ${vn}._destroyed = true; }`);
          x.w(`else {`);
        }
        if (!source.isDynamic && source.shape !== 'plane') {
          x.w(`const p = ${source.geomVN}.getPosition();`);
          x.w(`${source.geomVN}._shadowPosition=p;`);
          x.w(`${vn}.setPosition(p[0], p[1], p[2]);`);
        }
        if (ir.canDestroy) x.w(`}`);
      });
      b.w(`}`);
    }
  });
  e.w(`}`);
}

/** Release projectors first: their finalizers own rays inside receiver spaces.
 * Freeing a space first would destroy that ray twice (shadows.c / ath_ode.c).
 * The separate call scope drops temporary references before std.gc(). */
function emitShadowDisposal(e, ir) {
  e.w(`function _releaseShadowProjectors() {`);
  e.block(b => {
    b.w(`if (typeof ctx !== "undefined") ctx.shadows = {};`);
    for (const s of ir.shadows.filter(s => s.raycast)) {
      if (ir.canDestroy) b.w(`for (const object of _runtimeObjects.values()) object.visuals = object.visuals.filter(v => v !== ${s.vn});`);
      b.w(`${s.vn} = null;`);
    }
  });
  e.w(`}`);
  e.w(`function _disposeShadows() {`);
  e.block(b => {
    b.w(`_releaseShadowProjectors();`);
    b.w(`std.gc();`);
    for (const group of ir.shadowReceivers) {
      for (const {vn} of group.bodies) b.w(`if (!${vn}._destroyed) { ${vn}.free(); ${vn}._destroyed = true; }`);
      b.w(`${group.vn}.free();`);
    }
  });
  e.w(`}`);
}

function emitShadowPass(e, ir) {
  const cam = ir.camera;
  e.comment(
    "Render each caster's silhouette into its target, seen from the light.",
    "The decal below is turned and stretched to match what this camera saw;",
    "the two are derived together in src/core/shadowmath.js.",
  );
  e.w(`function _shadowPass() {`);
  e.block((b) => {
    b.w(`const _mainCam = Camera.save();`);
    b.w(`Screen.switchContext();`);
    b.nl();

    for (const s of ir.shadowPasses) {
      const px = il(s.rtPx);
      const p = s.proj;
      const data = s.caster.rd;
      const m = s.caster.rd.model;
      const d = p.camDist;

      b.comment(`${s.obj.name} <- ${s.caster.obj.name}`);
      if (ir.canDestroy) b.w(`if (!${s.caster.vn}._destroyed && !${s.vn}._destroyed) {`);
      b.w(`Screen.setBuffer(Screen.DRAW_BUFFER, ${s.rtVN});`);
      b.w(`Draw.rect(0, 0, ${px}, ${px}, Color.new(0, 0, 0, 0));`);
      b.w(`Render.setView(${fl(p.camFov)}, ${fl(cam.near)}, ${fl(cam.far)}, ${px}, ${px});`);
      b.w(`{`);
      b.block((x) => {
        x.w(`const _c = ${s.caster.vn}.position;`);
        // Camera.target() drags the camera by the target delta (setCameraTarget
        // in src/camera.c), so it has to run BEFORE Camera.position() or it
        // moves the position that was just set.
        x.w(`Camera.target(_c.x, _c.y, _c.z);`);
        if (p.planView) {
          x.comment(`${fl(p.camTilt)} on Z keeps cross(up, forward) from collapsing`);
          x.w(`Camera.position(_c.x, _c.y + ${fl(d)}, _c.z + ${fl(p.camTilt)});`);
        } else {
          x.w(`Camera.position(_c.x + ${fl(p.L.x * d)}, _c.y + ${fl(p.L.y * d)}, _c.z + ${fl(p.L.z * d)});`);
        }
        x.w(`Camera.update();`);
      });
      b.w(`}`);
      b.comment("Flatten the caster to a solid silhouette, then put it back");
      b.w(`${data.dataVN}.texture_mapping = false;`);
      b.w(`${data.dataVN}.shade_model = 0;`);
      b.w(`${data.dataVN}.pipeline = Render.PL_NO_LIGHTS;`);
      b.w(`${s.caster.vn}.render();`);
      b.w(`${data.dataVN}.texture_mapping = ${m.texture_mapping !== false};`);
      b.w(`${data.dataVN}.shade_model = ${m.shade_model === "SHADE_FLAT" ? 0 : 1};`);
      b.w(`${data.dataVN}.pipeline = Render.${m.pipeline || "PL_DEFAULT"};`);
      if (ir.canDestroy) b.w(`}`);
      b.nl();
    }

    b.comment("Back to the main framebuffer and camera");
    b.w(`Screen.switchContext();`);
    b.w(`Camera.restore(_mainCam);`);
    b.w(`Camera.update();`);
    b.w(`Render.setView(${fl(cam.fov)}, ${fl(cam.near)}, ${fl(cam.far)});`);
  });
  e.w(`}`);
  e.nl();
}

/** Projector draws — inside the loop, after opaque geometry, depth test on. */
function emitShadowDraws(e, ir) {
  if (!ir.shadows.length) return;
  e.comment("Shadow decals — drawn over opaque geometry with the depth test on");
  e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 1);Screen.setParam(Screen.ALPHA_TEST_REF,0);`);
  const blobs=[...new Set(ir.shadows.filter(s=>s.src!=="rendertarget").map(s=>s.rtVN))];
  if(blobs.length){
    // The release's 3D path can hang on a blob's first asynchronous upload.
    // Image.draw primes its VIF transfer; lock only after a block exists
    // (ath_image.c:149 / texture_manager.c:603). Alpha zero leaves no pixels.
    e.w(`if (!_blobImagesReady) {`);
    e.block(b=>{
      for(const name of blobs){
        b.w(`{ const color=${name}.color; ${name}.color=Color.new(0,0,0,0); ${name}.draw(0,0); ${name}.color=color; ${name}.lock(); }`);
      }
      b.w(`_blobImagesReady = true;`);
    });e.w(`}`);
  }
  if (ir.shadowReceivers.length) e.w(`_syncShadowReceivers();`);
  for (const s of [...ir.shadows.filter(s=>s.caustics),...ir.shadows.filter(s=>!s.caustics)]) {
    const guards=[];
    if (ir.canDestroy) guards.push(`!${s.vn}._destroyed`);
    if(s.caster)guards.push(`${s.caster.vn}.visible !== false`);
    if(guards.length)e.w(`if (${guards.join(" && ")}) {`);
    if(s.cachedCaustics){
      const c=s.cachedCaustics;
      e.w(`if(waterCausticCacheValid(${c.stateVN})){updateCachedCausticUVs(${c.stateVN},${s.caster.rd.waterVN});Screen.setParam(Screen.ALPHA_BLEND_EQUATION,{a:0,b:2,c:0,d:1,fix:0});${c.vn}.render();Screen.setParam(Screen.ALPHA_BLEND_EQUATION,{a:0,b:1,c:0,d:1,fix:0});}else{`);
    }
    if(s.caustics){
      const w=s.caster.rd.waterVN,tiling=fl(s.caster.rd.water.tiling);
      e.w(`${s.causticClockVN}[0] += ${ir.project.display?.mode === "PAL" ? "0.02" : "1/60"};`);
      e.w(`if (${s.causticClockVN}[0] >= ${s.causticClockVN}[1]) { ${s.causticClockVN}[0] %= ${s.causticClockVN}[1]; ${s.vn}.setUVRect(${w}.u, ${w}.v, ${w}.u + ${tiling}, ${w}.v + ${tiling}); }`);
    }
    if (s.sh.follow && s.caster) emitFollowPlacement(e, s);
    e.w(`${s.vn}.render();`);
    if(s.cachedCaustics)e.w(`}`);
    if (guards.length) e.w(`}`);
  }
  e.w(`Screen.setParam(Screen.ALPHA_TEST_REF,${il(ir.project.display?.alphaTest?.ref||0)});Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 0);`);
  e.nl();
}
/** Update only the translation of the reusable world-space matrix. */
function emitFollowPlacement(e, s) {
  const p = s.proj;
  const groundY = s.sh.groundY ?? 0;
  e.w(`{`);
  e.block((b) => {
    b.w(`const _c = ${s.caster.vn}.position;`);
    if (s.raycast) {
      const offset = shadowRayMatrixFor(p, {x:0,y:0,z:0}, s.sh.rayLength);
      b.w(`${s.matrixVN}[12] = _c.x ${signed(offset[12])};`);
      b.w(`${s.matrixVN}[13] = _c.y ${signed(offset[13])};`);
      b.w(`${s.matrixVN}[14] = _c.z ${signed(offset[14])};`);
    } else {
      b.w(`const _t = (_c.y - ${f6(groundY)}) * ${f6(1 / p.L.y)};`);
      b.w(`${s.matrixVN}[12] = _c.x ${signed(-p.L.x)} * _t;`);
      b.w(`${s.matrixVN}[14] = _c.z ${signed(-p.L.z)} * _t;`);
    }
    b.w(`${s.vn}.setTransform(${s.matrixVN});`);
  });
  e.w(`}`);
}

/**
 * A coefficient as its own sign plus magnitude, so the output reads
 * `a - 0.555 * b` rather than `a + -0.555 * b`.
 */
function signed(n) {
  const v = f6(n);
  return v < 0 ? `- ${f6(-v)}` : `+ ${v}`;
}
