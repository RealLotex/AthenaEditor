import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert} from 'jsr:@std/assert@1';
import {encodeBase64} from 'jsr:@std/encoding@1/base64';
const A=await load(),root=new URL('../reference/AthenaEnvReleaseAndExamples/render/',import.meta.url);
try{
  const p=A.mkProject('Animation mixing verification'),s=p.scenes[0];s.objects=[];s.defaultCameraRig=false;
  const skin=JSON.parse(await Deno.readTextFile(new URL('Twerk.gltf',root)));for(const b of skin.buffers)b.uri='data:application/octet-stream;base64,'+encodeBase64(await Deno.readFile(new URL(b.uri,root)));
  for(const material of skin.materials||[])delete material.pbrMetallicRoughness?.baseColorTexture;delete skin.images;delete skin.textures;
  const addAccessor=(values,type)=>{const floats=new Float32Array(values),buffer=skin.buffers.length,bufferView=skin.bufferViews.length,index=skin.accessors.length;skin.buffers.push({uri:'data:application/octet-stream;base64,'+encodeBase64(new Uint8Array(floats.buffer)),byteLength:floats.byteLength});skin.bufferViews.push({buffer,byteLength:floats.byteLength});skin.accessors.push({bufferView,componentType:5126,count:values.length/(type==='SCALAR'?1:type==='VEC3'?3:4),type});return index;};
  const times=addAccessor([0,1],'SCALAR'),a=addAccessor([0,0,0,4,0,0],'VEC3'),b=addAccessor([4,0,0,8,0,0],'VEC3'),qa=addAccessor([0,0,0,1,0,0,0,1],'VEC4'),qb=addAccessor([0,1,0,0,0,1,0,0],'VEC4'),node=skin.skins[0].joints[0];
  skin.animations=[['First',a,qa],['Second',b,qb]].map(([name,output,rotation])=>({name,samplers:[{input:times,output,interpolation:'LINEAR'},{input:times,output:rotation,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node,path:'translation'}},{sampler:1,target:{node,path:'rotation'}}]}));
  p.assets=[{cat:'models',name:'mix.gltf',content:JSON.stringify(skin)}];
  const hero=A.mkObject('hero');hero.components.model={...A.makeComponent('model'),file:'mix.gltf'};s.objects.push(hero);
  const sequence=A.mkSequence(),track=A.mkCinematicTrack('animation');track.clips=[{...A.mkCinematicClip('animation'),duration:1,objectId:hero.id,file:'mix.gltf',animation:'First',blendOut:.5},{...A.mkCinematicClip('animation',.5),duration:1,objectId:hero.id,file:'mix.gltf',animation:'Second',blendIn:.5}];sequence.tracks=[track];s.sequences=[sequence];
  const probe=A.mkObject('Probe');probe.components.script={file:'Probe.js'};s.objects.push(probe);p.scripts=[{name:'Probe.js',content:`export function init(ctx){const f=std.open('probe.log','w');f.close();ctx.events.on('cinematicFinished',()=>{const b=ctx.RenderObjects.hero.bones[0],f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'DONE',x:b.position.x,qy:b.rotation.y,qw:b.rotation.w})+'\\n');f.close();});}`}];
  const generated=A.generateProject(p);assert(!generated.diagnostics.some(d=>d.level==='error'),JSON.stringify(generated.diagnostics));
  generated.main=generated.main.replace('Screen.display(() => {','Screen.display(() => {try {').replace('ctx.cinematics.update(1/60);',`ctx.cinematics.update(1/60);if([29,44,59].includes(ctx.frame)){const b=hero.bones[0],f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'SAMPLE',time:ctx.cinematics.time,x:b.position.x,qy:b.rotation.y,qw:b.rotation.w})+'\\n');f.close();}`).replace(/\}\);\s*$/,`}catch(error){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'ERROR',message:String(error),stack:String(error.stack)})+'\\n');f.close();throw error;} });`);
  const log=await runConsoleFixture(generated,{timeoutMs:25000,complete:text=>text.includes('"tag":"DONE"')||text.includes('"tag":"ERROR"')});const records=log.trim().split('\n').map(JSON.parse);assert(!records.some(r=>r.tag==='ERROR'),log);const samples=records.filter(r=>r.tag==='SAMPLE');assert(samples.length===3,log);
  for(let i=0;i<samples.length;i++)assert(Math.abs(samples[i].x-[2,4,6][i])<.01,log);assert(Math.abs(samples[1].qy-Math.SQRT1_2)<.01&&Math.abs(samples[1].qw-Math.SQRT1_2)<.01,log);
  const end=records.find(r=>r.tag==='DONE');assert(Math.abs(end.x-(skin.nodes[node].translation?.[0]||0))<.01&&Math.abs(end.qw-(skin.nodes[node].rotation?.[3]??1))<.01,log);
  await Deno.mkdir('.verification',{recursive:true});await Deno.writeTextFile('.verification/animation-mixing.json',JSON.stringify({passed:true,records},null,2));await Deno.writeTextFile('.verification/animation-mixing.athena.json',JSON.stringify(p));console.log(JSON.stringify({passed:true,records}));
}finally{await shutdown();}
