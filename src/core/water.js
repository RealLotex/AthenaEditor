const WATER_TEXTURE_SIZES=[32,64,128,256,512];
const WATER_QUALITY_LABELS=['Ultra low','Low','Medium','High','Ultra'];
const WATER_QUALITY_RATES=[0,10,20,30,60];
const WATER_QUALITY_GRIDS=[1,4,8,12,16];
function normalizedWaterQuality(value={}) {
  const out={textureSize:WATER_TEXTURE_SIZES.includes(value.textureSize)?value.textureSize:512};
  for(const key of ['transparency','panning','waves','caustics','pattern'])out[key]=Math.round(clamp(num(value[key],key==='transparency'?1:['pattern','waves','panning'].includes(key)?4:3),0,key==='transparency'?1:4));
  return out;
}

function normalizedWater(value) {
  const water = { ...COMPONENTS.water.make(), ...value };
  for (const [key, lo, hi] of [["opacity",0,1],["tiling",.1,32],["waveHeight",0,.5],["waveSpeed",0,8],["rippleStrength",0,.25],["updateRate",5,60],["depth",.1,100],["causticStrength",0,1]]) water[key] = clamp(num(water[key], COMPONENTS.water.make()[key]),lo,hi);
  water.flow = { x:clamp(num(water.flow?.x,0),-1,1),z:clamp(num(water.flow?.z,0),-1,1) };
  water.color = Object.fromEntries(["r","g","b"].map(k=>[k,clamp(num(water.color?.[k],1),0,1)]));
  water.caustics = water.caustics === true;
  water.quality=normalizedWaterQuality(value?.quality||{caustics:water.caustics?3:0});
  water.textureUpdateRate=water.updateRate;
  if(value?.quality){
    water.caustics=water.quality.caustics>0;
    water.updateRate=Math.min(water.updateRate,Math.max(1,WATER_QUALITY_RATES[water.quality.waves],WATER_QUALITY_RATES[water.quality.panning]));
    water.waveUpdateRate=Math.min(water.updateRate,WATER_QUALITY_RATES[water.quality.waves]);water.uvUpdateRate=Math.min(water.updateRate,WATER_QUALITY_RATES[water.quality.panning]);
  }else water.waveUpdateRate=water.uvUpdateRate=water.updateRate;
  if(!water.quality.transparency)water.opacity=1;
  if(!water.quality.panning){water.flow={x:0,z:0};water.rippleStrength=0;}
  if(!water.quality.waves)water.waveHeight=0;
  if(!water.quality.caustics)water.caustics=false;
  return water;
}

// Borrowed vertex buffers are mutated in place, never replaced: assigning
// RenderData.vertices frees native geometry and is unsafe for shared clones.
function prepareWaterArrays(state) {
  const count=state.positions.length/state.stride,index=new Int32Array(count),keys=new Map(),basis=[];
  for(let corner=0;corner<count;corner++){
    const i=corner*state.stride,j=corner*state.uvStride,x=state.basePositions[i],z=state.basePositions[i+2],u=state.baseUVs[j],v=state.baseUVs[j+1],key=x+':'+z+':'+u+':'+v;
    let sample=keys.get(key);
    if(sample===undefined){
      sample=basis.length/8;keys.set(key,sample);
      const a=Math.PI*(x*5+z*2),b=Math.PI*(x*2-z*4);
      basis.push(Math.sin(a),Math.cos(a),Math.sin(b),Math.cos(b),Math.sin(v*Math.PI*4),Math.cos(v*Math.PI*4),Math.sin(u*Math.PI*6),Math.cos(u*Math.PI*6));
    }
    index[corner]=sample;
  }
  state.sampleIndex=index;state.waveBasis=new Float64Array(basis);state.waveSamples=new Float64Array(keys.size*6);
}

function advanceWaterArrays(state, dt) {
  if(state.cache){advanceCachedWaterArrays(state,dt);return;}
  const w = state.settings, step = Math.max(0,Math.min(.1,dt));
  state.u = (state.u + w.flow.x * step) % 1; state.v = (state.v + w.flow.z * step) % 1;
  state.phase = (state.phase + w.waveSpeed * step) % (Math.PI * 2);
  if(state.frameCount>1){
    if(!state.motionClock)state.motionClock=new Float64Array([0,state.frameCount/state.frameRate]);
    state.motionClock[0]=(state.motionClock[0]+step*w.waveSpeed)%state.motionClock[1];
    if(!state.patternTick)state.patternTick=new Float64Array([0,1/w.textureUpdateRate]);state.patternTick[0]+=step;
    if(step===0||state.patternTick[0]>=state.patternTick[1]){state.patternTick[0]%=state.patternTick[1];state.textureFrame=Math.floor(state.motionClock[0]*state.frameRate)%state.frameCount;}
  }
  // The coastal preset carries its evolving ripples in the small T4 frames.
  // A flat surface needs no per-corner CPU work on PS2. Only authored flow,
  // displacement or UV distortion enters the geometry path.
  if(!w.waveHeight&&!w.rippleStrength&&!w.flow.x&&!w.flow.z){
    if(!state.staticUVReady){for(let i=0;i<state.uvs.length;i+=state.uvStride){state.uvs[i]=state.baseUVs[i]*w.tiling;state.uvs[i+1]=state.baseUVs[i+1]*w.tiling;}state.staticUVReady=true;}
    return;
  }
  if(!state.waveTick)state.waveTick=new Float64Array([state.waveClock||0,1/Math.max(1,w.waveUpdateRate)]);
  state.waveTick[0]+=step;
  if(!state.geometryClock)state.geometryClock=new Float64Array([0,1/w.updateRate]);
  state.geometryClock[0]+=step;if(step>0 && state.geometryClock[0]<state.geometryClock[1])return;
  state.geometryClock[0]%=state.geometryClock[1];
  if(!state.waveBasis)prepareWaterArrays(state);
  const updateWaves=state.waveTick[0]>=state.waveTick[1],sin=Math.sin(state.phase),cos=Math.cos(state.phase),basis=state.waveBasis,samples=state.waveSamples;
  for(let i=0,j=0;i<basis.length;i+=8,j+=6){
    samples[j+4]=w.rippleStrength*(basis[i+4]*cos+basis[i+5]*sin);
    samples[j+5]=w.rippleStrength*(basis[i+7]*cos+basis[i+6]*sin);
    if(updateWaves){
      samples[j]=w.waveHeight*(.65*(basis[i]*cos+basis[i+1]*sin)+.35*(basis[i+2]*cos-basis[i+3]*sin));
      if(state.normals){
        const ca=basis[i+1]*cos-basis[i]*sin,cb=basis[i+3]*cos+basis[i+2]*sin;
        const nx=-w.waveHeight*Math.PI*(3.25*ca+.7*cb),nz=-w.waveHeight*Math.PI*(1.3*ca-1.4*cb),length=Math.sqrt(nx*nx+1+nz*nz);
        samples[j+1]=nx/length;samples[j+2]=1/length;samples[j+3]=nz/length;
      }
    }
  }
  if (updateWaves) {
    state.waveTick[0] %= state.waveTick[1];
    for (let i=0; i<state.positions.length; i+=state.stride) {
      const j=state.sampleIndex[i/state.stride]*6;
      state.positions[i+1]=state.basePositions[i+1]+samples[j];
      if(state.normals){
        state.normals[i]=samples[j+1];state.normals[i+1]=samples[j+2];state.normals[i+2]=samples[j+3];
      }
    }
  }
  state.waveClock=state.waveTick[0];
  for (let i=0; i<state.uvs.length; i+=state.uvStride) {
    const j=state.sampleIndex[i/state.uvStride]*6;
    state.uvs[i] = state.baseUVs[i]*w.tiling+state.u+samples[j+4];
    state.uvs[i+1] = state.baseUVs[i+1]*w.tiling+state.v+samples[j+5];
  }
}

function waterGeometryProfile(value) {
  const w=value.waveUpdateRate!==undefined?value:normalizedWater(value);
  return JSON.stringify([w.flow,w.waveHeight,w.waveSpeed,w.rippleStrength,w.updateRate,w.tiling,w.opacity,w.color,w.quality]);
}

// Frames belong to the texture asset, so rename/delete/save work through its
// existing reference. Derived export files never overwrite authored files.
function waterFrameAssets(asset, files=[],value) {
  if(value)asset=waterTextureForQuality(asset,value,files);
  const motion=asset?.waterMotion;
  if(!motion || !Array.isArray(motion.frames) || motion.frames.length<2)return [];
  if(motion.frames.length>64 || !Number.isFinite(motion.fps) || motion.fps<=0 || motion.fps>60 || motion.frames.some(f=>!f?.dataUrl?.startsWith('data:image/png;base64,')))throw Error('Water animation is damaged. Add a new Water object to restore its pattern.');
  return motion.frames.slice(1).map((frame,i)=>({cat:'textures',name:freeAssetName(files,asset.name.replace(/\.[^.]+$/,'')+'_motion_'+String(i+1).padStart(2,'0'),'png'),...frame,image:asset.image}));
}

function waterFrameFingerprint(text) {
  let a=2166136261,b=2246822519;for(let i=0;i<text.length;i++){a=Math.imul(a^text.charCodeAt(i),16777619);b=Math.imul(b^text.charCodeAt(i),3266489917);}
  return text.length+':'+(a>>>0).toString(16)+':'+(b>>>0).toString(16);
}
function upgradeWaterAssets(project) {
  if(typeof WATER_MOTION_DATA==='undefined' || !WATER_MOTION_DATA.frames.length)return;
  for(const asset of project.assets||[]) {
    if(asset.owned!==true || asset.editKind!=='water')continue;
    const previous=WATER_MOTION_DATA.previousFrames,frames=asset.waterMotion?.frames;
    const uneditedLevels=!asset.waterMotion?.levels||Object.entries(asset.waterMotion.levels).every(([size,list])=>list.length===WATER_MOTION_DATA.previousLevels?.[size]?.length&&list.every((f,i)=>waterFrameFingerprint(f.dataUrl||'')===WATER_MOTION_DATA.previousLevels[size][i]));
    const oldBuiltin=uneditedLevels&&asset.waterRevision===3&&previous?.length===32&&waterFrameFingerprint(asset.dataUrl||'')===previous[0]&&
      (asset.waterMotion?.builtin===3||frames?.length===32&&frames.every((f,i)=>waterFrameFingerprint(f.dataUrl||'')===previous[i]));
    if([3,4].includes(asset.waterMotion?.builtin)&&asset.dataUrl===WATER_MOTION_DATA.frames[0].dataUrl)asset.waterMotion={fps:asset.waterMotion.fps,frames:WATER_MOTION_DATA.frames,levels:WATER_MOTION_DATA.levels};
    if(asset.cat==='textures' && (oldBuiltin||asset.dataUrl===WATER_MOTION_DATA.legacy || asset.waterRevision===2&&asset.waterMotion?.frames.length===32&&asset.dataUrl===asset.waterMotion.frames[0]?.dataUrl)){
      Object.assign(asset,WATER_MOTION_DATA.frames[0],{image:{width:WATER_MOTION_DATA.size,height:WATER_MOTION_DATA.size,bpp:4,format:'png'},waterRevision:4,waterMotion:{fps:WATER_MOTION_DATA.fps,frames:WATER_MOTION_DATA.frames,levels:WATER_MOTION_DATA.levels}});
    }
    if(asset.cat==='models' && asset.content===waterMeshOBJ(8))asset.content=waterMeshOBJ();
  }
  for(const scene of project.scenes||[])walk(scene.objects,o=>{
    const w=o.components.water,asset=project.assets.find(a=>a.name===o.components.model?.textureFile&&a.waterMotion);
    if(w&&asset&&w.waveHeight===.025&&[0,.04].includes(w.rippleStrength)&&w.flow?.x===.04&&w.flow?.z===.015){w.waveHeight=0;w.rippleStrength=0;w.flow={x:0,z:0};}
  });
}

// Recovery storage references the editor's immutable preset; portable project
// files still embed every frame. Edited frames/levels are never compacted.
function compactWaterAsset(asset) {
  if(!asset||asset.cat!=='textures'||!asset.owned||![3,4].includes(asset.waterRevision)||typeof WATER_MOTION_DATA==='undefined'||asset.dataUrl!==WATER_MOTION_DATA.frames[0].dataUrl)return asset;
  const motion=asset.waterMotion;
  if(motion?.frames?.length!==WATER_MOTION_DATA.frames.length||motion.frames.some((f,i)=>f.dataUrl!==WATER_MOTION_DATA.frames[i].dataUrl))return asset;
  if(motion.levels&&Object.entries(motion.levels).some(([size,frames])=>frames.length!==WATER_MOTION_DATA.levels[size]?.length||frames.some((f,i)=>f.dataUrl!==WATER_MOTION_DATA.levels[size][i].dataUrl)))return asset;
  return {...asset,waterMotion:{fps:motion.fps,builtin:4}};
}

function waterCausticObject(object, world) {
  const w=normalizedWater(object.components.water);
  if (!w.caustics || !w.causticTexture) return null;
  return {id:`${object.id}:caustics`,name:`${object.name} caustics`,children:[],_waterOwner:object.id,
    components:{shadow:{...makeComponent("shadow"),source:"texture",texture:w.causticTexture,caster:object.name,autoFit:false,
      size:{x:Math.abs(world.scale.x),z:Math.abs(world.scale.z)},lightDir:{x:0,y:1,z:0},grid:{x:WATER_QUALITY_GRIDS[w.quality.caustics]+1,z:WATER_QUALITY_GRIDS[w.quality.caustics]+1},
      color:{r:1,g:1,b:1,a:w.causticStrength},blend:"SHADOW_BLEND_ADD",groundY:world.position.y-w.depth+.02,rayLength:w.depth+2,follow:true}},
    visible:true,exportEnabled:true,ctxEnabled:false};
}
