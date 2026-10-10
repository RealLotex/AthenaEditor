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
  if (!ir.renderDatas.length) {
    for(const t of ir.textures) e.w(`const ${t.vn} = new Image("${jsStr(ir.dirs.textures)}/${jsStr(t.file)}");`);
    return;
  }
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
    // Render does not export SHADE_* in the release (ath_render.c render_funcs).
    // Undefined becomes 0 in JS_ToUint32: both choices used to select Flat.
    // render.h's GS IIP enum is Flat=0, Gouraud=1.
    e.w(`${rd.dataVN}.shade_model = ${m.shade_model === "SHADE_FLAT" ? 0 : 1};`);
    e.w(`${rd.dataVN}.texture_mapping = ${m.texture_mapping !== false};`);
    e.w(`${rd.dataVN}.accurate_clipping = ${!!m.accurate_clipping};`);
    if(rd.vertexColors){
      // loadOBJ ignores OBJ RGB extensions (mesh_loaders.c:154). Copy the
      // baked corner colors into borrowed buffers. The unlit VU adds diffuse
      // to vertex RGB, so neutralize diffuse without changing opaque alpha.
      e.w(`{`);
      e.block(b=>{
        // The released QuickJS compiler drops entries from long array literals.
        // JSON parsing preserves every corner and runs only during mesh setup.
        const baked=JSON.stringify(rd.vertexColors.map(n=>clamp(num(n,0),0,1)));
        b.w(`const colors=new Float32Array(${rd.dataVN}.vertices.colors), baked=JSON.parse(${JSON.stringify(baked)});`);
        b.w(`if(colors.length/4 !== baked.length/3)throw Error("Vertex color count does not match the mesh.");`);
        b.w(`for(let i=0,n=${rd.dataVN}.materials.length;i<n;i++)${rd.dataVN}.updateMaterial(i,{diffuse:{r:0,g:0,b:0}});`);
        b.w(`for(let i=0;i<baked.length/3;i++){colors[i*4]=baked[i*3];colors[i*4+1]=baked[i*3+1];colors[i*4+2]=baked[i*3+2];colors[i*4+3]=0;}`);
      });e.w(`}`);
      e.w(`${rd.dataVN}.pipeline=Render.${m.pipeline || "PL_DEFAULT"};`);
    }
    if (!rd.texVN && !rd.cloneOf) {
      // Meshes that carry their own embedded texture (GLTF) still want the
      // filter. A clone shares that texture, so setting it again is redundant.
      e.w(`for (let _i = 0, _tex; (_tex = ${rd.dataVN}.getTexture(_i)); _i++) _tex.filter = ${m.textureFilter || "LINEAR"};`);
    }
    e.nl();
  }

  // Every RenderData(image) constructor forces GS_FILTER_LINEAR in ath_render.c.
  // Restore filters after ALL constructors, including meshes sharing one Image.
  for (const t of ir.textures) e.w(`if (${t.vn}) ${t.vn}.filter = ${t.filter};`);
  if (ir.textures.length) e.nl();

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
  e.nl();
}

/** Draw calls, emitted inside the frame loop. */
function emitModelDraws(e, ir) {
  if (!ir.models.length) return;
  e.comment("Opaque geometry");
  for (const m of ir.models.filter(m=>(!m.rd.water||!m.rd.water.quality.transparency)&&!m.particles)) e.w(`${ir.cinematics?.enabled ? `if (${m.vn}.visible !== false${ir.canDestroy ? ` && !${m.vn}._destroyed` : ""}) ` : ir.canDestroy ? `if (!${m.vn}._destroyed) ` : ""}${m.vn}.render();`);
  e.nl();
}
