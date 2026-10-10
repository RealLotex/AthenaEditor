import {load,shutdown} from './_load.js';
import {assert,assertEquals,assertAlmostEquals,assertRejects} from 'jsr:@std/assert@1';
const A=await load();
Deno.test('Directional shadow bake projects actual mesh geometry, preserving asymmetry',()=>{
  const mesh=A.readMeshOBJ('v 0 0 0\nv 2 0 0\nv 0 2 1\nf 1 2 3');
  const world={position:{x:5,y:7,z:9},scale:{x:1,y:1,z:1},rotation:{x:0,y:0,z:0}};
  const profile=A.shadowBakeProfile(mesh,world,{x:1,y:1,z:0});
  assertAlmostEquals(profile.projected[2][0],-2);
  assertAlmostEquals(profile.projected[2][1],1);
  const pixels=A.shadowSilhouettePixels(mesh,profile);
  assert(pixels.data.some((v,i)=>i%4===3&&v===255));
  assert(pixels.data.some((v,i)=>i%4===3&&v>0&&v<255));
  assertEquals(pixels.data[3],0);
});
Deno.test('Shadow bake shares indexed images across translations and uniform scales without modifying diffuse textures',async()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];
  const mesh=A.textMeshAsset('box.obj','v -.5 0 -.5\nv .5 0 -.5\nv 0 1 .5\nv 0 0 .5\nf 1 2 3\nf 1 3 4\nf 2 4 3');
  p.assets.push(mesh);
  const sun=A.mkObject('Sun');sun.components.light=A.makeComponent('light');s.objects.push(sun);
  const objects=[];
  for(let i=0;i<3;i++){
    const o=A.mkObject('Box');o.components.model={...A.makeComponent('model'),file:mesh.name,textureFile:'original.png'};
    o.components.transform.position.x=i*10;o.components.transform.scale={x:i+1,y:i+1,z:i+1};s.objects.push(o);objects.push(o);
  }
  const before=JSON.stringify(p),result=await A.bakeSharedShadows(s,A.editorAssets(p),objects.map(o=>o.id));
  assertEquals(JSON.stringify(p),before);assertEquals(result.outputs.length,1);
  assertEquals(A.textureFormatOfAsset(result.outputs[0]),'T4');
  for(const update of result.updates){assert(!update.model);assert(update.shadow.raycast);assertEquals(update.shadow.texture,result.outputs[0].name);}
  assertAlmostEquals(result.updates[2].shadow.size.x,result.updates[0].shadow.size.x*3);
  p.assets.push(...result.outputs);for(const update of result.updates)objects.find(o=>o.id===update.id).components.shadow=update.shadow;
  const ir=A.resolveScene(p,s,A.editorAssets(p));assertEquals(new Set(ir.shadows.map(s=>s.rtVN)).size,1);assertEquals(ir.shadowPasses.length,0);
});
Deno.test('Shadow baking fails early without light or with an animated caster',async()=>{
  const s=A.mkProject().scenes[0];s.objects=[];
  await assertRejects(()=>A.bakeSharedShadows(s,[],[]),Error,'directional light');
  const o=A.mkObject('Caster');o.components.model=A.makeComponent('model');o.components.animator=A.makeComponent('animator');
  const sun=A.mkObject('Sun');sun.components.light=A.makeComponent('light');s.objects.push(sun,o);
  await assertRejects(()=>A.bakeSharedShadows(s,[],[o.id]),Error,'static models');
});
Deno.test('Shared blobs ignore vertex-color copy filenames and retain a null original on rebake',async()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];const sun=A.mkObject('Sun');sun.components.light=A.makeComponent('light');s.objects.push(sun);
  const content='v 0 0 0\nv 1 0 0\nv 0 1 1\nf 1 2 3',objects=[];
  for(let i=0;i<2;i++){const file=A.textMeshAsset('copy'+i+'.obj',content),o=A.mkObject('Instance');p.assets.push(file);o.components.model={...A.makeComponent('model'),file:file.name};o._shadowBake={shadow:null};o.components.shadow={...A.makeComponent('shadow'),texture:'previous.png',source:'texture'};s.objects.push(o);objects.push(o);}
  const result=await A.bakeSharedShadows(s,A.editorAssets(p),objects.map(o=>o.id));assertEquals(result.outputs.length,1);assert(result.updates.every(u=>u.shadowSource===null));
});
await shutdown();
