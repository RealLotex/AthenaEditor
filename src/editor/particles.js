function particleSpritePixels(bubble=false,size=64) {
  const data=new Uint8ClampedArray(size*size*4);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const dx=(x+.5)/size*2-1,dy=(y+.5)/size*2-1,r=Math.hypot(dx,dy),at=(y*size+x)*4;
    const alpha=bubble?Math.max(0,1-Math.abs(r-.73)*16)+Math.max(0,1-Math.hypot(dx+.3,dy+.3)*8):Math.max(0,1-r*r)*Math.max(0,1-r*1.15);
    data[at]=data[at+1]=data[at+2]=255;data[at+3]=Math.round(clamp(alpha,0,1)*15)*17;
  }
  return {width:size,height:size,data};
}

async function prepareParticleAssets(preset='bubbles') {
  const lines=['vt 0 0','vt 1 0','vt 1 1','vt 0 1','vn 0 0 1'];
  for(let i=0;i<64;i++){const v=i*4+1;lines.push('v -.5 -.5 0','v .5 -.5 0','v .5 .5 0','v -.5 .5 0',`f ${v}/1/1 ${v+1}/2/1 ${v+2}/3/1`,`f ${v}/1/1 ${v+2}/3/1 ${v+3}/4/1`);}
  const content=lines.join('\n')+'\n';
  return [textMeshAsset('particle_sprite.obj',content),{...await textureOutputAsset(particleSpritePixels(preset==='bubbles'),preset==='bubbles'?'particle_bubble.png':'particle_drop.png',16),editKind:'particles',libraryFolder:'Particles'}];
}

function addParticleObject(project,scene,preset,assets,external=[]) {
  const names=installGeneratedAssets(project,assets,external),object=mkObject(uniqueName({bubbles:'Bubbles',splash:'Splash',fountain:'Fountain'}[preset],allObjects(scene.objects)));
  object.components.model={...makeComponent('model'),file:names[0],textureFile:names[1],pipeline:'PL_NO_LIGHTS',face_culling:'CULL_FACE_NONE',accurate_clipping:true};
  object.components.particles={...makeComponent('particles'),preset};
  if(preset==='splash')Object.assign(object.components.particles,{loop:false,lifetime:.8,speed:4,spread:1.5,count:20});
  if(preset==='fountain')Object.assign(object.components.particles,{lifetime:1.5,speed:6,spread:.6,rate:16});
  scene.objects.push(object);return object;
}
