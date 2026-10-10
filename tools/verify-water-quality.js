import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert} from 'jsr:@std/assert@1';
const A=await load();
try{
  const p=A.migrateProject(JSON.parse(await Deno.readTextFile('C:/Users/Marcos/Documents/my_game.atheditor'))),s=p.scenes.find(s=>s.id===p.activeSceneId),variant=Deno.args[0]||'optimized';
  const o=A.allObjects(s.objects).find(o=>o.components.water),w=o.components.water;
  w.quality={textureSize:512,transparency:1,panning:4,waves:4,caustics:4,pattern:4};w.caustics=true;w.textureFilter='LINEAR';
  if(variant==='ultra-low'){w.quality={textureSize:32,transparency:0,panning:0,waves:0,caustics:0,pattern:0};w.textureFilter='NEAREST';}
  const ir=A.resolveScene(p,s,A.editorAssets(p)),rd=ir.models.find(m=>m.obj.id===o.id).rd,shadow=ir.shadows.find(s=>s.caustics);
  const result=A.generateProject(p);assert(!result.diagnostics.some(d=>d.level==='error'),JSON.stringify(result.diagnostics));
  let disabling='';
  if(variant==='positions'||variant==='all-disabled')disabling+=`${rd.waterVN}.cache.positions=null;`;
  if(variant==='uvs'||variant==='all-disabled')disabling+=`${rd.waterVN}.cache.uvs=null;`;
  if(variant==='caustics'||variant==='all-disabled')disabling+=`${shadow.cachedCaustics.stateVN}.forceDynamic=true;`;
  if(variant==='moving-receiver'){
    const body=ir.physics.bodies.find(b=>!b.isDynamic&&b.shape!=='plane'&&b.model);
    assert(body,'Fixture needs a static receiver');disabling+=`{const p=${body.geomVN}.getPosition();${body.geomVN}.setPosition(p[0]+4,p[1],p[2]);}`;
  }
  const timer=`const verifyTimer=Timer.new(),verifySum=new Float64Array(2),verifyInterval=new Float64Array(2),verifyBegin=new Float64Array(1);let verifyFrame=0;`;
  result.main=timer+'\n'+result.main;
  result.main=result.main.replace('Screen.display(() => {',`${disabling}Screen.display(() => {verifyFrame++;verifyBegin[0]=Timer.getTime(verifyTimer);if(verifyFrame>10)verifyInterval[1]+=verifyBegin[0]-verifyInterval[0];verifyInterval[0]=verifyBegin[0];`);
  const end=result.main.lastIndexOf('});');
  result.main=result.main.slice(0,end)+`if(verifyFrame>10)verifySum[0]+=Timer.getTime(verifyTimer)-verifyBegin[0];if(verifyFrame===60){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'DONE',variant:${JSON.stringify(variant)},meanUs:verifySum[0]/50,intervalUs:verifyInterval[1]/50,cacheValid:${shadow?'waterCausticCacheValid('+shadow.cachedCaustics.stateVN+')':'null'},waterY:${rd.waterVN}.positions[1],u:${rd.waterVN}.uvs[0],vram:Screen.getMemoryStats(Screen.VRAM_USED_TOTAL),cacheBytes:${rd.waterCache?.bytes||0},corners:${rd.waterVN}.positions.length/4,alpha:new Float32Array(${rd.dataVN}.vertices.colors)[3],frameCount:${rd.waterVN}.frameCount,nearest:${rd.texVN}.filter===NEAREST})+String.fromCharCode(10));f.close();}\n`+result.main.slice(end);
  const log=await runConsoleFixture(result,{timeoutMs:90000});console.log(log);
  const record=log.trim().split(/\r?\n/).map(JSON.parse).find(r=>r.tag==='DONE');assert(record,log);
  await Deno.writeTextFile('.verification/water-quality-'+variant+'.json',JSON.stringify(record,null,2));
  if(variant==='optimized'){assert(record.cacheValid,'Static caustic cache was bypassed: '+log);assert(record.intervalUs<33334,'Maximum water quality fell below 30 FPS: '+log);}
  if(variant==='moving-receiver')assert(!record.cacheValid,'Moving collider did not invalidate cached caustics: '+log);
  if(variant==='ultra-low')assert(record.cacheBytes===0&&record.corners===6&&record.alpha===0&&record.frameCount===0&&record.nearest,'Ultra low retained expensive features: '+log);
}finally{await shutdown();}
