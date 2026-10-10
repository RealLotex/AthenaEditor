// Real audio/skin resources exercise paths which a mocked renderer cannot prove.
import { load, shutdown } from '../tests/_load.js';
import { runConsoleFixture } from './run-console-fixture.js';
import { assert } from 'jsr:@std/assert@1';
import { encodeBase64 } from 'jsr:@std/encoding@1/base64';
const A=await load(),root=new URL('../reference/AthenaEnvReleaseAndExamples/',import.meta.url);
try {
  const p=A.mkProject('Cinematic media verification'),s=p.scenes[0];s.objects=[];s.defaultCameraRig=false;
  const skin=JSON.parse(await Deno.readTextFile(new URL('render/Twerk.gltf',root)));
  for(const b of skin.buffers)b.uri='data:application/octet-stream;base64,'+encodeBase64(await Deno.readFile(new URL('render/'+b.uri,root)));
  skin.animations=skin.animations.slice(0,2);skin.animations[0].name='Idle';skin.animations[1].name='TestPose';
  const animations=structuredClone(skin);for(const material of animations.materials||[])delete material.pbrMetallicRoughness?.baseColorTexture;delete animations.images;delete animations.textures;
  p.assets.push({cat:'models',name:'anims.gltf',content:JSON.stringify(animations)});
  p.assets.push({cat:'textures',name:'player.png',dataUrl:'data:image/png;base64,'+encodeBase64(await Deno.readFile(new URL('render/player.png',root)))});
  p.assets.push({cat:'sounds',name:'voice.wav',dataUrl:'data:audio/wav;base64,'+encodeBase64(await Deno.readFile(new URL('sounds/Nokia%20Tune.wav',root)))});
  const hero=A.mkObject('hero');hero.components.model={...A.makeComponent('model'),file:'anims.gltf',textureFile:'player.png'};
  hero.components.animator={...A.makeComponent('animator'),file:'anims.gltf',defaultAnim:'Idle',loop:true};s.objects.push(hero);
  hero.components.rigidbody={...A.makeComponent('rigidbody'),mode:'static',shape:'sphere',radius:1,autoFit:false};
  A.attachEventPreset(p,s,hero,'playAnimation');hero.components.rigidbody.eventAnimation='TestPose';
  const zone=A.mkObject('Audio trigger'),body=A.mkObject('Body');
  zone.components.rigidbody={...A.makeComponent('rigidbody'),mode:'trigger',shape:'sphere',radius:2,autoFit:false};
  body.components.rigidbody={...A.makeComponent('rigidbody'),mode:'dynamic',shape:'sphere',radius:.5,autoFit:false};s.objects.push(zone,body);s.physics.gravity={x:0,y:0,z:0};
  A.attachEventPreset(p,s,zone,'playSound');zone.components.rigidbody.eventAudio='voice.wav';zone.components.rigidbody.eventOtherId=body.id;
  const first=A.mkObject('First camera'),rig=A.mkObject('Camera rig'),camera=A.mkObject('Active camera');
  first.components.camera=A.makeComponent('camera');camera.components.camera=A.makeComponent('camera');
  rig.components.transform.position={x:1,y:2,z:0};camera.components.transform.position={x:2,y:0,z:10};rig.children=[camera];s.objects.push(first,rig);s.activeCameraId=camera.id;
  const sequence=A.mkSequence();sequence.name='Media';
  for(const type of ['voice','animation']){
    const t=A.mkCinematicTrack(type),c=A.mkCinematicClip(type);c.duration=.6;
    if(type==='voice')c.file='voice.wav';else{c.objectId=hero.id;c.file='anims.gltf';c.animation='TestPose';c.loop=false;}
    t.clips=[c];sequence.tracks.push(t);
  }
  s.sequences=[sequence];
  const probe=A.mkObject('Probe');probe.components.script={file:'Probe.js'};s.objects.push(probe);
  p.scripts.push({name:'Probe.js',content:`
function record(ctx,tag,extra={}){const f=std.open("probe.log","a");f.puts(JSON.stringify({tag,frame:ctx.frame,...extra})+"\\n");f.close();}
export function init(ctx){const f=std.open("probe.log","w");f.close();ctx.events.on("sceneStart",()=>record(ctx,"START",{camera:Camera.save().position}));ctx.events.on("cinematicFinished",()=>record(ctx,"COMPLETE",{animation:ctx.RenderObjects.hero.isPlayingAnim(ctx.animCollections.hero["Idle"])}));}
export function update(ctx){if(ctx.frame>45)record(ctx,"DONE",{presetAnimation:ctx.RenderObjects.hero.isPlayingAnim(ctx.animCollections.hero["TestPose"]),presetAudio:ctx.eventActions.find(a=>a.preset==="playSound").sound.playing()});}
`});
  const generated=A.generateProject(p);
  // The probe runs in the display callback, where active cinematic clips can
  // be observed even though gameplay behaviour updates are suspended.
  generated.main=generated.main.replace('Screen.display(() => {','Screen.display(() => { try {').replace('ctx.cinematics.update(1/60);',`ctx.cinematics.update(1/60);
    if(ctx.frame===10){const f=std.open("probe.log","a");f.puts(JSON.stringify({tag:"ACTIVE",voice:_cinematicSounds["${sequence.tracks[0].clips[0].id}"].playing(),animation:hero.isPlayingAnim(_cinematicAnims["anims.gltf"]["TestPose"])})+"\\n");f.close();}
  `).replace(/\}\);\s*$/,`}catch(error){const f=std.open("probe.log","a");f.puts(JSON.stringify({tag:"ERROR",message:String(error),stack:String(error.stack)})+"\\n");f.close();throw error;} });`);
  const log=await runConsoleFixture(generated,{timeoutMs:25000,complete:text=>text.includes('"tag":"DONE"')||text.includes('"tag":"ERROR"')});
  const records=log.trim().split('\n').map(JSON.parse),active=records.find(r=>r.tag==='ACTIVE'),start=records.find(r=>r.tag==='START');
  assert(!records.some(r=>r.tag==='ERROR'),JSON.stringify(records));
  assert(active?.voice&&active.animation,'Voice / animation did not start: '+log);
  assert(records.some(r=>r.tag==='COMPLETE'&&r.animation),'Default animation did not resume: '+log);
  assert(records.some(r=>r.tag==='DONE'&&r.presetAudio&&r.presetAnimation),'Collision audio / animation presets did not execute: '+log);
  assert(Math.abs(start.camera.x-3)<.001&&Math.abs(start.camera.y-2)<.001,'Active nested camera was not used: '+log);
  await Deno.writeTextFile('.verification/cinematic-media.json',JSON.stringify({passed:true,records},null,2));
  console.log(JSON.stringify({passed:true,records}));
}finally{await shutdown();}
