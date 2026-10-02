// ═══════════════════════════════════════════════════════════════════════
//  MODELS — textures (shared) + RenderData (shared or cloned) + RenderObjects
//
//  VRAM is 4 MB and an uploaded texture never comes back, so nothing here is
//  uploaded twice if it can be helped:
//
//   * `new Image(file)` runs once per file+filter, however many meshes use it.
//     Three models sharing one atlas used to cost three copies of it, which is
//     how a scene with a handful of objects ran the console out of memory.
//   * A second RenderData over a mesh that is already loaded — which is what
//     two objects wanting different shading need — is a `.clone()`. That
//     shares the vertex buffers and the texture pointers and copies only the
//     materials (athena_renderdata_clone, ath_render.c:1067), and it holds a
//     `__source` reference so the geometry outlives it.
//
//  The dedup itself is decided in codegen/resolve.js; this only writes it out.
// ═══════════════════════════════════════════════════════════════════════

function emitRenderDatas(e, ir) {
  if (!ir.renderDatas.length) return;
  e.section("Meshes — one upload per mesh, one Image per texture");
  e.w(`os.chdir("${jsStr(ir.dirs.models)}");`);
  e.nl();

  for (const t of ir.textures) emitTexture(e, ir, t);

  for (const rd of ir.renderDatas) {
    const m = rd.model;

    if (rd.cloneOf) {
      // Same mesh, same texture, different settings: share both and pay only
      // for a copy of the material list.
      e.comment(`${m.file} again with different settings — shares ${rd.cloneOf}'s geometry and texture`);
      e.w(`const ${rd.dataVN} = ${rd.cloneOf}.clone();`);
    } else {
      e.w(`const ${rd.dataVN} = new RenderData("${jsStr(m.file)}"${rd.texVN ? `, ${rd.texVN}` : ""});`);
    }
    e.w(`${rd.dataVN}.pipeline = Render.${m.pipeline || "PL_DEFAULT"};`);
    e.w(`${rd.dataVN}.face_culling = Render.${m.face_culling || "CULL_FACE_BACK"};`);
    e.w(`${rd.dataVN}.shade_model = Render.${m.shade_model || "SHADE_GOURAUD"};`);
    e.w(`${rd.dataVN}.texture_mapping = ${m.texture_mapping !== false};`);
    e.w(`${rd.dataVN}.accurate_clipping = ${!!m.accurate_clipping};`);
    if (!rd.texVN && !rd.cloneOf) {
      // Meshes that carry their own embedded texture (GLTF) still want the
      // filter. A clone shares that texture, so setting it again is redundant.
      e.w(`try { ${rd.dataVN}.getTexture(0).filter = ${m.textureFilter || "LINEAR"}; } catch (_e) {}`);
    }
    e.nl();
  }

  for (const a of ir.anims) e.w(`const ${a.vn} = new AnimCollection("${jsStr(a.file)}");`);
  if (ir.anims.length) e.nl();

  e.section("Objects");
  for (const m of ir.models) {
    const t = m.world;
    e.w(`const ${m.vn} = new RenderObject(${m.rd.dataVN});`);
    e.w(`${m.vn}.position = {x: ${f3(t.position.x)}, y: ${f3(t.position.y)}, z: ${f3(t.position.z)}};`);
    e.w(`${m.vn}.rotation = {x: ${f3(t.rotation.x)}, y: ${f3(t.rotation.y)}, z: ${f3(t.rotation.z)}};`);
    e.w(`${m.vn}.scale    = {x: ${f3(t.scale.x)}, y: ${f3(t.scale.y)}, z: ${f3(t.scale.z)}};`);
    if (m.anim?.clip) {
      e.w(`${m.vn}.playAnim(${m.anim.vn}["${jsStr(m.anim.clip)}"], ${m.anim.loop});`);
    }
    e.nl();
  }

  e.w(`os.chdir("..");`);
  e.nl();
}

/**
 * One shared Image per texture file.
 *
 * Textures live beside the mesh in most projects, but the editor also supports
 * a shared textures/ folder, so probe both before giving up. Emitted from
 * inside the models directory, which is where the caller has already chdir'd.
 */
function emitTexture(e, ir, t) {
  e.w(`let ${t.vn} = null;`);
  e.w(`{`);
  e.block((b) => {
    b.w(`const _f = std.open("${jsStr(t.file)}", "r");`);
    b.w(`if (_f) { _f.close(); ${t.vn} = new Image("${jsStr(t.file)}"); }`);
    b.w(`else {`);
    b.block((c) => {
      c.w(`os.chdir(".."); os.chdir("${jsStr(ir.dirs.textures)}");`);
      c.w(`const _g = std.open("${jsStr(t.file)}", "r");`);
      c.w(`if (_g) { _g.close(); ${t.vn} = new Image("${jsStr(t.file)}"); }`);
      c.w(`os.chdir(".."); os.chdir("${jsStr(ir.dirs.models)}");`);
    });
    b.w(`}`);
  });
  e.w(`}`);
  e.w(`if (${t.vn}) ${t.vn}.filter = ${t.filter};`);
  e.nl();
}

/** Draw calls, emitted inside the frame loop. */
function emitModelDraws(e, ir) {
  if (!ir.models.length) return;
  e.comment("Opaque geometry");
  for (const m of ir.models) e.w(`${m.vn}.render();`);
  e.nl();
}
