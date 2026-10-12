// Topology generation and OBJ serialization run off the input/render thread.
// Weak keys release obsolete brush samples; transfers avoid copying corner arrays.
const TERRAIN_PREVIEW_JOBS=new WeakMap();
let terrainPreviewWorker=null,terrainPreviewJob=0,terrainPreviewActive=0;
const TERRAIN_PREVIEW_PENDING=new Map();
const TERRAIN_PREVIEW_QUEUE=[];
function dispatchTerrainPreviewJob() {
  if(terrainPreviewActive||!terrainPreviewWorker)return;
  const next=TERRAIN_PREVIEW_QUEUE.shift();if(!next)return;
  terrainPreviewActive=next.id;terrainPreviewWorker.postMessage(next.data);
}
function disposeTerrainPreviewWorker() {
  terrainPreviewWorker?.terminate();terrainPreviewWorker=null;
  for(const pending of TERRAIN_PREVIEW_PENDING.values())for(const waiter of pending.waiters)waiter.reject(Error('Terrain preparation cancelled.'));
  TERRAIN_PREVIEW_PENDING.clear();
  TERRAIN_PREVIEW_QUEUE.length=0;terrainPreviewActive=0;
}
function terrainPreviewBuffers(terrain,name='') {
  const mesh=terrainMesh(terrain),positions=new Float32Array(mesh.faces.length*9),normals=new Float32Array(positions.length),uvs=new Float32Array(mesh.faces.length*6);
  let p=0,u=0;
  for(const face of mesh.faces)for(const c of face){positions.set(mesh.positions[c.v],p);normals.set(mesh.normals[c.n],p);uvs.set(mesh.uvs[c.uv],u);p+=3;u+=2;}
  return {positions,normals,uvs,...(name?{content:writeMeshOBJ(mesh,name)}:{})};
}
function prepareTerrainPreview(terrain,name='',owner='') {
  if(!name&&TERRAIN_PREVIEW_JOBS.has(terrain))return TERRAIN_PREVIEW_JOBS.get(terrain);
  const promise=new Promise((resolve,reject)=>{
    if(typeof Worker==='undefined'){resolve(terrainPreviewBuffers(terrain,name));return;}
    if(!terrainPreviewWorker){
      const helpers={clamp,num,vlen,vnorm,vcross,ident,checkTerrain,terrainCell,meshFaceNormal,writeMeshOBJ,terrainMesh,terrainPreviewBuffers};
      const code='const RESERVED=new Set('+JSON.stringify([...RESERVED])+');\n'+Object.entries(helpers).map(([key,fn])=>'const '+key+'='+fn.toString()+';').join('\n')+`\nonmessage=({data:{id,terrain,name}})=>{try{const value=terrainPreviewBuffers(terrain,name);postMessage({id,value},[value.positions.buffer,value.normals.buffer,value.uvs.buffer]);}catch(error){postMessage({id,error:error.message});}};`;
      const url=URL.createObjectURL(new Blob([code],{type:'text/javascript'}));
      terrainPreviewWorker=new Worker(url,{type:'module'});URL.revokeObjectURL(url);
      terrainPreviewWorker.onmessage=({data})=>{const pending=TERRAIN_PREVIEW_PENDING.get(data.id);TERRAIN_PREVIEW_PENDING.delete(data.id);terrainPreviewActive=0;if(pending)for(const waiter of pending.waiters)data.error?waiter.reject(Error(data.error)):waiter.resolve(data.value);dispatchTerrainPreviewJob();};
      terrainPreviewWorker.onerror=error=>{for(const pending of TERRAIN_PREVIEW_PENDING.values())for(const waiter of pending.waiters)waiter.reject(Error(error.message));TERRAIN_PREVIEW_PENDING.clear();TERRAIN_PREVIEW_QUEUE.length=0;terrainPreviewActive=0;terrainPreviewWorker.terminate();terrainPreviewWorker=null;};
    }
    // A gesture can sample faster than topology generation. Keep the latest
    // unsent preview per object, while preserving every explicit export job.
    const queued=!name&&owner?TERRAIN_PREVIEW_QUEUE.find(job=>job.owner===owner&&!job.data.name):null;
    if(queued){TERRAIN_PREVIEW_JOBS.delete(queued.data.terrain);queued.data.terrain=terrain;TERRAIN_PREVIEW_PENDING.get(queued.id).waiters.push({resolve,reject});}
    else {const id=++terrainPreviewJob;TERRAIN_PREVIEW_PENDING.set(id,{waiters:[{resolve,reject}]});TERRAIN_PREVIEW_QUEUE.push({id,owner,data:{id,terrain,name}});}
    dispatchTerrainPreviewJob();
  });
  if(!name)TERRAIN_PREVIEW_JOBS.set(terrain,promise);return promise;
}
