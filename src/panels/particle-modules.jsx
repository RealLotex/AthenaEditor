function ParticleListControl({field,value=[],scene,obj,onChange}) {
  const key=field.key,update=(i,k,v)=>onChange(value.map((item,n)=>n===i?{...item,[k]:v}:item),'commit');
  const defaults={bursts:{time:0,count:10,cycles:1,interval:.1},colorKeys:{time:1,r:1,g:1,b:1,a:0},sizeKeys:{time:1,value:0},subEmitters:{event:'death',objectId:'',probability:1}};
  return <div className="particle-module-list"><h4>{tr(field.label)}</h4>
    {value.map((row,i)=><div key={i} className="particle-module-row">
      {key==='collisionPlanes'?<Field label={tr('Plane height')}><NumInput value={row} onChange={v=>onChange(value.map((y,n)=>n===i?v:y),'commit')}/></Field>:
      key==='subEmitters'?<><Field label={tr('Trigger')}><Select value={row.event} options={['birth','death','collision'].map(value=>({value,label:tr(value)}))} onChange={v=>update(i,'event',v)}/></Field><Field label={tr('Emitter')}><Select value={row.objectId} options={[{value:'',label:tr('Choose emitter…')},...exportableObjects(scene.objects).filter(o=>o.id!==obj.id&&o.components.particles).map(o=>({value:o.id,label:o.name}))]} onChange={v=>update(i,'objectId',v)}/></Field><Field label={tr('Probability')}><NumInput value={row.probability} min={0} max={1} onChange={v=>update(i,'probability',v)}/></Field></>:
      key==='colorKeys'?<><Field label={tr('Lifetime position')}><NumInput value={row.time} min={0} max={1} step={.05} onChange={v=>update(i,'time',v)}/></Field><Field label={tr('Color')}><Color01Input value={row} alpha onChange={v=>onChange(value.map((item,n)=>n===i?{...v,time:item.time}:item),'commit')}/></Field></>:
      Object.keys(defaults[key]).map(k=><Field key={k} label={tr(k)}><NumInput value={row[k]} min={0} max={key==='sizeKeys'&&k==='time'?1:undefined} step={k==='count'||k==='cycles'?1:.05} integer={k==='count'||k==='cycles'} onChange={v=>update(i,k,v)}/></Field>)}
      <button className="a-btn a-btn--sm" onClick={()=>onChange(value.filter((_,n)=>n!==i),'commit')}>{tr('Remove')}</button>
    </div>)}
    <button className="a-btn a-btn--sm" disabled={value.length>=16} onClick={()=>onChange([...value,key==='collisionPlanes'?0:{...defaults[key]}],'commit')}>+ {tr(field.label)}</button>
  </div>;
}
