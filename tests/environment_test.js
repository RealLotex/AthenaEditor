import {load,PURE_MODULES,shutdown} from './_load.js';
import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
const module={exports:{}};new Function('module','exports',await Deno.readTextFile('vendor/three.js'))(module,module.exports);globalThis.THREE=module.exports;
const A=await load([...PURE_MODULES,'viewport/loaders.js','editor/environment.js']);
Deno.test('Environment tint strengths are independent, bounded and respond to contact occlusion',()=>{
  const settings={lighting:false,recess:{color:{r:1,g:0,b:0},strength:1},mid:{strength:0},highlight:{strength:0}};
  const recess=A.environmentVertexColor({x:0,y:1,z:0},1,[],settings),exposed=A.environmentVertexColor({x:0,y:1,z:0},0,[],settings);
  assertEquals(recess,[1,0,0]);assertEquals(exposed,[1,1,1]);
  settings.recess.strength=.5;assertEquals(A.environmentVertexColor({x:0,y:1,z:0},1,[],settings),[1,.5,.5]);
  assertEquals(A.environmentVertexColor({x:0,y:1,z:0},0,[{direction:{x:0,y:1,z:0},ambient:{r:.1,g:.1,b:.1},diffuse:{r:.5,g:.5,b:.5}}],{...settings,lighting:true}),[.6,.6,.6]);
});
Deno.test('Mass coloring bakes actual contact AO into corner buffers, preserving UVs and textures',async()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];
  const surface=A.mkObject('Surface');surface.components.model={...A.makeComponent('model'),file:'floor.obj',textureFile:'original.png'};s.objects.push(surface);
  const wall=A.mkObject('Cover');wall.components.model={...A.makeComponent('model'),file:'floor.obj'};wall.components.transform.position.y=.1;s.objects.push(wall);
  p.assets.push(A.textMeshAsset('floor.obj',A.waterMeshOBJ(1)));
  const before=JSON.stringify(p),result=await A.bakeEnvironmentVertices(s,A.editorAssets(p),[surface.id],{lighting:false,radius:1,recess:{color:{r:1,g:0,b:0},strength:1},mid:{strength:0},highlight:{strength:0}});
  assertEquals(JSON.stringify(p),before);assertEquals(result.outputs.length,1);assertEquals(A.readMeshOBJ(result.outputs[0].content).uvs,A.readMeshOBJ(p.assets[0].content).uvs);
  assertEquals(result.updates[0].model.textureFile,'original.png');assertEquals(result.outputs[0].vertexColors.length,18);
  assert(result.outputs[0].vertexColors[1]<.9,'Surface covered by another mesh needs contact shading.');
  A.putProjectAsset(p,result.outputs[0]);surface.components.model=result.updates[0].model;
  const generated=A.generateProject(p);assert(generated.main.includes('.vertices.colors'));assert(generated.main.includes('Vertex color count does not match'));assert(generated.main.includes('diffuse:{r:0,g:0,b:0}'));
  const proxy=await A.buildModel(surface.components.model,A.editorAssets(p));assert(proxy.object3d.material.vertexColors);assertAlmostEquals(proxy.object3d.geometry.attributes.color.array[1],result.outputs[0].vertexColors[1],1e-5);A.disposeObject(proxy.object3d);
});
Deno.test('Mass coloring preserves untextured MTL diffuse colors when replacing native lighting',async()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];
  p.assets.push(A.textMeshAsset('colored.obj','mtllib colored.mtl\nv 0 0 0\nv 1 0 0\nv 0 0 1\nusemtl Blue\nf 1 3 2'),{name:'colored.mtl',cat:'models',content:'newmtl Blue\nKd .25 .5 .8'});
  const object=A.mkObject('Colored');object.components.model={...A.makeComponent('model'),file:'colored.obj'};s.objects.push(object);
  const result=await A.bakeEnvironmentVertices(s,A.editorAssets(p),[object.id],{lighting:false,recess:{strength:0},mid:{strength:0},highlight:{strength:0}});
  assertEquals(result.outputs[0].vertexColors.slice(0,3),[.25,.5,.8]);
});
Deno.test('Baked color export preserves long RGB lists and writes all native RGBA lanes',()=>{
  const expected=Array.from({length:108},(_,i)=>(i+1)/109),native=new Float32Array(144),e=new A.Emitter();
  A.emitRenderDatas(e,{renderDatas:[{model:{file:'baked.obj',pipeline:'PL_NO_LIGHTS'},dataVN:'baked_data',vertexColors:expected}],textures:[],anims:[],models:[],dirs:{models:'3dmodels'}});
  const code=e.toString();
  assert(code.includes('baked=JSON.parse('),'Use data parsing to avoid the native compiler truncating large array literals.');
  class Mesh {constructor(){this.vertices={colors:native.buffer};this.materials=[{}];}updateMaterial(_index,value){assertEquals(value,{diffuse:{r:0,g:0,b:0}});}getTexture(){return null;}}
  new Function('os','RenderData','Render','LINEAR',code)({chdir(){}},Mesh,{PL_NO_LIGHTS:1,CULL_FACE_BACK:1},1);
  for(let i=0;i<36;i++){
    for(let k=0;k<3;k++)assertAlmostEquals(native[i*4+k],expected[i*3+k],1e-7);
    assertEquals(native[i*4+3],0);
  }
});
await shutdown();
