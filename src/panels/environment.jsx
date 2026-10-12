function EnvironmentPanel({scene,files,selectedIds=[],onEdit,onApply,onReflect,onSelect}) {
  const value=normalizedEnvironment(scene.environment),models=exportableObjects(scene.objects).filter(o=>/\.obj$/i.test(o.components.model?.file||'')&&!o.components.water&&!o.components.particles&&!o.components.animator&&o.components.rigidbody?.mode!=='dynamic'),lights=exportableObjects(scene.objects).filter(o=>o.components.light);
  const [busy,setBusy]=useState(false),[progress,setProgress]=useState(0),[error,setError]=useState('');
  const [open,setOpen]=useState({recess:true,mid:true,highlight:true});
  const [reflectionPreset,setReflectionPreset]=useState('coastal'),[reflectionStrength,setReflectionStrength]=useState(.5);
  const reflective=exportableObjects(scene.objects).filter(o=>selectedIds.includes(o.id)&&o.components.model&&!o.components.particles);
  const controller=useRef(null);useEffect(()=>()=>controller.current?.abort(),[]);
  const set=(path,v,phase)=>onEdit(sc=>{sc.environment=normalizedEnvironment(sc.environment);setPath(sc.environment,path,v);},phase==='commit'?null:'environment.'+path);
  const bake=async()=>{
    const job=new AbortController();controller.current=job;setBusy(true);setError('');
    try{const result=await bakeEnvironmentVertices(scene,files,models.map(o=>o.id),value,{signal:job.signal,onProgress:setProgress});if(!job.signal.aborted)onApply(result);}
    catch(e){setError(e.message);}finally{setBusy(false);}
  };
  return <><PanelHeader title={tr("Lighting")}/><div className="a-scroll" style={{padding:12}}>
    <div className="a-light-shortcuts">{lights.map(light=><button key={light.id} className="a-btn a-btn--wide" onClick={()=>onSelect?.(light.id)}>☀ {tr('Select')} {light.name} → {tr('Properties')}</button>)}</div>
    <h3>{tr("Fog")}</h3><Checkbox value={value.fog.enabled} label={tr("Enable distance fog")} onChange={v=>set('fog.enabled',v,'commit')}/>
    {value.fog.enabled&&<>
      <Field label={tr("Fog color")}><Color01Input value={value.fog.color} onChange={(v,p)=>set('fog.color',v,p)}/></Field>
      <Field label={tr("Start distance")}><NumInput value={value.fog.start} min={0} max={4000} step={1} onChange={(v,p)=>set('fog.start',v,p)}/></Field>
      <Field label={tr("End distance")}><NumInput value={value.fog.end} min={value.fog.start+.1} max={10000} step={1} onChange={(v,p)=>set('fog.end',v,p)}/></Field>
      <p className="a-dim">{tr("Fog follows the game camera. Static OBJ surfaces use one extra draw, with no extra texture VRAM.")}</p>
    </>}
    <h3>{tr("Fake reflections")}</h3>
    <Field label={tr("Sky preset")}><Select value={reflectionPreset} onChange={setReflectionPreset} options={[{value:'coastal',label:tr("Coastal blue")},{value:'sunset',label:tr("Warm sunset")},{value:'night',label:tr("Moonlit blue")}]}/></Field>
    <Field label={tr("Strength")}><NumInput value={reflectionStrength} min={0} max={1} step={.05} onChange={setReflectionStrength}/></Field>
    <button className="a-btn" disabled={!reflective.length} onClick={()=>onReflect(reflective.map(o=>o.id),reflectionPreset,reflectionStrength)}>{tr("Apply to selected surfaces")}</button>
    <p className="a-dim">{tr("Select surfaces in Objects. A shared 128 px, 4-bit map costs about 8 KB. Uses the camera direction; suitable for water and glossy buildings.")}</p>
    <h3>{tr("Mass Vertex Coloring")}</h3><p className="a-dim">{tr("Color recesses, midtones and exposed surfaces across static objects. Contact shading is calculated when you apply it.")}</p>
    {['recess','mid','highlight'].map(key=><Section key={key} title={{recess:'Recesses',mid:'Midtones',highlight:'Highlights'}[key]} open={open[key]} onToggle={()=>setOpen(s=>({...s,[key]:!s[key]}))}>
      <Field label={tr("Color")}><Color01Input value={value[key].color} onChange={(v,p)=>set(key+'.color',v,p)}/></Field>
      <Field label={tr("Strength")}><NumInput value={value[key].strength} min={0} max={1} step={.05} onChange={(v,p)=>set(key+'.strength',v,p)}/></Field>
    </Section>)}
    <Field label={tr("Contact radius")}><NumInput value={value.radius} min={.01} max={100} step={.1} onChange={(v,p)=>set('radius',v,p)}/></Field>
    <Checkbox value={value.lighting} label={tr("Bake Sun lighting into colors")} onChange={v=>set('lighting',v,'commit')}/>
    <p className="a-dim">{value.lighting?tr("Sun lighting is captured when you apply. Reapply after changing the Sun."):tr("The Sun stays live. Only contact shading and these tints are baked.")}</p>
    <Field label={tr("Baking quality")}><Select value={value.quality} options={[{value:'draft',label:tr("Draft · fastest")},{value:'balanced',label:tr("Balanced")},{value:'high',label:tr("High · finer contact shading")}]} onChange={v=>set('quality',v,'commit')}/></Field>
    <p className="a-dim">{models.length} {tr("static OBJ models. Uses vertex colors and keeps existing textures; no extra texture VRAM.")}</p>
    <div className="a-toolbar"><button className="a-btn a-btn--primary" disabled={busy||!models.length} onClick={bake}>{busy?'Applying '+Math.round(progress*100)+'%':tr("Apply to static objects")}</button>
      {busy?<button className="a-btn" onClick={()=>controller.current?.abort()}>{tr("Cancel")}</button>:<button className="a-btn" disabled={!models.some(o=>o._environmentBake)} onClick={()=>onEdit(sc=>walk(sc.objects,o=>{if(o._environmentBake){o.components.model=deepClone(o._environmentBake.model);delete o._environmentBake;}}))}>{tr("Restore original colors")}</button>}
    </div>{error&&<p className="a-error" role="alert">{error}</p>}
  </div></>;
}
