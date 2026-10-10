import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert,assertAlmostEquals,assertEquals} from 'jsr:@std/assert@1';
const A=await load();
try{
  const results=[];
  for(const physics of Deno.args.includes('--single')?[false]:[false,true]){
    const p=A.mkProject('Water verification'),s=p.scenes[0];s.objects=[];s.defaultCameraRig=false;s.physics.enabled=physics;
    const water=A.addWaterObject(p,s,await A.prepareWaterAssets());water.components.transform.scale={x:12,y:1,z:12};
    water.components.water.waveHeight=.05;water.components.water.flow={x:.02,z:.01};water.components.water.depth=2;water.components.water.opacity=.4;
    const floor=A.mkObject('Seafloor');floor.components.model={...A.makeComponent('model'),file:'floor.obj',pipeline:'PL_NO_LIGHTS'};s.objects.push(floor);p.assets.push({name:'floor.obj',cat:'models',content:A.waterMeshOBJ(1)});floor.components.transform.scale={x:30,y:1,z:30};
    floor.components.rigidbody={...A.makeComponent('rigidbody'),mode:'static',shape:'plane'};
    const camera=A.mkObject('Camera');camera.components.camera={...A.makeComponent('camera'),target:{x:0,y:0,z:0}};camera.components.transform.position={x:0,y:8,z:12};s.objects.push(camera);
    const second=A.addWaterObject(p,s,await A.prepareWaterAssets());second.components.transform.position.x=16;
    if(Deno.args.includes('--static'))for(const asset of p.assets)delete asset.waterMotion;
    if(Deno.args.includes('--grid8'))p.assets.find(a=>a.cat==='models'&&a.editKind==='water').content=A.waterMeshOBJ(8);
    if(Deno.args.includes('--no-caustics'))for(const o of [water,second])o.components.water.caustics=false;
    const ir=A.resolveScene(p,s,A.editorAssets(p)),state=ir.models.find(m=>m.obj.id===water.id).rd.waterVN,buffers=ir.models.find(m=>m.obj.id===water.id).rd.waterBuffersVN;
    const generated=A.generateProject(p);assert(!generated.diagnostics.some(d=>d.level==='error'),JSON.stringify(generated.diagnostics));
    const probe=`if(++verifyWaterFrame===1||verifyWaterFrame===40${Deno.args.includes('--trace')?'||true':''}){const w=${state},f=std.open('probe.log','a');f.puts(JSON.stringify({tag:verifyWaterFrame===40?'DONE':'START',frame:verifyWaterFrame,u:w.u,v:w.v,y:w.positions[1],nx:w.normals?w.normals[0]:0,textureFrame:w.textureFrame,frameCount:w.frameCount,alpha:new Float32Array(${buffers}.colors)[3],vram:Screen.getMemoryStats(Screen.VRAM_USED_TOTAL)})+String.fromCharCode(10));f.close();}`;
    generated.main=generated.main.replace('  _updateWater(1/60);','  _updateWater(1/60);\n  '+probe);
    generated.main=generated.main.replace('Screen.display(() => {','let verifyWaterFrame=0;\nScreen.display(() => {');
    if(Deno.args.includes('--image'))for(const name of new Set(ir.shadows.map(s=>s.rtVN))){
      const shadow=ir.shadows.find(s=>s.rtVN===name);
      generated.main=generated.main.replace(shadow.vn+'.render();',`if(verifyWaterFrame===1){const color=${name}.color;${name}.color=Color.new(0,0,0,0);${name}.draw(0,0);${name}.color=color;${name}.lock();}`+shadow.vn+'.render();');
    }
    generated.main="try {\n"+generated.main+"\n} catch(error){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'ERROR',message:error.message,stack:error.stack}));f.close();throw error;}";
    const log=await runConsoleFixture(generated,{timeoutMs:30000});assert(log.includes('"tag":"DONE"'),log);
    const records=log.split(/\r?\n/).filter(line=>line.startsWith('{')).map(line=>JSON.parse(line)),first=records.find(r=>r.tag==='START'),last=records.find(r=>r.tag==='DONE');
    assert(first&&last);assertAlmostEquals(last.alpha,-.6,1e-5);assert(last.u!==first.u&&last.y!==first.y);assertEquals(last.frameCount,Deno.args.includes('--static')?0:32);if(!Deno.args.includes('--static'))assert(last.textureFrame!==first.textureFrame);if(ir.shadows.length)assertEquals(ir.shadows[0].rtVN,ir.shadows[1].rtVN);
    results.push({physics,records});console.log(JSON.stringify({physics,passed:true,records}));
  }
  await Deno.writeTextFile('.verification/water.json',JSON.stringify({passed:true,results},null,2));
}finally{await shutdown();}
