function configureParticlePreview(root,value,files=[],textureFile='',receivers=()=>[],emitterFor=()=>null) {
  const source=[];root.traverse(node=>{if(node.isMesh)source.push(node);});if(!source.length)return;
  const settings=normalizedParticles(value),state=createParticleState(settings),pool=[];
  for(const node of source)for(const material of [].concat(node.material))material.visible=false;
  const template=source[0],map=[].concat(template.material)[0]?.map;let geometry=new THREE.PlaneGeometry(1,1);
  if(settings.renderMode==='mesh'){geometry.dispose();geometry=new THREE.BufferGeometry();for(const [key,attribute] of Object.entries(template.geometry.attributes)){const count=attribute.array.length/settings.count;geometry.setAttribute(key,new THREE.BufferAttribute(attribute.array.slice(0,count),attribute.itemSize));}}
  const image=files.find(f=>f.cat==='textures'&&f.name===textureFile)?.image||files.find(f=>f.cat==='textures'&&f.name===textureFile)?.imageSize||{};
  for(let i=0;i<settings.count;i++){
    const material=new THREE.MeshBasicMaterial({map,color:new THREE.Color(settings.color.r,settings.color.g,settings.color.b),transparent:true,opacity:settings.opacity,depthWrite:false,side:THREE.DoubleSide});
    const sprite=new THREE.Mesh(settings.flipbook?geometry.clone():geometry,material);
    if(settings.flipbook){const uv=sprite.geometry.attributes.uv;sprite.userData.flipbook=createFlipbookUVState(uv.array,settings.animation,2,true,image.width,image.height);applyFlipbookFrame(sprite.userData.flipbook,0);uv.needsUpdate=true;}
    sprite.visible=false;sprite.renderOrder=(settings.sortingFudge<0?1.5:3)+settings.sortingFudge/100;root.add(sprite);pool.push(sprite);
  }
  if(settings.flipbook)geometry.dispose();
  state.onSubEmit=(sub,point)=>emitterFor(sub.objectId)?.emitAt(point);
  if(settings.collisionType==='world'){
    const ray=new THREE.Raycaster(),origin=new THREE.Vector3(),direction=new THREE.Vector3(),normalMatrix=new THREE.Matrix3();
    state.collide=(from,to)=>{origin.set(from.x,from.y,from.z);direction.set(to.x-from.x,to.y-from.y,to.z-from.z);const length=direction.length();if(length<.00001)return null;direction.divideScalar(length);ray.set(origin,direction);ray.near=.00001;ray.far=length+.002;const hit=ray.intersectObjects(receivers(),true)[0];if(!hit)return null;const normal=hit.face.normal.clone().applyMatrix3(normalMatrix.getNormalMatrix(hit.object.matrixWorld)).normalize();if(normal.dot(direction)>0)normal.negate();return {point:{x:hit.point.x+normal.x*.001,y:hit.point.y+normal.y*.001,z:hit.point.z+normal.z*.001},normal:{x:normal.x,y:normal.y,z:normal.z}};};
  }
  root.userData.particlePreview={state,pool,inverse:new THREE.Quaternion()};
}

function advanceParticlePreview(root,dt,camera) {
  const preview=root.userData.particlePreview;if(!preview)return;
  root.updateWorldMatrix(true,false);
  if(preview.state.emitter){const position=new THREE.Vector3(),rotation=new THREE.Quaternion(),scale=new THREE.Vector3(),euler=new THREE.Euler();root.matrixWorld.decompose(position,rotation,scale);euler.setFromQuaternion(rotation);preview.state.emitter={position:{x:position.x,y:position.y,z:position.z},rotation:{x:euler.x,y:euler.y,z:euler.z},scale:{x:scale.x,y:scale.y,z:scale.z}};}
  if(!preview.state.cinematic)stepParticleState(preview.state,dt);
  root.updateWorldMatrix(true,false);root.getWorldQuaternion(preview.inverse).invert();
  const settings=preview.state.settings,particles=preview.state.particles;
  for(let i=0;i<preview.pool.length;i++){
    const sprite=preview.pool[i],at=i*4;sprite.visible=particles[at+3]>0;
    if(!sprite.visible)continue;
    sprite.position.set(particles[at],particles[at+1],particles[at+2]);
    const size=settings.modules?preview.state.sizes[i]:settings.size,world=settings.modules&&settings.simulationSpace==='world',birth=preview.state.spawnScales,current=preview.state.emitter.scale;
    sprite.scale.set(size*(world?Math.abs(birth[i*3])/(Math.abs(current.x)||1):1),size*(settings.preset==='bubbles'?1:1.5)*(world?Math.abs(birth[i*3+1])/(Math.abs(current.y)||1):1),size*(world?Math.abs(birth[i*3+2])/(Math.abs(current.z)||1):1));
    sprite.material.opacity=particles[at+3]*settings.opacity;
    if(sprite.userData.flipbook&&applyFlipbookFrame(sprite.userData.flipbook,preview.state.ages[i]))sprite.geometry.attributes.uv.needsUpdate=true;
    if(settings.renderMode==='billboard'&&camera)sprite.quaternion.copy(preview.inverse).multiply(camera.quaternion);
    else if(world)sprite.quaternion.setFromEuler(new THREE.Euler(preview.state.spawnRotations[i*3],preview.state.spawnRotations[i*3+1],preview.state.spawnRotations[i*3+2])).premultiply(preview.inverse);
    else sprite.quaternion.identity();sprite.rotateZ(preview.state.spins[i]||0);
    if(settings.modules)sprite.material.color.setRGB(preview.state.tints[at],preview.state.tints[at+1],preview.state.tints[at+2]);
  }
}
