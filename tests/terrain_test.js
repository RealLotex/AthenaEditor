import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { load, shutdown } from "./_load.js";
const A=await load();
const atlas={name:"terrain_atlas.png",cat:"textures",owned:true,editKind:"terrain",libraryFolder:"Generated/Terrain",dataUrl:"data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aZ1kAAAAASUVORK5CYII=",image:{width:256,height:256,format:"png",bpp:8}};

Deno.test("terrain paint: one tile, bounded brush, erase, and independent ground material",()=>{
  const t=A.makeTerrain(8,8),p={x:.5,z:.5};
  const raised=A.terrainBrush(t,p,{mode:"cliffs",size:1,level:3});
  assertEquals(t.levels.every(n=>n===0),true);
  assertEquals(raised.levels.filter(n=>n===3).length,1);
  for(const size of [2,3,4,5,6])assertEquals(A.terrainBrush(t,p,{mode:"cliffs",size,level:3}).levels.filter(n=>n===3).length,size*size);
  const painted=A.terrainBrush(raised,p,{mode:"paint",size:1,surface:2});
  assertEquals(painted.levels,raised.levels);assertEquals(painted.surfaces.filter(n=>n===2).length,1);
  const erased=A.terrainBrush(painted,p,{mode:"cliffs",size:1,reverse:true});
  assertEquals(erased.levels,t.levels);assertEquals(erased.surfaces,painted.surfaces);
  assertEquals(A.terrainBrush(t,{x:100,z:100},{mode:"cliffs",size:16,level:5}),t);
});
Deno.test("terrain hills: raise/lower, smooth and flatten preserve cliff levels",()=>{
  const t=A.makeTerrain(8,8),p={x:0,z:0};
  t.levels[4*8+4]=3;
  const raised=A.terrainBrush(t,p,{mode:"hills",size:6,strength:.5});
  assert(raised.hills.some(n=>n>0));assertEquals(raised.levels,t.levels);
  const lowered=A.terrainBrush(raised,p,{mode:"hills",size:6,strength:.5,reverse:true});
  assert(lowered.hills.every(n=>Math.abs(n)<1e-8));
  const flat=A.terrainBrush(raised,p,{mode:"hills",size:6,strength:1,hillMode:"flatten"});
  assertEquals(flat.hills[4*9+4],0);
  const smooth=A.terrainBrush(raised,p,{mode:"hills",size:6,strength:1,hillMode:"smooth"});
  assert(smooth.hills[4*9+4]<raised.hills[4*9+4]);
});
Deno.test("terrain geometry: top faces up, valid UV atlas and finite normals after cliff+hills",()=>{
  let t=A.makeTerrain(8,8);
  t=A.terrainBrush(t,{x:0,z:0},{mode:"cliffs",size:3,level:3});
  t=A.terrainBrush(t,{x:.5,z:.5},{mode:"hills",size:6,strength:.5});
  const mesh=A.terrainMesh(t);
  assert(mesh.faces.length>8*8*2);
  assert(mesh.positions.every(p=>p.every(Number.isFinite)));
  assert(mesh.uvs.every(p=>p.every(n=>n>=0&&n<=1)));
  assert(mesh.normals.every(p=>p.every(Number.isFinite)&&Math.hypot(...p)>.99));
  const flat=A.terrainMesh(A.makeTerrain(4,4));
  assertEquals(flat.faces.filter(f=>A.meshFaceNormal(flat,f).y>.99).length,128);
  assertEquals(A.readMeshOBJ(A.writeMeshOBJ(mesh)).faces.length,mesh.faces.length);
});
Deno.test("terrain geometry: shared edges are seamless around stepped corners",()=>{
  let t=A.makeTerrain(4,4);t.levels=[0,0,0,0,0,1,2,0,0,2,3,0,0,0,0,0];
  const mesh=A.terrainMesh(t),edges=new Map();
  const key=p=>p.map(n=>n.toFixed(7)).join(",");
  for(const f of mesh.faces)for(let k=0;k<3;k++){
    const pair=[key(mesh.positions[f[k].v]),key(mesh.positions[f[(k+1)%3].v])].sort().join("|");
    edges.set(pair,(edges.get(pair)||0)+1);
  }
  // Only the bottom of the perimeter skirt is open; no cracks inside the terrain.
  for(const [edge,count] of edges) {
    assert(count<=2,`Overlapping face edge ${edge}`);
    if(count===1)assert(edge.split("|").every(p=>Number(p.split(",")[1])===-1),`Crack at ${edge}`);
  }
});
Deno.test("terrain cliffs: single-tile cliffs retain a grass cap instead of becoming spikes",()=>{
  const t=A.terrainBrush(A.makeTerrain(8,8),{x:.5,z:.5},{mode:"cliffs",size:1,level:3}),mesh=A.terrainMesh(t);
  const cap=mesh.faces.filter(f=>f.every(v=>mesh.positions[v.v][1]===3));
  assertEquals(cap.length,8);
  const area=cap.reduce((sum,f)=>{
    const [a,b,c]=f.map(v=>mesh.positions[v.v]);
    return sum+Math.abs((b[0]-a[0])*(c[2]-a[2])-(b[2]-a[2])*(c[0]-a[0]))/2;
  },0);
  assert(area>.15 && area<1,"An isolated cliff needs a useful flat summit surrounded by sloped rock");
  assert(cap.every(f=>f.every(v=>mesh.uvs[v.uv][0]<.5&&mesh.uvs[v.uv][1]>.5)),"Summits must use the grass tile");
});
Deno.test("terrain and skybox coexist through save, geometry upgrade and game export",()=>{
  const p=A.mkProject("Terrain and sky"),sc=A.activeScene(p),o=A.addEditorTerrain(p,sc,8,8,atlas);
  A.applyEditorTerrain(p,o.id,A.terrainBrush(o._terrain,{x:.5,z:.5},{mode:"cliffs",size:3,level:3}));
  A.applySkybox(p,sc,{enabled:true,preset:"sunset",rotation:35,brightness:.8},A.skyboxPresetAsset("sunset"));
  const sky=JSON.parse(JSON.stringify(sc.skybox)),image=p.assets.find(f=>f.name===sky.texture).dataUrl;
  p.assets.find(f=>f.name===o.components.model.file).terrainMeshVersion=3;
  const reopened=A.migrateProject(JSON.parse(JSON.stringify(p))),restored=A.activeScene(reopened);
  assertEquals(restored.skybox,sky);assertEquals(reopened.assets.find(f=>f.name===sky.texture).dataUrl,image);
  const result=A.generateProject(reopened);
  assert(result.assets.some(f=>f.filename==="textures/"+sky.texture));
  assert(result.assets.some(f=>f.filename==="3dmodels/"+o.components.model.file));
  assert(result.main.includes("skybox_object.render()")&&result.main.includes("ODE.GeomRenderObject("));
  assert(!result.diagnostics.some(d=>d.level==="error"));
});
Deno.test("terrain upgrade invalidates every stale lighting bake sharing the old mesh",()=>{
  const p=A.mkProject(),sc=A.activeScene(p),o=A.addEditorTerrain(p,sc,4,4,atlas),file=o.components.model.file;
  o._terrain.bevel=.18;o._lightingBake={model:JSON.parse(JSON.stringify(o.components.model))};o.components.model.file="old_bake.obj";
  const copy=JSON.parse(JSON.stringify(o));copy.id=A.uid();sc.objects.push(copy);
  p.assets.find(f=>f.name===file).terrainMeshVersion=3;
  const reopened=A.migrateProject(JSON.parse(JSON.stringify(p)));
  for(const object of A.activeScene(reopened).objects.filter(o=>o._terrain)){
    assertEquals(object.components.model.file,file);assertEquals(object._lightingBake,undefined);assertEquals(object._terrain.bevel,.28);
  }
});
Deno.test("terrain cliffs: a long terrace has a continuous sloping edge, not cell notches",()=>{
  const t=A.makeTerrain(16,16);for(let z=4;z<12;z++)for(let x=4;x<12;x++)t.levels[z*16+x]=3;
  const mesh=A.terrainMesh(t);
  const height=(x,z)=>{
    x-=8;z-=8;
    for(const f of mesh.faces){
      const [a,b,c]=f.map(v=>mesh.positions[v.v]),det=(b[2]-c[2])*(a[0]-c[0])+(c[0]-b[0])*(a[2]-c[2]);
      if(Math.abs(det)<1e-10)continue;
      const u=((b[2]-c[2])*(x-c[0])+(c[0]-b[0])*(z-c[2]))/det,
        v=((c[2]-a[2])*(x-c[0])+(a[0]-c[0])*(z-c[2]))/det;
      if(u>=-1e-8&&v>=-1e-8&&u+v<=1+1e-8)return u*a[1]+v*b[1]+(1-u-v)*c[1];
    }
    throw Error("Hole in the cliff");
  };
  const heights=Array.from({length:41},(_,i)=>height(5+i*.125,4.65));
  assert(Math.max(...heights)-Math.min(...heights)<.4,"A terrace edge must not dip at every cell boundary");
  assert(height(8,3.5)<1 && height(8,4.5)>2,"The rock wall needs a horizontal slope footprint");
  const before=t.levels.slice(),p=A.mkProject("Old terrain"),sc=A.activeScene(p),obj=A.addEditorTerrain(p,sc,16,16,atlas);
  obj._terrain=t;delete p.assets.find(f=>f.cat==="models").terrainMeshVersion;
  const migrated=A.migrateProject(JSON.parse(JSON.stringify(p)));
  assertEquals(migrated.scenes[0].objects.at(-1)._terrain.levels,before);
  assertEquals(migrated.assets.find(f=>f.cat==="models").terrainMeshVersion,A.TERRAIN_MESH_VERSION);
  assertEquals(A.migrateProject(migrated),migrated);
});
Deno.test("terrain save/export: edit same owned mesh, clone on shared edits, static collision",()=>{
  const p=A.mkProject("Terrain check"),sc=A.activeScene(p);
  const obj=A.addEditorTerrain(p,sc,8,8,atlas);
  const initial=obj.components.model.file;
  const next=A.terrainBrush(obj._terrain,{x:.5,z:.5},{mode:"cliffs",size:1,level:2});
  A.applyEditorTerrain(p,obj.id,next);assertEquals(obj.components.model.file,initial);
  A.applyEditorTerrain(p,obj.id,A.terrainBrush(next,{x:1.5,z:.5},{mode:"cliffs",size:1,level:2}));
  assertEquals(p.assets.filter(f=>f.cat==="models").length,1);
  const [copy]=A.cloneObjects([obj],sc.objects);sc.objects.push(copy);
  const originalBytes=p.assets.find(f=>f.name===initial).content;
  A.applyEditorTerrain(p,copy.id,A.terrainBrush(copy._terrain,{x:.5,z:.5},{mode:"cliffs",size:1,level:5}));
  assert(copy.components.model.file!==initial);assertEquals(p.assets.find(f=>f.name===initial).content,originalBytes);
  const reopened=A.migrateProject(JSON.parse(JSON.stringify(p)));
  assertEquals(A.findObj(A.activeScene(reopened).objects,copy.id)._terrain,copy._terrain);
  const out=A.generateProject(reopened,p.assets);
  assert(out.main.includes("ODE.GeomRenderObject("));
  assert(!out.diagnostics.some(d=>d.level==="error"),JSON.stringify(out.diagnostics));
});
Deno.test("terrain atlas: reuse unique texture, keep shared/prefab texture separate",()=>{
  const p=A.mkProject(),sc=A.activeScene(p),obj=A.addEditorTerrain(p,sc,4,4,atlas);
  assertEquals(A.terrainAtlasName(p,obj.id),atlas.name);
  const [copy]=A.cloneObjects([obj],sc.objects);sc.objects.push(copy);
  assert(A.terrainAtlasName(p,obj.id)!==atlas.name);
  const pixels=A.terrainAtlasPixels();assertEquals(pixels.data.length,256*256*4);
  assert(pixels.data.every((n,i)=>i%4!==3||n===255));
});
Deno.test("terrain refuses corrupt or oversized data before generating geometry",()=>{
  assertEquals(A.makeTerrain(10000,-5).width,64);assertEquals(A.makeTerrain(10000,-5).depth,4);
  const t=A.makeTerrain(4,4);t.hills[0]=NaN;assertThrows(()=>A.terrainMesh(t));
  t.hills[0]=0;t.levels[0]=Infinity;assertThrows(()=>A.terrainBrush(t,{x:0,z:0},{mode:"cliffs"}));
});
await shutdown();
