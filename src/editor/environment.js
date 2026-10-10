// Static AO + vertex lighting uses RAM only. Keep UVs and diffuse textures intact.
async function bakeEnvironmentVertices(scene,files,selected,settings,{signal,onProgress}={}) {
  const env=normalizedEnvironment(settings),objects=exportableObjects(scene.objects),worlds=worldTransforms(scene.objects);
  const lights=objects.filter(o=>o.components.light).map(o=>o.components.light),blockers=[],outputs=[],updates=[];
  const direction=new THREE.Vector3(),origin=new THREE.Vector3(),normal=new THREE.Vector3(),tangent=new THREE.Vector3(),bitangent=new THREE.Vector3();
  let yieldTime=performance.now();
  try{
    for(const o of objects){
      if(!o.components.model || o.components.water || o.components.particles || o.components.animator || o.components.rigidbody?.mode==='dynamic')continue;
      const file=files.find(f=>f.name===o.components.model.file);
      if(!file?.content || !/\.obj$/i.test(file.name))continue;
      const blocker=new THREE.Mesh(parseOBJ(file.content),new THREE.MeshBasicMaterial({side:THREE.DoubleSide}));
      const w=worlds.get(o.id);blocker.matrixAutoUpdate=false;blocker.matrix.fromArray(matFromTRS(w.position,w.rotation,w.scale));blocker.updateMatrixWorld(true);blockers.push(blocker);
    }
    const occluders=new EnvironmentOcclusionIndex(blockers),rayCount={draft:3,balanced:6,high:12}[env.quality];
    for(let index=0;index<selected.length;index++){
      const object=objects.find(o=>o.id===selected[index]);
      if(!object?.components.model || object.components.water || object.components.particles || object.components.animator || object.components.rigidbody?.mode==='dynamic')throw Error('Vertex coloring requires static models.');
      const source=object._environmentBake?.model||object.components.model;
      const file=files.find(f=>f.name===source.file);
      if(!file?.content || !/\.obj$/i.test(file.name))throw Error(object.name+': vertex coloring supports OBJ meshes.');
      const mesh=readMeshOBJ(file.content),w=worlds.get(object.id),matrix=new THREE.Matrix4().fromArray(matFromTRS(w.position,w.rotation,w.scale)),normals=new THREE.Matrix3().getNormalMatrix(matrix),colors=[];
      const diffuse=new Map();
      // Neutralizing native diffuse must retain untextured MTL colors. Explicit
      // texture overrides use white, matching the native RenderData constructor.
      if(!source.textureFile||source.texture_mapping===false)for(const library of mesh.materialLibraries){
        const material=files.find(f=>f.name===library||f.name===library.split(/[\\/]/).at(-1));let current='';
        for(const line of (material?.content||'').split(/\r?\n/)){const [key,...args]=line.trim().split(/\s+/);if(key==='newmtl')current=args.join(' ');if(key==='Kd'&&args.length>=3)diffuse.set(current,args.slice(0,3).map(v=>clamp(num(Number(v),1),0,1)));}
      }
      // Cache duplicate position/normal corners inside a mesh (UV seams don't
      // change AO); at most 12 short rays for each unique surface vertex.
      const samples=new Map();
      const colorSettings={...env,lighting:env.lighting&&!object._lightingBake};
      for(let f=0;f<mesh.faces.length;f++){
        if(signal?.aborted)throw Error('Vertex coloring cancelled.');
        const face=mesh.faces[f],faceNormal=meshFaceNormal(mesh,face);
        for(const c of face){
          const key=c.v+':'+(c.n>=0?c.n:[faceNormal.x,faceNormal.y,faceNormal.z].join(','));
          let color=samples.get(key);
          if(!color){
            normal.fromArray(mesh.normals[c.n]||[faceNormal.x,faceNormal.y,faceNormal.z]).applyMatrix3(normals).normalize();
            origin.fromArray(mesh.positions[c.v]).applyMatrix4(matrix).addScaledVector(normal,.002);
            tangent.set(Math.abs(normal.y)<.9?0:1,Math.abs(normal.y)<.9?1:0,0).cross(normal).normalize();bitangent.crossVectors(normal,tangent);
            let covered=0;
            for(let s=0;s<rayCount;s++){
              const r=Math.sqrt((s+.5)/rayCount),angle=s*2.399963229728653;
              direction.copy(normal).multiplyScalar(Math.sqrt(1-r*r)).addScaledVector(tangent,r*Math.cos(angle)).addScaledVector(bitangent,r*Math.sin(angle));
              const distance=occluders.trace(origin,direction,env.radius);
              if(distance!==null)covered+=1-distance/env.radius;
            }
            color=evaluateEnvironmentColor(normal,covered/rayCount,lights,colorSettings);samples.set(key,color);
          }
          const base=diffuse.get(mesh.materials[f]);colors.push(...(base?color.map((v,k)=>v*base[k]):color));
        }
        if(f%64===0&&performance.now()-yieldTime>8){onProgress?.((index+f/mesh.faces.length)/selected.length);await new Promise(resolve=>setTimeout(resolve,0));yieldTime=performance.now();}
      }
      const name=freeAssetName([...files,...outputs],object.name+'_environment','obj');
      // Triangulate the saved mesh too: native OBJ buffers have one entry per
      // corner, whereas an authored quad would otherwise have only four.
      outputs.push({...textMeshAsset(name,writeMeshOBJ(mesh,object.name)),vertexColors:colors,editKind:'vertex-colors',libraryFolder:'Environment'});
      updates.push({id:object.id,model:{...source,file:name,pipeline:env.lighting?'PL_NO_LIGHTS':source.pipeline},environmentSource:source});
    }
    onProgress?.(1);return {outputs,updates,sceneId:scene.id};
  }finally{for(const mesh of blockers)disposeObject(mesh);}
}

async function prepareReflectionAsset(preset='coastal',strength=.5) {
  const size=128,data=new Uint8ClampedArray(size*size*4),amount=clamp(num(strength,.5),0,1);
  const colors={coastal:[[.06,.32,.7],[.75,.94,1]],sunset:[[.23,.12,.4],[1,.65,.35]],night:[[.02,.06,.16],[.2,.55,.85]]};
  const [dark,light]=colors[preset]||colors.coastal;
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const u=x/(size-1),v=y/(size-1),cloud=Math.max(0,Math.sin(u*12+Math.sin(v*9))*Math.cos(v*13)),horizon=Math.exp(-(((v-.5)*12)**2));
    const mix=clamp((1-v)*.6+cloud*.25+horizon*.45,0,1),at=(y*size+x)*4;
    for(let k=0;k<3;k++)data[at+k]=Math.round((dark[k]+(light[k]-dark[k])*mix)*amount*255);
    data[at+3]=255;
  }
  return {...await textureOutputAsset({width:size,height:size,data},'reflection_'+preset+'.png',16),editKind:'reflection',libraryFolder:'Environment'};
}
