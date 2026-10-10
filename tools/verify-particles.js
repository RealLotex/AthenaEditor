import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
const A=await load();
try{
  const p=A.mkProject('Particle verification'),s=p.scenes[0];s.objects=[];s.defaultCameraRig=false;
  const effects=[];
  for(const preset of A.PARTICLE_PRESETS){const o=A.addParticleObject(p,s,preset,await A.prepareParticleAssets(preset));o.components.transform.position.x=effects.length*2-2;o.components.particles.count=12;effects.push(o);}
  const splash=effects[1];splash.components.particles.playOnStart=false;
  const rule=A.mkEventRule(),action=A.mkFlowAction('emitParticles');action.objectId=splash.id;rule.event.type='timer';rule.event.seconds=.1;rule.actions=[action];s.eventRules=[rule];
  const fountain=effects[2];fountain.components.particles.playOnStart=false;
  const sequence=A.mkSequence(),track=A.mkCinematicTrack('particles'),clip=A.mkCinematicClip('particles');
  sequence.event.type='timer';sequence.event.seconds=.5;clip.objectId=fountain.id;clip.duration=.5;track.clips=[clip];sequence.tracks=[track];s.sequences=[sequence];
  const camera=A.mkObject('Camera');camera.components.camera={...A.makeComponent('camera'),target:{x:0,y:1,z:0}};camera.components.transform.position={x:0,y:3,z:9};s.objects.push(camera);
  const generated=A.generateProject(p),ir=A.resolveScene(p,s,A.editorAssets(p)),model=ir.models.find(m=>m.obj.id===splash.id);
  const emitter=ir.models.find(m=>m.obj.id===fountain.id);
  const probe=`if(++verifyFrame===20||verifyFrame===45||verifyFrame===90){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:verifyFrame===90?'DONE':verifyFrame===45?'CINEMATIC':'ACTIVE',elapsed:_sceneEventsState.elapsed,fired:_eventFlowState.states[0].fired,playing:${model.particleVN}.playing,time:${model.particleVN}.time,active:${model.particleVN}.particles.filter((v,i)=>i%4===3&&v>0).length,origin:${model.vn}.position.x,vertices:${model.particleVN}.positions.length/4,w:${model.particleVN}.positions[3],first:${model.particleVN}.positions[0],second:${model.particleVN}.positions[24],cinematic:${emitter.particleVN}.cinematic||false,emitterPlaying:${emitter.particleVN}.playing,emitterActive:${emitter.particleVN}.activeCount,vram:Screen.getMemoryStats(Screen.VRAM_USED_TOTAL)})+String.fromCharCode(10));f.close();}`;
  generated.main=generated.main.replace('Screen.display(() => {','let verifyFrame=0;Screen.display(() => {').replace('Screen.setParam(Screen.DEPTH_TEST_ENABLE, false);','Screen.setParam(Screen.DEPTH_TEST_ENABLE, false);'+probe);
  const log=await runConsoleFixture(generated,{timeoutMs:20000}),records=log.trim().split(/\r?\n/).map(JSON.parse);
  const active=records.find(r=>r.tag==='ACTIVE'),done=records.find(r=>r.tag==='DONE');assert(active?.playing&&active.active>0,log);assert(done&&!done.playing&&done.active===0,log);assertAlmostEquals(active.origin,0,1e-4);assertAlmostEquals(done.origin,0,1e-4);assertEquals(ir.textures.length,2);assertEquals(active.vertices,384);assertEquals(active.w,1);assert(active.first!==active.second,log);
  const cinematic=records.find(r=>r.tag==='CINEMATIC');assert(cinematic?.cinematic&&cinematic.emitterPlaying&&cinematic.emitterActive>0,log);assert(!done.cinematic&&!done.emitterPlaying&&done.emitterActive===0,log);assertEquals(ir.cinematics.pools.length,0);
  await Deno.writeTextFile('.verification/particles.json',JSON.stringify({passed:true,records},null,2));console.log(JSON.stringify({passed:true,records}));
}finally{await shutdown();}
