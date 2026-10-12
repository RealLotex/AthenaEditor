// The editor and player advance the same small vertex/UV arrays. Caustic rays
// are an approximation of the native receiver colliders, sampled at 10 Hz.
function configureWaterPreview(root, value, files, receivers=()=>[], textureName='') {
  const settings=normalizedWater(value),entries=[];
  const asset=waterTextureForQuality(files.find(f=>f.cat==='textures'&&f.name===textureName),settings,files),frames=waterFrameAssets(asset,files);
  const textures=frames.map(f=>{const texture=makeTexture(f.dataUrl,settings.textureFilter||'LINEAR');texture.wrapS=texture.wrapT=THREE.RepeatWrapping;return texture;});
  root.userData.waterTextures=textures;
  root.traverse(node=>{
    if(!node.isMesh || !node.geometry?.attributes?.uv)return;
    const geometry=node.geometry.clone();node.geometry.dispose();node.geometry=geometry;
    const old=node.material,material=Array.isArray(old)?old[0]:old;
    node.material=new THREE.MeshBasicMaterial({map:material.map,color:new THREE.Color(settings.color.r,settings.color.g,settings.color.b),transparent:!!settings.quality.transparency,opacity:settings.opacity,depthWrite:!settings.quality.transparency,side:THREE.DoubleSide});
    if(node.material.map){node.material.map.wrapS=node.material.map.wrapT=THREE.RepeatWrapping;node.material.map.needsUpdate=!!node.material.map.image;}
    for(const m of Array.isArray(old)?old:[old])m.dispose();
    node.renderOrder=2;node.castShadow=false;
    const positions=geometry.attributes.position.array,uvs=geometry.attributes.uv.array,normals=geometry.attributes.normal?.array;
    const state={settings,positions,normals,uvs,basePositions:new Float32Array(positions),baseUVs:new Float32Array(uvs),stride:3,uvStride:2,u:0,v:0,phase:0,waveClock:1,geometry,material:node.material,frames:textures.length?[node.material.map,...textures]:[],frameCount:textures.length?textures.length+1:0,frameRate:asset?.waterMotion?.fps||16,textureFrame:0};
    advanceWaterArrays(state,0);entries.push(state);
  });
  root.userData.waterEntries=entries;
  const file=files.find(f=>f.cat==='textures'&&f.name===settings.causticTexture);
  if(settings.caustics&&file?.dataUrl){
    const grid=WATER_QUALITY_GRIDS[settings.quality.caustics],geometry=new THREE.PlaneGeometry(1,1,grid,grid);geometry.rotateX(-Math.PI/2);
    const texture=makeTexture(file.dataUrl,'LINEAR');texture.repeat.set(settings.tiling,settings.tiling);
    texture.wrapS=texture.wrapT=THREE.RepeatWrapping;
    const material=new THREE.MeshBasicMaterial({map:texture,transparent:true,opacity:settings.causticStrength,depthWrite:false,blending:THREE.AdditiveBlending,side:THREE.DoubleSide});
    const mesh=new THREE.Mesh(geometry,material);mesh.renderOrder=1;mesh.frustumCulled=false;root.add(mesh);
    root.userData.waterCaustics={mesh,base:new Float32Array(geometry.attributes.position.array),clock:1,settings,receivers,cursor:0,snapshot:[],ray:new THREE.Raycaster(),point:new THREE.Vector3(),down:new THREE.Vector3(0,-1,0)};
  }
}

function advanceWaterPreview(root,dt) {
  if(!root.visible)return;
  for(const state of root.userData.waterEntries||[]){
    advanceWaterArrays(state,dt);state.geometry.attributes.position.needsUpdate=true;state.geometry.attributes.uv.needsUpdate=true;
    if(state.normals)state.geometry.attributes.normal.needsUpdate=true;
    if(state.frames.length && state.frames[state.textureFrame]?.image)state.material.map=state.frames[state.textureFrame];
  }
  const c=root.userData.waterCaustics;if(!c)return;
  const state=root.userData.waterEntries[0];if(state)c.mesh.material.map.offset.set(state.u,state.v);
  c.clock+=dt;if(c.clock<.1&&!c.projecting)return;c.clock%=.1;
  root.updateMatrixWorld(true);
  const positions=c.mesh.geometry.attributes.position.array,meshes=[];
  for(const target of c.receivers())target.traverse(node=>{if(node.isMesh&&node.visible&&node.geometry?.attributes.position){node.updateWorldMatrix(true,false);meshes.push(node);}});
  const changed=c.snapshot.length!==meshes.length||meshes.some((mesh,i)=>{const saved=c.snapshot[i];return saved?.mesh!==mesh||saved.geometry!==mesh.geometry||saved.version!==mesh.geometry.attributes.position.version||mesh.matrixWorld.elements.some((v,k)=>saved.matrix[k]!==v);})||!c.rootMatrix||root.matrixWorld.elements.some((v,k)=>c.rootMatrix[k]!==v);
  if(changed){
    c.snapshot=meshes.map(mesh=>({mesh,geometry:mesh.geometry,version:mesh.geometry.attributes.position.version,matrix:[...mesh.matrixWorld.elements]}));
    c.rootMatrix=[...root.matrixWorld.elements];c.index=new EnvironmentOcclusionIndex(meshes);c.cursor=0;c.projecting=true;
  }
  if(!c.projecting)return;
  const deadline=performance.now()+2;
  // Only geometry/transform changes invalidate the static seafloor. Spread even
  // that projection over frames; texture panning remains independent and smooth.
  while(c.cursor<positions.length){
    const i=c.cursor;c.point.set(c.base[i],0,c.base[i+2]).applyMatrix4(root.matrixWorld);const surface=c.point.y;
    c.point.y+=.1;const distance=c.index.trace(c.point,c.down,c.settings.depth+.1),y=distance!==null?c.point.y-distance+.02:surface-c.settings.depth+.02;
    c.point.y=y;root.worldToLocal(c.point);positions[i]=c.point.x;positions[i+1]=c.point.y;positions[i+2]=c.point.z;c.cursor+=3;
    if(performance.now()>deadline)break;
  }
  c.mesh.geometry.attributes.position.needsUpdate=true;
  if(c.cursor>=positions.length)c.projecting=false;
}
