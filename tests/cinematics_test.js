import { assert, assertEquals, assertThrows, assertStringIncludes } from "jsr:@std/assert@1";
import { load } from "./_load.js";
const A=await load();

Deno.test('emitted audio selects its own stream before native rewind, on first playback and when changing files',()=>{
  const p=A.mkProject(),sc=p.scenes[0],s=A.mkSequence(),t=A.mkCinematicTrack('voice');sc.objects=[];sc.sequences=[s];s.tracks=[t];
  t.clips=[0,1].map(i=>({...A.mkCinematicClip('voice',i*.5),duration:.5,file:`voice${i}.wav`}));
  p.assets=t.clips.map(c=>({cat:'sounds',name:c.file,dataUrl:'data:audio/wav;base64,AAAA'}));
  const ir=A.resolveScene(p,sc),e=new A.Emitter();A.emitSounds(e,ir);A.emitCinematics(e,ir);
  let current=null;const played=[];
  const Sound={Stream(file){return {pause(){},playing:()=>false,play(){current=this;played.push(file);},rewind(){assertEquals(current,this,'Native rewind would dereference the wrong stream');}};}};
  const camera={position:{x:0,y:2,z:10},target:{x:0,y:0,z:0}},ctx={};
  new Function('ctx','Sound','Camera','font',e.toString())(ctx,Sound,{save:()=>structuredClone(camera),target(){},position(){}},{});
  ctx.events.emit('sceneStart');ctx.cinematics.update(.5);ctx.cinematics.update(.5);
  assertEquals(played,['sounds/voice0.wav','sounds/voice1.wav']);
});
function sequence(type='dialogue') {
  const s=A.mkSequence(),t=A.mkCinematicTrack(type),c=A.mkCinematicClip(type);
  s.tracks=[t];t.clips=[c];return {s,t,c};
}
function playback(s) {
  const model={position:{x:9,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1},visible:true};
  let camera={position:{x:0,y:2,z:10},target:{x:0,y:0,z:0}}, plays=0,pauses=0,completions=0;
  const sound={play(){plays++;},pause(){pauses++;},rewind(){}};
  const pool=Array.from({length:16},()=>({visible:false}));
  const adapter=A.createCinematicAdapter({model:()=>model,sound:()=>sound,particles:()=>pool,cameraSave:()=>structuredClone(camera),cameraRestore:s=>camera=s,cameraSet:(p,t)=>camera={position:p,target:t},complete:()=>completions++});
  const player=A.createCinematicPlayer([s],adapter);
  return {model,adapter,player,pool,get camera(){return camera;},get plays(){return plays;},get pauses(){return pauses;},get completions(){return completions;}};
}
Deno.test('timeline boundaries show and hide cinematic-only UI, and complete once across a long frame',()=>{
  const {s,c}=sequence();c.start=1;c.duration=2;
  const r=playback(s);r.player.play(s.id);assertEquals(r.adapter.ui.length,0);
  r.player.update(1);assertEquals(r.adapter.ui.find(e=>e.clip.id===c.id).clip.text,c.text);
  r.player.update(20);assertEquals(r.adapter.ui.length,0);assert(!r.player.playing);assertEquals(r.completions,1);
  r.player.update(20);assertEquals(r.completions,1);
});
Deno.test('transform playback interpolates, pause freezes time, seeking and stopping restore the original state',()=>{
  const {s,c}=sequence('transform');c.objectId='hero';c.from={x:0,y:0,z:0};c.to={x:10,y:0,z:0};
  const r=playback(s);r.player.play(s.id);r.player.update(1);assertEquals(r.model.position.x,5);
  r.player.pause();r.player.update(1);assertEquals(r.model.position.x,5);
  r.player.seek(.5);assertEquals(r.model.position.x,2.5);assert(r.player.paused);
  r.player.pause(false);r.player.update(.5);assertEquals(r.model.position.x,5);
  r.player.stop();assertEquals(r.model.position.x,9);assertEquals(r.completions,0);
  assertThrows(()=>r.player.play('missing'),Error,'Unknown cinematic');
});
Deno.test('camera shots restore their camera at the clip boundary and cancellation restores all active clips',()=>{
  const {s,c}=sequence('camera'),m=A.mkCinematicTrack('mesh'),mc=A.mkCinematicClip('mesh');mc.objectId='hero';m.clips=[mc];s.tracks.push(m);
  c.toPosition={x:10,y:3,z:8};const r=playback(s),before=structuredClone(r.camera);
  r.player.play(s.id);r.player.update(1);assertEquals(r.camera.position.x,5);assertEquals(r.model.visible,false);
  r.player.stop();assertEquals(r.camera,before);assertEquals(r.model.visible,true);
});
Deno.test('audio starts once, respects pause, stops on clip exit, and stays silent when scrubbing',()=>{
  const {s,c}=sequence('voice');const r=playback(s);r.player.play(s.id);r.player.update(.2);assertEquals(r.plays,1);
  r.player.pause();assertEquals(r.pauses,1);r.player.pause(false);assertEquals(r.plays,2);
  r.player.seek(.5);assertEquals(r.plays,2);r.player.update(.5);assertEquals(r.plays,2);
  r.player.stop();assert(r.pauses>=2);
});
Deno.test('particle clips use preallocated pools and hide every instance on stop',()=>{
  const {s}=sequence('particles'),r=playback(s);r.player.play(s.id);r.player.update(.3);
  assert(r.pool.every(p=>p.visible&&Number.isFinite(p.position.x)));r.player.stop();assert(r.pool.every(p=>!p.visible));
});
Deno.test('scene events dispatch to scripts, filter collider pairs, fire timers once, and unsubscribe handlers',()=>{
  const {s}=sequence();s.event={type:'onTriggerExit',objectId:'zone',otherId:'hero'};
  const started=[],events=A.createSceneEvents([s],{play:id=>started.push(id)}),observed=[];
  const handler=events.on('sceneStart',e=>observed.push(e));events.emit('sceneStart');events.off('sceneStart',handler);events.emit('sceneStart');assertEquals(observed.length,1);
  events.emit('onTriggerExit',{selfId:'zone',otherId:'prop'});assertEquals(started,[]);
  events.emit('onTriggerExit',{selfId:'zone',otherId:'hero'});assertEquals(started,[s.id]);
  events.on('timer',()=>observed.push('timer'));events.startTimer('timer',2);events.update(1);assertEquals(observed.length,1);events.update(1);events.update(9);assertEquals(observed.length,2);
  events.startTimer('timer',1);events.cancelTimer('timer');events.update(9);assertEquals(observed.length,2);
  assertThrows(()=>events.startTimer('timer',-1));assertThrows(()=>events.on('sceneStart',null));
});
Deno.test('validation rejects fighting camera/property/audio clips, missing targets/assets and ambiguous events',()=>{
  const p=A.mkProject(),sc=p.scenes[0],{s,t,c}=sequence('camera');sc.sequences=[s];
  const second=A.mkCinematicTrack('camera');second.clips=[{...c,id:'second'}];s.tracks.push(second);
  assert(A.cinematicProblems(sc).some(p=>p.message.includes('same property')));
  s.tracks=[t];assertEquals(A.cinematicProblems(sc),[]);
  const a=A.mkCinematicTrack('voice'),b=A.mkCinematicTrack('sfx');a.clips=[A.mkCinematicClip('voice')];b.clips=[A.mkCinematicClip('sfx')];s.tracks=[a,b];
  assert(A.cinematicProblems(sc).some(p=>p.message.includes('one streaming player')));
  sc.sequences.push({...A.mkSequence(),name:'Duplicate'});assert(A.cinematicProblems(sc).some(p=>p.message.includes('conflicts')));
});
Deno.test('export preloads and shares portraits/audio, exposes events without sequences, and guards gameplay and transitions',()=>{
  const p=A.mkProject(),sc=p.scenes[0];sc.objects=[];sc.defaultCameraRig=false;
  const {s,t,c}=sequence('portrait');c.file='face.png';const voice=A.mkCinematicTrack('voice');voice.clips=[{...A.mkCinematicClip('voice'),file:'voice.wav'},{...A.mkCinematicClip('voice',2),file:'voice.wav'}];s.tracks=[t,voice];sc.sequences=[s];
  p.assets=[{cat:'textures',name:'face.png',dataUrl:'data:image/png;base64,AAAA'},{cat:'sounds',name:'voice.wav',dataUrl:'data:audio/wav;base64,AAAA'}];
  const ir=A.resolveScene(p,sc,A.editorAssets(p,[]));assertEquals(ir.sounds.length,1);assertEquals(ir.textures.length,1);
  const main=A.generateProject(p).main;assertStringIncludes(main,'new Image("textures/face.png")');assertStringIncludes(main,'ctx.events.emit("sceneStart")');assertStringIncludes(main,'ctx.events.emit("beforeSceneEnd")');assertStringIncludes(main,'!ctx.cinematics.playing');assertStringIncludes(main,'_cinematicExitPending');
  new Function(main.replace(/^import .*$/gm,''));
  sc.sequences=[];const o=A.mkObject('script');o.components.script={file:'Events.js'};sc.objects=[o];p.scripts=[{name:'Events.js',content:'export function init(ctx) {ctx.events.on("sceneStart",()=>{});}'}];
  const simple=A.generateProject(p).main;assertStringIncludes(simple,'ctx.events = createSceneEvents([]');assert(!simple.includes('_cinematicFont'));
});
Deno.test('migration preserves timelines and fills missing event/track arrays idempotently',()=>{
  const p=A.mkProject(),{s}=sequence();p.scenes[0].sequences=[s];const data=JSON.stringify(p);A.migrateProject(p);A.migrateProject(p);assertEquals(JSON.stringify(p),data);
  p.scenes[0].sequences=[{name:'Old',tracks:[{type:'dialogue'}]}];A.migrateProject(p);assertEquals(p.scenes[0].sequences[0].event.type,'manual');assertEquals(p.scenes[0].sequences[0].tracks[0].clips,[]);
});

Deno.test('generated playback executes serialized boundaries, restores borrowed particle transforms, and dispatches completion',()=>{
  const p=A.mkProject(),sc=p.scenes[0],o=A.mkObject('hero');o.components.model={...A.makeComponent('model'),file:'hero.obj'};sc.objects=[o];
  const {s,c}=sequence();c.duration=.5;c.text='¡Hola… mañana!';
  for(const type of ['transform','particles']){const t=A.mkCinematicTrack(type),c=A.mkCinematicClip(type);c.duration=.5;c.objectId=o.id;if(type==='transform')c.to={x:10,y:0,z:0};else c.count=8;t.clips=[c];s.tracks.push(t);}
  sc.sequences=[s];const ir=A.resolveScene(p,sc,[]),e=new A.Emitter();A.emitCinematics(e,ir);
  let camera={position:{x:0,y:2,z:10},target:{x:0,y:0,z:0}},draws=0;const printed=[];
  const Camera={save:()=>structuredClone(camera),position:(x,y,z)=>camera.position={x,y,z},target:(x,y,z)=>camera.target={x,y,z}};
  const model={position:{x:9,y:0,z:0},scale:{x:1,y:1,z:1},rotation:{x:0,y:0,z:0},render:()=>draws++},ctx={};
  const rt=new Function('ctx','Camera','font','canvas','Color','Draw',ir.models[0].vn,e.toString()+';return {draw:_cinematicDrawUI,particles:_cinematicDrawParticles};')(ctx,Camera,{print:(_x,_y,text)=>printed.push(text)},{width:640,height:448},{new:()=>0},{rect(){}},model);
  const finished=[];ctx.events.on('cinematicFinished',event=>finished.push(event.sequenceId));ctx.events.emit('sceneStart');ctx.cinematics.update(.25);
  assertEquals(model.position.x,5);rt.particles();assertEquals(draws,8);assertEquals(model.position.x,5);rt.draw();assert(printed.join(' ').includes('¡Hola... mañana!'));
  ctx.cinematics.update(.25);assertEquals(model.position.x,9);assertEquals(finished,[s.id]);const count=printed.length;rt.draw();assertEquals(printed.length,count);
  ctx.events.dispose();ctx.cinematics.dispose();
});

Deno.test('dialogue export prepares wrapping, preserves two-byte accents, and blocks unsafe font glyphs and invalid UI sizes',()=>{
  const p=A.mkProject(),sc=p.scenes[0],{s,c}=sequence();sc.sequences=[s];c.text='¿Sí… mañana?';
  assertEquals(A.cinematicNativeText(c.text),'¿Sí... mañana?');assertEquals(A.cinematicProblems(sc),[]);
  c.text='🙂';assert(A.cinematicProblems(sc).some(p=>p.message.includes('unsupported characters')));
  c.text='Valid';c.width=-1;assert(A.cinematicProblems(sc).some(p=>p.message.includes('positive dimensions')));
  c.width=120;c.height=48;c.fontSize=20;c.text='one two three four five six';assertEquals(A.cinematicDialogueLines(c),['one two','three four']);
});

Deno.test('animation clips reject unskinned targets, unknown animation names and external glTF dependencies',()=>{
  const p=A.mkProject(),sc=p.scenes[0],o=A.mkObject('hero');o.components.model={...A.makeComponent('model'),file:'hero.gltf'};sc.objects=[o];const {s,c}=sequence('animation');c.objectId=o.id;c.file='hero.gltf';c.animation='Talk';sc.sequences=[s];
  const asset={cat:'models',name:'hero.gltf',content:JSON.stringify({skins:[{}],animations:[{name:'Talk'}]})};
  assertEquals(A.cinematicProblems(sc,[asset]),[]);c.animation='Missing';assert(A.cinematicProblems(sc,[asset]).some(p=>p.message.includes('choose an animation')));
  c.animation='Talk';asset.content=JSON.stringify({animations:[{name:'Talk'}],buffers:[{uri:'external.bin'}]});const problems=A.cinematicProblems(sc,[asset]);assert(problems.some(p=>p.message.includes('skinned')));assert(problems.some(p=>p.message.includes('self-contained')));
});
