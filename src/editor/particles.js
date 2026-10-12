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
  const defaults=normalizedParticles(object.components.particles);
  Object.assign(object.components.particles,{lifetimeMin:object.components.particles.lifetime??defaults.lifetimeMin,lifetimeMax:object.components.particles.lifetime??defaults.lifetimeMax,speedMin:object.components.particles.speed??defaults.speedMin,speedMax:object.components.particles.speed??defaults.speedMax,sizeMin:object.components.particles.size??defaults.sizeMin,sizeMax:object.components.particles.size??defaults.sizeMax,gravityModifier:preset==='bubbles'?0:1});
  if(preset==='splash')Object.assign(object.components.particles,{rate:0,duration:.04,bursts:[{time:0,count:20,cycles:1,interval:.1}]});
  scene.objects.push(object);return object;
}

function particleMeshAssetForSettings(settings,files,ownerId) {
  if(settings.renderMode!=='mesh')return null;
  const source=files.find(f=>f.cat==='models'&&f.name===settings.meshFile);
  if(!source?.content||!/\.obj$/i.test(source.name))throw Error('Mesh particles require an imported OBJ.');
  const base=readMeshOBJ(source.content);if(base.faces.length>256)throw Error('Particle meshes support up to 256 triangles per instance.');
  const mesh={positions:[],uvs:[],normals:[],faces:[]};
  for(let i=0;i<settings.count;i++)for(const face of base.faces){const corners=[];for(const c of face){const v=mesh.positions.push(base.positions[c.v])-1,uv=mesh.uvs.push(base.uvs[c.uv]||[0,0])-1,n=mesh.normals.push(base.normals[c.n]||[0,1,0])-1;corners.push({v,uv,n});}mesh.faces.push(corners);}
  return {...textMeshAsset('particle_'+ident(ownerId)+'_pool.obj',writeMeshOBJ(mesh)),particleCorners:base.faces.length*3};
}

function particlePreviewAssets(model,value,files,ownerId) {
  const settings=normalizedParticles(value),pool=particleMeshAssetForSettings(settings,files,ownerId);
  return pool?{model:{...model,file:pool.name},files:[...files,pool]}:{model,files};
}
