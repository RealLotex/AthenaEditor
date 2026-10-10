import {assert,assertEquals,assertAlmostEquals,assertThrows,assertStringIncludes} from 'jsr:@std/assert@1';
import {load} from './_load.js';
const A=await load();
function setup(rules){
  const enabled={enemy:false},positions={door:{x:0,y:0,z:0}},executed=[];let busy=false;
  const events=A.createSceneEvents([],null),platform={alive:()=>true,enabled:id=>enabled[id]!==false,position:id=>({...positions[id]}),move:(id,p)=>positions[id]=p,cinematicBusy:()=>busy,playSequence:id=>{busy=true;executed.push(id);},action:a=>{executed.push(a.type);if(a.type==='setGameplayEnabled')enabled[a.objectId]=a.enabled;}};
  const runner=new A.EventFlowRunner(rules.map(rule=>({rule,ownerId:''})),platform,events,{key:1});
  return {runner,events,executed,enabled,positions,finish:id=>{busy=false;events.emit('cinematicFinished',{sequenceId:id});}};
}
Deno.test('visual chain filters entrants, waits for cinematic and moving door, then enables enemies once',()=>{
  const rule=A.mkEventRule();rule.once=true;rule.event={type:'onTriggerEnter',objectId:'zone',otherId:'player'};
  const play={...A.mkFlowAction('playSequence'),sequenceId:'intro'},move={...A.mkFlowAction('moveObject'),objectId:'door',duration:1,to:{x:4,y:0,z:0}},enable={...A.mkFlowAction('setGameplayEnabled'),objectId:'enemy'};rule.actions=[play,move,enable];
  const r=setup([rule]);r.events.emit('onTriggerEnter',{selfId:'zone',otherId:'crate'});assertEquals(r.executed,[]);
  r.events.emit('onTriggerEnter',{selfId:'zone',otherId:'player'});r.events.emit('onTriggerEnter',{selfId:'zone',otherId:'player'});assertEquals(r.executed,['intro']);
  r.runner.update(.5);assertEquals(r.positions.door.x,0);r.finish('intro');r.runner.update(.5);assertAlmostEquals(r.positions.door.x,2);assertEquals(r.enabled.enemy,false);
  r.runner.update(.5);assertEquals(r.positions.door.x,4);assertEquals(r.enabled.enemy,true);assert(!r.runner.running);
  r.events.emit('onTriggerEnter',{selfId:'zone',otherId:'player'});assertEquals(r.executed,['intro','setGameplayEnabled']);
});
Deno.test('conditions use scene variables and object state; timers finish once and custom cycles fail clearly',()=>{
  const rule=A.mkEventRule();rule.event={type:'timer',seconds:.5};rule.conditions=[{...A.mkFlowCondition('variable'),key:'key',value:1}];rule.actions=[{...A.mkFlowAction('setVariable'),key:'key',value:2},{...A.mkFlowAction('setGameplayEnabled'),objectId:'enemy'}];
  const r=setup([rule]);r.events.update(.49);assertEquals(r.enabled.enemy,false);r.events.update(.01);assertEquals(r.enabled.enemy,true);assertEquals(r.runner.variables.key,2);r.events.update(3);assertEquals(r.executed.length,1);
  const cycle=A.mkEventRule();cycle.event={type:'custom',name:'again'};cycle.actions=[{...A.mkFlowAction('emitEvent'),name:'again'}];
  // Running rules ignore themselves, preventing the common self-loop.
  const c=setup([cycle]);c.events.emit('again');assert(!c.runner.running);c.runner.dispose();assertEquals(c.events.handlers.again,[]);
  const blocked=A.mkEventRule();blocked.conditions=[{...A.mkFlowCondition('objectEnabled'),objectId:'enemy',enabled:true}];blocked.actions=[{...A.mkFlowAction('setVariable'),key:'key',value:3}];const b=setup([blocked]);b.events.emit('sceneStart');assertEquals(b.runner.variables.key,1);
});
Deno.test('empty cinematics finish synchronously without skipping or duplicating subsequent actions',()=>{
  const rule=A.mkEventRule();rule.actions=[{...A.mkFlowAction('playSequence'),sequenceId:'empty'},{...A.mkFlowAction('wait'),seconds:1},{...A.mkFlowAction('setVariable'),key:'key',value:3}];
  const r=setup([rule]);r.runner.platform.playSequence=id=>r.finish(id);r.events.emit('sceneStart');assert(r.runner.running);r.runner.update(1);assertEquals(r.runner.variables.key,3);assert(!r.runner.running);
});
Deno.test('missing references, invalid curves and conflicting direct triggers are export errors; rules survive migration',()=>{
  const p=A.mkProject(),s=p.scenes[0],r=A.mkEventRule();r.actions=[A.mkFlowAction('playSequence'),A.mkFlowAction('moveObject')];s.eventRules.push(r);
  const errors=A.eventFlowProblems(s,[],p);assert(errors.some(d=>d.message.includes('choose a cinematic')));assert(errors.some(d=>d.message.includes('exported object')));
  const seq=A.mkSequence();s.sequences.push(seq);r.actions=[{...A.mkFlowAction('playSequence'),sequenceId:seq.id}];assert(A.eventFlowProblems(s,[],p).some(d=>d.message.includes('also starts directly')));seq.event.type='manual';assertEquals(A.eventFlowProblems(s,[],p),[]);
  assertEquals(A.migrateProject(JSON.parse(JSON.stringify(p))).scenes[0].eventRules,s.eventRules);
});
Deno.test('emitted chains run without scripts or physics and wait before reloading scenes',()=>{
  const p=A.mkProject(),s=p.scenes[0];s.objects=[];s.defaultCameraRig=false;const r=A.mkEventRule();r.actions=[{...A.mkFlowAction('wait'),seconds:.1},{...A.mkFlowAction('setVariable'),key:'test',value:2}];s.eventVariables={test:0};s.eventRules=[r];
  const generated=A.generateProject(p);assertEquals(generated.diagnostics.filter(d=>d.level==='error'),[]);assertStringIncludes(generated.main,'ctx.eventFlows.update(1/60)');assertStringIncludes(generated.main,'!ctx.eventFlows.running');new Function(generated.main);
  assertStringIncludes(generated.main,'if (pad.justPressed(Pads.TRIANGLE)) _nextScene = "main.js";');
  const ir=A.resolveScene(p,s),e=new A.Emitter();A.emitObjectLifetime(e,ir);A.emitSceneEventsRuntime(e,ir);A.emitEventFlows(e,ir);const ctx={};new Function('ctx',e.toString())(ctx);ctx.events.emit('sceneStart');ctx.eventFlows.update(.1);assertEquals(ctx.variables.test,2);
});

Deno.test('switching an event ignores hidden collision filters; moving parent groups rejects infinite planes',()=>{
  const r=A.mkEventRule();r.event.objectId='old';r.event.otherId='old';r.event.sequenceId='old';r.actions=[{...A.mkFlowAction('setVariable'),key:'key',value:4}];
  const instance=setup([r]);instance.events.emit('sceneStart');assertEquals(instance.runner.variables.key,4);
  const p=A.mkProject(),s=p.scenes[0],parent=A.mkObject('Group'),plane=A.mkObject('Plane');parent.components.model=A.makeComponent('model');plane.components.rigidbody={...A.makeComponent('rigidbody'),shape:'plane'};parent.children=[plane];s.objects=[parent];
  r.event=A.mkEventRule().event;r.actions=[{...A.mkFlowAction('moveObject'),objectId:parent.id}];s.eventRules=[r];assert(A.eventFlowProblems(s,[],p).some(d=>d.message.includes('infinite plane')));
});
