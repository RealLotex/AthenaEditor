// Bake a directional silhouette once in editor RAM. Runtime instances share
// the indexed image; receivers keep their own texture and no offscreen pass runs.
function shadowBakeProfile(mesh, world, direction, size = 128) {
  const unit = Math.max(Math.abs(world.scale.x), Math.abs(world.scale.y), Math.abs(world.scale.z), .001);
  const scale = {x:world.scale.x/unit, y:world.scale.y/unit, z:world.scale.z/unit};
  const matrix = matFromTRS(v3(), world.rotation, scale);
  const light = shadowProjection({source:'texture',maxStretch:4}, direction).L;
  const projected = mesh.positions.map(p => {
    const x=p[0]*matrix[0]+p[1]*matrix[4]+p[2]*matrix[8];
    const y=p[0]*matrix[1]+p[1]*matrix[5]+p[2]*matrix[9];
    const z=p[0]*matrix[2]+p[1]*matrix[6]+p[2]*matrix[10];
    return [x-light.x/light.y*y, z-light.z/light.y*y];
  });
  let x=.01,z=.01;
  for(const p of projected){x=Math.max(x,Math.abs(p[0]));z=Math.max(z,Math.abs(p[1]));}
  // Symmetric padding about the caster's origin also supports off-centre meshes.
  const extent={x:x*2*(1+6/size), z:z*2*(1+6/size)};
  return {unit,light,extent,projected,key:JSON.stringify([matrix.map(n=>Number(n.toFixed(5))),light,size])};
}

function shadowSilhouettePixels(mesh, profile, size=128) {
  if(![64,128,256,512].includes(size))throw Error('Choose a supported shadow texture size.');
  const mask=new Float32Array(size*size);
  const points=profile.projected.map(p=>[(p[0]/profile.extent.x+.5)*size,(p[1]/profile.extent.z+.5)*size]);
  // Native projector V increases along +Z (shadows.c:419), so image rows do too.
  for(const face of mesh.faces){
    const [a,b,c]=face.map(v=>points[v.v]);
    const den=(b[1]-c[1])*(a[0]-c[0])+(c[0]-b[0])*(a[1]-c[1]);
    if(Math.abs(den)<1e-8)continue;
    const loX=clamp(Math.floor(Math.min(a[0],b[0],c[0])),0,size-1), hiX=clamp(Math.ceil(Math.max(a[0],b[0],c[0])),0,size-1);
    const loY=clamp(Math.floor(Math.min(a[1],b[1],c[1])),0,size-1), hiY=clamp(Math.ceil(Math.max(a[1],b[1],c[1])),0,size-1);
    for(let y=loY;y<=hiY;y++)for(let x=loX;x<=hiX;x++){
      const u=((b[1]-c[1])*(x+.5-c[0])+(c[0]-b[0])*(y+.5-c[1]))/den;
      const v=((c[1]-a[1])*(x+.5-c[0])+(a[0]-c[0])*(y+.5-c[1]))/den;
      if(u>=0&&v>=0&&u+v<=1)mask[y*size+x]=1;
    }
  }
  let source=mask;
  for(let pass=0;pass<2;pass++){
    const next=new Float32Array(mask.length);
    for(let y=1;y<size-1;y++)for(let x=1;x<size-1;x++){
      let sum=0;
      for(let j=-1;j<=1;j++)for(let i=-1;i<=1;i++)sum+=source[(y+j)*size+x+i]*(i===0?2:1)*(j===0?2:1);
      next[y*size+x]=sum/16;
    }
    source=next;
  }
  const data=new Uint8ClampedArray(size*size*4);
  for(let i=0;i<source.length;i++){data[i*4]=data[i*4+1]=data[i*4+2]=255;data[i*4+3]=Math.round(source[i]*15)*17;}
  return {width:size,height:size,data};
}

async function bakeSharedShadows(scene,files,selected,{size=128,signal,onProgress}={}) {
  const objects=exportableObjects(scene.objects),worlds=worldTransforms(scene.objects);
  const sun=objects.find(o=>o.components.light);
  if(!sun)throw Error('Add a directional light before generating shadows.');
  const outputs=[],updates=[],cache=new Map();
  for(let i=0;i<selected.length;i++){
    if(signal?.aborted)throw Error('Bake cancelled.');
    const o=objects.find(o=>o.id===selected[i]);
    if(!o?.components.model || o.components.water || o.components.particles || o.components.animator || o.components.rigidbody?.mode==='dynamic')throw Error('Shared shadow baking requires static models.');
    const file=files.find(f=>f.name===o.components.model.file);
    if(!file?.content||!file.name.toLowerCase().endsWith('.obj'))throw Error(o.name+': shared shadow baking supports OBJ meshes.');
    const mesh=readMeshOBJ(file.content),profile=shadowBakeProfile(mesh,worlds.get(o.id),sun.components.light.direction,size);
    // Vertex coloring creates per-instance OBJ copies; identical silhouettes
    // still share one image regardless of the copied filename or UVs.
    const key=JSON.stringify([mesh.positions,mesh.faces.map(face=>face.map(c=>c.v))])+'|'+profile.key;
    let texture=cache.get(key);
    if(!texture){
      const name=freeAssetName([...files,...outputs],file.name.replace(/\.[^.]+$/,'')+'_shadow','png');
      texture=await textureOutputAsset(shadowSilhouettePixels(mesh,profile,size),name,16);
      texture.editKind='shadow-bake';texture.libraryFolder='Shadows';
      outputs.push(texture);cache.set(key,texture);
    }
    const shadow={...makeComponent('shadow'),source:'texture',texture:texture.name,autoFit:false,lightDir:profile.light,
      size:{x:profile.extent.x*profile.unit,z:profile.extent.z*profile.unit},grid:{x:8,z:8},color:{r:0,g:0,b:0,a:.55}};
    updates.push({id:o.id,shadow,shadowSource:o._shadowBake?o._shadowBake.shadow:o.components.shadow??null});
    onProgress?.((i+1)/selected.length);
  }
  return {outputs,updates,sceneId:scene.id};
}
