function waterTextureForQuality(asset,value,files=[]) {
  if(!asset?.waterMotion&&!asset?.waterQualityLevels)return asset;
  const quality=normalizedWaterQuality(value?.quality),motion=asset.waterMotion||{frames:[asset],fps:0};
  const levels=asset.waterQualityLevels||motion.levels||(asset.owned&&[3,4].includes(asset.waterRevision)&&typeof WATER_MOTION_DATA!=='undefined'&&asset.dataUrl===WATER_MOTION_DATA.frames[0].dataUrl?WATER_MOTION_DATA.levels:{});
  const size=levels?.[quality.textureSize]?quality.textureSize:asset.image?.width||asset.imageSize?.width||512;
  const source=levels?.[size]||motion.frames,count=[1,8,16,24,32][quality.pattern];
  const frames=Array.from({length:Math.min(count,source.length)},(_,i)=>source[Math.floor(i*source.length/Math.min(count,source.length))]);
  const name=size===asset.image?.width?asset.name:freeAssetName(files,asset.name.replace(/\.[^.]+$/,'')+'_'+size,'png');
  const format=textureFormatOfAsset(frames[0]),image={...(imageSize(bytesFromDataUrl(frames[0].dataUrl,64),name)||{width:size,height:size,format:'png'}),bpp:format==='T4'?4:format==='T8'?8:/16/.test(format||'')?16:32};
  return {...asset,...frames[0],name,image,imageSize:image,waterMotion:{frames,fps:quality.pattern?(motion.fps||60)*frames.length/source.length:0}};
}

// Cache complete geometry poses once, then transfer contiguous buffers in C.
// Texture coordinates retain an independent flow offset and update clock.
function advanceCachedWaterArrays(state,dt) {
  const w=state.settings,c=state.cache,step=Math.max(0,Math.min(.1,dt)),clock=c.clock;
  clock[0]=(clock[0]+w.waveSpeed*step)%(Math.PI*2);state.phase=clock[0];
  state.u=(state.u+w.flow.x*step)%1;state.v=(state.v+w.flow.z*step)%1;
  if(state.frameCount>1){
    clock[1]=(clock[1]+step*w.waveSpeed)%(state.frameCount/state.frameRate);
    if(!state.patternTick)state.patternTick=new Float64Array([0,1/w.textureUpdateRate]);state.patternTick[0]+=step;
    if(step===0||state.patternTick[0]>=state.patternTick[1]){state.patternTick[0]%=state.patternTick[1];state.textureFrame=Math.floor(clock[1]*state.frameRate)%state.frameCount;}
  }
  const pose=Math.floor(clock[0]*c.poses/(Math.PI*2))%c.poses;
  clock[2]+=step;clock[3]+=step;
  if(w.waveHeight&&(step===0||clock[2]>=1/w.waveUpdateRate)){
    clock[2]%=1/w.waveUpdateRate;
    if(c.previousPosition!==pose){
      if(c.positions)state.positions.set(c.positions[pose]);else updateWaterPositionFallback(state,pose*Math.PI*2/c.poses);
      if(c.normals)state.normals.set(c.normals[pose]);c.previousPosition=pose;
    }
  }
  if(step===0||clock[3]>=1/w.uvUpdateRate){
    clock[3]%=1/w.uvUpdateRate;
    const frame=c.uvs?.[c.uvs.length===1?0:pose];
    if(frame){state.uvs.set(frame);if(state.u||state.v)for(let i=0;i<state.uvs.length;i+=state.uvStride){state.uvs[i]+=state.u;state.uvs[i+1]+=state.v;}}
    else updateWaterUVFallback(state,pose*Math.PI*2/c.poses);
  }
}

function updateWaterPositionFallback(state,phase) {
  if(!state.waveBasis)prepareWaterArrays(state);
  const w=state.settings,b=state.waveBasis,s=state.waveSamples,sin=Math.sin(phase),cos=Math.cos(phase);
  for(let i=0,j=0;i<b.length;i+=8,j+=6)s[j]=w.waveHeight*(.65*(b[i]*cos+b[i+1]*sin)+.35*(b[i+2]*cos-b[i+3]*sin));
  for(let i=0;i<state.positions.length;i+=state.stride)state.positions[i+1]=state.basePositions[i+1]+s[state.sampleIndex[i/state.stride]*6];
}

function updateWaterUVFallback(state,phase) {
  if(!state.waveBasis)prepareWaterArrays(state);
  const w=state.settings,b=state.waveBasis,s=state.waveSamples,sin=Math.sin(phase),cos=Math.cos(phase);
  for(let i=0,j=0;i<b.length;i+=8,j+=6){s[j+4]=w.rippleStrength*(b[i+4]*cos+b[i+5]*sin);s[j+5]=w.rippleStrength*(b[i+7]*cos+b[i+6]*sin);}
  for(let i=0;i<state.uvs.length;i+=state.uvStride){const j=state.sampleIndex[i/state.uvStride]*6;state.uvs[i]=state.baseUVs[i]*w.tiling+state.u+s[j+4];state.uvs[i+1]=state.baseUVs[i+1]*w.tiling+state.v+s[j+5];}
}

function waterPerformanceEstimate(object,files) {
  const w=normalizedWater(object.components.water),source=waterMeshForQuality(files.find(f=>f.name===object.components.model?.file),w,files),texture=waterTextureForQuality(files.find(f=>f.name===object.components.model?.textureFile),w,files);
  const triangles=source?.bounds?.triangles||(source?.content&&/\.obj$/i.test(source.name)?readMeshOBJ(source.content).faces.length:512);
  const corners=triangles*3,uvRate=w.flow.x||w.flow.z||w.rippleStrength?w.uvUpdateRate:0;
  const cpu=(corners/1536)*(uvRate/30)*(w.flow.x||w.flow.z?3.1:.1)+(w.waveHeight?corners/1536*w.waveUpdateRate/30*.15:0);
  const projectedTriangles=w.caustics?2*WATER_QUALITY_GRIDS[w.quality.caustics]**2:0;
  const drawing=(triangles+projectedTriangles)/512*.35,blend=w.quality.transparency?.25:0,uploads=(texture?.image?.width||512)**2/512**2*(texture?.waterMotion?.frames?.length>1?[0,.03,.06,.09,.12][w.quality.pattern]:0);
  const low=cpu+drawing+blend+uploads,high=low+(.3+w.quality.transparency*.8)*(texture?.image?.width||512)/512;
  const cacheBytes=waterGeometryCacheLayout(corners,w,!!object.components.reflection).bytes;
  return {low,high,cpu,triangles,projectedTriangles,textureSize:texture?.image?.width||0,textureBytes:textureVRAMBytes(texture)||0,frames:texture?.waterMotion?.frames?.length||1,patternRate:Math.min(w.textureUpdateRate,(texture?.waterMotion?.fps||0)*w.waveSpeed),cacheBytes,uvRate,waveRate:w.waveHeight?w.waveUpdateRate:0};
}

function waterGeometryCacheLayout(corners,w,reflection=false) {
  const active=!!(w.waveHeight||w.rippleStrength||w.flow.x||w.flow.z),lanes=(w.waveHeight?1:0)+(w.rippleStrength?1:0)+(reflection&&w.waveHeight?1:0),poses=lanes===3?64:128;
  const bytes=active?corners*16*((w.waveHeight?poses:0)+(w.rippleStrength?poses:1)+(reflection&&w.waveHeight?poses:0)):0;
  return {poses,bytes:bytes<=8*1024*1024?bytes:0};
}

function waterCausticCacheValid(state) {
  if(state.forceDynamic)return false;
  for(const entry of state.sources){
    const object=entry.object;
    if(object._destroyed||object.visible===false)return false;
    for(const key of ['position','rotation','scale']){const a=object[key],b=entry[key];if(a.x!==b.x||a.y!==b.y||a.z!==b.z)return false;}
  }
  for(const entry of state.colliders||[]){
    if(entry.geom._destroyed)return false;
    if(!entry.position)continue; // Native planes are fixed by their equation.
    // Receiver synchronization has already fetched this position for its proxy.
    const p=entry.geom._shadowPosition||entry.geom.getPosition();
    if(p[0]!==entry.position[0]||p[1]!==entry.position[1]||p[2]!==entry.position[2])return false;
  }
  return true;
}

function updateCachedCausticUVs(state,water) {
  if(state.uvs.length===water.uvs.length){state.uvs.set(water.uvs);return;}
  for(let i=0;i<state.uvs.length;i+=4){state.uvs[i]=state.baseUVs[i]*water.settings.tiling+water.u;state.uvs[i+1]=state.baseUVs[i+1]*water.settings.tiling+water.v;}
}
