import {load,shutdown} from './_load.js';
import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
const A=await load();
Deno.test('Particle pools stay fixed, capped and deterministic throughout repeated bursts',()=>{
  const settings=A.normalizedParticles({preset:'splash',loop:false,count:20,lifetime:.8}),state=A.createParticleState(settings),array=state.particles;
  A.stepParticleState(state,.1);const first=Array.from(array);assert(array.some(v=>v!==0));
  for(let i=0;i<100;i++)A.stepParticleState(state,.1);assert(!state.playing);assert(!array.some((v,i)=>i%4===3&&v>0));
  state.emit();A.stepParticleState(state,.1);assertEquals(Array.from(array),first);assert(state.particles===array);
  const loop=A.createParticleState(A.normalizedParticles({count:8,rate:64}));for(let i=0;i<36000;i++)A.stepParticleState(loop,1/60);
  assertEquals(loop.particles.length,32);assert(loop.particles.every(Number.isFinite));
});
Deno.test('Particle presets share tiny indexed images and geometry, expose event actions and allocate no native objects per particle',async()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];
  const a=A.addParticleObject(p,s,'fountain',await A.prepareParticleAssets('fountain'));
  const b=A.addParticleObject(p,s,'splash',await A.prepareParticleAssets('splash'));assertEquals(a.components.model.textureFile,b.components.model.textureFile);
  const tex=A.editorAssets(p).find(f=>f.name===a.components.model.textureFile);assertEquals(A.textureFormatOfAsset(tex),'T4');assertEquals(A.textureVRAMBytes(tex),2304);
  b.components.particles.playOnStart=false;
  const rule=A.mkEventRule(),action=A.mkFlowAction('emitParticles');action.objectId=b.id;rule.actions=[action];s.eventRules=[rule];
  const generated=A.generateProject(p);assert(!generated.diagnostics.some(d=>d.level==='error'),JSON.stringify(generated.diagnostics));
  assertEquals((generated.main.match(/new RenderObject\(/g)||[]).length,2);assertEquals((generated.main.match(/new Image\(/g)||[]).length,2); // same upload, two mutually exclusive path probes
  assert(generated.main.includes('ctx.emitParticles'));assert(generated.main.includes('updateParticleVertices('));
  assert(generated.main.includes('ranges[0].end=143;'));assert(generated.main.includes('ranges[0].end=119;'));
  const frame=generated.main.slice(generated.main.indexOf('Screen.display'));assertEquals((frame.match(/\.render\(\)/g)||[]).length,2);
  assert(!generated.main.slice(generated.main.indexOf('Screen.display')).includes('new Float'));
  assertEquals(A.eventFlowProblems(s,A.editorAssets(p),p).length,0);
});
Deno.test('Batched sprites have independent positions and alpha, including vertical camera billboards',()=>{
  const state=A.createParticleState(A.normalizedParticles({count:2,size:.2,opacity:1}));state.particles.set([-1,2,0,1,1,2,0,.5]);state.positions=new Float32Array(48);state.colors=new Float32Array(48);state.billboard=new Float64Array(6);state.corners=new Float64Array([-.5,-.5,.5,-.5,.5,.5,-.5,-.5,.5,.5,-.5,.5]);
  const scale={x:1,y:1,z:1},camera={position:{x:0,y:0,z:10},target:{x:0,y:0,z:0}};
  A.updateParticleVertices(state,{x:0,y:0,z:0},scale,camera);assertAlmostEquals(state.positions[0],-1.1,1e-5);assertAlmostEquals(state.positions[24],.9,1e-5);assertEquals(state.colors[3],0);assertEquals(state.colors[27],-.5);
  for(let i=3;i<state.positions.length;i+=4)assertEquals(state.positions[i],1,'Sprites must retain homogeneous position W for native world/camera translation');
  A.updateParticleVertices(state,{x:0,y:0,z:0},scale,{position:{x:0,y:10,z:0},target:{x:0,y:0,z:0}});assert(state.positions.every(Number.isFinite));assert(Math.abs(state.positions[2]-state.positions[10])>.1);
});
Deno.test('Timeline emitter clips reuse pools, scrub deterministically and restore playback without cloning emitters',async()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];
  const o=A.addParticleObject(p,s,'fountain',await A.prepareParticleAssets('fountain'));
  const sequence=A.mkSequence(),track=A.mkCinematicTrack('particles'),clip=A.mkCinematicClip('particles');clip.objectId=o.id;clip.start=.5;clip.duration=1;track.clips=[clip];sequence.tracks=[track];s.sequences=[sequence];
  const emitter=A.createParticleState(A.normalizedParticles(o.components.particles));A.stepParticleState(emitter,.1);const before=Array.from(emitter.particles),time=emitter.time;
  const adapter=A.createCinematicAdapter({model:()=>({position:{x:0,y:0,z:0}}),particleEmitter:()=>emitter,cameraSave:()=>({}),cameraRestore(){},particles(){throw Error('Emitter clips must not allocate legacy model pools');}});
  const player=A.createCinematicPlayer([sequence],adapter);player.play(sequence.id);player.update(.75);
  assert(emitter.cinematic);assertAlmostEquals(emitter.time,.25);assert(emitter.activeCount>0);const sample=Array.from(emitter.particles);
  player.seek(.75);assertEquals(Array.from(emitter.particles),sample);assert(player.paused);
  player.stop();assert(!emitter.cinematic);assertEquals(emitter.time,time);assertEquals(Array.from(emitter.particles),before);
  emitter.stop();player.play(sequence.id);player.update(.75);player.stop();assert(!emitter.playing);assertEquals(emitter.activeCount,0);
  const generated=A.generateProject(p);assertEquals((generated.main.match(/new RenderObject\(/g)||[]).length,1);assert(generated.main.includes('particleEmitter:id=>ctx.particles?.[id]'));
  const second=A.mkCinematicTrack('particles');second.clips=[{...clip,id:'overlap'}];sequence.tracks.push(second);assert(A.cinematicProblems(s,A.editorAssets(p)).some(d=>d.message.includes('same property')));
});
await shutdown();
