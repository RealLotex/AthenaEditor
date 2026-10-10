import {assert,assertAlmostEquals,assertEquals,assertStringIncludes} from 'jsr:@std/assert@1';
import {load} from './_load.js';
import {PNG} from 'npm:pngjs@7.0.0';
import {Buffer} from 'node:buffer';
const A=await load();
const assets=await A.prepareWaterAssets();
const make=()=>{const p=A.mkProject('Water test'),s=p.scenes[0];s.defaultCameraRig=false;s.objects=[];const o=A.addWaterObject(p,s,assets);return {p,s,o};};

Deno.test('water patterns are seamless native T4 images with transparent caustics and a small grid',()=>{
  assertEquals(A.readMeshOBJ(assets[0].content).faces.length,512);
  for(const asset of assets.slice(1)){
    const bytes=Uint8Array.from(atob(asset.dataUrl.split(',')[1]),c=>c.charCodeAt(0)),image=PNG.sync.read(Buffer.from(bytes));
    assertEquals([bytes[24],bytes[25]],[4,3]);assertEquals(A.textureVRAMBytes(asset),131328);
    for(let i=0;i<image.width;i++)for(let c=0;c<4;c++){
      assertEquals(image.data[(i*image.width)*4+c],image.data[(i*image.width+image.width-1)*4+c]);
      assertEquals(image.data[i*4+c],image.data[((image.height-1)*image.width+i)*4+c]);
    }
    if(asset.name.includes('caustics'))assert(image.data.some((v,i)=>i%4===3&&v===0));
  }
});

Deno.test('adding water deduplicates assets without replacing a user file',()=>{
  const {p,s,o}=make(),before=p.assets.length;
  const second=A.addWaterObject(p,s,assets);assertEquals(p.assets.length,before);assert(second.name!==o.name);
  assertEquals(second.components.model.textureFile,o.components.model.textureFile);
  assertEquals(A.assetUsage(p,p.assets.find(a=>a.name===o.components.water.causticTexture)).length,2);
  const collision=A.mkProject('Collision');collision.assets=[{...assets[0],content:'user mesh'}];
  A.addWaterObject(collision,collision.scenes[0],assets);assertEquals(collision.assets[0].content,'user mesh');
});

Deno.test('water mutates borrowed arrays, limits waves to 30 Hz and wraps flow without drift',()=>{
  const settings=A.normalizedWater({tiling:3,waveHeight:.1,updateRate:30,flow:{x:.2,z:-.1}}),positions=new Float32Array([.1,0,.2,1]),uvs=new Float32Array([.5,.5,1,1]);
  const state={settings,positions,uvs,basePositions:positions.slice(),baseUVs:uvs.slice(),stride:4,uvStride:4,u:0,v:0,phase:0,waveClock:0};
  A.advanceWaterArrays(state,1/60);assertEquals(positions[1],0);A.advanceWaterArrays(state,1/60);assert(positions[1]!==0);
  for(let i=0;i<6000;i++)A.advanceWaterArrays(state,1/60);
  assert(Math.abs(state.u)<1&&Math.abs(state.v)<1&&state.phase<Math.PI*2);assert(Math.abs(positions[1])<=.1);
  assertAlmostEquals(uvs[0],1.5+state.u+settings.rippleStrength*Math.sin(Math.PI*2+state.phase),1e-5);assertEquals(state.basePositions[1],0);
});

Deno.test('export shares caustic uploads, keeps animated profiles independent and draws water after shadows',()=>{
  const {p,s,o}=make(),second=A.addWaterObject(p,s,assets);second.components.water.opacity=.3;
  const plain=A.mkObject('Plain');plain.components.model={...o.components.model};s.objects.push(plain);
  const before=JSON.stringify(p),ir=A.resolveScene(p,s,A.editorAssets(p));assertEquals(JSON.stringify(p),before);
  assertEquals(ir.renderDatas.filter(rd=>rd.water).length,2);assert(ir.renderDatas.every(rd=>!rd.cloneOf));
  assertEquals(ir.shadows.length,2);assertEquals(ir.shadows[0].rtVN,ir.shadows[1].rtVN);assertEquals(ir.shadowPasses.length,0);
  const g=A.generateProject(p);assert(!g.diagnostics.some(d=>d.level==='error'),JSON.stringify(g.diagnostics));
  assertEquals(ir.textures.filter(t=>t.file==='water_caustics.png').length,1);
  assertEquals(g.main.match(new RegExp('let '+ir.shadows[0].rtVN+' = null','g')).length,1);
  const frame=g.main.slice(g.main.indexOf('Screen.display(() => {'));
  assert(frame.indexOf(ir.shadows[0].vn+'.render()')<frame.indexOf(ir.models[0].vn+'.render()'));
  assertStringIncludes(frame,'Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 1)');
  assertStringIncludes(frame,'Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 0)');
  assertStringIncludes(frame,'Screen.setParam(Screen.ALPHA_TEST_REF,0)');
  assertStringIncludes(frame,`${ir.shadows[0].causticClockVN}[1]`);
  const budget=A.sceneVRAMBudget(s,A.editorAssets(p),p);assertEquals(budget.uploads.filter(t=>t.name.includes('caustics')).length,1);
});

Deno.test('water is not a shadow receiver even if it has a solid collider',()=>{
  const {p,s,o}=make();s.physics.enabled=true;o.components.rigidbody={...A.makeComponent('rigidbody'),mode:'static',shape:'box'};
  const floor=A.mkObject('Seafloor');floor.components.rigidbody={...A.makeComponent('rigidbody'),mode:'static',shape:'plane'};s.objects.push(floor);
  const ir=A.resolveScene(p,s,A.editorAssets(p));assertEquals(ir.shadows[0].receivers.bodies.map(b=>b.body.obj.id),[floor.id]);
});

Deno.test('the cellular field evolves through its third axis and loops without a seam',()=>{
  const first=A.waterPatternPixels(false,32,0),last=A.waterPatternPixels(false,32,1),middle=A.waterPatternPixels(false,32,.25);
  assertEquals(first.data,last.data);assert(first.data.some((v,i)=>v!==middle.data[i]));
  for(const frame of A.waterFrameAssets(assets[1])){
    const image=PNG.sync.read(Buffer.from(atob(frame.dataUrl.split(',')[1]),'binary'));
    for(let i=0;i<image.width;i++)for(let c=0;c<4;c++){
      assertEquals(image.data[i*image.width*4+c],image.data[(i*image.width+image.width-1)*4+c]);
      assertEquals(image.data[i*4+c],image.data[((image.height-1)*image.width+i)*4+c]);
    }
  }
});

Deno.test('motion frames are shared, collision-safe on export and fully counted in VRAM',()=>{
  const {p,s,o}=make();A.addWaterObject(p,s,assets);p.assets.push({name:'water_tropical_motion_01.png',cat:'textures',dataUrl:'user image'});
  const ir=A.resolveScene(p,s,A.editorAssets(p)),rd=ir.models[0].rd;
  assertEquals(rd,ir.models[1].rd);assertEquals(rd.waterFrames.length,31);
  assert(rd.waterFrames[0].file!=='water_tropical_motion_01.png');
  const result=A.generateProject(p);assertEquals(result.assets.filter(a=>a.filename.includes('water_tropical_motion_')).length,32);
  assertEquals(A.sceneVRAMBudget(s,A.editorAssets(p),p).uploads.filter(t=>t.name.startsWith('water_tropical')).length,32);
  assertStringIncludes(result.main,`.setTexture(0,${rd.waterVN}.frames[`);
});

Deno.test('water motion freezes at speed zero and updates borrowed normals without losing homogeneous coordinates',()=>{
  const settings=A.normalizedWater({waveSpeed:0,waveHeight:.1}),positions=new Float32Array([.1,0,.2,1]),uvs=new Float32Array([.2,.3,1,1]),normals=new Float32Array([0,1,0,0]);
  const state={settings,positions,uvs,normals,basePositions:positions.slice(),baseUVs:uvs.slice(),stride:4,uvStride:4,u:0,v:0,phase:0,waveClock:1,frameCount:32,frameRate:16};
  A.advanceWaterArrays(state,.1);const y=positions[1];A.advanceWaterArrays(state,.1);
  assertEquals(state.textureFrame,0);assertEquals(positions[1],y);assertEquals(positions[3],1);assertEquals(normals[3],0);assertAlmostEquals(Math.hypot(...normals.slice(0,3)),1,1e-6);
  settings.waveSpeed=1;A.advanceWaterArrays(state,.1);assert(state.textureFrame>0);assert(positions[1]!==y);
});

Deno.test('old generated water upgrades while edited textures and meshes retain their contents',()=>{
  const p=A.mkProject();p.assets=[{...assets[0],content:A.waterMeshOBJ(8)},{...assets[1],waterMotion:undefined,dataUrl:A.WATER_MOTION_DATA.legacy},{...assets[1],name:'edited.png',waterMotion:undefined,dataUrl:'authored pixels'}];
  A.migrateProject(p);assertEquals(p.assets[0].content,A.waterMeshOBJ());assertEquals(p.assets[1].waterMotion.frames.length,32);assertEquals(p.assets[2].dataUrl,'authored pixels');assertEquals(p.assets[2].waterMotion,undefined);
});
