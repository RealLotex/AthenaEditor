// Native regression for the release compiler truncating long RGB array literals.
import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
try {
  const A=await load(),p=A.mkProject('Baked color startup regression'),s=p.scenes[0];
  s.objects=[];s.defaultCameraRig=false;s.physics.enabled=false;p.display.frameCounter=false;
  const object=A.mkObject('Baked mesh');object.components.model={...A.makeComponent('model'),file:'baked.obj',pipeline:'PL_NO_LIGHTS'};s.objects.push(object);
  const expected=Array.from({length:108},(_,i)=>(i+1)/109);
  p.assets.push({...A.textMeshAsset('baked.obj','v -1 0 0\nv 1 0 0\nv 0 1 0\n'+Array.from({length:12},()=> 'f 1 2 3').join('\n')),vertexColors:expected});
  const generated=A.generateProject(p),ir=A.resolveScene(p,s,A.editorAssets(p)),rd=ir.renderDatas[0];
  const start=generated.main.indexOf('Screen.display(() => {');
  assert(start>=0);
  generated.main=generated.main.slice(0,start)+`let _probeFrame=0;\n`+generated.main.slice(start).replace('Screen.display(() => {','Screen.display(() => {++_probeFrame;');
  const end=generated.main.lastIndexOf('});');
  generated.main=generated.main.slice(0,end)+`if(_probeFrame===120){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'DONE',frame:_probeFrame,colors:Array.from(new Float32Array(${rd.dataVN}.vertices.colors))})+String.fromCharCode(10));f.close();}\n`+generated.main.slice(end);
  const log=await runConsoleFixture(generated),done=log.trim().split(/\r?\n/).map(JSON.parse).find(r=>r.tag==='DONE');
  assert(done,log);assertEquals(done.colors.length,144);
  for(let i=0;i<36;i++){for(let k=0;k<3;k++)assertAlmostEquals(done.colors[i*4+k],expected[i*3+k],1e-6);assertEquals(done.colors[i*4+3],0);}
  await Deno.mkdir('.verification',{recursive:true});
  await Deno.writeTextFile('.verification/vertex-colors-native.json',JSON.stringify({passed:true,...done},null,2));
  console.log(JSON.stringify({passed:true,frame:done.frame,corners:done.colors.length/4}));
}finally{await shutdown();}
