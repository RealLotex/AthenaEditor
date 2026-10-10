import {load,shutdown} from '../tests/_load.js';
import {runConsoleFixture} from './run-console-fixture.js';
import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
const A=await load();
try{
  const p=A.mkProject('Atlas verification'),s=p.scenes[0];s.objects=[];s.defaultCameraRig=false;s.physics.enabled=false;
  const image={width:64,height:64,data:new Uint8ClampedArray(64*64*4)},colors=[[30,190,255],[245,245,255],[255,190,20],[20,60,220]];
  for(let y=0;y<64;y++)for(let x=0;x<64;x++)image.data.set([...colors[Math.floor(x/32)+Math.floor(y/32)*2],255],(y*64+x)*4);
  const atlas=await A.textureOutputAsset(image,'sprite_atlas.png',16);p.assets.push(atlas);
  const sprite=A.mkObject('Animated sprite');sprite.components.model={...A.makeComponent('model'),file:'sprite.obj',textureFile:atlas.name,pipeline:'PL_NO_LIGHTS',face_culling:'CULL_FACE_NONE'};
  sprite.components.textureAnimation={...A.makeComponent('textureAnimation'),columns:2,rows:2,fps:12,loop:true};s.objects.push(sprite);
  p.assets.push(A.textMeshAsset('sprite.obj','v -.5 -.5 0\nv .5 -.5 0\nv .5 .5 0\nv -.5 .5 0\nvt 0 0\nvt 1 0\nvt 1 1\nvt 0 1\nvn 0 0 1\nf 1/1/1 2/2/1 3/3/1\nf 1/1/1 3/3/1 4/4/1\n'));
  const emitter=A.addParticleObject(p,s,'bubbles',await A.prepareParticleAssets());emitter.components.model.textureFile=atlas.name;
  Object.assign(emitter.components.particles,{flipbook:true,columns:2,rows:2,fps:12,animationLoop:true,count:12,rate:12});emitter.components.transform.position.x=2;
  const camera=A.mkObject('Camera');camera.components.camera={...A.makeComponent('camera'),target:{x:1,y:0,z:0}};camera.components.transform.position={x:1,y:2,z:8};s.objects.push(camera);
  const generated=A.generateProject(p),ir=A.resolveScene(p,s),generic=ir.models.find(m=>m.obj.id===sprite.id).rd,particle=ir.models.find(m=>m.obj.id===emitter.id);
  assert(!generated.diagnostics.some(d=>d.level==='error'),JSON.stringify(generated.diagnostics));assertEquals(ir.textures.length,1);
  const probe=`if(++verifyFrame===1||verifyFrame===17||verifyFrame===90){const a=${generic.flipbookVN},b=${particle.particleVN},f=std.open('probe.log','a');f.puts(JSON.stringify({tag:verifyFrame===90?'DONE':'FRAME',frame:a.frame,time:a.clock[0],uv:[a.uvs[0],a.uvs[1]],particleFrames:[b.frames[0],b.frames[5]],ages:[b.ages[0],b.ages[5]],particleUV:[b.uvs[0],b.uvs[1]],vram:Screen.getMemoryStats(Screen.VRAM_USED_TOTAL)})+String.fromCharCode(10));f.close();}`;
  generated.main=generated.main.replace('Screen.display(() => {','let verifyFrame=0;Screen.display(() => {');
  const end=generated.main.lastIndexOf('});');generated.main=generated.main.slice(0,end)+probe+generated.main.slice(end);
  const log=await runConsoleFixture(generated,{timeoutMs:30000}),records=log.trim().split(/\r?\n/).map(JSON.parse);
  assertEquals(records.length,3);assert(records.some(r=>r.frame!==records[0].frame),log);
  const base=new Float32Array([0,1,1,1]),settings=A.normalizedFlipbook(sprite.components.textureAnimation),reference=A.createFlipbookUVState(base,settings,4,false,64,64);
  for(const record of records){assertEquals(record.frame,A.flipbookFrame(settings,record.time));A.applyFlipbookFrame(reference,record.time);assertAlmostEquals(record.uv[0],reference.uvs[0],1e-6);assertAlmostEquals(record.uv[1],reference.uvs[1],1e-6);assertEquals(record.particleFrames[0],A.flipbookFrame(settings,record.ages[0]));}
  assert(records[2].particleFrames[0]!==records[2].particleFrames[5],log);assertEquals(new Set(records.map(r=>r.vram)).size,1);
  await Deno.writeTextFile('.verification/flipbooks.json',JSON.stringify({passed:true,atlasImages:ir.textures.length,records},null,2));console.log(log);
}finally{await shutdown();}
