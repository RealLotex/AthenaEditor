import {assert,assertEquals,assertAlmostEquals,assertThrows} from 'jsr:@std/assert@1';
import {load,PURE_MODULES} from './_load.js';
const A=await load([...PURE_MODULES,'viewport/game.jsx']);

Deno.test('opening Game Timeline without a preview request or sequence cannot autoplay or read a null request',()=>{
  for(const request of [null,undefined,{}, {sequenceId:'intro'},{sequenceId:null,requestId:'r'}]){
    assertEquals(A.hasPendingGamePreview(request,undefined,null),false);
    assertEquals(A.hasPendingGamePreview(request,'intro',null),false);
  }
  const request={sequenceId:'intro',requestId:'r'};
  assert(A.hasPendingGamePreview(request,'intro',null));
  assertEquals(A.hasPendingGamePreview(request,'other',null),false);
  assertEquals(A.hasPendingGamePreview(request,'intro','r'),false);
});

Deno.test('small project edits preserve immutable assets, unaffected scenes and undo snapshots',()=>{
  const p=A.mkProject(),second=A.mkScene('Other');p.scenes.push(second);
  p.assets=[{id:'large',name:'original.png',cat:'textures',dataUrl:'data:image/png;base64,'+'a'.repeat(1000000)}];
  const draft=A.cloneProjectDraft(p);draft.scenes[0].background.r=42;
  const next=A.reuseProjectBranches(p,draft);
  assert(next!==p);assertEquals(p.scenes[0].background.r,40);
  assert(next.assets===p.assets);assert(next.scenes[1]===second);
  assert(next.scenes[0].objects===p.scenes[0].objects);
  assert(A.reuseProjectBranches(next,A.cloneProjectDraft(next))===next);
  const removed=A.cloneProjectDraft(next);removed.scenes.pop();delete removed.dirs.sounds;
  const changed=A.reuseProjectBranches(next,removed);
  assertEquals(changed.scenes.length,1);assertEquals(next.scenes.length,2);
  assert(!Object.hasOwn(changed.dirs,'sounds'));assert(Object.hasOwn(next.dirs,'sounds'));
});

Deno.test('Game live colors, fog and HUD retain world geometry while structural changes invalidate it',()=>{
  const p=A.mkProject(),scene=p.scenes[0],original=A.gameSceneBuildState(scene),copy=A.cloneProjectDraft(scene);
  const light=copy.objects.find(o=>o.components.light);light.components.light.ambient.r=.93;
  copy.background.r=100;copy.uiElements=[{type:'Panel',bgColor:{r:10,g:20,b:30}}];
  copy.environment=A.normalizedEnvironment(copy.environment);copy.environment.fog.color.r=.84;
  assert(A.reuseProjectBranches(original,A.gameSceneBuildState(copy))===original);
  copy.objects[0].components.transform.position.y+=3;
  assert(A.reuseProjectBranches(original,A.gameSceneBuildState(copy))!==original);
  assertEquals(scene.background.r,40);
});

Deno.test('renaming event variables updates hidden and disabled rules and fails before changing invalid names',()=>{
  const scene=A.mkScene(),object=A.mkObject('Hidden');object.visible=false;
  scene.eventVariables={score:3,taken:7};
  const rule=A.mkEventRule();rule.enabled=false;rule.conditions=[{type:'variable',key:'score'}];rule.actions=[{type:'setVariable',key:'score'}];
  object.components.events={rules:[rule]};scene.objects=[object];
  const sceneRule=A.mkEventRule();sceneRule.actions=[{type:'setVariable',key:'score'}];scene.eventRules=[sceneRule];
  assertEquals(A.eventVariableReferences(scene,'score').length,3);
  const before=JSON.stringify(scene);
  for(const name of ['taken','__proto__',''])assertThrows(()=>A.renameEventVariable(scene,'score',name));
  assertEquals(JSON.stringify(scene),before);
  A.renameEventVariable(scene,'score','points');
  assertEquals(scene.eventVariables,{points:3,taken:7});assertEquals(A.eventVariableReferences(scene,'points').length,3);
  assertThrows(()=>A.renameEventVariable(scene,'missing','new'));
});

Deno.test('new clips use the selected actor world pose and current Game camera without modifying the scene',()=>{
  const scene=A.mkScene(),parent=A.mkObject('Parent'),actor=A.mkObject('Actor');actor.components.model=A.makeComponent('model');
  parent.components.transform.position.x=10;actor.components.transform.position.x=2;parent.children=[actor];scene.objects=[parent];
  const before=JSON.stringify(scene),clip=A.targetNewCinematicClip('transform',A.mkCinematicClip('transform'),scene,actor.id);
  assertEquals(clip.objectId,actor.id);assertEquals(clip.from.x,12);assertEquals(clip.to.x,12);
  const camera=A.targetNewCinematicClip('camera',A.mkCinematicClip('camera'),scene,actor.id),resolved=A.resolveSceneCamera(scene);
  assertEquals(camera.position,resolved.position);assertEquals(camera.target,resolved.target);
  assertEquals(JSON.stringify(scene),before);
  assertAlmostEquals(A.snapCinematicTime(1.276,.1),1.3);assertEquals(A.snapCinematicTime(1.276,0),1.276);assertEquals(A.snapCinematicTime(-1),0);
});

Deno.test('editor localization translates fixed UI and preserves unknown project text and engine enum values',()=>{
  A.setLang('es');assertEquals(A.tr('Export Game…'),'Exportar juego…');assertEquals(A.tr('Water quality'),'Calidad del agua');
  const options=A.localizeEditorOptions([{value:'NEAREST',label:'Nearest'}]);assertEquals(options[0].value,'NEAREST');assertEquals(options[0].label,'Vecino más cercano');
  A.setLang('pt');assertEquals(A.tr('Properties'),'Propriedades');assertEquals(A.tr('Destroy Object'),'Destruir objeto');
  const userText='Marcos, diálogo original 123';assertEquals(A.tr(userText),userText);
  assertEquals(A.tr('__proto__'),'__proto__');assertEquals(A.tr('constructor'),'constructor');
  A.setLang('en');assertEquals(A.tr('Properties'),'Properties');
  for(const [key,row] of Object.entries(A.EDITOR_TRANSLATIONS)){assertEquals(row.length,2,key);assert(row.every(text=>typeof text==='string'&&text.trim()),key);}
});

Deno.test('numeric drafts accept decimal commas and reject empty, partial and nonfinite numbers',()=>{
  for(const [text,number] of [['1,5',1.5],['-.5',-.5],['1e3',1000],[' 2.25 ',2.25]])assertEquals(A.parseEditorNumber(text),number);
  for(const text of ['', '-', '1foo','1,2,3','NaN','Infinity','1e999'])assertEquals(A.parseEditorNumber(text),null);
});
