function emitWaterSetup(e,ir) {
  const datas=ir.renderDatas.filter(rd=>rd.water);if(!datas.length)return;
  e.section("Water — shared small patterns, borrowed geometry, no framebuffer copies");
  for(const fn of [advanceCachedWaterArrays,updateWaterPositionFallback,updateWaterUVFallback])e.w(fn.toString());
  for(const rd of datas){
    const w=rd.water,vn=rd.waterVN,buffers=rd.waterBuffersVN;
    e.w(`${rd.dataVN}.pipeline = Render.PL_NO_LIGHTS;`);
    // colors.vcl adds material diffuse to vertex RGBA. updateMaterial fixes
    // diffuse alpha at one (ath_render.c:979), so the vertex subtracts it.
    e.w(`for(let i=0,n=${rd.dataVN}.materials.length;i<n;i++) ${rd.dataVN}.updateMaterial(i,{diffuse:{r:0,g:0,b:0}});`);
    e.w(`const ${buffers} = ${rd.dataVN}.vertices;`);
    e.w(`const ${vn} = {settings:${JSON.stringify(w)},positions:new Float32Array(${buffers}.positions),normals:${rd.refTex?`new Float32Array(${buffers}.normals)`:"null"},uvs:new Float32Array(${buffers}.texcoords),stride:4,uvStride:4,u:0,v:0,phase:0,waveClock:1,frameCount:${rd.waterFrames.length?rd.waterFrames.length+1:0},frameRate:${rd.waterFrameRate},textureFrame:0,previousFrame:0${rd.waterFrames.length?`,frames:[${[rd.texVN,...rd.waterFrames.map(t=>t.vn)].join(',')}]`:''}};`);
    e.w(`${vn}.basePositions = new Float32Array(${vn}.positions);`);
    e.w(`${vn}.baseUVs = new Float32Array(${vn}.uvs);`);
    if(rd.waterCache){
      const c=rd.waterCache;
      // std.File.read copies a binary ArrayBuffer directly (quickjs-libc.c:1178).
      e.w(`{const file=std.open("${jsStr(ir.dirs.models+'/'+c.file)}","rb"),buffer=new ArrayBuffer(${c.bytes});if(!file||file.read(buffer,0,${c.bytes})!==${c.bytes})throw Error("Water motion cache could not be loaded.");file.close();const cache=${JSON.stringify(c)};cache.clock=new Float64Array(4);cache.previousPosition=-1;`);
      for(const key of ['positions','uvs','normals'])e.w(`cache.${key}=${c[key+'Count']?`Array.from({length:${c[key+'Count']}},(_,i)=>new Float32Array(buffer,(${c[key+'Offset']}+i*${c.length})*4,${c.length}))`:'null'};`);
      e.w(`${vn}.cache=cache;}`);
    }
    e.w(`{ const colors = new Float32Array(${buffers}.colors); for(let i=0;i<colors.length;i+=4){colors[i]=${fl(w.color.r)};colors[i+1]=${fl(w.color.g)};colors[i+2]=${fl(w.color.b)};colors[i+3]=${fl(w.opacity-1)};} }`);
    e.w(`advanceWaterArrays(${vn},0);`);
  }
  e.w(prepareWaterArrays.toString());e.w(advanceWaterArrays.toString());
  e.w(`function _updateWater(dt) {`);
  e.block(b=>{for(const rd of datas){b.w(`advanceWaterArrays(${rd.waterVN},dt);`);if(rd.waterFrames.length)b.w(`if(${rd.waterVN}.textureFrame!==${rd.waterVN}.previousFrame){${rd.dataVN}.setTexture(0,${rd.waterVN}.frames[${rd.waterVN}.textureFrame]);${rd.waterVN}.previousFrame=${rd.waterVN}.textureFrame;}`);}});e.w(`}`);
  e.nl();
  const caustics=ir.shadows.filter(s=>s.cachedCaustics);
  if(caustics.length){
    e.w(waterCausticCacheValid.toString());e.w(updateCachedCausticUVs.toString());
    for(const s of caustics){
      const c=s.cachedCaustics,source=[s.caster,...c.receivers];
      e.w(`const ${c.dataVN}=new RenderData("${jsStr(ir.dirs.models+'/'+c.file)}",${s.rtVN});${c.dataVN}.pipeline=Render.PL_NO_LIGHTS;${c.dataVN}.face_culling=Render.CULL_FACE_NONE;${c.dataVN}.accurate_clipping=true;${c.dataVN}.shade_model=1;`);
      e.w(`for(let i=0,n=${c.dataVN}.materials.length;i<n;i++)${c.dataVN}.updateMaterial(i,{diffuse:{r:0,g:0,b:0}});`);
      e.w(`{const colors=new Float32Array(${c.dataVN}.vertices.colors);for(let i=0;i<colors.length;i+=4){colors[i]=colors[i+1]=colors[i+2]=1;colors[i+3]=${fl(s.caster.rd.water.causticStrength-1)};}}`);
      e.w(`const ${c.vn}=new RenderObject(${c.dataVN});const ${c.stateVN}={uvs:new Float32Array(${c.dataVN}.vertices.texcoords),sources:[${source.map(m=>`{object:${m.vn},position:${m.vn}.position,rotation:${m.vn}.rotation,scale:${m.vn}.scale}`).join(',')}]};${c.stateVN}.baseUVs=new Float32Array(${c.stateVN}.uvs);`);
    }
  }
}

function emitWaterReceiverSetup(e,ir) {
  for(const shadow of ir.shadows.filter(s=>s.cachedCaustics&&s.receivers)){
    const state=shadow.cachedCaustics.stateVN,bodies=shadow.receivers.bodies.map(b=>b.body);
    const unsupported=bodies.some(b=>!b.isDynamic&&b.shape!=='plane'&&(!b.model||b.model.anim||b.model.particles||!/\.obj$/i.test(b.model.rd.model.file)));
    if(unsupported)e.w(`${state}.forceDynamic=true;`);
    e.w(`${state}.colliders=[${bodies.map(b=>`{geom:${b.geomVN},position:${b.shape==='plane'?'null':b.geomVN+'.getPosition()'}}`).join(',')}];`);
  }
}

function emitWaterDraws(e,ir) {
  const models=ir.models.filter(m=>m.rd.water?.quality.transparency);if(!models.length)return;
  e.comment("Transparent water follows floor decals; it cannot cover the seafloor depth");
  e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 1);`);
  e.w(`Screen.setParam(Screen.ALPHA_TEST_REF, 0);`);
  for(const model of models){
    const conditions=[`${model.vn}.visible !== false`];if(ir.canDestroy)conditions.push(`!${model.vn}._destroyed`);
    if(model.rd.water.opacity>0)e.w(`if (${conditions.join(" && ")}) ${model.vn}.render();`);
  }
  e.w(`Screen.setParam(Screen.ALPHA_TEST_REF, ${il(ir.project.display?.alphaTest?.ref || 0)});`);
  e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 0);`);
  e.nl();
}
