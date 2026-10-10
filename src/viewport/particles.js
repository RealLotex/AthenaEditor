function configureParticlePreview(root,value,files=[],textureFile='') {
  const source=[];root.traverse(node=>{if(node.isMesh)source.push(node);});if(!source.length)return;
  const settings=normalizedParticles(value),state=createParticleState(settings),pool=[];
  for(const node of source)for(const material of [].concat(node.material))material.visible=false;
  const template=source[0],map=[].concat(template.material)[0]?.map,geometry=new THREE.PlaneGeometry(1,1);
  const image=files.find(f=>f.cat==='textures'&&f.name===textureFile)?.image||files.find(f=>f.cat==='textures'&&f.name===textureFile)?.imageSize||{};
  for(let i=0;i<settings.count;i++){
    const material=new THREE.MeshBasicMaterial({map,color:new THREE.Color(settings.color.r,settings.color.g,settings.color.b),transparent:true,opacity:settings.opacity,depthWrite:false,side:THREE.DoubleSide});
    const sprite=new THREE.Mesh(settings.flipbook?geometry.clone():geometry,material);
    if(settings.flipbook){const uv=sprite.geometry.attributes.uv;sprite.userData.flipbook=createFlipbookUVState(uv.array,settings.animation,2,true,image.width,image.height);applyFlipbookFrame(sprite.userData.flipbook,0);uv.needsUpdate=true;}
    sprite.visible=false;sprite.renderOrder=3;root.add(sprite);pool.push(sprite);
  }
  if(settings.flipbook)geometry.dispose();
  root.userData.particlePreview={state,pool,inverse:new THREE.Quaternion()};
}

function advanceParticlePreview(root,dt,camera) {
  const preview=root.userData.particlePreview;if(!preview)return;
  if(!preview.state.cinematic)stepParticleState(preview.state,dt);
  root.updateWorldMatrix(true,false);root.getWorldQuaternion(preview.inverse).invert();
  const settings=preview.state.settings,particles=preview.state.particles;
  for(let i=0;i<preview.pool.length;i++){
    const sprite=preview.pool[i],at=i*4;sprite.visible=particles[at+3]>0;
    if(!sprite.visible)continue;
    sprite.position.set(particles[at],particles[at+1],particles[at+2]);
    sprite.scale.set(settings.size,settings.size*(settings.preset==='bubbles'?1:1.5),settings.size);
    sprite.material.opacity=particles[at+3]*settings.opacity;
    if(sprite.userData.flipbook&&applyFlipbookFrame(sprite.userData.flipbook,preview.state.ages[i]))sprite.geometry.attributes.uv.needsUpdate=true;
    if(camera)sprite.quaternion.copy(preview.inverse).multiply(camera.quaternion);
  }
}
