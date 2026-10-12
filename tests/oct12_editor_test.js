import {assert,assertEquals,assertAlmostEquals} from 'jsr:@std/assert@1';
import {load,shutdown} from './_load.js';
const A=await load();
Deno.test('terrain brush nine builds identical preview and export off the input thread',async()=>{
  const terrain=A.terrainBrush(A.makeTerrain(32,32),{x:0,z:0},{mode:'hills',size:9,strength:.5});
  try{
    const prepared=await A.prepareTerrainPreview(terrain,'Nine'),direct=A.terrainPreviewBuffers(terrain,'Nine');
    assertEquals(prepared.positions,direct.positions);assertEquals(prepared.normals,direct.normals);assertEquals(prepared.content,direct.content);
    assertEquals(A.readMeshOBJ(prepared.content).faces.length,prepared.positions.length/9);
  }finally{A.disposeTerrainPreviewWorker();}
});
Deno.test('water independent update cap permits sixty hertz and lower rates',()=>{
  const q={textureSize:512,transparency:1,panning:4,waves:4,caustics:4,pattern:4};
  for(const rate of [5,10,15,30,60]){const s=A.normalizedWater({quality:q,updateRate:rate});assertEquals(s.waveUpdateRate,rate);assertEquals(s.uvUpdateRate,rate);}
  const settings=A.normalizedWater({quality:q,updateRate:60,waveHeight:.1,flow:{x:.1,z:0}}),positions=new Float32Array([.1,0,.2]),uvs=new Float32Array([.1,.2]);
  const state={settings,positions,uvs,basePositions:positions.slice(),baseUVs:uvs.slice(),stride:3,uvStride:2,u:0,v:0,phase:0,waveClock:1};
  A.advanceWaterArrays(state,1/60);const before=positions[1];A.advanceWaterArrays(state,1/60);assert(before!==positions[1]);
});
Deno.test('eight substantive tours have independent portable projects and consistent operation targets',async()=>{
  assertEquals(A.EDITOR_TOURS.length,8);const ids=new Set();
  for(const tour of A.EDITOR_TOURS){assert(tour.steps.length>=20);const project=await A.makeTourProject(tour.id);assertEquals(project._tutorial.id,tour.id);assert(project.assets.length>=8);assertEquals(project._tutorial.version,A.TOUR_PROGRESS_VERSION);
    for(const step of tour.steps){assert(!ids.has(step.id));ids.add(step.id);assert(step.text.length>40);assert(A.DOCK_PANELS[step.panel],step.panel);}
    const reloaded=A.migrateProject(JSON.parse(JSON.stringify(project)));assertEquals(reloaded._tutorial.id,tour.id);
  }
});
Deno.test('skipped terrain creation and sculpting produce the same editable scene; repeating is idempotent',async()=>{
  const p=await A.makeTourProject('world'),create={type:'object',role:'terrain'};
  A.applyTourOperation(p,create,await A.prepareTourOperation(p,create));const count=A.activeScene(p).objects.length;
  A.applyTourOperation(p,create,{});assertEquals(A.activeScene(p).objects.length,count);
  const sculpt={type:'terrainBrush',role:'terrain',mode:'hills'};
  try{A.applyTourOperation(p,sculpt,await A.prepareTourOperation(p,sculpt));assert(A.tourOperationComplete(p,sculpt));assert(A.tourObject(p,'terrain')._terrain.hills.some(v=>v>0));}
  finally{A.disposeTerrainPreviewWorker();}
});
Deno.test('HUD bindings and animations share native and preview semantics without mutating authoring data',()=>{
  const element={animation:{enabled:true,property:'x',from:-100,to:60,duration:1,loop:false,curve:'linear'},binding:{variable:'health',kind:'progress',min:0,max:100}},before=JSON.stringify(element);
  assertEquals(A.hudMotionValues(element,.5,{health:65}),{x:-20,progress:.65});assertEquals(JSON.stringify(element),before);
  assertEquals(A.hudMotionValues(element,3,{health:300}).progress,1);
  const p=A.mkProject(),s=p.scenes[0],el=A.mkUIEl('ProgressBar');Object.assign(el,element);s.eventVariables={health:65};s.uiElements=[el];
  const rule=A.mkEventRule();rule.actions=[{...A.mkFlowAction('setVariable'),key:'health',value:30}];s.eventRules=[rule];
  const generated=A.generateProject(p);assert(generated.main.includes('hudMotionValues('));assert(generated.main.includes('ctx.variables||{}'));assert(generated.main.includes('_hudTime+=1/60'));
});
Deno.test('particle modules expose every requirement from particles.txt and deterministic world simulation',()=>{
  const keys=new Set(A.COMPONENTS.particles.fields.map(f=>f.key));
  for(const key of ['loop','duration','lifetimeMin','lifetimeMax','speedMin','sizeMin','sizeMax','simulationSpace','count','rate','bursts','shape','velocity','gravityModifier','colorKeys','sizeKeys','rotationSpeed','collisionType','subEmitters','flipbook','renderMode','material','sortingFudge'])assert(keys.has(key),key);
  for(const shape of A.PARTICLE_SHAPES){const c=A.normalizedParticles({...A.makeComponent('particles'),shape,count:4,rate:0,bursts:[{time:0,count:4,cycles:1,interval:.1}],simulationSpace:'world'}),state=A.createParticleState(c);A.stepParticleState(state,.1);const first=state.particles[0];state.emitter.position.x=3;A.stepParticleState(state,0);assertAlmostEquals(state.particles[0],first-3,1e-6);assert(state.particles.every(Number.isFinite));assertEquals(state.activeCount,4);}
});
Deno.test('water preset migration preserves edits to source frames and mip levels',()=>{
  const data=A.WATER_MOTION_DATA,frames=Array.from({length:32},(_,i)=>({dataUrl:'old-frame-'+i})),levels={32:frames},oldFrames=data.previousFrames,oldLevels=data.previousLevels;
  try{data.previousFrames=frames.map(f=>A.waterFrameFingerprint(f.dataUrl));data.previousLevels={32:data.previousFrames};
    const original={owned:true,editKind:'water',cat:'textures',waterRevision:3,dataUrl:frames[0].dataUrl,waterMotion:{fps:16,frames,levels}},project=()=>({assets:[A.deepClone(original)],scenes:[]});
    const clean=project();A.upgradeWaterAssets(clean);assertEquals(clean.assets[0].waterRevision,4);
    for(const key of ['frames','levels']){const p=project();(key==='frames'?p.assets[0].waterMotion.frames:p.assets[0].waterMotion.levels[32])[1].dataUrl='authored pixels';A.upgradeWaterAssets(p);assertEquals(p.assets[0].waterRevision,3);}
  }finally{data.previousFrames=oldFrames;data.previousLevels=oldLevels;}
});
Deno.test('animated water sampling preserves speed across qualities and caps pattern independent of mesh',()=>{
  const source={name:'water.png',waterMotion:{fps:60,frames:A.WATER_MOTION_DATA.frames,levels:A.WATER_MOTION_DATA.levels}};
  let period;
  for(let pattern=1;pattern<=4;pattern++){const texture=A.waterTextureForQuality(source,{quality:{pattern,textureSize:32}}),p=texture.waterMotion.frames.length/texture.waterMotion.fps;if(period)assertAlmostEquals(p,period);period=p;}
  const settings=A.normalizedWater({updateRate:60,quality:{waves:0,panning:0,pattern:4}});assertEquals(settings.textureUpdateRate,60);
});
Deno.test('all cinematic channels in the tour are exportable without overlapping the streaming player',async()=>{
  const p=await A.makeTourProject('cinematics'),tour=A.EDITOR_TOURS.find(t=>t.id==='cinematics');
  for(const step of tour.steps)if(step.operation){A.applyTourOperation(p,step.operation,await A.prepareTourOperation(p,step.operation));}
  const result=A.generateProject(p);assertEquals(result.diagnostics.filter(d=>d.level==='error'),[]);assertEquals(p.scenes[0].sequences[0].tracks.length,11);
});
Deno.test('tours recognize manually created rules, HUD and scenes without private guide markers',async()=>{
  const p=await A.makeTourProject('events'),s=A.activeScene(p),op=A.EDITOR_TOURS.find(t=>t.id==='events').steps.find(t=>t.operation?.id==='pickup').operation;
  A.applyTourOperation(p,{type:'object',role:'pickup'});const definition=A.tourRuleDefinition(p,op);s.eventRules.push({...A.mkEventRule(),...definition,name:'My hand-built event'});assert(A.tourOperationComplete(p,op));
  const hud=A.mkUIEl('Text');hud.name='Score';s.uiElements.push(hud);assert(A.tourOperationComplete(p,{type:'hud',role:'hudText'}));
  p.scenes.push(A.mkScene('Victory'));assert(A.tourOperationComplete(p,{type:'scene',role:'victory',name:'Victory'}));assert(A.tourValuesMatch(.7854,Math.PI/4));
});
Deno.test('scene exit releases each physics handle once after an object has already been destroyed',()=>{
  const p=A.mkProject(),s=p.scenes[0];s.physics.enabled=true;const objects=['Floor','Actor'].map(name=>{const o=A.mkObject(name);o.components.rigidbody={...A.makeComponent('rigidbody'),mode:name==='Floor'?'static':'dynamic'};s.objects.push(o);return o;});
  const r=A.mkEventRule();r.actions=[{...A.mkFlowAction('destroyObject'),objectId:objects[0].id}];s.eventRules.push(r);
  const ir=A.resolveScene(p,s),main=A.generateProject(p).main,start=main.indexOf('function _disposePhysics()'),end=main.indexOf('\n}',start)+2;
  const names=['ode_contacts','ode_space','ode_world',...ir.physics.bodies.flatMap(b=>[b.geomVN,...b.isDynamic?[b.bodyVN]:[]])],freed=[];
  const mocks=names.map(name=>({free(){freed.push(name);},destroyWorld(){freed.push(name);}}));mocks[3]._freed=true;
  const dispose=new Function(...names,'let _physicsDisposed=false;'+main.slice(start,end)+';return _disposePhysics;')(...mocks);dispose();dispose();assertEquals(freed.length,names.length-1);assertEquals(new Set(freed).size,freed.length);
});
await shutdown();
