// Rules are data. The editor and exported game share the ordered action runner.
const FLOW_EVENTS = [...CINEMATIC_EVENTS.filter(e=>e.value!=='manual'),{value:'cinematicFinished',label:'Cinematic finishes'}];
const FLOW_ACTIONS = [
  {value:'playSequence',label:'Play cinematic'}, {value:'wait',label:'Wait'},
  {value:'moveObject',label:'Move object / open door'}, {value:'setGameplayEnabled',label:'Enable / disable behaviours'},
  {value:'setVisible',label:'Show / hide model'}, {value:'destroyObject',label:'Destroy object'},
  {value:'playSound',label:'Play sound oneshot'}, {value:'playAnimation',label:'Play animation'},
  {value:'emitParticles',label:'Play particles'},
  {value:'setVariable',label:'Set variable'}, {value:'emitEvent',label:'Emit custom event'}, {value:'changeScene',label:'Change scene'},
];
const FLOW_CONDITIONS = [{value:'objectEnabled',label:'Behaviours enabled'},{value:'variable',label:'Variable comparison'}];
const FLOW_OPERATORS = [{value:'equal',label:'Equals'},{value:'notEqual',label:'Does not equal'},{value:'greater',label:'Greater than'},{value:'less',label:'Less than'}];
function mkEventRule(){return {id:uid(),name:'Event',enabled:true,once:false,event:{type:'sceneStart',objectId:'',otherId:'',name:'',seconds:3,sequenceId:''},conditions:[],actions:[]};}
function mkFlowAction(type){
  if(!FLOW_ACTIONS.some(a=>a.value===type))throw Error('Unknown event action');
  return {id:uid(),type,objectId:'',sequenceId:'',sceneId:'',seconds:1,duration:1,to:{x:0,y:0,z:0},curve:'easeInOut',enabled:true,visible:true,file:'',animation:'',loop:false,key:'',value:0,name:'',wait:true};
}
function mkFlowCondition(type){return {id:uid(),type,objectId:'',enabled:true,key:'',operator:'equal',value:0};}
function sceneEventRules(scene){return [...(scene.eventRules||[]).map(rule=>({rule,ownerId:''})),...exportableObjects(scene.objects||[]).flatMap(o=>(o.components?.events?.rules||[]).map(rule=>({rule,ownerId:o.id})) )];}

function eventVariableReferences(scene,key) {
  const rules=[...(scene.eventRules||[])];
  walk(scene.objects||[],object=>rules.push(...(object.components?.events?.rules||[])));
  return rules.flatMap(rule=>[...(rule.conditions||[]),...(rule.actions||[])].filter(node=>node.key===key&&['variable','setVariable'].includes(node.type)).map(node=>({rule:rule.name,node})));
}
function renameEventVariable(scene,key,name) {
  const next=String(name).trim();
  if(!Object.hasOwn(scene.eventVariables||{},key))throw Error('The variable no longer exists.');
  if(next===key)return;
  if(!next||['__proto__','prototype','constructor'].includes(next)||Object.hasOwn(scene.eventVariables||{},next))throw Error('Choose a unique variable name.');
  for(const {node} of eventVariableReferences(scene,key))node.key=next;
  scene.eventVariables[next]=scene.eventVariables[key];delete scene.eventVariables[key];
}
function flowEventType(event={},id){return event.type==='custom'?event.name:event.type==='timer'?'flowTimer:'+id:event.type;}
function eventFlowProblems(scene,files=[],project=null){
  const out=[],objects=exportableObjects(scene.objects||[]),ids=new Set(),variables=scene.eventVariables||{};
  for(const {rule:r,ownerId} of sceneEventRules(scene)){
    const owner=objects.find(o=>o.id===ownerId),error=m=>out.push({level:'error',component:'events',objectId:ownerId||undefined,objectName:owner?.name,message:`Event "${r.name}": ${m}`});
    if(!r.id||ids.has(r.id))error('rule IDs must be unique.');ids.add(r.id);
    if(!Array.isArray(r.actions)||!Array.isArray(r.conditions)){error('invalid conditions or actions.');continue;}
    if(r.enabled===false)continue;
    const e=r.event||{};
    if(!FLOW_EVENTS.some(t=>t.value===e.type))error('choose a valid event.');
    if(e.type==='custom'&&!e.name?.trim())error('enter a custom event name.');
    if(e.type==='timer'&&(!Number.isFinite(e.seconds)||e.seconds<0))error('timer must be non-negative.');
    if(e.type==='cinematicFinished'&&e.sequenceId&&!scene.sequences?.some(s=>s.id===e.sequenceId))error('the cinematic no longer exists.');
    if(e.type?.startsWith('on')){
      const collider=objects.find(o=>o.id===(e.objectId||ownerId));
      if(!scene.physics?.enabled||!collider?.components.rigidbody?.collisionEvents)error('choose an exported collider with Generate Collision / Overlap Events enabled.');
      if(e.otherId&&!objects.some(o=>o.id===e.otherId&&o.components.rigidbody))error('Only with points to a missing collider.');
    }
    const nodeIds=new Set();
    const target=n=>{const o=objects.find(o=>o.id===n.objectId);if(!o)error('choose an exported object for '+(FLOW_ACTIONS.find(a=>a.value===n.type)?.label||'the condition')+'.');return o;};
    const variable=n=>{if(!Object.hasOwn(variables,n.key))error(`variable "${n.key}" is missing. Add it to Scene variables.`);if(!Number.isFinite(n.value))error('variable values must be finite numbers.');};
    for(const n of [...r.conditions,...r.actions]){if(!n.id||nodeIds.has(n.id))error('conditions and actions need unique IDs.');nodeIds.add(n.id);}
    for(const c of r.conditions){
      if(c.type==='objectEnabled')target(c);
      else if(c.type==='variable'){variable(c);if(!FLOW_OPERATORS.some(o=>o.value===c.operator))error('choose a valid comparison.');}
      else error('unknown condition.');
    }
    for(const a of r.actions){
      if(!FLOW_ACTIONS.some(t=>t.value===a.type)){error('unknown action.');continue;}
      const o=['moveObject','setGameplayEnabled','setVisible','destroyObject','playAnimation','emitParticles'].includes(a.type)?target(a):null;
      if(a.type==='emitParticles'&&!o?.components.particles)error('choose a particle emitter.');
      if(a.type==='playSequence'&&!scene.sequences?.some(s=>s.id===a.sequenceId))error('choose a cinematic.');
      if(a.type==='changeScene'&&!project?.scenes?.some(s=>s.id===a.sceneId))error('choose a destination scene.');
      if(a.type==='wait'&&(!Number.isFinite(a.seconds)||a.seconds<0))error('wait time must be non-negative.');
      if(a.type==='moveObject'){
        if(!o?.components.model)error('Move object requires a Model target.');
        if(!a.to||!['x','y','z'].every(k=>Number.isFinite(a.to[k]))||!Number.isFinite(a.duration)||a.duration<0)error('movement needs a finite world position and non-negative duration.');
        if(o&&allObjects([o]).some(child=>child.components?.rigidbody?.shape==='plane'))error('an infinite plane cannot move, including one inside the target hierarchy.');
        if(!CINEMATIC_CURVES.some(c=>c.value===a.curve))error('choose a valid movement curve.');
      }
      if(['setVisible','playAnimation'].includes(a.type)&&!o?.components.model)error('the action requires a Model target.');
      if(a.type==='playSound'&&!files.some(f=>f.cat==='sounds'&&f.name===a.file&&(f.dataUrl||f.content!==undefined)))error('choose an imported sound.');
      if(a.type==='playAnimation'){
        const animation=files.find(f=>f.cat==='models'&&f.name===a.file),model=files.find(f=>f.cat==='models'&&f.name===o?.components.model?.file);
        if(!cinematicAnimationNames(animation).includes(a.animation)||!cinematicGltfInfo(model)?.skins?.length)error('choose an animation and a skinned Model target.');
      }
      if(a.type==='setVariable')variable(a);
      if(a.type==='emitEvent'&&!a.name?.trim())error('enter the custom event name.');
    }
    // A direct timeline binding and a chain must not both start a cinematic.
    if(r.actions.some(a=>a.type==='playSequence'))for(const s of scene.sequences||[]){const x=s.event;
      const colliderId=e.type?.startsWith('on')?(e.objectId||ownerId):'',otherId=e.type?.startsWith('on')?e.otherId:'';
      if(!['manual','timer'].includes(e.type)&&flowEventType(e,r.id)===flowEventType(x,s.id)&&(!x.objectId||!colliderId||x.objectId===colliderId)&&(!x.otherId||!otherId||x.otherId===otherId))error(`"${s.name}" also starts directly on this event. Set its start event to Manual / script.`);
    }
  }
  for(const [key,value] of Object.entries(variables))if(!key.trim()||!Number.isFinite(value))out.push({level:'error',component:'events',message:'Scene variables need names and finite numeric values.'});
  return out;
}
class EventFlowRunner {
  constructor(rules,platform,events,variables={}){
    this.platform=platform;this.events=events;this.variables=Object.assign(Object.create(null),variables);this.jobs=[];this.states=[];this.handlers=[];this.depth=0;this.elapsed=0;this.numberBuffer=new Float64Array(1);
    const byEvent=Object.create(null);
    for(const {rule,ownerId} of rules){if(rule.enabled===false)continue;const state={rule,ownerId,running:false,fired:false};this.states.push(state);const type=flowEventType(rule.event,rule.id);(byEvent[type]||=[]).push(state);
      if(rule.event.type==='timer')events.startTimer(type,rule.event.seconds);
    }
    for(const [type,states] of Object.entries(byEvent)){const callback=payload=>this.trigger(states,payload);events.on(type,callback);this.handlers.push({type,callback});}
    const callback=p=>this.completed(p.sequenceId);events.on('cinematicFinished',callback);this.handlers.push({type:'cinematicFinished',callback});
  }
  number(v){this.numberBuffer[0]=v;return this.numberBuffer[0];}
  matches(state,p){const e=state.rule.event;if(e.type.startsWith('on'))return (!(e.objectId||state.ownerId)||(e.objectId||state.ownerId)===p.selfId)&&(!e.otherId||e.otherId===p.otherId);return e.type!=='cinematicFinished'||!e.sequenceId||e.sequenceId===p.sequenceId;}
  conditions(rule){for(const c of rule.conditions){if(c.type==='objectEnabled'){if(this.platform.enabled(c.objectId)!==c.enabled)return false;}
    else {const a=this.number(this.variables[c.key]),b=this.number(c.value);if(c.operator==='equal'&&a!==b||c.operator==='notEqual'&&a===b||c.operator==='greater'&&a<=b||c.operator==='less'&&a>=b)return false;}}
    return true;
  }
  trigger(states,p={}){
    if(this.depth>=32)throw Error('Custom events form a cycle. Add a Wait action or remove the cycle.');this.depth++;
    try{for(const state of states){if(state.running||state.rule.once&&state.fired||!this.matches(state,p)||!this.conditions(state.rule)||state.ownerId&&!this.platform.alive(state.ownerId))continue;
      state.running=true;state.fired=true;const job={state,index:0,wait:null,payload:p};this.jobs.push(job);this.advance(job);
    }}finally{this.depth--;this.prune();}
  }
  advance(job){
    const actions=job.state.rule.actions;
    while(job.state.running&&job.index<actions.length){const a=actions[job.index++];
      if(a.type==='wait'&&a.seconds>0){job.wait={type:'time',at:this.number(this.elapsed+a.seconds)};return;}
      if(a.type==='playSequence'){
        if(this.platform.cinematicBusy()){job.wait={type:'startSequence',action:a};return;}
        // Register before play: an empty cinematic finishes synchronously.
        if(a.wait!==false)job.wait={type:'sequence',id:a.sequenceId};
        this.platform.playSequence(a.sequenceId);if(job.wait)return;
      }else if(a.type==='moveObject'){
        if(!this.platform.alive(a.objectId))throw Error('Movement target was destroyed: '+a.objectId);
        if(a.duration>0){job.wait={type:'move',action:a,from:this.platform.position(a.objectId),start:this.elapsed};return;}
        this.platform.move(a.objectId,a.to);
      }else if(a.type==='setVariable')this.variables[a.key]=a.value;
      else if(a.type==='emitEvent')this.events.emit(a.name,job.payload);
      else if(a.type!=='wait')this.platform.action(a,job.payload);
    }
    job.state.running=false;job.wait=null;
  }
  completed(id){for(const job of this.jobs.slice())if(job.wait?.type==='sequence'&&job.wait.id===id){job.wait=null;this.advance(job);}this.prune();}
  prune(){for(let i=this.jobs.length-1;i>=0;i--)if(!this.jobs[i].state.running)this.jobs.splice(i,1);}
  update(dt){
    this.elapsed=this.number(this.elapsed+Math.max(0,dt));
    for(const job of this.jobs.slice()){const w=job.wait;if(!w)continue;
      if(w.type==='time'&&this.elapsed>=this.number(w.at-1e-9)){job.wait=null;this.advance(job);}
      else if(w.type==='startSequence'&&!this.platform.cinematicBusy()){const a=w.action;job.wait=a.wait===false?null:{type:'sequence',id:a.sequenceId};this.platform.playSequence(a.sequenceId);if(!job.wait)this.advance(job);}
      else if(w.type==='sequence'&&!this.platform.cinematicBusy())throw Error('Cinematic in event chain was interrupted: '+w.id);
      else if(w.type==='move'){
        if(!this.platform.alive(w.action.objectId)){job.state.running=false;continue;}
        const t=Math.min(1,this.number(this.elapsed-w.start)/w.action.duration);this.platform.move(w.action.objectId,cinematicLerp(w.from,w.action.to,cinematicCurve(t,w.action.curve)));
        if(t>=1){job.wait=null;this.advance(job);}
      }
    }this.prune();
  }
  get running(){return this.jobs.length>0;}
  dispose(){for(const {type,callback} of this.handlers)this.events.off(type,callback);for(const state of this.states)if(state.rule.event.type==='timer')this.events.cancelTimer(flowEventType(state.rule.event,state.rule.id));this.jobs.length=0;this.handlers.length=0;this.states.length=0;this.events=null;this.platform=null;}
}
