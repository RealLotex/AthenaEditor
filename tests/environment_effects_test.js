import {load,PURE_MODULES,shutdown} from './_load.js';
import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
const A=await load([...PURE_MODULES,'editor/environment.js']);
Deno.test('Fog follows camera depth and transforms, throttles updates and preserves borrowed arrays',()=>{
  const positions=new Float32Array([0,0,0,1,0,0,-5,1,0,0,-10,1]),colors=new Float32Array(12),settings=A.normalizedSceneFog({enabled:true,start:0,end:10,color:{r:.6,g:.8,b:1}});
  const state=A.createFogState(positions,colors,settings),matrix=A.matFromTRS({}, {}, {x:1,y:1,z:1}),camera={position:{x:0,y:0,z:0},target:{x:0,y:0,z:-1}};
  A.advanceFogArrays(state,0,matrix,camera);assertEquals([colors[3],colors[7],colors[11]],[-1,-.5,0]);assertAlmostEquals(colors[0],.6,1e-6);
  assertEquals(A.advanceFogArrays(state,.01,matrix,camera),false);matrix[14]=-5;A.advanceFogArrays(state,.1,matrix,camera);assertAlmostEquals(colors[3],-.5);assertEquals(state.colors,colors);assertEquals(state.positions,positions);
  assertEquals(A.normalizedEnvironment({fog:settings}).fog,settings);
});
Deno.test('Fog exports material-free geometry and reflection instances share a small indexed map',async()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];s.environment={fog:{enabled:true,start:5,end:30}};
  const reflection=await A.prepareReflectionAsset();p.assets.push(reflection,A.textMeshAsset('surface.obj','mtllib missing.mtl\nv -1 0 -1\nv 1 0 -1\nv 0 1 0\nusemtl Glass\nf 1 2 3'));
  assertEquals(A.textureVRAMBytes(reflection),8448);
  for(let i=0;i<3;i++){const o=A.mkObject('Surface');o.components.model={...A.makeComponent('model'),file:'surface.obj',pipeline:'PL_NO_LIGHTS'};o.components.reflection={...A.makeComponent('reflection'),texture:reflection.name};s.objects.push(o);}
  const before=JSON.stringify(p),ir=A.resolveScene(p,s,A.editorAssets(p)),out=A.generateProject(p);
  assertEquals(JSON.stringify(p),before);assertEquals(ir.fogMeshes.length,1);assertEquals(ir.fogModels.length,3);assertEquals(ir.textures.length,1);assertEquals(ir.renderDatas.length,1);
  assert(!ir.fogMeshes[0].content.includes('mtllib'));assert(!ir.fogMeshes[0].content.includes('usemtl'));
  assert(out.assets.some(f=>f.filename.endsWith(ir.fogMeshes[0].name)));assert(out.main.includes('material.ref_texture_id=index'));assert(out.main.includes('.setTexture(index,'));assert(out.main.includes('Screen.setParam(Screen.ALPHA_TEST_REF,0)'));
  assertEquals(A.sceneVRAMBudget(s,A.editorAssets(p),p).textures,8448);
  const emitter=A.addParticleObject(p,s,'bubbles',await A.prepareParticleAssets());const copy=A.resolveScene(p,s,A.editorAssets(p));assert(!copy.fogModels.some(f=>f.model.obj.id===emitter.id));
  assertEquals((A.generateProject(p).main.match(/function matFromEuler\(/g)||[]).length,1);
  const plain=A.mkObject('Plain');plain.components.model={...s.objects[0].components.model};s.objects.push(plain);
  const shared=A.resolveScene(p,s,A.editorAssets(p));assert(shared.models.find(m=>m.obj.id===plain.id).rd.cloneOf,'Reflection material changes should retain shared geometry.');
});
await shutdown();
