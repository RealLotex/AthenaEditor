function hudMotionDefaults() {
  return {binding:{variable:'',kind:'text',min:0,max:100,prefix:'',suffix:''},animation:{enabled:false,property:'x',from:0,to:60,duration:1,loop:false,curve:'easeInOut'}};
}
function hudMotionProblems(element,variables={}) {
  const errors=[],binding=element.binding,animation=element.animation;
  if(binding?.variable&&!Object.hasOwn(variables,binding.variable))errors.push('HUD binding references a missing scene variable: '+binding.variable);
  if(binding?.variable&&!['text','progress','visible'].includes(binding.kind))errors.push('Choose a supported HUD binding.');
  if(binding?.kind==='progress'&&binding.variable&&(!Number.isFinite(binding.min)||!Number.isFinite(binding.max)||binding.max<=binding.min))errors.push('HUD progress range must have a maximum above its minimum.');
  if(animation?.enabled&&(!['x','y','width','height'].includes(animation.property)||!Number.isFinite(animation.from)||!Number.isFinite(animation.to)||!Number.isFinite(animation.duration)||animation.duration<=0||!['linear','easeIn','easeOut','easeInOut'].includes(animation.curve)))errors.push('HUD animation needs finite endpoints, a positive duration and a supported curve.');
  return errors.map(message=>({level:'error',component:'hud',objectId:element.id,message}));
}
// Shared by Game and native HUD drawing. Layout animation never writes project data.
function hudMotionValues(element,time,variables={}) {
  const result={},binding=element.binding,animation=element.animation;
  if(binding?.variable&&Object.prototype.hasOwnProperty.call(variables,binding.variable)){
    const value=variables[binding.variable];
    if(binding.kind==='progress')result.progress=Math.max(0,Math.min(1,(value-binding.min)/Math.max(.0001,binding.max-binding.min)));
    else if(binding.kind==='visible')result.visible=!!value;
    else result.text=(binding.prefix||'')+value+(binding.suffix||'');
  }
  if(animation?.enabled&&animation.duration>0){
    let t=(animation.loop?time%animation.duration:Math.min(time,animation.duration))/animation.duration;
    if(animation.curve==='easeInOut')t=t*t*(3-2*t);else if(animation.curve==='easeIn')t*=t;else if(animation.curve==='easeOut')t=1-(1-t)*(1-t);
    result[animation.property]=animation.from+(animation.to-animation.from)*t;
  }
  return result;
}
