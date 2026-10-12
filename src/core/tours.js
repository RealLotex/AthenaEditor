const TOUR_PROGRESS_VERSION=1;
function tourObject(project,role) {
  const objects=allObjects(activeScene(project).objects),explicit=objects.find(o=>o._tourRole===role);if(explicit)return explicit;
  const matches={terrain:o=>!!o._terrain,water:o=>!!o.components.water,emitter:o=>!!o.components.particles,sun:o=>!!o.components.light,camera:o=>!!o.components.camera,player:o=>o.name==='Player',floor:o=>o.name==='Ground',demo:o=>o.name==='Crate'||o.name==='Demo',actor:o=>o.name==='Guide'&&!!o.components.animator,pickup:o=>o.name==='Key',door:o=>o.name==='Door',trigger:o=>o.name==='Finish Zone',subEmitter:o=>!!o.components.particles&&o.id!==tourObject(project,'emitter')?.id};
  return objects.find(matches[role]||(()=>false));
}
function tourSequence(project) {return activeScene(project).sequences?.find(s=>s._tourSequence)||activeScene(project).sequences?.[0];}
function tourHUD(project,role) {const names={hudPanel:'HUD background',hudText:'Score',healthBar:'Health',hudImage:'Portrait',hudButton:'Continue',keyCounter:'Keys',victoryText:'Victory'};return activeScene(project).uiElements?.find(e=>e._tourRole===role)||activeScene(project).uiElements?.find(e=>e.name===names[role]);}
function tourTargetScene(project,role,name='Victory') {return project.scenes.find(s=>s._tourScene===role)||project.scenes.find(s=>s.name===name);}
function tourValuesMatch(actual,expected) {
  if(typeof expected==='number')return typeof actual==='number'&&Math.abs(actual-expected)<=1e-4*Math.max(1,Math.abs(expected));
  if(Array.isArray(expected))return Array.isArray(actual)&&actual.length===expected.length&&expected.every((value,i)=>tourValuesMatch(actual[i],value));
  if(expected&&typeof expected==='object')return actual&&Object.entries(expected).every(([key,value])=>tourValuesMatch(actual[key],value));
  return actual===expected;
}
function tourRuleDefinition(project,operation) {
  const event={...operation.event};if(event.otherRole){event.otherId=tourObject(project,event.otherRole)?.id||'';delete event.otherRole;}if(event.objectRole){event.objectId=tourObject(project,event.objectRole)?.id||'';delete event.objectRole;}
  const actions=operation.actions.map(a=>{const value={...a};if(a.objectRole){value.objectId=tourObject(project,a.objectRole)?.id||'';delete value.objectRole;}if(a.sceneRole){value.sceneId=tourTargetScene(project,a.sceneRole)?.id||'';delete value.sceneRole;}if(a.type==='playSequence')value.sequenceId=tourSequence(project)?.id||'';return value;});
  return {name:operation.name,event,once:!!operation.once,conditions:operation.conditions||[],actions};
}
function tourOperationComplete(project,operation) {
  if(!operation)return false;
  const sc=activeScene(project),o=tourObject(project,operation.role);
  if(operation.type==='object')return !!o;
  if(operation.type==='set')return !!o&&tourValuesMatch(readPath(o,operation.path),operation.value);
  if(operation.type==='sceneSet')return tourValuesMatch(readPath(sc,operation.path),operation.value);
  if(operation.type==='projectSet')return tourValuesMatch(readPath(project,operation.path),operation.value);
  if(operation.type==='terrainBrush')return !!o&&o._terrain?.[operation.mode==='paint'?'surfaces':operation.mode==='cliffs'?'levels':'hills']?.some(v=>v!==0);
  if(operation.type==='sky')return sc.skybox?.enabled&&sc.skybox.preset===operation.preset;
  if(operation.type==='sequence')return !!tourSequence(project);
  if(operation.type==='clip')return !!tourSequence(project)?.tracks.find(t=>t.type===operation.track)?.clips.length;
  if(operation.type==='clipSet'){const c=tourSequence(project)?.tracks.find(t=>t.type===operation.track)?.clips[0];return c&&tourValuesMatch(readPath(c,operation.path),operation.value);}
  if(operation.type==='rule'){const {name,...definition}=tourRuleDefinition(project,operation);return sc.eventRules?.some(r=>r._tourRule===operation.id||r.enabled!==false&&tourValuesMatch(r,definition));}
  if(operation.type==='gameVictory')return tourHUD(project,'victoryText')?.binding?.variable==='won'&&tourHUD(project,'victoryText')?.binding?.kind==='visible'&&Object.hasOwn(sc.eventVariables,'won');
  if(operation.type==='hud')return !!tourHUD(project,operation.role);
  if(operation.type==='hudSet')return tourValuesMatch(readPath(tourHUD(project,operation.role)||{},operation.path),operation.value);
  if(operation.type==='scene')return !!tourTargetScene(project,operation.role,operation.name);
  if(operation.type==='bake')return allObjects(sc.objects).some(o=>operation.kind==='shadow'?o._shadowBake:operation.kind==='lighting'?o._environmentBake&&o.components.model?.pipeline==='PL_NO_LIGHTS'&&sc.environment?.lighting:o._environmentBake||o._lightingBake);
  if(operation.type==='linkSubEmitter')return tourObject(project,'emitter')?.components.particles.subEmitters?.some(s=>s.objectId===tourObject(project,'subEmitter')?.id);
  if(operation.type==='modelFlipbook')return !!tourObject(project,'demo')?.components.textureAnimation;
  if(operation.type==='keyframes')return !!tourSequence(project)?.tracks.find(t=>t.type===operation.track)?.clips[0]?.keys?.length;
  if(operation.type==='sequenceEvent')return tourSequence(project)?.event.type===operation.event.type;
  if(operation.type==='previewSequence')return false;
  return false;
}
async function prepareTourOperation(project,operation) {
  const files=editorAssets(project);
  if(operation.type==='object'&&operation.role==='terrain'){const t=makeTerrain(16,16),atlas=await terrainAtlasAsset(t,files,'tour_terrain_atlas.png');return {atlas};}
  if(operation.type==='object'&&operation.role==='water')return {assets:await prepareWaterAssets()};
  if(operation.type==='object'&&['emitter','subEmitter'].includes(operation.role))return {assets:await prepareParticleAssets('fountain')};
  if(operation.type==='terrainBrush'){
    const o=tourObject(project,operation.role),t=terrainBrush(o._terrain,{x:0,z:0},{mode:operation.mode,size:9,strength:.5,level:3,surface:2});
    return {terrain:t,prepared:await prepareTerrainPreview(t,o.name)};
  }
  if(operation.type==='sky')return {sky:await prepareSkyboxLayout(skyboxPresetAsset(operation.preset),{textureSize:128,bitDepth:4,upperOnly:true})};
  if(operation.type==='bake'){
    const sc=activeScene(project),models=exportableObjects(sc.objects).filter(o=>o.components.model?.file?.endsWith('.obj')&&!o.components.water&&!o.components.particles&&o.components.rigidbody?.mode!=='dynamic');
    if(operation.kind==='shadow')return {bake:await bakeSharedShadows(sc,files,models.map(o=>o.id))};
    return {bake:await bakeEnvironmentVertices(sc,files,models.map(o=>o.id),normalizedEnvironment({...sc.environment,lighting:operation.kind==='lighting'}))};
  }
  return {};
}
function applyTourOperation(project,operation,prepared={}) {
  if(tourOperationComplete(project,operation))return;
  const sc=activeScene(project),files=editorAssets(project);let o=tourObject(project,operation.role);
  switch(operation.type){
    case 'object':
      if(operation.role==='terrain')o=addEditorTerrain(project,sc,16,16,prepared.atlas);
      else if(operation.role==='water')o=addWaterObject(project,sc,prepared.assets);
      else if(['emitter','subEmitter'].includes(operation.role))o=addParticleObject(project,sc,'fountain',prepared.assets);
      else {
        o=mkObject({demo:'Demo',door:'Door',pickup:'Key',trigger:'Finish Zone',actor:'Guide'}[operation.role]||operation.role);
        o.components.model={...makeComponent('model'),file:operation.role==='actor'?'tour_actor.gltf':'crate.obj'};
        o.components.transform.position={x:operation.role==='trigger'?5:0,y:1,z:0};
        if(operation.role==='actor')o.components.animator={...makeComponent('animator'),file:'tour_actor.gltf',defaultAnim:'Wave',loop:true};
        if(['door','pickup','trigger'].includes(operation.role)){o.components.rigidbody={...makeComponent('rigidbody'),shape:'box',mode:operation.role==='door'?'static':'trigger',collisionEvents:true};sc.physics.enabled=true;}
        sc.objects.push(o);
      }
      if(operation.role==='subEmitter')o.components.particles.playOnStart=false;
      o._tourRole=operation.role;return o;
    case 'set':if(!o)throw Error('The practice object is missing: '+operation.role);writePath(o,operation.path,deepClone(operation.value));if(operation.path==='components.particles.material')o.components.model.textureFile=operation.value;return;
    case 'sceneSet':writePath(sc,operation.path,deepClone(operation.value));return;
    case 'projectSet':writePath(project,operation.path,deepClone(operation.value));return;
    case 'terrainBrush':applyEditorTerrain(project,o.id,prepared.terrain,[],null,prepared.prepared);return;
    case 'sky':
      if(operation.preset==='night'&&project._tutorial?.id==='lighting'){
        walk(sc.objects,o=>{if(o._environmentBake){o.components.model=deepClone(o._environmentBake.model);delete o._environmentBake;}});
        const sun=tourObject(project,'sun');if(sun)sun.components.light.diffuse={r:.2,g:.3,b:.5};sc.environment.lighting=false;
      }
      applySkybox(project,sc,{...normalizedSkybox(sc.skybox),enabled:true,preset:operation.preset,textureSize:128,bitDepth:4,upperOnly:true},prepared.sky);return;
    case 'scene':{const next=mkScene(operation.name||'Victory');next._tourScene=operation.role;if(operation.role==='victory'){const title=mkUIEl('Text');Object.assign(title,{name:'Victory',text:'¡Ganaste! Recogiste la llave.',x:70,y:190,width:500,fontSize:24});next.uiElements.push(title);}project.scenes.push(next);return;}
    case 'sequence':{const s=mkSequence();s.name='Tour Cinematic';s.event.type='manual';s._tourSequence=true;sc.sequences.push(s);return;}
    case 'clip':{
      const sequence=tourSequence(project);if(!sequence)throw Error('Create the sequence first.');
      let track=sequence.tracks.find(t=>t.type===operation.track);if(!track){track=mkCinematicTrack(operation.track);sequence.tracks.push(track);}
      const c=mkCinematicClip(operation.track);c.duration=4;if(['transform','animation','mesh','particles'].includes(operation.track))c.objectId=tourObject(project,operation.track==='particles'?'emitter':operation.track==='animation'?'actor':'demo')?.id||'';
      if(operation.track==='portrait')c.file='tour_portrait.png';if(['sfx','voice'].includes(operation.track)){c.file='tour_chime.wav';const audio=sequence.tracks.filter(t=>['sfx','voice'].includes(t.type)).flatMap(t=>t.clips);c.start=Math.max(0,...audio.map(c=>c.start+c.duration));}
      if(operation.track==='animation'){c.file='tour_actor.gltf';c.animation='Wave';}
      if(operation.track==='dialogue')c.text='Bienvenido al tour.\nEste diálogo tiene dos líneas.';
      if(operation.track==='transform')c.to={x:3,y:1,z:0};
      track.clips.push(c);return;
    }
    case 'clipSet':writePath(tourSequence(project).tracks.find(t=>t.type===operation.track).clips[0],operation.path,deepClone(operation.value));return;
    case 'rule':{
      const definition=tourRuleDefinition(project,operation),rule={...mkEventRule(),...definition,_tourRule:operation.id};
      rule.conditions=definition.conditions.map(c=>({...mkFlowCondition(c.type),...c}));rule.actions=definition.actions.map(a=>({...mkFlowAction(a.type),...a}));
      sc.eventRules.push(rule);return;
    }
    case 'gameVictory':{sc.eventVariables.won??=0;const title=tourHUD(project,'victoryText')||mkUIEl('Text');Object.assign(title,{name:'Victory',_tourRole:'victoryText',text:'¡Ganaste! Recogiste la llave.',x:70,y:190,width:500,fontSize:24,binding:{variable:'won',kind:'visible',min:0,max:1,prefix:'',suffix:''}});if(!sc.uiElements.includes(title))sc.uiElements.push(title);return;}
    case 'hud':{const el=mkUIEl(operation.kind||'Text');el.name=operation.name||operation.role;if(el.type==='Button')el.text='Continuar';el._tourRole=operation.role;const layout={hudPanel:{x:0,y:0,width:640,height:100,z:0},hudText:{x:60,y:20,z:2},healthBar:{x:60,y:55,z:2},hudImage:{x:500,y:15,width:64,height:64,z:2},hudButton:{x:240,y:390,z:2}}[operation.role];if(layout)Object.assign(el,layout);sc.uiElements.push(el);return;}
    case 'hudSet':writePath(tourHUD(project,operation.role),operation.path,deepClone(operation.value));return;
    case 'linkSubEmitter':tourObject(project,'emitter').components.particles.subEmitters=[{event:'death',objectId:tourObject(project,'subEmitter').id,probability:1}];return;
    case 'modelFlipbook':{const target=tourObject(project,'demo');target.components.model.textureFile='tour_flipbook.png';target.components.textureAnimation=makeComponent('textureAnimation');return;}
    case 'keyframes':enableCinematicKeyframes(operation.track,tourSequence(project).tracks.find(t=>t.type===operation.track).clips[0]);return;
    case 'sequenceEvent':tourSequence(project).event=deepClone(operation.event);return;
    case 'previewSequence':return;
    case 'bake':{
      const result=prepared.bake;
      for(const asset of result.outputs||[])putProjectAsset(project,asset);
      for(const update of result.updates||[]){const target=findObj(sc.objects,update.id);if(target){if(operation.kind==='shadow'){target._shadowBake={shadow:deepClone(update.shadowSource)};target.components.shadow=update.shadow;}else{target._environmentBake={model:deepClone(update.environmentSource)};target.components.model=update.model;}}}return;
    }
    default:throw Error('Unknown guided tour operation: '+operation.type);
  }
}
async function makeTourProject(id) {
  const tour=EDITOR_TOURS.find(t=>t.id===id);if(!tour)throw Error('Unknown tour.');
  const project=['events','physics','hud'].includes(id)?templateThirdPerson():mkProject();
  project.name='Tour · '+tour.title;project._tutorial={id,version:TOUR_PROGRESS_VERSION};
  for(const [name,make] of Object.entries(TEMPLATE_MESHES))putProjectAsset(project,textMeshAsset(name,make()));
  for(const asset of await prepareTourExampleAssets())putProjectAsset(project,asset);
  const sc=activeScene(project);sc.eventRules||=[];sc.sequences||=[];sc.eventVariables||={};
  for(const role of ['sun','camera','player','floor']){const o=tourObject(project,role);if(o)o._tourRole=role;}
  if(!tourObject(project,'floor')){const ground=mkObject('Ground');ground._tourRole='floor';ground.components.model={...makeComponent('model'),file:'ground.obj'};ground.components.rigidbody={...makeComponent('rigidbody'),mode:'static',shape:'plane'};sc.objects.push(ground);}
  sc.physics.enabled=true;
  return project;
}
