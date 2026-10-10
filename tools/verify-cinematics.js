import { load, shutdown } from "../tests/_load.js";
import { runConsoleFixture } from "./run-console-fixture.js";
import { assert } from "jsr:@std/assert@1";
const A=await load();
try {
  const p=A.mkProject('Cinematic verification'),s=p.scenes[0],dest=A.mkScene('Destination');p.scenes.push(dest);
  s.objects=[];s.defaultCameraRig=false;s.physics.enabled=true;s.physics.gravity={x:0,y:0,z:0};
  const hero=A.mkObject('hero');hero.components.model={...A.makeComponent('model'),file:'hero.obj'};
  hero.components.rigidbody={...A.makeComponent('rigidbody'),shape:'sphere',radius:.5,mode:'dynamic',autoFit:false,freezeRotation:true};s.objects.push(hero);
  const playerMesh=new Function(await Deno.readTextFile(new URL('../src/templates/assets.js',import.meta.url))+';return playerObj();')();
  p.assets.push({cat:'models',name:'hero.obj',content:playerMesh});
  const add=(name,event,type='dialogue',duration=.2)=>{
    const seq=A.mkSequence();seq.name=name;seq.event={...seq.event,...event};const t=A.mkCinematicTrack(type),c=A.mkCinematicClip(type);c.duration=duration;t.clips=[c];seq.tracks=[t];s.sequences.push(seq);return {seq,t,c};
  };
  const intro=add('Intro',{type:'sceneStart'},'transform',.5);intro.c.objectId=hero.id;intro.c.to={x:3,y:0,z:0};
  for(const type of ['camera','particles','dialogue','panel','mesh']){const t=A.mkCinematicTrack(type),c=A.mkCinematicClip(type);c.duration=.5;if(['particles','mesh'].includes(type))c.objectId=hero.id;if(type==='particles')c.count=8;t.clips=[c];intro.seq.tracks.push(t);}
  const custom=add('Custom',{type:'custom',name:'dialogueNow'}),timer=add('Timer',{type:'timer',seconds:1.2}),outro=add('Outro',{type:'beforeSceneEnd'});
  const probe=A.mkObject('probe');probe.components.script={file:'Probe.js',ctxKey:'probe'};s.objects.push(probe);
  p.scripts.push({name:'Probe.js',content:`let updates=0, custom=false;
function record(ctx,tag,extra={}){const f=std.open("probe.log","a");f.puts(JSON.stringify({tag,frame:ctx.frame,updates,...extra})+"\\n");f.close();}
export function init(ctx){
 const f=std.open("probe.log","w");f.close();
 ctx.events.on("sceneStart",()=>record(ctx,"START"));
 ctx.events.on("beforeSceneEnd",()=>record(ctx,"BEFORE_END"));
 ctx.events.on("cinematicFinished",event=>{
   record(ctx,"COMPLETE",{id:event.sequenceId,x:ctx.RenderObjects.hero?ctx.RenderObjects.hero.position.x:0,camera:Camera.save().position});
   if(event.sequenceId==="${timer.seq.id}")ctx.goToScene("${dest.id}");
 });
}
export function update(ctx){updates++;if(updates===1)record(ctx,"FIRST_UPDATE");if(!custom&&ctx.frame>=40){custom=true;ctx.events.emit("dialogueNow");}}
`});
  const destination=A.mkObject('DestinationProbe');destination.components.script={file:'Destination.js'};dest.objects.push(destination);dest.defaultCameraRig=false;
  p.scripts.push({name:'Destination.js',content:`
export function init(ctx) {
    const f = std.open("probe.log", "a");
    f.puts(JSON.stringify({tag:"DONE"}) + "\\n");
    f.close();
}
`});
  const generated=A.generateProject(p);
  const frameGuard=text=>text.replace('Screen.display(() => {','Screen.display(() => { try {').replace(/\}\);\s*$/,`}catch(error){const f=std.open("probe.log","a");f.puts(JSON.stringify({tag:"ERROR",message:String(error),stack:String(error.stack)})+"\\n");f.close();throw error;} });`);
  generated.main=frameGuard(generated.main);for(const f of generated.sceneFiles)f.content=frameGuard(f.content);
  const log=await runConsoleFixture(generated,{timeoutMs:20000,complete:text=>text.includes('"tag":"DONE"')||text.includes('"tag":"ERROR"')});
  const records=log.trim().split('\n').map(JSON.parse);
  assert(!records.some(r=>r.tag==='ERROR'),JSON.stringify(records));
  const completions=records.filter(r=>r.tag==='COMPLETE');assert(completions.length===4,JSON.stringify(records));
  const introEnd=completions.find(r=>r.id===intro.seq.id),first=records.find(r=>r.tag==='FIRST_UPDATE');
  assert(introEnd.updates===0&&first.frame>=29,'Gameplay ran during intro');
  assert(Math.abs(introEnd.x)<.001&&Math.abs(introEnd.camera[0]||introEnd.camera.x||0)<.001,'Transform/camera not restored');
  const before=records.find(r=>r.tag==='BEFORE_END'),end=completions.find(r=>r.id===outro.seq.id);
  assert(end.frame-before.frame>=10&&end.updates===before.updates,'Transition did not wait or gameplay ran during outro');
  assert(records.at(-1).tag==='DONE','Destination was not loaded');
  await Deno.mkdir('.verification',{recursive:true});await Deno.writeTextFile('.verification/cinematics.json',JSON.stringify({passed:true,records},null,2));
  console.log(JSON.stringify({passed:true,records}));
}finally{await shutdown();}
