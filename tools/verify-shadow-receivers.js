// Native regression: floor -> high platform -> moved platform -> destruction.
// Probe exactly the centre ray emitted to Projector, against its actual receiver geoms.
// --reload additionally audits the bundled runtime's known live-shadow unload failure.
import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert} from 'jsr:@std/assert@1';
const A=await load();
try {
  const p=A.mkProject('Shadow receiver verification'),s=p.scenes[0];s.objects=[];s.defaultCameraRig=false;s.physics.enabled=true;s.physics.gravity={x:0,y:0,z:0};
  const make=(name,shape,mode='static')=>{const o=A.mkObject(name);o.components.rigidbody={...A.makeComponent('rigidbody'),shape,mode,autoFit:false};return o;};
  const hero=make('Hero','sphere','dynamic');hero.components.rigidbody.radius=.5;hero.components.rigidbody.freezeRotation=true;hero.components.model={...A.makeComponent('model'),file:'hero.obj',pipeline:'PL_NO_LIGHTS'};hero.components.shadow={...A.makeComponent('shadow'),lightDir:{x:0,y:1,z:0},autoFit:false,size:{x:2,z:2},grid:{x:3,z:3}};hero.components.transform.position.y=1;
  const floor=make('Floor','plane'),platform=make('Platform','box');platform.components.rigidbody.size={x:6,y:2,z:6};platform.components.transform.position.y=20;
  const trigger=make('Zone','box','trigger');trigger.components.rigidbody.size={x:10,y:10,z:10};trigger.components.transform.position.y=25;
  const probe=A.mkObject('Probe');probe.components.script={...A.makeComponent('script'),file:'Probe.js'};s.objects=[hero,floor,platform,trigger,probe];
  const rule=A.mkEventRule();rule.event.type='custom';rule.event.name='unused';rule.actions=[{...A.mkFlowAction('destroyObject'),objectId:platform.id}];s.eventRules=[rule];
  p.assets=[{cat:'models',name:'hero.obj',content:new Function(await Deno.readTextFile(new URL('../src/templates/assets.js',import.meta.url))+';return playerObj();')()}];
  const dest=A.mkScene('Destination');dest.objects=[];dest.defaultCameraRig=false;p.scenes.push(dest);
  const destProbe=A.mkObject('DestinationProbe');destProbe.components.script={...A.makeComponent('script'),file:'Destination.js'};dest.objects.push(destProbe);
  p.scripts.push({name:'Probe.js',content:`export function init(ctx){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'START'})+'\\n');f.close();}export function update(ctx){if(ctx.frame===31)ctx.physics.bodies.hero.setPosition(0,22,0);if(ctx.frame===61){ctx.physics.geoms.platform.setPosition(4,30,0);ctx.physics.bodies.hero.setPosition(4,32,0);}if(ctx.frame===91)ctx.destroyObject('${platform.id}');if(ctx.frame===110)ctx.goToScene('${dest.id}');}`});
  p.scripts.push({name:'Destination.js',content:`let again=false;export function init(ctx){const input=std.open('probe.log','r');const text=input.readAsString();input.close();const count=text.split('"tag":"START"').length-1;const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:count>=2?'DONE':'RELOADED'})+'\\n');f.close();again=count<2;}export function update(ctx){if(again&&ctx.frame>=10){again=false;ctx.goToScene('${s.id}');}}`});
  const reload=Deno.args.includes('--reload');
  if(!reload)p.scripts.find(f=>f.name==='Probe.js').content=p.scripts.find(f=>f.name==='Probe.js').content.replace("export function update(ctx){","export function update(ctx){if(ctx.frame===100){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'DONE'})+'\\n');f.close();}");
  const generated=A.generateProject(p);assert(!generated.diagnostics.some(d=>d.level==='error'),JSON.stringify(generated.diagnostics));
  const ir=A.resolveScene(p,s,[]),shadow=ir.shadows[0],receivers=shadow.receivers.bodies;
  assert(receivers.length===2&&receivers.every(r=>r.body.obj.id!==hero.id&&r.body.obj.id!==trigger.id));
  const matrix=shadow.matrixVN,L=shadow.proj.L;
  const query=`const verificationRay = ODE.GeomRay(null,12.0);
function verifyReceiver(){if(![25,55,85,95].includes(ctx.frame))return;
 const start=[${matrix}[12]+${L.x}*6,${matrix}[13]-${L.y}+${L.y}*6,${matrix}[14]+${L.z}*6];
 verificationRay.raySet(start[0],start[1],start[2],${-L.x},${-L.y},${-L.z});
 let hit=null;for(const g of [${receivers.map(r=>r.vn).join(',')}]){if(g._destroyed)continue;for(const c of ODE.geomCollide(verificationRay,g))if(!hit||c.depth<hit.depth)hit=c;}
 const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'RAY',frame:ctx.frame,start,hit:hit?hit.position:null,removed:${receivers.find(r=>r.body.obj.id===platform.id).vn}._destroyed===true})+'\\n');f.close();
}
`;
  generated.main=generated.main.replace('Screen.display(() => {',query+'Screen.display(() => {try {').replace(`${shadow.vn}.render();`,`${shadow.vn}.render(); verifyReceiver();`).replace(/\}\);\s*$/,`}catch(error){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'ERROR',message:String(error),stack:String(error.stack)})+'\\n');f.close();throw error;} });`);
  generated.sceneFiles[0].content=generated.main;
  const log=await runConsoleFixture(generated,{timeoutMs:25000,complete:text=>text.includes('"tag":"DONE"')||text.includes('"tag":"ERROR"')});
  const records=log.trim().split('\n').map(JSON.parse);assert(!records.some(r=>r.tag==='ERROR'),log);const rays=records.filter(r=>r.tag==='RAY');
  assert(rays.length===(reload?8:4),log);
  for(let i=0;i<rays.length;i+=4){assert(Math.abs(rays[i].hit[1])<.01,log);assert(Math.abs(rays[i+1].hit[1]-21)<.01&&Math.abs(rays[i+1].start[1]-22)<.01,log);assert(Math.abs(rays[i+2].hit[1]-31)<.01&&Math.abs(rays[i+2].hit[0]-4)<.01,log);assert(rays[i+3].removed&&rays[i+3].hit===null,log);}
  await Deno.mkdir('.verification',{recursive:true});await Deno.writeTextFile('.verification/shadow-receivers.json',JSON.stringify({passed:true,reloadVerified:reload,records},null,2));console.log(JSON.stringify({passed:true,reloadVerified:reload,records}));
} finally {await shutdown();}
