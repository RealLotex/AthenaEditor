import { assert, assertEquals } from 'jsr:@std/assert@1';
import { load } from './_load.js';
const A=await load(['core/util.js','core/editor-controls.js','core/layout.js']);

Deno.test('color dragging coalesces intermediate samples and commits the final color exactly once',()=>{
  const jobs=new Map(),samples=[],commits=[];let id=0;
  const gesture=A.createColorGesture(value=>samples.push(value),value=>commits.push(value),{schedule:fn=>{jobs.set(++id,fn);return id;},cancel:id=>jobs.delete(id)});
  for(let i=0;i<1000;i++)gesture.input('#'+i);
  assertEquals(samples,['#0']);assertEquals(jobs.size,1);
  for(const [id,job] of [...jobs]){jobs.delete(id);job();}
  assertEquals(samples,['#0','#999']);
  gesture.input('#ff0000');gesture.finish('#123456');gesture.finish('#123456');
  assertEquals(samples,['#0','#999','#123456']);assertEquals(commits,['#123456']);assertEquals(jobs.size,0);
  gesture.input('#abcdef');gesture.input('#ffffff');gesture.dispose();
  assertEquals(jobs.size,0);assertEquals(commits,['#123456']);
});

Deno.test('a drag never becomes a selection click after returning to its starting point',()=>{
  const gesture={x:100,y:80,pointerId:1,dragged:false};
  A.updateSelectionGesture(gesture,{clientX:120,clientY:80,pointerId:1},5);
  assert(!A.selectionGestureIsClick(gesture,{clientX:100,clientY:80,pointerId:1,type:'pointerup'},5));
});
Deno.test('small pointer jitter selects only on release; cancellation and another pointer cannot select',()=>{
  const gesture={x:10,y:20,pointerId:4,dragged:false};
  assert(!A.selectionGestureIsClick(gesture,{clientX:12,clientY:22,pointerId:4,type:'pointercancel'},5));
  assert(!A.selectionGestureIsClick(gesture,{clientX:12,clientY:22,pointerId:5,type:'pointerup'},5));
  assert(A.selectionGestureIsClick(gesture,{clientX:13,clientY:24,pointerId:4,type:'pointerup'},5));
});
Deno.test('camera presets resolve exact buttons and modifiers without stealing selection modifiers',()=>{
  const defaults=A.normalizeEditorMouse();
  assertEquals(A.editorMouseAction(defaults,{button:0}),'orbit');
  assertEquals(A.editorMouseAction(defaults,{button:0,ctrlKey:true}),null);
  const blender=A.editorMousePreset('blender',defaults);
  assertEquals(A.editorMouseAction(blender,{button:1}),'orbit');
  assertEquals(A.editorMouseAction(blender,{button:1,shiftKey:true}),'pan');
  assertEquals(A.editorMouseAction(blender,{button:1,ctrlKey:true}),'dolly');
  const maya=A.editorMousePreset('maya',defaults);
  assertEquals(A.editorMouseAction(maya,{button:0}),null);
  assertEquals(A.editorMouseAction(maya,{button:0,altKey:true}),'orbit');
  assertEquals(A.editorMouseAction(maya,{button:0,altKey:true,shiftKey:true}),null);
  assertEquals(A.DEFAULT_EDITOR_MOUSE.orbit.button,0);
});
Deno.test('conflicting mouse gestures are rejected while disabled bindings may share a modifier',()=>{
  const settings=A.normalizeEditorMouse();
  assertEquals(A.editorMouseConflict(settings,'pan',{button:0,modifier:'none'}),'orbit');
  assertEquals(A.editorMouseConflict(settings,'pan',{button:-1,modifier:'none'}),null);
  const bounded=A.normalizeEditorMouse({orbit:{button:99,modifier:'bad'},dragThreshold:-1,zoomSpeed:Infinity});
  assertEquals(bounded.orbit,A.DEFAULT_EDITOR_MOUSE.orbit);
  assertEquals(bounded.dragThreshold,1);assertEquals(bounded.zoomSpeed,1);
});
Deno.test('saved hotkeys replace defaults, can disable an action, and never alter command definitions',()=>{
  const commands=[{id:'save',keys:'Ctrl+S'},{id:'move',keys:'W'},{id:'other'}];
  const mapped=A.editorCommandBindings(commands,A.normalizeEditorHotkeys({save:'shift+ctrl+p',move:'',other:'F8',invalid:12}));
  assertEquals(mapped.map(c=>c.keys),['Ctrl+Shift+P','','F8']);
  assertEquals(commands[0].keys,'Ctrl+S');assertEquals(mapped[0].defaultKeys,'Ctrl+S');
  assertEquals(A.editorHotkeyConflict(mapped,'other','CTRL+SHIFT+P').id,'save');
  assertEquals(A.editorHotkeyConflict(mapped,'other','Ctrl+S'),null);
  assertEquals(A.editorCommandBindings([...commands,{id:'save',keys:'Ctrl+P'}],{}).filter(command=>command.id==='save').map(command=>command.keys),['Ctrl+P']);
});
Deno.test('World, Lighting, Events, Project, Controls and UV remain independently dockable',()=>{
  let layout=A.layoutPreset('Focus');
  for(const panel of ['sceneSettings','environment','events','projectSettings','controls','uv']){
    layout=A.activateDockPanel(layout,panel);
    assertEquals(A.dockLocation(layout,panel).group.active,panel);
  }
  assertEquals(A.DOCK_PANELS.sceneSettings,'World');
  assertEquals(A.canonicalDockPanel('environment'),'environment');
  const restored=A.normalizeDockLayout(JSON.parse(JSON.stringify(layout)));
  for(const panel of ['environment','events','projectSettings'])assert(A.dockLocation(restored,panel));
});

Deno.test('duplicate panel commands retain legacy shortcuts and prefer an explicit canonical override',()=>{
  const commands=[{id:'view.timeline',keys:'Ctrl+T'},{id:'view.panel.timeline',keys:''}];
  const mapped=A.editorCommandBindings(commands,{'view.timeline':'F8'});
  assert(mapped[0].hidden);assertEquals(mapped[0].keys,'');
  assertEquals(mapped[1].keys,'F8');assertEquals(mapped[1].defaultKeys,'Ctrl+T');
  assertEquals(A.editorCommandBindings(commands,{'view.timeline':'F8','view.panel.timeline':''})[1].keys,'');
  assertEquals(commands[0].keys,'Ctrl+T');
});
