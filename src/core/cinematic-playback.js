// Game and PS2 share scheduling and sampling, with platform-specific resources.
function cinematicBoundaryCompare(a,b) { return a.time-b.time||Number(a.enter)-Number(b.enter); }
function cinematicLerp(a,b,t) {return {x:a.x+(b.x-a.x)*t,y:a.y+(b.y-a.y)*t,z:a.z+(b.z-a.z)*t};}
class CinematicPlayer {
  constructor(sequences,adapter) {
    this.adapter=adapter;this.compiled=[];this.active=[];this.numberBuffer=new Float64Array(1);
    this.current=null;this.time=0;this.cursor=0;this.snapshot=null;this.playing=false;this.paused=false;this.id=null;
    for(const sequence of sequences){
      const boundaries=[];let duration=0;
      for(const track of sequence.tracks)for(const clip of track.clips){
        const entry={type:track.type,clip},start=this.number(clip.start),end=this.number(start+this.number(clip.duration));
        boundaries.push({time:start,enter:true,entry},{time:end,enter:false,entry});duration=this.number(Math.max(duration,end));
      }
      const cameraStarts=new Set(boundaries.filter(b=>b.enter&&b.entry.type==='camera').map(b=>b.time));
      for(const b of boundaries)if(!b.enter&&b.entry.type==='camera')b.handoff=cameraStarts.has(b.time);
      boundaries.sort(cinematicBoundaryCompare);this.compiled.push({sequence,boundaries,duration});
    }
  }
  number(value){this.numberBuffer[0]=value;return this.numberBuffer[0];}
  sampleActive(time){
    for(let i=0;i<this.active.length;i++){const a=this.active[i],e=a.entry;this.adapter.sample(e.type,e.clip,Math.max(0,Math.min(1,(time-e.clip.start)/e.clip.duration)),time-e.clip.start,a.state);}
    this.adapter.platform?.mixAnimations?.();
  }
  sample(next,audible){
    while(this.current&&this.cursor<this.current.boundaries.length&&this.number(this.current.boundaries[this.cursor].time)<=this.number(next+1e-9)){
      const b=this.current.boundaries[this.cursor],e=b.entry;
      this.sampleActive(b.time);this.cursor=this.cursor+1;
      if(b.enter)this.active.push({entry:e,state:this.adapter.enter(e.type,e.clip,audible)});
      else for(let i=0;i<this.active.length;i++)if(this.active[i].entry.clip.id===e.clip.id){
        this.adapter.exit(e.type,e.clip,this.active[i].state,b.handoff);this.active.splice(i,1);break;
      }
    }
    this.time=this.number(next);
    this.sampleActive(this.time);
  }
  stop(completed=false){
    if(!this.current)return;
    const id=this.id;
    for(let i=0;i<this.active.length;i++){const a=this.active[i],e=a.entry;this.adapter.exit(e.type,e.clip,a.state);}
    this.active.length=0;this.current=null;this.playing=false;this.paused=false;this.id=null;
    this.adapter.restore(this.snapshot);this.snapshot=null;
    if(completed&&this.adapter.complete)this.adapter.complete(id);
  }
  play(id){
    let next=null;for(let i=0;i<this.compiled.length;i++)if(this.compiled[i].sequence.id===id){next=this.compiled[i];break;}
    if(!next)throw new Error('Unknown cinematic: '+id);
    this.stop();this.current=next;this.time=0;this.cursor=0;this.playing=true;this.paused=false;this.id=id;this.snapshot=this.adapter.capture();this.sample(0,true);
    if(!next.duration)this.stop(true);
  }
  pause(value=true){this.paused=value;this.adapter.pause?.(value);}
  seek(time){
    if(!this.current)return;const next=this.current,id=this.id;this.stop();this.current=next;this.id=id;this.playing=true;this.paused=true;this.cursor=0;this.snapshot=this.adapter.capture();this.sample(this.number(Math.max(0,Math.min(next.duration,time))),false);
  }
  update(dt){
    if(!this.current||this.paused)return;
    const end=this.number(this.current.duration);let next=this.number(this.number(this.time)+this.number(Math.max(0,dt)));
    if(next>=this.number(end-1e-9))next=end;
    this.sample(next,true);if(this.number(this.time)>=end)this.stop(true);
  }
  dispose(){this.stop();this.compiled.length=0;this.active.length=0;this.adapter=null;}
}
class CinematicAdapter {
  constructor(platform){this.platform=platform;this.ui=[];this.sounds=[];}
  capture(){this.cameraCarry=null;return this.platform.capture?this.platform.capture():this.platform.cameraSave();}
  restore(state){if(this.platform.restore)this.platform.restore(state);else this.platform.cameraRestore(state);}
  complete(id){this.platform.complete?.(id);}
  enter(type,c,audible){
    if(['dialogue','portrait','panel','fade'].includes(type)){const entry={type,clip:c,opacity:1};this.ui.push(entry);return entry;}
    if(['voice','sfx'].includes(type)){
      const sound=this.platform.sound(c);sound.loop=!!c.loop;
      const state={sound,age:0,silent:!audible,id:c.id};if(audible){sound.rewind();sound.play();}this.sounds.push(state);return state;
    }
    if(type==='camera'){const saved=this.platform.cameraSave(),state={from:this.cameraCarry?.from||saved,restore:this.cameraCarry?.restore||saved};this.cameraCarry=null;return state;}
    const m=this.platform.model(c.objectId);if(!m||m._destroyed)return null;
    if(type==='transform'){const v=m[c.property];return {x:v.x,y:v.y,z:v.z};}
    if(type==='mesh'){const previous=m.visible!==false;m.visible=c.visible;return previous;}
    if(type==='animation')return this.platform.animate(m,c);
    if(type==='particles'){
      const emitter=this.platform.particleEmitter?.(c.objectId);
      if(emitter){const state={emitter,time:emitter.time,playing:emitter.playing};emitter.stop();emitter.emit();emitter.cinematic=true;return state;}
      const v=m.position;return {pool:this.platform.particles(c),origin:{x:v.x,y:v.y,z:v.z}};
    }
    return null;
  }
  sample(type,c,t,age,state){
    const m=this.platform.model(c.objectId);
    if(['dialogue','portrait','panel'].includes(type)&&state)state.opacity=cinematicClipOpacity(c,age);
    if(type==='fade'&&state)state.opacity=cinematicKeyframeValue(c.keys,age,c.fromAlpha,c.toAlpha,c.duration,c.curve,c.bezier)/128;
    if(['voice','sfx'].includes(type)&&state)state.age=age;
    if(type==='transform'&&state&&m&&!m._destroyed)m[c.property]=cinematicKeyframeValue(c.keys,age,c.from,c.to,c.duration,c.curve,c.bezier);
    if(type==='camera'){
      let value=cinematicKeyframeValue(c.keys,age,{position:c.position,target:c.target},{position:c.toPosition,target:c.toTarget},c.duration,c.curve,c.bezier);
      if(c.transitionIn&&age<c.transitionIn){const blend=cinematicCurve(age/c.transitionIn,c.curve,c.bezier);value={position:cinematicLerp(state.from.position,value.position,blend),target:cinematicLerp(state.from.target,value.target,blend)};}
      this.platform.cameraSet(value.position,value.target);
    }
    if(type==='animation'&&state)this.platform.sampleAnimation?.(state,age);
    if(type==='particles'&&state?.emitter){const emitter=state.emitter;emitter.time=emitter.number(age);emitter.playing=true;stepParticleState(emitter,0);}
    if(type==='particles'&&state?.pool)for(let i=0;i<state.pool.length;i++){
      const p=state.pool[i],angle=i*2.399963,phase=(age+i/state.pool.length)%1,distance=phase*c.speed;
      p.visible=true;p.position={x:state.origin.x+Math.cos(angle)*distance,y:state.origin.y+phase*c.speed,z:state.origin.z+Math.sin(angle)*distance};p.scale={x:c.size,y:c.size,z:c.size};
    }
  }
  exit(type,c,state,handoff=false){
    for(let i=0;i<this.ui.length;i++)if(this.ui[i].clip.id===c.id){this.ui.splice(i,1);break;}
    if(['voice','sfx'].includes(type)){state?.sound.pause();for(let i=0;i<this.sounds.length;i++)if(this.sounds[i].id===c.id){this.sounds.splice(i,1);break;}}
    if(type==='camera'){if(handoff)this.cameraCarry={from:this.platform.cameraSave(),restore:state.restore};else this.platform.cameraRestore(state.restore);}
    const m=this.platform.model(c.objectId);
    if(type==='transform'&&state&&m&&!m._destroyed)m[c.property]=state;
    if(type==='mesh'&&m&&!m._destroyed)m.visible=state;
    if(type==='animation'&&state)this.platform.restoreAnimation(m,state);
    if(type==='particles'&&state?.emitter){const emitter=state.emitter;emitter.stop();emitter.cinematic=false;emitter.time=state.time;emitter.playing=state.playing;if(state.playing)stepParticleState(emitter,0);}
    if(type==='particles'&&state?.pool)for(let i=0;i<state.pool.length;i++)state.pool[i].visible=false;
  }
  pause(value){for(let i=0;i<this.sounds.length;i++){const s=this.sounds[i];if(value)s.sound.pause();else{if(s.silent&&s.sound.seek)s.sound.seek(s.age);s.sound.play();s.silent=false;}}}
  dispose(){this.ui.length=0;this.sounds.length=0;this.platform=null;}
}
class SceneEvents {
  constructor(sequences,player){
    this.player=player;this.listeners=Object.create(null);this.handlers=Object.create(null);this.timers=[];this.elapsed=0;this.numberBuffer=new Float64Array(1);
    for(const s of sequences){
      const e=s.event;if(e.type==='timer')this.timers.push({name:'sequence:'+s.id,at:this.number(e.seconds),event:'timer:'+s.id});
      const type=e.type==='timer'?'timer:'+s.id:e.type==='custom'?e.name:e.type;if(type==='manual')continue;
      if(!this.listeners[type])this.listeners[type]=[];this.listeners[type].push({s,e});
    }
  }
  number(v){this.numberBuffer[0]=v;return this.numberBuffer[0];}
  on(type,callback){if(typeof callback!=='function')throw new Error('Event handler must be a function');if(!this.handlers[type])this.handlers[type]=[];if(!this.handlers[type].includes(callback))this.handlers[type].push(callback);return callback;}
  off(type,callback){const i=this.handlers[type]?.indexOf(callback)??-1;if(i>=0)this.handlers[type].splice(i,1);}
  emit(type,payload={}){
    const rules=this.listeners[type]||[];let match=null;
    for(let i=0;i<rules.length;i++){const r=rules[i],e=r.e;if((!e.objectId||e.objectId===payload.selfId)&&(!e.otherId||e.otherId===payload.otherId)){if(match)throw new Error('Multiple cinematics bound to event: '+type);match=r.s;}}
    const callbacks=(this.handlers[type]||[]).slice();for(let i=0;i<callbacks.length;i++)callbacks[i](payload);
    if(match&&(!this.player.playing||this.player.id!==match.id))this.player.play(match.id);
    return !!match;
  }
  startTimer(name,seconds){if(!name||!Number.isFinite(seconds)||seconds<0)throw new Error('Invalid timer');this.cancelTimer(name);this.timers.push({name,at:this.number(this.elapsed+this.number(seconds)),event:name});}
  cancelTimer(name){for(let i=0;i<this.timers.length;i++)if(this.timers[i].name===name){this.timers.splice(i,1);break;}}
  update(dt){this.elapsed=this.number(this.elapsed+this.number(Math.max(0,dt)));for(let i=this.timers.length-1;i>=0;i--){const t=this.timers[i];if(this.elapsed>=this.number(t.at-1e-9)){this.timers.splice(i,1);this.emit(t.event);}}}
  dispose(){this.listeners=Object.create(null);this.handlers=Object.create(null);this.timers.length=0;this.player=null;}
}
function createCinematicPlayer(sequences,adapter){return new CinematicPlayer(sequences,adapter);}
function createCinematicAdapter(platform){return new CinematicAdapter(platform);}
function createSceneEvents(sequences,player){return new SceneEvents(sequences,player);}
