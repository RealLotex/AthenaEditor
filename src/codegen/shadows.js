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
  if (passes.length) {
    e.comment(
      `${passes.length} offscreen target(s), ${(ir.rtBytes / 1024).toFixed(0)} KB of VRAM locked.`,
      "Context 2 is aimed at the render target; the main frame keeps context 1.",
    );
  }

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
    } else {
      e.w(`os.chdir("${jsStr(ir.dirs.textures)}");`);
      e.w(`const ${s.rtVN} = new Image("${jsStr(sh.texture)}");`);
      e.w(`${s.rtVN}.filter = LINEAR;`);
      e.w(`${s.rtVN}.lock();`);
      e.w(`os.chdir("..");`);
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

    e.w(`const ${s.vn} = new Shadows.Projector(${s.rtVN});`);
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
      e.w(`${s.vn}.enableRaycast(ode_space, 1, ${fl(sh.rayLength ?? 12)});`);
    }
    e.w(`${s.vn}.setBlend(Shadows.${sh.blend || "SHADOW_BLEND_DARKEN"});`);

    const groundY = sh.groundY ?? 0;
    const origin = sh.follow && s.caster ? s.caster.world.position : s.world.position;
    const ground = shadowGroundPoint(p, origin, groundY);
    const matrix = shadowMatrixFor(p, ground, groundY);
    e.w(`const ${s.matrixVN} = [${matrix.map(f6).join(", ")}];`);
    e.w(`${s.vn}.setTransform(${s.matrixVN});`);
    e.nl();
  }

  if (passes.length) emitShadowPass(e, ir);
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
      b.w(`${data.dataVN}.shade_model = Render.SHADE_FLAT;`);
      b.w(`${data.dataVN}.pipeline = Render.PL_NO_LIGHTS;`);
      b.w(`${s.caster.vn}.render();`);
      b.w(`${data.dataVN}.texture_mapping = ${m.texture_mapping !== false};`);
      b.w(`${data.dataVN}.shade_model = Render.${m.shade_model || "SHADE_GOURAUD"};`);
      b.w(`${data.dataVN}.pipeline = Render.${m.pipeline || "PL_DEFAULT"};`);
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
  for (const s of ir.shadows) {
    if (s.sh.follow && s.caster) emitFollowPlacement(e, s);
    e.w(`${s.vn}.render();`);
  }
  e.nl();
}

/** Update only the translation of the reusable world-space matrix. */
function emitFollowPlacement(e, s) {
  const p = s.proj;
  const groundY = s.sh.groundY ?? 0;
  e.w(`{`);
  e.block((b) => {
    b.w(`const _c = ${s.caster.vn}.position;`);
    b.w(`const _t = (_c.y - ${f6(groundY)}) * ${f6(1 / p.L.y)};`);
    b.w(`${s.matrixVN}[12] = _c.x ${signed(-p.L.x)} * _t;`);
    b.w(`${s.matrixVN}[14] = _c.z ${signed(-p.L.z)} * _t;`);
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
