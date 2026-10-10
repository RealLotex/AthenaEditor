import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert} from 'jsr:@std/assert@1';
const A=await load();
try {
  const p=A.mkProject('Timeline authoring verification'),s=p.scenes[0];s.objects=[];s.defaultCameraRig=false;
  const hero=A.mkObject('hero');hero.components.model={...A.makeComponent('model'),file:'hero.obj'};hero.components.transform.position.x=9;s.objects.push(hero);
  const mesh=new Function(await Deno.readTextFile(new URL('../src/templates/assets.js',import.meta.url))+';return playerObj();')();p.assets.push({cat:'models',name:'hero.obj',content:mesh});
  const sequence=A.mkSequence();s.sequences.push(sequence);
  const transform=A.mkCinematicTrack('transform'),c=A.mkCinematicClip('transform');c.objectId=hero.id;c.duration=1;c.keys=[{id:'k0',time:0,value:{x:0,y:0,z:0},curve:'easeIn'},{id:'k1',time:.37,value:{x:4,y:0,z:0},curve:'easeOut'},{id:'k2',time:1,value:{x:0,y:0,z:0}}];transform.clips.push(c);sequence.tracks.push(transform);
  const camera=A.mkCinematicTrack('camera'),first=A.mkCinematicClip('camera'),second=A.mkCinematicClip('camera',.5);first.duration=.5;first.toPosition.x=4;second.duration=.5;second.position.x=8;second.toPosition.x=8;second.transitionIn=.25;camera.clips=[first,second];sequence.tracks.push(camera);
  const fade=A.mkCinematicTrack('fade'),f=A.mkCinematicClip('fade');f.duration=.5;fade.clips=[f];sequence.tracks.push(fade);
  const probe=A.mkObject('Probe');probe.components.script={file:'Probe.js'};s.objects.push(probe);
  p.scripts.push({name:'Probe.js',content:`export function init(ctx){const f=std.open("probe.log","w");f.close();ctx.events.on("cinematicFinished",()=>{const f=std.open("probe.log","a");f.puts(JSON.stringify({tag:"DONE",x:ctx.RenderObjects.hero.position.x,camera:Camera.save().position})+"\\n");f.close();});}`});
  const generated=A.generateProject(p);assert(!generated.diagnostics.some(d=>d.level==='error'),JSON.stringify(generated.diagnostics));
  generated.main=generated.main.replace('Screen.display(() => {','Screen.display(() => {try {').replace('ctx.cinematics.update(1/60);',`ctx.cinematics.update(1/60);
    if([14,29,36,44].includes(ctx.frame)){const f=std.open("probe.log","a"),fade=_cinematicAdapter.ui.find(e=>e.type==="fade");f.puts(JSON.stringify({tag:"SAMPLE",time:ctx.cinematics.time,x:hero.position.x,camera:Camera.save().position,opacity:fade?fade.opacity:null})+"\\n");f.close();}`)
    .replace(/\}\);\s*$/,`}catch(error){const f=std.open("probe.log","a");f.puts(JSON.stringify({tag:"ERROR",message:String(error),stack:String(error.stack)})+"\\n");f.close();throw error;} });`);
  const log=await runConsoleFixture(generated,{timeoutMs:25000,complete:text=>text.includes('"tag":"DONE"')||text.includes('"tag":"ERROR"')});
  const records=log.trim().split('\n').map(JSON.parse);assert(!records.some(r=>r.tag==='ERROR'),JSON.stringify(records));
  const samples=records.filter(r=>r.tag==='SAMPLE');assert(samples.length===4,log);
  for(const sample of samples){const t=sample.time,expected=t<=.37?4*(t/.37)**2:4*(1-(1-(t-.37)/.63)**2);
    // Second segment eases out from 4 down to 0.
    const x=t<=.37?expected:4-expected;assert(Math.abs(sample.x-x)<.01,'Keyframes / easing: '+JSON.stringify(sample));
    const cameraX=t<=.5?8*t:t<=.75?4+16*(t-.5):8;assert(Math.abs(sample.camera.x-cameraX)<.01,'Camera handoff: '+JSON.stringify(sample));
    if(t<.5-1e-6)assert(Math.abs(sample.opacity-t/.5)<.01,'Fade opacity: '+JSON.stringify(sample));
  }
  const end=records.at(-1);assert(end.tag==='DONE'&&Math.abs(end.x-9)<.001&&Math.abs(end.camera.x)<.001,'State restoration: '+log);
  await Deno.mkdir('.verification',{recursive:true});await Deno.writeTextFile('.verification/timeline-authoring.json',JSON.stringify({passed:true,records},null,2));console.log(JSON.stringify({passed:true,records}));
}finally{await shutdown();}
