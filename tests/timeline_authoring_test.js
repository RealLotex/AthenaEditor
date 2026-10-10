import {assert,assertEquals,assertAlmostEquals,assertThrows} from 'jsr:@std/assert@1';
import {load} from './_load.js';
const A=await load();

function sceneSequence(type='transform'){
  const p=A.mkProject(),scene=p.scenes[0],object=A.mkObject('Door');object.components.model={...A.makeComponent('model'),file:'door.obj'};scene.objects.push(object);
  const sequence=A.mkSequence(),track=A.mkCinematicTrack(type),clip=A.mkCinematicClip(type);clip.objectId=object.id;sequence.tracks.push(track);track.clips.push(clip);scene.sequences.push(sequence);
  return {p,scene,object,sequence,track,clip};
}

Deno.test('keyframes sample each outgoing curve, including holds and custom Bezier, at exact boundaries',()=>{
  const {clip}=sceneSequence();clip.to={x:10,y:0,z:0};A.enableCinematicKeyframes('transform',clip);A.addCinematicKeyframe('transform',clip,1);
  clip.keys[0].curve='easeIn';clip.keys[1].curve='step';
  const sample=time=>A.cinematicKeyframeValue(clip.keys,time,clip.from,clip.to,clip.duration);
  assertEquals(sample(.5).x,1.25);assertEquals(sample(1).x,5);assertEquals(sample(1.9).x,5);assertEquals(sample(2).x,10);
  assertAlmostEquals(A.cinematicCurve(.5,'bezier',[0,0,1,1]),.5,.00001);
  assertThrows(()=>A.addCinematicKeyframe('transform',clip,1),Error,'already');
});

Deno.test('stretching a clip scales key times and fades, while duplication creates independent key IDs',()=>{
  const {sequence,track,clip}=sceneSequence();A.enableCinematicKeyframes('transform',clip);clip.fadeIn=.5;
  A.stretchCinematicClip(clip,4);assertEquals(clip.keys[1].time,4);assertEquals(clip.fadeIn,1);
  const copy=A.duplicateCinematicClip(sequence,track.id,clip.id);assertEquals(copy.start,4);assert(copy.id!==clip.id);assert(copy.keys[0].id!==clip.keys[0].id);
  copy.keys[0].value.x=20;assertEquals(clip.keys[0].value.x,0);
});

Deno.test('reusable sequences retarget selected objects, get new IDs and cannot insert unresolved bindings',()=>{
  const {p,scene,sequence,object}=sceneSequence();const preset=A.saveSequencePreset(p,scene,sequence);
  const target=A.mkScene('Next'),door=A.mkObject(object.name);door.components.model=A.makeComponent('model');target.objects.push(door);p.scenes.push(target);
  const bindings=A.defaultSequenceBindings(preset,target);assertEquals(bindings[object.id],door.id);
  const copy=A.instantiateSequencePreset(preset,target,bindings);assertEquals(copy.tracks[0].clips[0].objectId,door.id);assertEquals(copy.event.type,'manual');assert(copy.id!==sequence.id);
  assertThrows(()=>A.instantiateSequencePreset(preset,target,{}),Error,'compatible object');assertEquals(target.sequences.length,1);
  copy.tracks[0].clips[0].to.x=10;assertEquals(preset.sequence.tracks[0].clips[0].to.x,0);
  const loaded=A.migrateProject(JSON.parse(JSON.stringify(p)));assertEquals(loaded.sequenceLibrary[0].bindings,preset.bindings);
  const second=A.instantiateSequencePreset(preset,target,bindings);assert(second.name!==copy.name);
  assert(A.saveSequencePreset(p,scene,sequence).name!==preset.name);
});

Deno.test('camera transitions begin at the previous shot endpoint and restore the original after a gap or cancellation',()=>{
  const {sequence,track,clip}=sceneSequence('camera');clip.duration=1;clip.toPosition.x=4;
  const next=A.mkCinematicClip('camera',1);next.position.x=8;next.toPosition.x=8;next.transitionIn=1;track.clips.push(next);
  let camera={position:{x:0,y:2,z:10},target:{x:0,y:0,z:0},up:{x:0,y:1,z:0}},original=structuredClone(camera);
  const adapter=A.createCinematicAdapter({model(){},cameraSave:()=>structuredClone(camera),cameraRestore:c=>camera=c,cameraSet:(position,target)=>camera={...camera,position,target}});
  const player=A.createCinematicPlayer([sequence],adapter);player.play(sequence.id);player.seek(1.5);assertAlmostEquals(camera.position.x,6);player.stop();assertEquals(camera,original);
  player.play(sequence.id);player.update(1);assertAlmostEquals(camera.position.x,4);player.update(.5);assertAlmostEquals(camera.position.x,6);player.stop();assertEquals(camera,original);
});

Deno.test('screen and dialogue fades sample opacity, stop cleanly and export through the shared adapter',()=>{
  const {p,scene,sequence,track,clip}=sceneSequence('fade');clip.duration=2;
  const dialogue=A.mkCinematicTrack('dialogue'),text=A.mkCinematicClip('dialogue');text.fadeIn=1;text.fadeOut=1;dialogue.clips.push(text);sequence.tracks.push(dialogue);
  const camera={position:{x:0,y:2,z:10},target:{x:0,y:0,z:0}},adapter=A.createCinematicAdapter({model(){},cameraSave:()=>camera,cameraRestore(){}}),player=A.createCinematicPlayer([sequence],adapter);
  player.play(sequence.id);player.update(.5);assertAlmostEquals(adapter.ui.find(e=>e.type==='fade').opacity,.25);assertAlmostEquals(adapter.ui.find(e=>e.type==='dialogue').opacity,.5);player.stop();assertEquals(adapter.ui,[]);
  assertEquals(A.cinematicProblems(scene),[]);clip.keys=[{id:'bad',time:3,value:128}];assert(A.cinematicProblems(scene).some(p=>p.message.includes('ordered keyframes')));
  clip.keys=[];assert(A.generateProject(p).main.includes('cinematicKeyframeValue'));
});
