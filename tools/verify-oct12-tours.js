import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
const A=await load(),reports=[];
try{for(const id of ['events','cinematics','hud']){
  const p=await A.makeTourProject(id),tour=A.EDITOR_TOURS.find(t=>t.id===id);
  for(const step of tour.steps)if(step.operation)A.applyTourOperation(p,step.operation,await A.prepareTourOperation(p,step.operation));
  const s=A.activeScene(p),result=A.generateProject(p),ir=A.resolveScene(p,s,A.editorAssets(p));assertEquals(result.diagnostics.filter(d=>d.level==='error'),[]);
  let before='',record='',limit=id==='cinematics'?540:id==='hud'?360:220;
  if(id==='cinematics')record='playing:ctx.cinematics.playing,time:ctx.cinematics.time,active:ctx.cinematics.active.length';
  if(id==='hud')record='score:ctx.variables.score,health:ctx.variables.health';
  if(id==='events'){
    const player=A.tourObject(p,'player'),body=ir.physics.bodies.find(b=>b.obj.id===player.id).bodyVN,door=ir.models.find(m=>m.obj.id===A.tourObject(p,'door').id).vn,victory=ir.ui.find(u=>u.el.id===A.tourHUD(p,'victoryText').id).vn;
    before=`if(verifyFrame===10||verifyFrame===160){${body}.setPosition(5,1,0);${body}.setLinearVel(0,0,0);}if(verifyFrame===45){${body}.setPosition(0,1,0);${body}.setLinearVel(0,0,0);}if(verifyFrame===60){${body}.setPosition(2,1,0);${body}.setLinearVel(0,0,0);}`;
    record=`keys:ctx.variables.keys,won:ctx.variables.won,victoryVisible:${victory}.visible,playerEnabled:ctx.isGameplayEnabled('${player.id}'),doorY:${door}.position.y`;
  }
  result.main=result.main.replace('Screen.display(() => {',`let verifyFrame=0;Screen.display(() => {verifyFrame++;${before}`);
  const end=result.main.lastIndexOf('});');result.main=result.main.slice(0,end)+`if(verifyFrame===40||verifyFrame===140||verifyFrame===${limit}){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:verifyFrame===${limit}?'DONE':'SAMPLE',tour:'${id}',frame:verifyFrame,${record}})+String.fromCharCode(10));f.close();}`+result.main.slice(end);
  const log=await runConsoleFixture(result,{timeoutMs:45000}),records=log.trim().split(/\r?\n/).map(JSON.parse),first=records[0],last=records.at(-1);
  if(id==='events'){assertEquals(first.keys,0);assertEquals(first.won,0);assertEquals(first.victoryVisible,false);assertEquals(last.keys,1);assertEquals(last.won,1);assertEquals(last.victoryVisible,true);assertEquals(last.playerEnabled,false);assertAlmostEquals(last.doorY,4,.01);}
  if(id==='cinematics'){assert(first.playing&&first.active>0);assertEquals(last.playing,false);assertEquals(last.active,0);}
  if(id==='hud'){assertEquals(last.score,10);assertEquals(last.health,65);}
  reports.push({id,passed:true,records});console.log(JSON.stringify(reports.at(-1)));
}await Deno.writeTextFile('.verification/oct12-tours-native.json',JSON.stringify(reports,null,2)+'\n');}finally{A.disposeTerrainPreviewWorker();await shutdown();}
