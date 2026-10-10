function emitFlipbookSetup(e,ir) {
  const generic=ir.renderDatas.filter(rd=>rd.flipbook),particles=ir.models.filter(m=>m.particles?.flipbook);
  if(!generic.length&&!particles.length)return;
  e.section('Flipbooks — one atlas, cached UV frames, no per-frame allocation');
  for(const fn of [flipbookFrame,createFlipbookUVState,applyFlipbookFrame,advanceFlipbookUVs])e.w(fn.toString());
  for(const rd of generic){
    const image=rd.tex?.imageSize||{};
    e.w(`const ${rd.flipbookVN}=createFlipbookUVState(new Float32Array(${rd.dataVN}.vertices.texcoords),${JSON.stringify(rd.flipbook)},4,false,${il(image.width||0)},${il(image.height||0)});applyFlipbookFrame(${rd.flipbookVN},0);`);
  }
  if(generic.length)e.w(`function _updateTextureAnimations(dt){${generic.map(rd=>`advanceFlipbookUVs(${rd.flipbookVN},dt);`).join('')}}`);
}
