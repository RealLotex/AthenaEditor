import {load,PURE_MODULES,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert,assertEquals} from 'jsr:@std/assert@1';
const module={exports:{}};new Function('module','exports',await Deno.readTextFile('vendor/three.js'))(module,module.exports);globalThis.THREE=module.exports;
const A=await load([...PURE_MODULES,'viewport/loaders.js','editor/environment.js']);
try{
  const p=A.mkProject('Coastal environment verification'),s=p.scenes[0];s.objects=[];s.defaultCameraRig=false;s.physics.enabled=true;
  const water=A.addWaterObject(p,s,await A.prepareWaterAssets());water.components.transform.scale={x:24,y:1,z:24};water.components.water.depth=2;water.components.water.opacity=.4;
  const floor=A.mkObject('Seafloor');floor.components.model={...A.makeComponent('model'),file:'floor.obj',pipeline:'PL_NO_LIGHTS'};floor.components.transform.scale={x:30,y:1,z:30};floor.components.rigidbody={...A.makeComponent('rigidbody'),shape:'plane'};s.objects.push(floor);p.assets.push(A.textMeshAsset('floor.obj',A.waterMeshOBJ(1)));
  const terrain=A.makeTerrain(8,8);terrain.blend=true;terrain.blendSize=256;terrain.blendBits=4;
  for(let z=0;z<=8;z++)for(let x=0;x<=8;x++)terrain.hills[z*9+x]=3*Math.exp(-((x-4)**2+(z-4)**2)/5);
  terrain.surfaces=terrain.surfaces.map((_,i)=>i%8<4?0:1);
  const island=A.mkObject('Island');island.components.model={...A.makeComponent('model'),file:'island.obj',textureFile:'island.png',pipeline:'PL_NO_LIGHTS'};island.components.rigidbody={...A.makeComponent('rigidbody'),shape:'mesh',autoFit:false};island.components.transform.position.x=7;island._terrain=terrain;s.objects.push(island);
  A.putProjectAsset(p,A.textMeshAsset('island.obj',A.writeMeshOBJ(A.terrainMesh(terrain),'Island')));p.assets.push(await A.terrainAtlasAsset(terrain,[],'island.png'));
  const sun=A.mkObject('Sun');sun.components.light=A.makeComponent('light');s.objects.push(sun);
  const camera=A.mkObject('Camera');camera.components.camera={...A.makeComponent('camera'),fov:85,target:{x:0,y:1,z:0}};camera.components.transform.position={x:0,y:8,z:14};s.objects.push(camera);
  p.assets.push(A.textMeshAsset('prop.obj','v -.5 0 -.5\nv .5 0 -.5\nv 0 2 .5\nv 0 0 .5\nf 1 2 3\nf 1 3 4\nf 2 4 3'));
  const props=[];for(let i=0;i<2;i++){const o=A.mkObject('Prop'+i);o.components.model={...A.makeComponent('model'),file:'prop.obj'};o.components.transform.position={x:-2+i*4,y:2,z:0};s.objects.push(o);props.push(o);}
  const shadows=await A.bakeSharedShadows(s,A.editorAssets(p),props.map(o=>o.id));assertEquals(shadows.outputs.length,1);p.assets.push(...shadows.outputs);for(const u of shadows.updates)props.find(o=>o.id===u.id).components.shadow=u.shadow;
  const colors=await A.bakeEnvironmentVertices(s,A.editorAssets(p),props.map(o=>o.id),{lighting:true});p.assets.push(...colors.outputs);for(const u of colors.updates)props.find(o=>o.id===u.id).components.model=u.model;
  const probe=A.mkObject('Probe');probe.components.script={...A.makeComponent('script'),file:'Probe.js'};s.objects.push(probe);
  if(Deno.args.includes('--effects')){
    const reflection=await A.prepareReflectionAsset();p.assets.push(reflection);water.components.reflection={...A.makeComponent('reflection'),texture:reflection.name};
    s.environment={fog:{enabled:true,start:5,end:30,color:{r:.65,g:.8,b:.92}}};
  }
  const dest=A.mkScene('Reload destination');dest.objects=[];dest.defaultCameraRig=false;p.scenes.push(dest);
  s.transitions=[{name:dest.id,targetSceneId:dest.id}];dest.transitions=[{name:s.id,targetSceneId:s.id}];
  const dp=A.mkObject('Destination probe');dp.components.script={...A.makeComponent('script'),file:'Destination.js'};dest.objects.push(dp);
  p.scripts.push({name:'Probe.js',content:`export function init(ctx){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'START'})+String.fromCharCode(10));f.close();}export function update(ctx){if(ctx.frame===40)ctx.goToScene('${dest.id}');}`});
  p.scripts.push({name:'Destination.js',content:`let again=false;export function init(ctx){const f=std.open('probe.log','r');const text=f.readAsString();f.close();const count=text.split('"tag":"START"').length-1;const out=std.open('probe.log','a');out.puts(JSON.stringify({tag:count>=2?'DONE':'RELOADED'})+String.fromCharCode(10));out.close();again=count<2;}export function update(ctx){if(again&&ctx.frame===5){again=false;ctx.goToScene('${s.id}');}}`});
  if(Deno.args.includes('--no-physics'))s.physics.enabled=false;
  if(Deno.args.includes('--no-shadows')){water.components.water.caustics=false;for(const o of props)delete o.components.shadow;}
  if(Deno.args.includes('--baseline')){delete water.components.water;for(const o of props)delete o.components.shadow;for(const file of p.assets)delete file.vertexColors;}
  if(Deno.args.includes('--single'))p.scripts.find(f=>f.name==='Probe.js').content=p.scripts.find(f=>f.name==='Probe.js').content.replace("if(ctx.frame===40)ctx.goToScene", "if(ctx.frame===30){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'DONE'})+String.fromCharCode(10));f.close();}if(ctx.frame===40)ctx.goToScene");
  const generated=A.generateProject(p),ir=A.resolveScene(p,s,A.editorAssets(p)),rd=ir.models.find(m=>m.obj.id===props[0].id).rd;
  const extra=ir.fogModels.length?`,fogAlpha:${ir.fogModels[0].stateVN}.colors[3],reflection:${ir.models.find(m=>m.obj.id===water.id).rd.dataVN}.materials[0].ref_texture_id`:'';
  const probeCode=`if(ctx.frame===20){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'COLORS',count:new Float32Array(${rd.dataVN}.vertices.colors).length,color:new Float32Array(${rd.dataVN}.vertices.colors)[0],vram:Screen.getMemoryStats(Screen.VRAM_USED_TOTAL)${extra}})+String.fromCharCode(10));f.close();}`;
  const instrument=code=>code.replace('Camera.update();','Camera.update();\n'+probeCode).replace('Screen.display(() => {','Screen.display(() => { try {').replace(/\}\);\s*$/,`}catch(error){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'ERROR',message:String(error),stack:String(error.stack)})+String.fromCharCode(10));f.close();throw error;} });`);
  generated.main=instrument(generated.main);generated.sceneFiles[0].content=generated.main;
  await Deno.writeTextFile('.verification/coastal-tools.athena.json',JSON.stringify(p));
  const log=await runConsoleFixture(generated,{timeoutMs:25000,complete:text=>text.includes('"tag":"DONE"')||text.includes('"tag":"ERROR"')});
  const records=log.trim().split(/\r?\n/).map(JSON.parse);assert(!records.some(r=>r.tag==='ERROR'),log);assert(records.some(r=>r.tag==='DONE'),log);
  const expected=Deno.args.includes('--single')?1:2;assertEquals(records.filter(r=>r.tag==='START').length,expected);assertEquals(records.filter(r=>r.tag==='COLORS').length,expected);if(!Deno.args.includes('--baseline'))assert(records.filter(r=>r.tag==='COLORS').every(r=>r.color>0&&r.color<1));
  if(Deno.args.includes('--effects'))assert(records.filter(r=>r.tag==='COLORS').every(r=>r.fogAlpha>-1&&r.fogAlpha<=0&&r.reflection>=0),log);
  await Deno.writeTextFile('.verification/environment.json',JSON.stringify({passed:true,reloadVerified:!Deno.args.includes('--single'),baseline:Deno.args.includes('--baseline'),records},null,2));console.log(JSON.stringify({passed:true,records}));
}finally{await shutdown();}
