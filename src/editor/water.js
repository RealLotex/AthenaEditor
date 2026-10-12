function waterMeshOBJ(segments=16) {
  const lines=["o Water"];
  for(let z=0;z<=segments;z++)for(let x=0;x<=segments;x++){
    lines.push(`v ${x/segments-.5} 0 ${z/segments-.5}`,`vt ${x/segments} ${z/segments}`);
  }
  lines.push("vn 0 1 0");
  for(let z=0;z<segments;z++)for(let x=0;x<segments;x++){
    const a=z*(segments+1)+x+1,b=a+1,c=a+segments+1,d=c+1;
    lines.push(`f ${a}/${a}/1 ${c}/${c}/1 ${b}/${b}/1`,`f ${b}/${b}/1 ${c}/${c}/1 ${d}/${d}/1`);
  }
  return lines.join("\n")+"\n";
}

function legacyWaterPatternPixels(caustics=false,size=128) {
  const data=new Uint8ClampedArray(size*size*4),sites=[];
  const hash=n=>{const f=Math.sin(n*127.1+311.7)*43758.5453;return f-Math.floor(f);};
  for(let z=0;z<4;z++)for(let x=0;x<4;x++)sites.push([(x+.2+hash(x+z*4)*.6)/4,(z+.2+hash(x+z*4+17)*.6)/4]);
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/(size-1),v=y/(size-1);let a=Infinity,b=Infinity;
    for(const site of sites){let dx=Math.abs(u-site[0]),dy=Math.abs(v-site[1]);dx=Math.min(dx,1-dx);dy=Math.min(dy,1-dy);const d=dx*dx+dy*dy;if(d<a){b=a;a=d;}else if(d<b)b=d;}
    const edge=Math.max(0,1-(Math.sqrt(b)-Math.sqrt(a))*45),at=(y*size+x)*4;
    if(caustics){data[at]=data[at+1]=data[at+2]=255;data[at+3]=Math.round(edge**2*255);}
    else{data[at]=Math.round(18+edge*155);data[at+1]=Math.round(112+edge*117-Math.min(20,a*600));data[at+2]=Math.round(205+edge*50);data[at+3]=255;}
  }
  return {width:size,height:size,data};
}

// Periodic 3D Voronoi: XY covers the surface; the third coordinate advances
// through the volume. Nearby cells only, rather than every site per pixel.
function waterPatternPixels(caustics=false,size=128,slice=0) {
  if(caustics)return legacyWaterPatternPixels(true,size);
  const data=new Uint8ClampedArray(size*size*4),tau=Math.PI*2,t=((slice%1)+1)%1*tau;
  // Smooth periodic height derivatives create broad reflected ripples. Avoid
  // the discontinuous nearest-site edges that made Voronoi resemble lightning.
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/(size-1)*tau,v=y/(size-1)*tau;
    const a=u*3+v*2+t,b=u*2-v*3-t,c=u*5+v+t*2;
    const nx=.28*Math.cos(a)+.17*Math.cos(b)+.06*Math.cos(c),nz=.19*Math.cos(a)-.22*Math.cos(b)+.03*Math.cos(c);
    const reflected=Math.max(0,1-Math.abs(nx*.8+nz*.5-.08)*5),glint=Math.pow(reflected,3)*.36;
    const depth=.5+.5*Math.sin(u+v+Math.sin(a)*.15),at=(y*size+x)*4;
    data[at]=Math.round(12+depth*10+glint*115);data[at+1]=Math.round(122+depth*22+glint*90);data[at+2]=Math.round(180+depth*20+glint*65);data[at+3]=255;
  }
  return {width:size,height:size,data};
}

async function bakeWaterMotion(size=512) {
  const images=Array.from({length:32},(_,i)=>waterPatternPixels(false,size,i/32));
  const sample={width:size,height:size*images.length,data:new Uint8ClampedArray(size*size*images.length*4)};
  for(let i=0;i<images.length;i++)sample.data.set(images[i].data,i*size*size*4);
  // Every frame uses the same palette, so highlights evolve without color pops.
  const indexed=quantizeSkybox(sample,16),frames=[];
  const levels={};
  for(let i=0;i<images.length;i++){
    const bytes=await indexedTexturePNG({...indexed,height:size,indices:indexed.indices.subarray(i*size*size,(i+1)*size*size)});
    frames.push({dataUrl:bytesDataURL(bytes),size:bytes.length});
  }
  for(const resolution of WATER_TEXTURE_SIZES.filter(s=>s<size)){
    const level=[];
    for(let frame=0;frame<images.length;frame++){
      const indices=new Uint8Array(resolution*resolution),base=frame*size*size;
      for(let y=0;y<resolution;y++)for(let x=0;x<resolution;x++)indices[y*resolution+x]=indexed.indices[base+Math.round(y*(size-1)/(resolution-1))*size+Math.round(x*(size-1)/(resolution-1))];
      const bytes=await indexedTexturePNG({...indexed,width:resolution,height:resolution,indices});level.push({dataUrl:bytesDataURL(bytes),size:bytes.length});
    }
    levels[resolution]=level;
  }
  const caustics=await indexedTexturePNG(quantizeTexture(waterPatternPixels(true,size),16));
  const legacy=await indexedTexturePNG(quantizeTexture(legacyWaterPatternPixels(),16));
  return {fps:60,size,frames,levels,caustics:{dataUrl:bytesDataURL(caustics),size:caustics.length},legacy:bytesDataURL(legacy)};
}

async function prepareWaterAssets() {
  const assets=[{name:"water_surface.obj",cat:"models",content:waterMeshOBJ(),editKind:"water",owned:true,libraryFolder:"Water"}];
  const motion=WATER_MOTION_DATA;
  for(const caustics of [false,true]){
    const image=caustics?motion.caustics:motion.frames[0];
    assets.push({name:caustics?"water_caustics.png":"water_tropical.png",cat:"textures",...image,...(!caustics?{waterMotion:{fps:motion.fps,frames:motion.frames,levels:motion.levels},waterRevision:4}:{}),
      image:{width:motion.size,height:motion.size,bpp:4,format:"png"},editKind:"water",owned:true,libraryFolder:"Water"});
  }
  return assets;
}

function installGeneratedAssets(project,assets,external=[]) {
  const names=[];
  for(const asset of assets){
    const files=editorAssets(project,external),same=files.find(f=>f.cat===asset.cat&&(asset.content!==undefined?f.content===asset.content:f.dataUrl===asset.dataUrl));
    if(same)names.push(same.name);
    else {const name=freeAssetName(files,asset.name.replace(/\.[^.]+$/,""),asset.name.split(".").at(-1));putProjectAsset(project,{...asset,name});names.push(name);}
  }
  return names;
}

function addWaterObject(project,scene,assets,external=[]) {
  const names=installGeneratedAssets(project,assets,external);
  const object=mkObject(uniqueName("Water",allObjects(scene.objects||[])));
  object.components.transform.scale={x:32,y:1,z:32};object.components.transform.position.y=2;
  object.components.model={...makeComponent("model"),file:names[0],textureFile:names[1],textureFilter:"LINEAR",pipeline:"PL_NO_LIGHTS",face_culling:"CULL_FACE_NONE",accurate_clipping:true};
  object.components.water={...makeComponent("water"),caustics:true,causticTexture:names[2]};
  scene.objects.push(object);return object;
}
