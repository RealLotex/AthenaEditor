import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
import {load} from './_load.js';
const A=await load();
async function project(){const p=A.mkProject(),s=p.scenes[0],o=A.addWaterObject(p,s,await A.prepareWaterAssets());return {p,s,o};}

Deno.test('Ultra low exports a 32 pixel static opaque texture, two triangles and no caustic projector',async()=>{
  const {p,s,o}=await project();o.components.water.waveHeight=.3;o.components.water.flow={x:.1,z:.1};
  o.components.water.quality={textureSize:32,transparency:0,panning:0,waves:0,caustics:0,pattern:0};o.components.water.textureFilter='NEAREST';
  const before=JSON.stringify(p),ir=A.resolveScene(p,s),rd=ir.models.find(m=>m.obj.id===o.id).rd,result=A.generateProject(p);
  assertEquals(ir.shadows.length,0);assertEquals(rd.waterFrames.length,0);assertEquals(rd.waterCache,undefined);assertEquals(rd.water.opacity,1);assertEquals(rd.water.waveHeight,0);assertEquals(rd.water.flow,{x:0,z:0});assertEquals(rd.tex.filter,'NEAREST');
  assertEquals(A.readMeshOBJ(ir.waterGeneratedAssets.find(f=>f.cat==='models').content).faces.length,2);
  assertEquals(rd.tex.imageSize.width,32);assertEquals(rd.tex.imageSize.bpp,4);assertEquals(JSON.stringify(p),before);
  assert(!result.diagnostics.some(d=>d.level==='error'),JSON.stringify(result.diagnostics));assert(result.main.includes(ir.models.find(m=>m.obj.id===o.id).vn+'.render()'));assert(!result.main.includes('Transparent water follows'));
  const budget=A.sceneVRAMBudget(s,A.editorAssets(p),p);assert(budget.uploads.some(t=>t.name.endsWith('_32.png')));
});

Deno.test('Maximum water preserves animated samples, shares caches and images, and preprojects static caustics',async()=>{
  const {p,s,o}=await project();o.components.water.waveHeight=.3;o.components.water.rippleStrength=.05;o.components.water.flow={x:.1,z:.015};o.components.water.quality={textureSize:512,transparency:1,panning:4,waves:4,caustics:4,pattern:4};
  const duplicate=A.deepClone(o);duplicate.id='second-water';duplicate.name='Water two';s.objects.push(duplicate);
  const ir=A.resolveScene(p,s),rd=ir.models.find(m=>m.obj.id===o.id).rd;assertEquals(ir.models.find(m=>m.obj.id===duplicate.id).rd,rd);assertEquals(rd.waterCache.bytes,6291456);assertEquals(rd.waterFrames.length,31);
  assert(ir.shadows.every(s=>s.cachedCaustics.grid===16));assertEquals(ir.textures.length,new Set(ir.textures.map(t=>t.file+'|'+t.filter)).size);
  const raw=A.readMeshOBJ(A.waterMeshOBJ()),cache=A.buildWaterGeometryCache(raw,o.components.water),pose=37,offset=pose*cache.length;
  const positions=new Float32Array(cache.buffer.subarray(cache.positionsOffset,cache.positionsOffset+cache.length)),uvs=new Float32Array(cache.buffer.subarray(cache.uvsOffset,cache.uvsOffset+cache.length));
  const state={settings:A.normalizedWater(o.components.water),positions,uvs,basePositions:new Float32Array(positions),baseUVs:new Float32Array(uvs),stride:4,uvStride:4,u:.13,v:.21};
  // Use authored UVs for the reference, not an already tiled cache frame.
  let at=0;for(const face of raw.faces)for(const corner of face){const uv=raw.uvs[corner.uv];state.baseUVs.set([uv[0],1-uv[1],1,1],at);at+=4;}
  state.basePositions.fill(0);at=0;for(const face of raw.faces)for(const corner of face){state.basePositions.set([...raw.positions[corner.v],1],at);at+=4;}
  A.updateWaterPositionFallback(state,pose*Math.PI*2/cache.poses);A.updateWaterUVFallback(state,pose*Math.PI*2/cache.poses);
  for(let i=0;i<positions.length;i+=4){assertAlmostEquals(positions[i+1],cache.buffer[cache.positionsOffset+offset+i+1],1e-6);assertAlmostEquals(uvs[i],cache.buffer[cache.uvsOffset+offset+i]+.13,1e-6);assertAlmostEquals(uvs[i+1],cache.buffer[cache.uvsOffset+offset+i+1]+.21,1e-6);}
});

Deno.test('Caustic cache falls back when a receiver moves, is hidden or destroyed',()=>{
  const object={position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}},state={sources:[{object,...A.deepClone(object)}]};
  assert(A.waterCausticCacheValid(state));object.position.y=1;assert(!A.waterCausticCacheValid(state));object.position.y=0;object.visible=false;assert(!A.waterCausticCacheValid(state));object.visible=true;object._destroyed=true;assert(!A.waterCausticCacheValid(state));
});

Deno.test('Caustic cache checks collider-only movement and reuses synchronized positions',()=>{
  let position=[0,0,0];const geom={getPosition:()=>position},entry={geom,position:position.slice()},state={sources:[],colliders:[entry]};
  assert(A.waterCausticCacheValid(state));position=[0,1,0];assert(!A.waterCausticCacheValid(state));
  geom._shadowPosition=[0,0,0];geom.getPosition=()=>{throw Error('Duplicate collider read');};assert(A.waterCausticCacheValid(state));
});

Deno.test('Water cost reflects disabled caches, reflection normals and preserved custom meshes',async()=>{
  const {p,o}=await project();o.components.water.quality={textureSize:32,transparency:0,panning:0,waves:0,caustics:0,pattern:0};
  assertEquals(A.waterPerformanceEstimate(o,A.editorAssets(p)).cacheBytes,0);
  o.components.water.waveHeight=.3;o.components.water.rippleStrength=.05;o.components.water.quality={waves:4,panning:4};o.components.reflection={};
  assertEquals(A.waterPerformanceEstimate(o,A.editorAssets(p)).cacheBytes,A.buildWaterGeometryCache(A.readMeshOBJ(A.waterMeshOBJ()),o.components.water,true).bytes);
  p.assets.find(f=>f.name===o.components.model.file).content=A.waterMeshOBJ(3);o.components.water.quality.waves=0;
  assertEquals(A.waterPerformanceEstimate(o,A.editorAssets(p)).triangles,18);
});

Deno.test('Static caustics reach a plane collider without requiring a render mesh',async()=>{
  const {p,s,o}=await project();s.physics.enabled=true;o.components.transform.position.y=2;
  const floor=A.mkObject('Physical floor');floor.components.rigidbody={...A.makeComponent('rigidbody'),mode:'static',shape:'plane',planeY:.5};s.objects.push(floor);
  const ir=A.resolveScene(p,s),cached=ir.shadows[0].cachedCaustics,mesh=A.readMeshOBJ(ir.waterGeneratedAssets.find(f=>f.name===cached.file).content);
  assert(mesh.positions.every(p=>Math.abs(p[1]-.52)<1e-6));
  const actor=A.mkObject('Actor');actor.components.rigidbody={...A.makeComponent('rigidbody'),mode:'dynamic',shape:'sphere'};s.objects.push(actor);
  assertEquals(A.resolveScene(p,s).shadows[0].receivers.bodies.map(b=>b.body.obj.id),[floor.id]);
});

Deno.test('Every water texture size has actual indexed bytes and a decreasing VRAM estimate',async()=>{
  const {p,s,o}=await project();let previous=0;
  for(const size of A.WATER_TEXTURE_SIZES){o.components.water.quality={textureSize:size,pattern:4};const cost=A.waterPerformanceEstimate(o,A.editorAssets(p));assertEquals(cost.textureSize,size);assert(cost.textureBytes>previous);previous=cost.textureBytes;const ir=A.resolveScene(p,s);assertEquals(ir.models.find(m=>m.obj.id===o.id).rd.tex.imageSize.width,size);}
});

Deno.test('Water quality controls set independent update rates and replace the legacy caustic switch',()=>{
  for(let level=0;level<=4;level++){
    const water=A.normalizedWater({caustics:false,waveHeight:.2,quality:{waves:level,panning:4-level,caustics:level}});
    assertEquals(water.waveUpdateRate,A.WATER_QUALITY_RATES[level]);assertEquals(water.uvUpdateRate,A.WATER_QUALITY_RATES[4-level]);assertEquals(water.caustics,level>0);
  }
});

Deno.test('Recovery storage compacts immutable water frames and restores every quality without losing authored frames',async()=>{
  const {p}=await project(),original=JSON.stringify(p),saved=JSON.stringify(p,(_key,value)=>A.compactWaterAsset(value));
  assert(saved.length<original.length/2);const restored=A.migrateProject(JSON.parse(saved)),asset=restored.assets.find(f=>f.waterMotion);
  assertEquals(asset.waterMotion.frames,A.WATER_MOTION_DATA.frames);assertEquals(asset.waterMotion.levels,A.WATER_MOTION_DATA.levels);
  const edited=A.deepClone(asset);edited.waterMotion.frames[1].dataUrl='authored pixels';assertEquals(A.compactWaterAsset(edited),edited);
  assertEquals(JSON.stringify(p),original);
});
