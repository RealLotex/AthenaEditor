function emitEnvironmentSetup(e,ir) {
  for(const rd of ir.renderDatas)if(rd.refTex){
    // ath_render.c:547 appends one texture slot; never skip indices. The full
    // material snapshot keeps its count unchanged (setter realloc is unsafe).
    e.w(`{let index=0,texture;while((texture=${rd.dataVN}.getTexture(index))&&texture!==${rd.refTex.vn})index++;if(!texture)${rd.dataVN}.setTexture(index,${rd.refTex.vn});const materials=${rd.dataVN}.materials;for(const material of materials)material.ref_texture_id=index;${rd.dataVN}.materials=materials;}`);
  }
  if(ir.renderDatas.some(rd=>rd.refTex))e.w(`let _reflectionImagesReady=false;`);
  if(!ir.fogModels.length)return;
  e.section('Fog — untextured overlays, independent colors, no extra VRAM');
  e.w(createFogState.toString());e.w(advanceFogArrays.toString());
  e.w(`os.chdir("${jsStr(ir.dirs.models)}");`);
  for(const f of ir.fogModels){
    e.w(`const ${f.dataVN}=new RenderData("${jsStr(f.mesh.name)}");${f.dataVN}.pipeline=Render.PL_NO_LIGHTS;${f.dataVN}.texture_mapping=false;${f.dataVN}.face_culling=Render.${f.model.rd.model.face_culling||'CULL_FACE_BACK'};${f.dataVN}.accurate_clipping=${!!f.model.rd.model.accurate_clipping};${f.dataVN}.shade_model=1;`);
    e.w(`for(let i=0,n=${f.dataVN}.materials.length;i<n;i++)${f.dataVN}.updateMaterial(i,{diffuse:{r:0,g:0,b:0}});`);
    e.w(`const ${f.vn}=new RenderObject(${f.dataVN});const ${f.stateVN}=createFogState(new Float32Array(${f.dataVN}.vertices.positions),new Float32Array(${f.dataVN}.vertices.colors),${JSON.stringify(ir.fog)});`);
  }
  e.w(`os.chdir("..");`);
  e.w(`function _updateFog(dt){const camera=Camera.save();`);
  e.block(b=>{for(const f of ir.fogModels){
    const m=f.model;
    b.w(`{const state=${f.stateVN},p=${m.vn}.position,r=${m.vn}.rotation,s=${m.vn}.scale,matrix=matFromEuler(r.x,r.y,r.z);for(let j=0;j<3;j++){matrix[j]*=s.x;matrix[4+j]*=s.y;matrix[8+j]*=s.z;}matrix[12]=p.x;matrix[13]=p.y;matrix[14]=p.z;advanceFogArrays(state,dt,matrix,camera);${f.vn}.position=p;${f.vn}.rotation=r;${f.vn}.scale=s;}`);
  }});e.w(`}`);
}

function emitReflectionWarmup(e,ir) {
  const textures=[...new Map(ir.renderDatas.filter(rd=>rd.refTex).map(rd=>[rd.refTex.vn,rd.refTex])).values()];if(!textures.length)return;
  // Prime GIF uploads before the reflection VIF pass requests these images.
  e.w(`if(!_reflectionImagesReady){`);e.block(b=>{for(const t of textures)b.w(`{const saved=${t.vn}.color;${t.vn}.color=Color.new(128,128,128,0);${t.vn}.draw(0,0);${t.vn}.color=saved;}`);});e.w(`_reflectionImagesReady=true;}`);
}

function emitFogDraws(e,ir) {
  if(!ir.fogModels.length)return;
  e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER,_mainDepth,1);Screen.setParam(Screen.ALPHA_TEST_REF,0);`);
  for(const f of ir.fogModels)e.w(`if(${f.model.vn}.visible!==false${ir.canDestroy?'&&!'+f.model.vn+'._destroyed':''})${f.vn}.render();`);
  e.w(`Screen.setParam(Screen.ALPHA_TEST_REF,${il(ir.project.display?.alphaTest?.ref||0)});Screen.setBuffer(Screen.DEPTH_BUFFER,_mainDepth,0);`);
}
