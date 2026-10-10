function waterMeshForQuality(asset,value,files=[]) {
  if(!asset?.owned||asset.editKind!=='water'||![waterMeshOBJ(),waterMeshOBJ(8)].includes(asset.content))return asset;
  const quality=normalizedWaterQuality(value?.quality),segments=WATER_QUALITY_GRIDS[quality.waves];
  if(segments===16)return asset;
  const content=waterMeshOBJ(segments),name=freeAssetName(files,asset.name.replace(/\.[^.]+$/,'')+'_grid_'+segments,'obj');
  return {...asset,name,content,bounds:asset.bounds?{...asset.bounds,triangles:segments*segments*2}:undefined};
}

function buildWaterGeometryCache(mesh,value,reflection=false) {
  const w=normalizedWater(value),count=mesh.faces.length*3;
  if(!w.waveHeight&&!w.rippleStrength&&!w.flow.x&&!w.flow.z)return null;
  const positions=new Float32Array(count*4),uvs=new Float32Array(count*4),normals=reflection?new Float32Array(count*4):null;
  let at=0;for(const face of mesh.faces)for(const corner of face){positions.set([...mesh.positions[corner.v],1],at);const uv=mesh.uvs[corner.uv]||[0,0];uvs.set([uv[0],1-uv[1],1,1],at);if(normals)normals.set([0,1,0,0],at);at+=4;}
  const {poses,bytes}=waterGeometryCacheLayout(count,w,reflection);
  if(!bytes)return null;
  const state={settings:w,positions,uvs,normals,basePositions:new Float32Array(positions),baseUVs:new Float32Array(uvs),stride:4,uvStride:4};prepareWaterArrays(state);
  const cache={poses,positions:[],uvs:[],normals:[]};
  for(let pose=0;pose<poses;pose++){
    const phase=pose*Math.PI*2/poses;
    if(w.waveHeight){updateWaterPositionFallback(state,phase);cache.positions.push(new Float32Array(positions));}
    if(w.rippleStrength||pose===0){state.u=state.v=0;updateWaterUVFallback(state,phase);cache.uvs.push(new Float32Array(uvs));}
    if(reflection&&w.waveHeight){
      for(let i=0;i<normals.length;i+=4){const j=state.sampleIndex[i/4]*8,b=state.waveBasis,ca=b[j+1]*Math.cos(phase)-b[j]*Math.sin(phase),cb=b[j+3]*Math.cos(phase)+b[j+2]*Math.sin(phase),nx=-w.waveHeight*Math.PI*(3.25*ca+.7*cb),nz=-w.waveHeight*Math.PI*(1.3*ca-1.4*cb),length=Math.hypot(nx,1,nz);normals[i]=nx/length;normals[i+1]=1/length;normals[i+2]=nz/length;}
      cache.normals.push(new Float32Array(normals));
    }
  }
  const buffer=new Float32Array(bytes/4);let offset=0;
  for(const key of ['positions','uvs','normals']){cache[key+'Offset']=offset;for(const frame of cache[key]){buffer.set(frame,offset);offset+=frame.length;}cache[key+'Count']=cache[key].length;}
  return {poses,length:positions.length,bytes,buffer,...Object.fromEntries(['positions','uvs','normals'].flatMap(key=>[[key+'Offset',cache[key+'Offset']],[key+'Count',cache[key+'Count']]]))};
}

function waterPreviewAssets(model,value,files) {
  const mesh=waterMeshForQuality(files.find(f=>f.cat==='models'&&f.name===model.file),value,files),texture=waterTextureForQuality(files.find(f=>f.cat==='textures'&&f.name===model.textureFile),value,files);
  return {model:{...model,file:mesh?.name||model.file,textureFile:texture?.name||model.textureFile,textureFilter:value.textureFilter||model.textureFilter},files:[...files.filter(f=>f.name!==mesh?.name&&f.name!==texture?.name),...[mesh,texture].filter(Boolean)]};
}

async function prepareWaterQualityLevels(asset) {
  const frames=asset.waterMotion?.frames||[asset],levels={};
  for(const size of WATER_TEXTURE_SIZES)levels[size]=[];
  for(const frame of frames){
    const pixels=await readTexturePixels({...asset,...frame});
    for(const size of WATER_TEXTURE_SIZES){const output=await textureOutputAsset(resizeTexturePixels(pixels,size,size,true),asset.name,16);levels[size].push({dataUrl:output.dataUrl,size:output.size});}
  }
  return {...asset,waterQualityLevels:levels};
}

function bakeWaterCausticMesh(water,models,files,bodies=[]) {
  const triangles=[],receivers=[];
  for(const model of models){
    if(model===water||model.rd.water||model.particles||model.anim||model.obj.components.rigidbody?.mode==='dynamic')continue;
    const file=files.find(f=>f.cat==='models'&&f.name===model.rd.model.file);if(!file?.content||!/\.obj$/i.test(file.name))continue;
    const mesh=readMeshOBJ(file.content),matrix=matFromTRS(model.world.position,model.world.rotation,model.world.scale);
    for(const face of mesh.faces)for(const corner of face){const p=mesh.positions[corner.v];for(let axis=0;axis<3;axis++)triangles.push(p[0]*matrix[axis]+p[1]*matrix[4+axis]+p[2]*matrix[8+axis]+matrix[12+axis]);}
    receivers.push(model);
  }
  const index=new EnvironmentOcclusionIndex([],triangles),w=water.rd.water,grid=WATER_QUALITY_GRIDS[w.quality.caustics],mesh=readMeshOBJ(waterMeshOBJ(grid));
  for(const p of mesh.positions){
    const x=water.world.position.x+p[0]*Math.abs(water.world.scale.x),z=water.world.position.z+p[2]*Math.abs(water.world.scale.z),y=water.world.position.y+.1;
    let distance=index.trace({x,y,z},{x:0,y:-1,z:0},w.depth+.1);
    for(const body of bodies)if(body.shape==='plane'){
      const hit=y-num(body.rb.planeY,0);
      if(hit>=0&&hit<=w.depth+.1&&(distance===null||hit<distance))distance=hit;
    }
    p[0]=x;p[1]=distance===null?water.world.position.y-w.depth+.02:y-distance+.02;p[2]=z;
  }
  return {mesh:writeMeshOBJ(mesh,'Water caustics'),receivers,grid};
}
