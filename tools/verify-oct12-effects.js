import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
const A=await load();
try{
  const p=A.mkProject('Extended particles and HUD'),s=p.scenes[0];s.physics.enabled=true;
  A.putProjectAsset(p,A.textMeshAsset('ground.obj',A.groundObj()));A.putProjectAsset(p,A.textMeshAsset('crate.obj',A.boxObj('Crate',.5,.5,.5)));
  const floor=A.mkObject('Ground');floor.components.model={...A.makeComponent('model'),file:'ground.obj'};floor.components.rigidbody={...A.makeComponent('rigidbody'),shape:'plane',mode:'static'};s.objects.push(floor);
  const source=A.addParticleObject(p,s,'splash',await A.prepareParticleAssets('splash'));source.components.transform.position={x:0,y:2,z:0};
  Object.assign(source.components.particles,{shape:'point',simulationSpace:'world',lifetimeMin:2,lifetimeMax:2,speedMin:0,speedMax:0,gravityModifier:1,count:4,bursts:[{time:0,count:4,cycles:1,interval:.1}],collisionType:'world',bounce:.35});
  const child=A.addParticleObject(p,s,'splash',await A.prepareParticleAssets('splash'));Object.assign(child.components.particles,{playOnStart:false,count:32,lifetimeMin:.4,lifetimeMax:.4,bursts:[{time:0,count:2,cycles:1,interval:.1}],gravityModifier:0});source.components.particles.subEmitters=[{event:'collision',objectId:child.id,probability:1}];
  const mesh=A.addParticleObject(p,s,'splash',await A.prepareParticleAssets('splash'));Object.assign(mesh.components.particles,{renderMode:'mesh',meshFile:'crate.obj',count:3,lifetimeMin:2,lifetimeMax:2,simulationSpace:'world',sortingFudge:-2});
  s.eventVariables={health:100};const hud=A.mkUIEl('ProgressBar');hud.binding={variable:'health',kind:'progress',min:0,max:100};hud.animation={enabled:true,property:'x',from:-100,to:60,duration:1,loop:false,curve:'linear'};s.uiElements=[hud];
  const timer=A.mkEventRule();timer.event={...timer.event,type:'timer',seconds:.7};timer.actions=[{...A.mkFlowAction('setVariable'),key:'health',value:65}];s.eventRules=[timer];
  const generated=A.generateProject(p),ir=A.resolveScene(p,s,A.editorAssets(p)),find=id=>ir.models.find(m=>m.obj.id===id),a=find(source.id),b=find(child.id),m=find(mesh.id),u=ir.ui[0];
  const probe=`if(++verifyFrame===30||verifyFrame===60||verifyFrame===150){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:verifyFrame===150?'DONE':'SAMPLE',frame:verifyFrame,sourceActive:${a.particleVN}.activeCount,childActive:${b.particleVN}.activeCount,collisions:${a.particleVN}.collisionAges.filter(v=>v>=0).length,sourceY:${a.particleVN}.previous[1],meshActive:${m.particleVN}.activeCount,meshCorners:${m.particleVN}.meshTemplate.length/4,meshW:${m.particleVN}.positions[3],hudX:${u.vn}.x,health:${u.vn}.progress})+String.fromCharCode(10));f.close();}`;
  generated.main=generated.main.replace('Screen.display(() => {','let verifyFrame=0;Screen.display(() => {').replace('    drawUI();','    drawUI();'+probe);
  const log=await runConsoleFixture(generated,{timeoutMs:25000}),records=log.trim().split(/\r?\n/).map(JSON.parse);assertEquals(records.length,3);
  const first=records[0],hit=records[1],last=records[2];assertAlmostEquals(first.hudX,-20,.05);assertEquals(first.health,1);assertAlmostEquals(hit.hudX,60,.05);assertAlmostEquals(hit.health,.65,.001);assert(hit.collisions>0&&hit.childActive>0,log);assert(hit.sourceY>=-.05,log);assert(hit.meshActive>0&&hit.meshCorners===36,log);assertEquals(hit.meshW,1);assertEquals(last.sourceActive,0);assertEquals(last.meshActive,0);
  await Deno.writeTextFile('.verification/oct12-effects-native.json',JSON.stringify({passed:true,records},null,2)+'\n');console.log(JSON.stringify({passed:true,records}));
}finally{await shutdown();}
