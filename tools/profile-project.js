import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert} from 'jsr:@std/assert@1';
try{
  const A=await load(),project=A.migrateProject(JSON.parse(await Deno.readTextFile('C:/Users/Marcos/Documents/my_game.atheditor'))),scene=project.scenes.find(s=>s.id===project.activeSceneId)||project.scenes[0];
  const variant=Deno.args[0]||'baseline';
  for(const o of A.allObjects(scene.objects)){
    if(variant==='no-water' && o.components.water)o.visible=false;
    if(variant==='fog-no-water'&&o.components.water)o.visible=false;
    if(variant==='no-terrain' && o.name==='Terrain')o.visible=false;
    if(variant==='no-mesh-collider' && o.components.rigidbody?.shape==='mesh')delete o.components.rigidbody;
  }
  if(variant==='fog'||variant==='fog-no-water')scene.environment={...scene.environment,fog:{enabled:true,start:10,end:50,color:{r:.6,g:.8,b:.9}}};
  if(variant==='no-physics'){scene.physics.enabled=false;project.scripts=[];for(const o of A.allObjects(scene.objects))delete o.components.script;}
  const result=A.generateProject(project),ir=A.resolveScene(project,scene,A.editorAssets(project));
  assert(!result.diagnostics.some(d=>d.level==='error'),JSON.stringify(result.diagnostics));
  let main=result.main;
  const timer=`const _profileTimer=Timer.new(),_profileSum=new Float64Array(4),_profileStart=new Float64Array(4),_profileInterval=new Float64Array(2);let _profileFrame=0;function _profileMark(slot){_profileStart[slot]=Timer.getTime(_profileTimer);}function _profileEnd(slot){if(_profileFrame>3)_profileSum[slot]+=Timer.getTime(_profileTimer)-_profileStart[slot];}`;
  main=timer+'\n'+main;
  main=main.replace('Screen.display(() => {',`Screen.display(() => {++_profileFrame;_profileMark(0);if(_profileFrame>3)_profileInterval[1]+=_profileStart[0]-_profileInterval[0];_profileInterval[0]=_profileStart[0];_profileMark(1);`);
  main=main.replace('  Camera.update();','  _profileEnd(1);_profileMark(2);Camera.update();');
  main=main.replace('  _updateWater(1/60);','  _profileMark(3);_updateWater(1/60);_profileEnd(3);');
  const end=main.lastIndexOf('});');
  const last=Deno.args.includes('--long')?140:20;
  main=main.slice(0,end)+`_profileEnd(2);_profileEnd(0);if(_profileFrame===4||_profileFrame===${last}){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:_profileFrame===${last}?'DONE':'START',frame:_profileFrame,variant:${JSON.stringify(variant)},meanUs:Array.from(_profileSum).map(v=>v/Math.max(1,_profileFrame-3)),frameIntervalUs:_profileInterval[1]/(_profileFrame-3),vram:Screen.getMemoryStats(Screen.VRAM_USED_TOTAL)})+String.fromCharCode(10));f.close();}\n`+main.slice(end);
  result.main=main;
  const log=await runConsoleFixture(result,{timeoutMs:90000});
  console.log(log);await Deno.writeTextFile('.verification/profile-'+variant+'.log',log);
  const done=log.trim().split(/\r?\n/).map(JSON.parse).find(r=>r.tag==='DONE');
  assert(done&&done.frameIntervalUs<50000,'Frame interval exceeded the 20 FPS regression floor: '+log);
}finally{await shutdown();}
