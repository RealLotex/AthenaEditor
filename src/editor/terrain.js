// Editor data stays editable; the game receives an ordinary OBJ and one atlas.
// Shared corners and edge midpoints form one continuous surface.
const TERRAIN_MESH_VERSION=5;
function makeTerrain(width = 32, depth = 32) {
  width = Math.round(clamp(num(width, 32), 4, 64));
  depth = Math.round(clamp(num(depth, 32), 4, 64));
  return { version: 1, width, depth, cellSize: 1, stepHeight: 1,
    bevel: .28, levels: Array(width * depth).fill(0),
    hills: Array((width + 1) * (depth + 1)).fill(0),
    surfaces: Array(width * depth).fill(0), textures: ["", "", "", ""] };
}

function checkTerrain(t) {
  if (!t || t.version !== 1 || !Number.isInteger(t.width) || !Number.isInteger(t.depth) ||
      t.width < 4 || t.width > 64 || t.depth < 4 || t.depth > 64 ||
      !Number.isFinite(t.cellSize) || t.cellSize < .1 || t.cellSize > 100 ||
      !Number.isFinite(t.stepHeight) || t.stepHeight < .1 || t.stepHeight > 100 ||
      !Number.isFinite(t.bevel) || t.bevel < .02 || t.bevel > .45 ||
      t.levels?.length !== t.width * t.depth || t.surfaces?.length !== t.width * t.depth ||
      t.hills?.length !== (t.width + 1) * (t.depth + 1) ||
      t.levels.some(n => !Number.isInteger(n) || n < 0 || n > 16) ||
      t.surfaces.some(n => !Number.isInteger(n) || n < 0 || n > 2) ||
      t.hills.some(n => !Number.isFinite(n) || Math.abs(n) > 100)) {
    throw Error("This terrain has invalid data. Undo the last change or reopen your saved project.");
  }
  return t;
}

function terrainCell(t, x, z) {
  return x >= 0 && z >= 0 && x < t.width && z < t.depth ? z * t.width + x : -1;
}

function terrainBrush(t, point, tool) {
  checkTerrain(t);
  const next = deepClone(t), radius = clamp(num(tool.size, 1), 1, 16) / 2;
  const gx = point.x / t.cellSize + t.width / 2,
    gz = point.z / t.cellSize + t.depth / 2;
  if (gx < 0 || gz < 0 || gx >= t.width || gz >= t.depth) return next;
  if (tool.mode === "cliffs" || tool.mode === "paint") {
    const size = Math.round(radius * 2), cx = Math.floor(gx), cz = Math.floor(gz),
      startX = cx - Math.floor(size / 2), startZ = cz - Math.floor(size / 2);
    for (let z = startZ; z < startZ + size; z++) for (let x = startX; x < startX + size; x++) {
      const i = terrainCell(t, x, z);
      if (i < 0) continue;
      if (tool.mode === "cliffs") next.levels[i] = tool.reverse ? 0 : Math.round(clamp(num(tool.level, 1), 0, 16));
      else next.surfaces[i] = tool.reverse ? 0 : Math.round(clamp(num(tool.surface, 0), 0, 2));
    }
  } else {
    const r = Math.max(radius, .8), strength = clamp(num(tool.strength, .25), .01, 2);
    for (let z = Math.max(0, Math.floor(gz - r)); z <= Math.min(t.depth, Math.ceil(gz + r)); z++) {
      for (let x = Math.max(0, Math.floor(gx - r)); x <= Math.min(t.width, Math.ceil(gx + r)); x++) {
        const distance = Math.hypot(x - gx, z - gz);
        if (distance >= r) continue;
        const i = z * (t.width + 1) + x, weight = (1 - distance / r) ** 2;
        let target;
        if (tool.hillMode === "smooth") {
          const neighbours = [[x-1,z],[x+1,z],[x,z-1],[x,z+1]]
            .filter(([a,b]) => a >= 0 && b >= 0 && a <= t.width && b <= t.depth);
          target = neighbours.reduce((sum,[a,b]) => sum + t.hills[b*(t.width+1)+a],0) / neighbours.length;
          next.hills[i] += (target - t.hills[i]) * weight * Math.min(1,strength);
        } else if (tool.hillMode === "flatten") {
          next.hills[i] += (num(tool.flattenHeight, 0) - t.hills[i]) * weight * Math.min(1,strength);
        } else next.hills[i] += weight * strength * (tool.reverse ? -1 : 1);
        next.hills[i] = clamp(next.hills[i], -100, 100);
      }
    }
  }
  return next;
}

function terrainMesh(t) {
  checkTerrain(t);
  const mesh = { positions: [], uvs: [], normals: [], faces: [] };
  const centres=t.levels.map((level,i)=>{
    const x=i%t.width,z=Math.floor(i/t.width);let dx=0,dz=0,connected=false;
    for(const [a,b] of [[-1,0],[1,0],[0,-1],[0,1]]) {
      const n=terrainCell(t,x+a,z+b);
      if(n>=0&&t.levels[n]===level)connected=true;
      if(n>=0&&t.levels[n]!==level){const width=Math.min(.45,t.bevel*(1+.22*Math.sin(x*12.17+z*7.31)));dx-=a*width;dz-=b*width;}
    }
    return {x:x+.5+dx,z:z+.5+dz,level,connected};
  });
  const hill=(gx,gz)=>{
    const x=clamp(gx,0,t.width),z=clamp(gz,0,t.depth),a=Math.min(Math.floor(x),t.width-1),b=Math.min(Math.floor(z),t.depth-1),u=x-a,v=z-b,
      h=(p,q)=>t.hills[q*(t.width+1)+p];
    return h(a,b)*(1-u)*(1-v)+h(a+1,b)*u*(1-v)+h(a+1,b+1)*u*v+h(a,b+1)*(1-u)*v;
  };
  const vertex=(x,z,cells)=>{
    const valid=cells.map(([a,b])=>terrainCell(t,a,b)).filter(i=>i>=0),
      average=key=>valid.reduce((sum,i)=>sum+centres[i][key],0)/valid.length;
    let gx=x===0||x===t.width?x:average("x"),gz=z===0||z===t.depth?z:average("z");
    const level=average("level");
    // A shared, small contour variation gives rock facets, without cracks or teeth.
    if(valid.some(i=>centres[i].level!==level)) {
      if(gx>0&&gx<t.width)gx+=Math.sin(x*17.13+z*7.71)*t.bevel*.18;
      if(gz>0&&gz<t.depth)gz+=Math.sin(x*5.39-z*19.17)*t.bevel*.18;
    }
    return {x:gx,z:gz,level,cells:valid,p:[(gx-t.width/2)*t.cellSize,level*t.stepHeight+hill(gx,gz),(gz-t.depth/2)*t.cellSize]};
  };
  const corners=[],horizontal=[],vertical=[];
  for(let z=0;z<=t.depth;z++)for(let x=0;x<=t.width;x++)corners.push(vertex(x,z,[[x-1,z-1],[x,z-1],[x-1,z],[x,z]]));
  for(let z=0;z<=t.depth;z++)for(let x=0;x<t.width;x++)horizontal.push(vertex(x+.5,z,[[x,z-1],[x,z]]));
  for(let z=0;z<t.depth;z++)for(let x=0;x<=t.width;x++)vertical.push(vertex(x,z+.5,[[x-1,z],[x,z]]));
  const strips=new Map();
  const tri=(points,surface,uvs,strip=false)=>{
    const [a,b,c]=points.map(v=>v.p),cross=vcross({x:b[0]-a[0],y:b[1]-a[1],z:b[2]-a[2]},{x:c[0]-a[0],y:c[1]-a[1],z:c[2]-a[2]});
    if(Math.hypot(cross.x,cross.y,cross.z)<1e-10)return;
    const base=mesh.positions.length,uv=mesh.uvs.length;
    mesh.positions.push(...points.map(v=>v.p));
    const face=[0,1,2].map(i=>({v:base+i,uv:uv+i,n:-1})),normal=meshFaceNormal(mesh,face);
    if(strip) {
      // Equal-height neighbours share their grass lip. Remove the two internal
      // faces where their strips meet, leaving one connected outside surface.
      const key=points.map(v=>v.p.map(n=>n.toFixed(7)).join(",")).sort().join("|");
      const previous=strips.get(key);
      if(previous && normal.x*previous.normal.x+normal.y*previous.normal.y+normal.z*previous.normal.z<-.99){mesh.faces[previous.index]=null;strips.delete(key);return;}
      strips.set(key,{index:mesh.faces.length,normal});
    }
    const n=mesh.normals.push([normal.x,normal.y,normal.z])-1,pad=2/256;
    for(const [u,v] of uvs)mesh.uvs.push([surface%2/2+pad+clamp(u,0,1)*(.5-2*pad),1-Math.floor(surface/2)/2-pad-clamp(v,0,1)*(.5-2*pad)]);
    face.forEach(c=>c.n=n);mesh.faces.push(face);
  };
  const bottom=Math.min(...t.hills)-t.cellSize,maxLevel=Math.max(1,...t.levels);
  for(let z=0;z<t.depth;z++)for(let x=0;x<t.width;x++) {
    const i=z*t.width+x,c=centres[i],centre={...c,p:[(c.x-t.width/2)*t.cellSize,c.level*t.stepHeight+hill(c.x,c.z),(c.z-t.depth/2)*t.cellSize]},
      ring=[corners[z*(t.width+1)+x],horizontal[z*t.width+x],corners[z*(t.width+1)+x+1],vertical[z*(t.width+1)+x+1],
        corners[(z+1)*(t.width+1)+x+1],horizontal[(z+1)*t.width+x],corners[(z+1)*(t.width+1)+x],vertical[z*(t.width+1)+x]],
      alongX=Math.abs(ring[5].level-ring[1].level)>=Math.abs(ring[3].level-ring[7].level),
      cap=ring.map(v=>{
        if(v.level===c.level)return v;
        const same=v.cells.filter(j=>centres[j].level===c.level),
          average=key=>same.reduce((sum,j)=>sum+centres[j][key],0)/same.length,
          connected=same.some(j=>centres[j].connected),
          inset=v.cells.length===4&&same.length===1?(connected?.8:.65):v.cells.length===4&&same.length===3?.55:connected?.7:.5,
          gx=v.x+(average("x")-v.x)*inset,gz=v.z+(average("z")-v.z)*inset;
        return {x:gx,z:gz,level:c.level,p:[(gx-t.width/2)*t.cellSize,c.level*t.stepHeight+hill(gx,gz),(gz-t.depth/2)*t.cellSize]};
      }),
      groundUV=p=>[(x%4+p.x-x)/4,(z%4+p.z-z)/4],
      rockUV=p=>[alongX?(x%4+p.x-x)/4:(z%4+p.z-z)/4,p.level/maxLevel];
    for(let k=0;k<8;k++) {
      const next=(k+1)%8,points=[centre,cap[next],cap[k]];
      tri(points,t.surfaces[i],points.map(groundUV));
      for(const strip of [[cap[k],ring[next],ring[k]],[cap[k],cap[next],ring[next]]])tri(strip,3,strip.map(rockUV),true);
      const perimeter=(k<2&&z===0)||(k>=2&&k<4&&x===t.width-1)||(k>=4&&k<6&&z===t.depth-1)||(k>=6&&x===0);
      if(perimeter) {
        const a=ring[k],b=ring[(k+1)%8],aa={...a,p:[a.p[0],bottom,a.p[2]]},bb={...b,p:[b.p[0],bottom,b.p[2]]};
        tri([aa,b,a],3,[[0,1],[1,0],[0,0]]);tri([aa,bb,b],3,[[0,1],[1,1],[1,0]]);
      }
    }
  }
  mesh.faces=mesh.faces.filter(Boolean);
  // OBJ supports independent indices. Share identical values and discard the
  // temporary vertices of cancelled strips so saved/exported meshes stay small.
  for(const [field,index] of [["positions","v"],["uvs","uv"],["normals","n"]]) {
    const values=mesh[field],shared=[],indices=new Map();
    for(const face of mesh.faces)for(const corner of face){
      const value=values[corner[index]],key=value.join(",");
      if(!indices.has(key)){indices.set(key,shared.length);shared.push(value);}
      corner[index]=indices.get(key);
    }
    mesh[field]=shared;
  }
  return mesh;
}

// Four small original pixel textures; custom images can replace each slot.
function terrainAtlasPixels() {
  const width=256,height=256,data=new Uint8ClampedArray(width*height*4);
  const colors=[[107,153,48],[124,99,63],[126,132,132],[68,68,61]];
  const noise=(u,v,n,seed)=>{
    const x=Math.floor(u*n),y=Math.floor(v*n),fx=u*n-x,fy=v*n-y,
      hash=(a,b)=>{
        let h=Math.imul((a+n)%n+seed,374761393)+Math.imul((b+n)%n+seed,668265263);
        h=Math.imul(h^(h>>>13),1274126177);return ((h^(h>>>16))>>>0)/4294967295;
      },
      sx=fx*fx*(3-2*fx),sy=fy*fy*(3-2*fy);
    return (hash(x,y)*(1-sx)+hash(x+1,y)*sx)*(1-sy)+(hash(x,y+1)*(1-sx)+hash(x+1,y+1)*sx)*sy;
  };
  for(let y=0;y<height;y++)for(let x=0;x<width;x++) {
    const slot=(x>=128?1:0)+(y>=128?2:0),u=x%128/128,v=y%128/128,
      coarse=noise(u,v,8,41),detail=noise(u,v,32,17),grain=noise(u,v,128,13),
      relief=(coarse-.5)*65+(detail-.5)*38+(grain-.5)*26,
      moss=slot===3?clamp((noise(u,v,5,31)-.59)*7,0,.65):0,c=colors[slot],i=(y*width+x)*4;
    for(let k=0;k<3;k++)data[i+k]=clamp(c[k]+relief+([26,47,-9][k])*moss,0,255);
    data[i+3]=255;
  }
  return {width,height,data};
}

// Rebuild old generated resources once; authored height/paint data stays intact.
function upgradeTerrainGeometry(project) {
  const regenerated=new Set(),outdated=new Set((project.assets||[]).filter(f=>f.editKind==="terrain"&&f.owned&&f.terrainMeshVersion!==TERRAIN_MESH_VERSION).map(f=>f.name));
  const visit=obj=>{
    if(!obj._terrain || !obj.components.model)return;
    const model=obj._lightingBake?.model||obj.components.model,
      asset=project.assets?.find(f=>f.name===model.file&&f.editKind==="terrain"&&f.owned);
    const texture=project.assets?.find(f=>f.name===model.textureFile&&f.editKind==="terrain"&&f.owned);
    if(texture && typeof TERRAIN_DEFAULT_ATLAS!=="undefined" && texture.terrainTextureVersion!==TERRAIN_DEFAULT_ATLAS.terrainTextureVersion && !(obj._terrain.textures||[]).some(Boolean))Object.assign(texture,deepClone(TERRAIN_DEFAULT_ATLAS),{mtime:Date.now()});
    if(!asset || !outdated.has(asset.name))return;
    checkTerrain(obj._terrain);
    if(obj._terrain.bevel===.18)obj._terrain.bevel=.28;
    if(!regenerated.has(asset.name)) {
      Object.assign(asset,textMeshAsset(asset.name,writeMeshOBJ(terrainMesh(obj._terrain),obj.name)),{terrainMeshVersion:TERRAIN_MESH_VERSION});
      regenerated.add(asset.name);
    }
    if(obj._lightingBake){obj.components.model=deepClone(model);delete obj._lightingBake;}
  };
  for(const scene of project.scenes||[])walk(scene.objects,visit);
  for(const prefab of project.prefabs||[])walk([prefab],visit);
  return project;
}

async function terrainAtlasAsset(t, files, name) {
  if(!(t.textures||[]).some(Boolean) && typeof TERRAIN_DEFAULT_ATLAS!=="undefined")return {id:uid(),name,cat:"textures",...deepClone(TERRAIN_DEFAULT_ATLAS),owned:true,mtime:Date.now(),editKind:"terrain",libraryFolder:"Generated/Terrain"};
  const image=terrainAtlasPixels();
  for(let slot=0;slot<4;slot++) {
    const filename=t.textures?.[slot];
    if(!filename)continue;
    const file=files.find(f=>f.cat==="textures"&&f.name===filename);
    if(!file)throw Error(`The terrain texture ${filename} is missing.`);
    const pixels=resizeTexturePixels(await readTexturePixels(file),124,124,false);
    const ox=slot%2*128,oy=Math.floor(slot/2)*128;
    for(let y=0;y<128;y++)for(let x=0;x<128;x++) {
      const a=(clamp(y-2,0,123)*124+clamp(x-2,0,123))*4,
        b=((oy+y)*256+ox+x)*4;
      image.data.set(pixels.data.subarray(a,a+4),b);
    }
  }
  return {...await textureOutputAsset(image,name),terrainTextureVersion:TERRAIN_DEFAULT_ATLAS.terrainTextureVersion,editKind:"terrain",libraryFolder:"Generated/Terrain"};
}

function addEditorTerrain(project, scene, width, depth, atlas, external=[]) {
  const obj=mkObject(uniqueName("Terrain",scene.objects));
  obj._terrain=makeTerrain(width,depth);
  const files=editorAssets(project,external),name=freeAssetName(files,"terrain","obj");
  putProjectAsset(project,{...textMeshAsset(name,writeMeshOBJ(terrainMesh(obj._terrain),obj.name)),
    editKind:"terrain",terrainMeshVersion:TERRAIN_MESH_VERSION,libraryFolder:"Generated/Terrain",terrainOwner:obj.id});
  putProjectAsset(project,{...atlas,terrainOwner:obj.id});
  obj.components.model={...makeComponent("model"),file:name,textureFile:atlas.name,textureFilter:"NEAREST"};
  obj.components.rigidbody={...makeComponent("rigidbody"),mode:"static",shape:"mesh"};
  scene.physics.enabled=true;
  scene.objects.push(obj);return obj;
}

function applyEditorTerrain(project, id, terrain, external=[], atlas=null) {
  checkTerrain(terrain);
  const obj=findObj(activeScene(project).objects,id);
  if(!obj?._terrain||!obj.components.model)throw Error("Select the terrain again before editing it.");
  if(!atlas && JSON.stringify(obj._terrain)===JSON.stringify(terrain))return;
  if(obj._lightingBake?.model)obj.components.model=deepClone(obj._lightingBake.model);
  const files=editorAssets(project,external),source=files.find(f=>f.name===obj.components.model.file);
  let uses=0;
  for(const sc of project.scenes)walk(sc.objects,o=>{if(o.components.model?.file===source?.name)uses++;});
  for(const pf of project.prefabs||[])walk([pf],o=>{if(o.components.model?.file===source?.name)uses++;});
  // Duplicates/prefabs share their starting mesh until their first own edit.
  const name=source?.owned&&source.editKind==="terrain"&&uses===1 ? source.name : freeAssetName(files,obj.name+"_terrain","obj");
  putProjectAsset(project,{...textMeshAsset(name,writeMeshOBJ(terrainMesh(terrain),obj.name)),
    editKind:"terrain",terrainMeshVersion:TERRAIN_MESH_VERSION,libraryFolder:"Generated/Terrain",terrainOwner:obj.id});
  obj.components.model.file=name;obj._terrain=deepClone(terrain);
  delete obj._lightingBake;
  if(atlas){putProjectAsset(project,{...atlas,terrainOwner:obj.id});obj.components.model.textureFile=atlas.name;}
}

function terrainAtlasName(project,id,external=[]) {
  const object=findObj(activeScene(project).objects,id), files=editorAssets(project,external),
    source=files.find(f=>f.name===object?.components.model?.textureFile);
  let uses=0;
  const count=o=>{if(o.components.model?.textureFile===source?.name)uses++;};
  for(const sc of project.scenes)walk(sc.objects,count);
  for(const pf of project.prefabs||[])walk([pf],count);
  return source?.owned&&source.editKind==="terrain"&&uses===1?source.name:freeAssetName(files,(object?.name||"terrain")+"_atlas","png");
}
