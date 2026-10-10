const CINEMATIC_CURVES=[{value:'linear',label:'Linear'},{value:'easeIn',label:'Ease in'},{value:'easeOut',label:'Ease out'},{value:'easeInOut',label:'Ease in / out'},{value:'step',label:'Hold / step'},{value:'bezier',label:'Bezier'}];

function cinematicCurve(t,curve='linear',bezier=[.25,.1,.25,1]) {
  t=Math.max(0,Math.min(1,t));if(t===0||t===1)return t;
  if(curve==='step')return 0;
  if(curve==='easeIn')return t*t;
  if(curve==='easeOut')return 1-(1-t)*(1-t);
  if(curve==='easeInOut')return t*t*(3-2*t);
  if(curve==='bezier') {
    let lo=0,hi=1,u=t;
    for(let i=0;i<18;i++){u=(lo+hi)/2;const x=3*(1-u)*(1-u)*u*bezier[0]+3*(1-u)*u*u*bezier[2]+u*u*u;if(x<t)lo=u;else hi=u;}
    return 3*(1-u)*(1-u)*u*bezier[1]+3*(1-u)*u*u*bezier[3]+u*u*u;
  }
  return t;
}

function cinematicValueLerp(a,b,t) {
  if(typeof a==='number')return a+(b-a)*t;
  const result={};for(const key of Object.keys(a))result[key]=cinematicValueLerp(a[key],b[key],t);return result;
}

function cinematicKeyframeValue(keys,age,from,to,duration,curve,bezier) {
  if(!keys?.length)return cinematicValueLerp(from,to,cinematicCurve(age/duration,curve,bezier));
  if(age<=keys[0].time)return keys[0].value;
  if(age>=keys[keys.length-1].time)return keys[keys.length-1].value;
  let lo=0,hi=keys.length-1;
  while(hi-lo>1){const mid=(lo+hi)>>1;if(keys[mid].time<=age)lo=mid;else hi=mid;}
  const a=keys[lo],b=keys[hi];
  return cinematicValueLerp(a.value,b.value,cinematicCurve((age-a.time)/(b.time-a.time),a.curve||curve,a.bezier||bezier));
}

function cinematicClipOpacity(c,age) {
  const incoming=c.fadeIn?cinematicCurve(age/c.fadeIn,c.curve,c.bezier):1;
  const outgoing=c.fadeOut?cinematicCurve((c.duration-age)/c.fadeOut,c.curve,c.bezier):1;
  return Math.max(0,Math.min(incoming,outgoing));
}

function cinematicClipEndpoints(type,clip) {
  if(type==='transform')return [clip.from,clip.to];
  if(type==='camera')return [{position:clip.position,target:clip.target},{position:clip.toPosition,target:clip.toTarget}];
  if(type==='fade')return [clip.fromAlpha,clip.toAlpha];
  throw Error('This channel does not support keyframes.');
}

function enableCinematicKeyframes(type,clip) {
  if(clip.keys?.length)return;
  const [from,to]=cinematicClipEndpoints(type,clip);
  clip.keys=[{id:uid(),time:0,value:deepClone(from),curve:clip.curve||'linear'},
    {id:uid(),time:clip.duration,value:deepClone(to),curve:clip.curve||'linear'}];
}

function addCinematicKeyframe(type,clip,time) {
  const [from,to]=cinematicClipEndpoints(type,clip);
  time=Math.max(0,Math.min(clip.duration,time));
  const value=cinematicKeyframeValue(clip.keys,time,from,to,clip.duration,clip.curve,clip.bezier);
  enableCinematicKeyframes(type,clip);
  if(clip.keys.some(k=>Math.abs(k.time-time)<1e-6))throw Error('There is already a keyframe at this time.');
  const key={id:uid(),time,value:deepClone(value),curve:clip.curve||'linear'};
  clip.keys.push(key);clip.keys.sort((a,b)=>a.time-b.time);return key;
}

function stretchCinematicClip(clip,duration) {
  if(!Number.isFinite(duration)||duration<=0)throw Error('Clip duration must be positive.');
  const ratio=duration/clip.duration;
  for(const key of clip.keys || [])key.time*=ratio;
  for(const key of ['fadeIn','fadeOut','transitionIn','blendIn','blendOut'])if(clip[key])clip[key]*=ratio;
  clip.duration=duration;
}

function cloneCinematicSequence(sequence) {
  const copy=deepClone(sequence);copy.id=uid();
  for(const track of copy.tracks){track.id=uid();for(const clip of track.clips){clip.id=uid();for(const key of clip.keys || [])key.id=uid();}}
  return copy;
}

function duplicateCinematicClip(sequence,trackId,clipId) {
  const track=sequence.tracks.find(t=>t.id===trackId),source=track?.clips.find(c=>c.id===clipId);
  if(!source)throw Error('Choose a clip to duplicate.');
  const copy=deepClone(source);copy.id=uid();copy.name=source.name+' Copy';copy.start=Math.max(...track.clips.map(c=>c.start+c.duration));
  for(const key of copy.keys || [])key.id=uid();track.clips.push(copy);return copy;
}

function sequenceObjectBindings(sequence,scene) {
  const slots=new Map(),add=(id,role)=>{
    if(!id)return;
    const object=findObj(scene.objects,id),slot=slots.get(id)||{id,label:object?.name||'Missing object',roles:[]};
    if(!slot.roles.includes(role))slot.roles.push(role);slots.set(id,slot);
  };
  add(sequence.event?.objectId,'collider');add(sequence.event?.otherId,'collider');
  for(const track of sequence.tracks)for(const clip of track.clips){add(clip.objectId,'model');add(clip.cameraId,'camera');}
  return [...slots.values()];
}

function sequenceBindingCandidates(slot,scene) {
  return exportableObjects(scene.objects).filter(o=>slot.roles.every(role=>role==='model'?!!o.components.model:role==='camera'?!!o.components.camera:!!o.components.rigidbody));
}

function saveSequencePreset(project,scene,sequence,name=sequence.name) {
  const preset={id:uid(),name:uniqueName(name.trim()||'Sequence',project.sequenceLibrary||[]),sequence:cloneCinematicSequence(sequence),bindings:sequenceObjectBindings(sequence,scene)};
  preset.sequence.event.type='manual';
  (project.sequenceLibrary ||= []).push(preset);return preset;
}

function defaultSequenceBindings(preset,scene) {
  const result={};for(const slot of preset.bindings || []) {
    const candidates=sequenceBindingCandidates(slot,scene),exact=candidates.find(o=>o.id===slot.id),named=candidates.filter(o=>o.name===slot.label);
    result[slot.id]=exact?.id||(named.length===1?named[0].id:'');
  }
  return result;
}

function instantiateSequencePreset(preset,scene,bindings) {
  for(const slot of preset.bindings || [])if(!sequenceBindingCandidates(slot,scene).some(o=>o.id===bindings[slot.id]))throw Error(`Choose a compatible object for "${slot.label}".`);
  const copy=cloneCinematicSequence(preset.sequence || preset);copy.name=uniqueName(preset.name,scene.sequences||[]);
  const remap=(holder,key)=>{if(holder?.[key]&&bindings[holder[key]])holder[key]=bindings[holder[key]];};
  remap(copy.event,'objectId');remap(copy.event,'otherId');
  for(const track of copy.tracks)for(const clip of track.clips){remap(clip,'objectId');remap(clip,'cameraId');}
  copy.event.type='manual';(scene.sequences ||= []).push(copy);return copy;
}
function snapCinematicTime(value,step=.1) {return Math.max(0,step>0?Math.round(value/step)*step:value);}

function targetNewCinematicClip(type,clip,scene,selectedObjectId,files=[]) {
  const object=findObj(scene.objects||[],selectedObjectId);
  if(object?.components.model&&['transform','animation','mesh','particles'].includes(type)){
    clip.objectId=object.id;
    if(type==='transform'){const world=worldTransforms(scene.objects).get(object.id);clip.from={...world.position};clip.to={...world.position};}
    if(type==='animation'&&object.components.animator){clip.file=object.components.animator.file;clip.animation=object.components.animator.defaultAnim||'';}
  }
  if(type==='camera'){const camera=resolveSceneCamera(scene);clip.position={...camera.position};clip.target={...camera.target};clip.toPosition={...camera.position};clip.toTarget={...camera.target};}
  if(['sfx','voice'].includes(type)){const sounds=files.filter(f=>f.cat==='sounds'&&!f.error);if(sounds.length===1)clip.file=sounds[0].name;}
  return clip;
}
