function HUDMotionControls({element,variables={},onChange}) {
  const defaults=hudMotionDefaults(),binding={...defaults.binding,...element.binding},animation={...defaults.animation,...element.animation};
  const update=(module,key,value)=>onChange({[module]:{...(module==='binding'?binding:animation),[key]:value}});
  return <>
    <div className="a-sec__group">{tr('Gameplay binding')}</div>
    <Field label={tr('Scene variable')}><Select value={binding.variable} options={[{value:'',label:tr('None')},...Object.keys(variables).map(value=>({value,label:value}))]} onChange={v=>update('binding','variable',v)}/></Field>
    <Field label={tr('Bind to')}><Select value={binding.kind} options={['text','progress','visible'].map(value=>({value,label:tr(value)}))} onChange={v=>update('binding','kind',v)}/></Field>
    {['min','max'].map(key=><Field key={key} label={tr(key)}><NumInput value={binding[key]} onChange={v=>update('binding',key,v)}/></Field>)}
    {['prefix','suffix'].map(key=><Field key={key} label={tr(key)}><TextInput value={binding[key]} onChange={v=>update('binding',key,v)}/></Field>)}
    <div className="a-sec__group">{tr('HUD animation')}</div>
    <Field label={tr('Animate')}><Checkbox value={animation.enabled} onChange={v=>update('animation','enabled',v)}/></Field>
    <Field label={tr('Animated property')}><Select value={animation.property} options={['x','y','width','height'].map(value=>({value,label:value}))} onChange={v=>update('animation','property',v)}/></Field>
    {['from','to','duration'].map(key=><Field key={key} label={tr(key)}><NumInput value={animation[key]} min={key==='duration'?.01:undefined} onChange={v=>update('animation',key,v)}/></Field>)}
    <Field label={tr('Repeat animation')}><Checkbox value={animation.loop} onChange={v=>update('animation','loop',v)}/></Field>
    <Field label={tr('Animation curve')}><Select value={animation.curve} options={CINEMATIC_CURVES.filter(c=>['linear','easeIn','easeOut','easeInOut'].includes(c.value))} onChange={v=>update('animation','curve',v)}/></Field>
  </>;
}
