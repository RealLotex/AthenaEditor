import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
import {load} from './_load.js';
const A=await load();
Deno.test('Flipbook frames run left to right, top to bottom, loop or hold and avoid redundant updates',()=>{
  const uv=new Float32Array([0,0,1,1,1,1,1,1]),s=A.createFlipbookUVState(uv,{columns:2,rows:2,fps:4,loop:false},4,false,64,64);
  assert(A.applyFlipbookFrame(s,0));assertAlmostEquals(uv[0],.5/64);assertAlmostEquals(uv[1],.5/64);assert(!A.applyFlipbookFrame(s,.1));A.applyFlipbookFrame(s,.5);assertAlmostEquals(uv[1],.5+.5/64);A.applyFlipbookFrame(s,99);assertEquals(s.frame,3);
  const browser=A.createFlipbookUVState(new Float32Array([0,1,1,0]),{columns:2,rows:2,fps:4,loop:true},2,true,64,64);A.applyFlipbookFrame(browser,0);assertAlmostEquals(browser.uvs[1],1-.5/64);A.applyFlipbookFrame(browser,1);assertEquals(browser.frame,0);
});
Deno.test('Particles animate using individual ages and keep clocks frozen during pause',()=>{
  const settings=A.normalizedParticles({...A.makeComponent('particles'),count:4,rate:4,lifetime:1,flipbook:true,columns:2,rows:2,fps:8,animationLoop:false}),s=A.createParticleState(settings);
  for(let i=0;i<6;i++)A.stepParticleState(s,.1);assert(s.ages[0]>s.ages[1]);assertEquals(A.flipbookFrame(settings.animation,s.ages[0]),3);const ages=new Float64Array(s.ages);A.stepParticleState(s,0);assertEquals(s.ages,ages);s.emit();A.stepParticleState(s,.01);assertEquals(A.flipbookFrame(settings.animation,s.ages[0]),0);s.stop();assertEquals(s.activeCount,0);
});
Deno.test('Texture animation owns UV buffers and shares only identical animation profiles',()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];p.assets=[{name:'plane.obj',cat:'models',content:A.waterMeshOBJ(1)},{name:'atlas.png',cat:'textures',dataUrl:A.WATER_MOTION_DATA.frames[0].dataUrl,image:{width:512,height:512,bpp:4}}];
  const make=(name,columns)=>{const o=A.mkObject(name);o.components.model={...A.makeComponent('model'),file:'plane.obj',textureFile:'atlas.png'};o.components.textureAnimation={...A.makeComponent('textureAnimation'),columns,rows:2};s.objects.push(o);return o;};
  const first=make('first',2),second=make('second',4),third=make('third',2),ir=A.resolveScene(p,s),models=ir.models;
  assertEquals(models[0].rd,models[2].rd);assert(models[0].rd!==models[1].rd);assertEquals(models[1].rd.cloneOf,null);assertEquals(ir.textures.length,1);const result=A.generateProject(p);assert(!result.diagnostics.some(d=>d.level==='error'),JSON.stringify(result.diagnostics));assert(result.main.includes('.vertices.texcoords'));assert(!result.main.includes('vertices.texture)'));
});
