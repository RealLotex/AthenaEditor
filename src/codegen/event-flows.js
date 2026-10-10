function resolveEventFlows(ir,names){
  const rules=sceneEventRules(ir.scene).filter(r=>r.rule.enabled!==false),resources=new Map(),methods={};
  for(const {rule} of rules)for(const a of rule.actions||[]){
    if(a.type==='playSound'&&a.file){let sound=ir.sounds.find(s=>s.sound.file===a.file&&s.eventOnly);if(!sound){sound={obj:{id:a.id},vn:names.take('flow_sound','sound'),sound:{file:a.file},eventOnly:true};ir.sounds.push(sound);}resources.set(a.id,sound.vn);}
    if(a.type==='playAnimation'&&a.file&&!ir.anims.some(x=>x.file===a.file))ir.anims.push({file:a.file,vn:names.take('flow_animation','anims')});
  }
  for(const key of Object.getOwnPropertyNames(EventFlowRunner.prototype))if(key!=='constructor'&&typeof Object.getOwnPropertyDescriptor(EventFlowRunner.prototype,key).value==='function')methods[key]=names.take('_flow_'+key,'event_method');
  return {rules,resources,methods,enabled:rules.length>0||ir.objects.some(o=>o.components.events?.gameplayEnabled===false)};
}
function emitEventFlows(e,ir){
  const flow=ir.eventFlows;if(!flow.enabled)return;
  e.section('Visual events — indexed triggers and ordered actions');
  if(!ir.cinematics.enabled){e.w(...cinematicLerp.toString().split('\n'));e.w(...cinematicCurve.toString().split('\n'));}
  e.w(...flowEventType.toString().split('\n'));
  e.w(`const _flowModels = {${ir.models.map(m=>`"${jsStr(m.obj.id)}":${m.vn}`).join(',')}};`);
  e.w(`const _flowSounds = {${[...flow.resources].map(([id,vn])=>`"${jsStr(id)}":${vn}`).join(',')}};`);
  e.w(`const _flowAnimations = {${ir.anims.map(a=>`"${jsStr(a.file)}":${a.vn}`).join(',')}};`);
  e.w(`const _flowPlatform = {`);
  e.block(b=>{
    b.w(`alive:_isObjectAlive, enabled:_isObjectEnabled, cinematicBusy:()=>!!ctx.cinematics?.playing, playSequence:id=>ctx.cinematics.play(id),`);
    b.w(`position:id=>{const p=_flowModels[id].position;return {x:p.x,y:p.y,z:p.z};},`);
    b.w(`move:(id,p)=>{const o=_runtimeObjects.get(id);if(!o?.alive)return;const m=_flowModels[id],old=m.position,delta={x:p.x-old.x,y:p.y-old.y,z:p.z-old.z};`);
    // Hierarchy transforms are baked. Translate descendants and their native
    // collider positions together; never use the unsafe ODE rotation setter.
    b.w(`const moveChild=key=>{const o=_runtimeObjects.get(key);if(!o?.alive)return;const model=_flowModels[key];if(model){const q=model.position;model.position={x:q.x+delta.x,y:q.y+delta.y,z:q.z+delta.z};}const handle=o.body||o.geom;if(handle&&o.movable){const q=handle.getPosition();handle.setPosition(q[0]+delta.x,q[1]+delta.y,q[2]+delta.z);}for(const child of o.children)moveChild(child);};moveChild(id);},`);
    b.w(`action:a=>{`);
    b.block(x=>{
      x.w(`if(a.type==='setGameplayEnabled')setObjectGameplayEnabled(a.objectId,a.enabled);`);
      x.w(`else if(a.type==='setVisible'){const m=_flowModels[a.objectId];if(m&&!m._destroyed)m.visible=a.visible;}`);
      x.w(`else if(a.type==='destroyObject')destroyObject(a.objectId);`);
      x.w(`else if(a.type==='emitParticles')ctx.emitParticles?.(a.objectId);`);
      x.w(`else if(a.type==='changeScene')ctx.goToScene(a.sceneId);`);
      x.w(`else if(a.type==='playSound'){const s=_flowSounds[a.id];s.loop=false;s.pause();s.play();s.rewind();}`);
      x.w(`else if(a.type==='playAnimation'){const m=_flowModels[a.objectId],clip=_flowAnimations[a.file][a.animation];if(m&&!m._destroyed)m.playAnim(clip,a.loop);}`);
    });b.w(`}`);
  });e.w(`};`);
  e.w(`const _eventFlowState={platform:_flowPlatform,events:ctx.events,variables:Object.assign(Object.create(null),${JSON.stringify(ir.scene.eventVariables||{})}),jobs:[],states:[],handlers:[],depth:0,elapsed:0,numberBuffer:new Float64Array(1)};`);
  for(const [key,vn] of Object.entries(flow.methods)){const source=EventFlowRunner.prototype[key].toString();e.w(...(`function ${vn}${source.slice(source.indexOf('('))}`.replace(/\bthis\b/g,'_eventFlowState')).split('\n'));e.w(`_eventFlowState.${key}=${vn};`);}
  e.w(`Object.defineProperty(_eventFlowState,'running',{get:()=>_eventFlowState.jobs.length>0});`);
  const rulesByType=Object.create(null);
  for(const state of flow.rules){const rule=state.rule,type=flowEventType(rule.event,rule.id);(rulesByType[type]||=[]).push(state);}
  e.w(`const _flowRulesByType=${JSON.stringify(rulesByType)};`);
  e.w(`for(const type of Object.keys(_flowRulesByType)){const states=_flowRulesByType[type].map(s=>({rule:s.rule,ownerId:s.ownerId,running:false,fired:false}));_eventFlowState.states.push(...states);const callback=p=>_eventFlowState.trigger(states,p);ctx.events.on(type,callback);_eventFlowState.handlers.push({type,callback});for(const s of states)if(s.rule.event.type==='timer')ctx.events.startTimer(type,s.rule.event.seconds);}`);
  e.w(`const _flowComplete=p=>_eventFlowState.completed(p.sequenceId);ctx.events.on('cinematicFinished',_flowComplete);_eventFlowState.handlers.push({type:'cinematicFinished',callback:_flowComplete});`);
  e.w(`ctx.eventFlows=_eventFlowState;ctx.variables=_eventFlowState.variables;ctx.setGameplayEnabled=setObjectGameplayEnabled;ctx.isGameplayEnabled=_isObjectEnabled;`);
  e.w(`for(const o of _runtimeObjects.values())if(o.body&&!o.enabled)o.body.disable();`);
}
