function WaterQualityControls({comp,obj,files,onChange,mixedFields=[]}) {
  const [busy,setBusy]=useState(false),pending=useRef(false);
  const quality=normalizedWater(comp).quality,estimate=waterPerformanceEstimate({...obj,components:{...obj.components,water:comp}},files);
  const change=async(field,value,phase)=>{
    if(pending.current)return;
    const result=onChange(field,value,phase);
    if(result?.then){pending.current=true;setBusy(true);try{await result;}finally{pending.current=false;setBusy(false);}}
  };
  const update=(key,value,phase='edit')=>change('quality',{...quality,[key]:value},phase);
  const slider=(key,label,max,output)=><label className="a-skybox__slider" key={key}><span>{tr(label)}<output>{output}</output></span>
    <input type="range" disabled={busy} aria-label={`Water ${label.toLowerCase()}`} min="0" max={max} step="1" value={key==='textureSize'?WATER_TEXTURE_SIZES.indexOf(quality[key]):quality[key]}
      onChange={e=>update(key,key==='textureSize'?WATER_TEXTURE_SIZES[Number(e.target.value)]:Number(e.target.value))}
      onPointerUp={()=>update(key,quality[key],'commit')} onKeyUp={()=>update(key,quality[key],'commit')}/></label>;
  return <div className="a-water-quality"><div className="a-sec__group">{tr("Water quality")}</div>
    <div className="a-row"><button disabled={busy} className="a-btn a-btn--sm" onClick={()=>change('quality',{textureSize:32,transparency:0,panning:0,waves:0,caustics:0,pattern:0},'commit')}>{tr("Ultra low")}</button>
      <button disabled={busy} className="a-btn a-btn--sm" onClick={()=>change('quality',{textureSize:512,transparency:1,panning:4,waves:4,caustics:4,pattern:4},'commit')}>{tr("Maximum")}</button></div>
    {busy&&<p className="a-skybox__hint" role="status">{tr("Preparing texture quality…")}</p>}
    {slider('textureSize','Texture size',4,`${quality.textureSize} × ${quality.textureSize}`)}
    {slider('transparency','Transparency',1,tr(quality.transparency?'Transparent':'Opaque'))}
    {slider('pattern','Pattern animation',4,quality.pattern&&estimate.frames>1?`${[0,4,8,12,16][quality.pattern]} FPS`:tr('Static'))}
    {slider('panning','Texture movement',4,quality.panning?`${tr(WATER_QUALITY_LABELS[quality.panning])} · up to ${WATER_QUALITY_RATES[quality.panning]} Hz`:tr('Off'))}
    {slider('waves','Mesh waves',4,`${quality.waves?tr(WATER_QUALITY_LABELS[quality.waves]):tr('Off')} · ${estimate.triangles} triangles`)}
    {slider('caustics','Caustics',4,quality.caustics?tr(WATER_QUALITY_LABELS[quality.caustics]):tr('Off'))}
    <Field label={tr("Filtering")}><Select disabled={busy} value={comp.textureFilter||obj.components.model?.textureFilter||'LINEAR'} options={[{value:'LINEAR',label:tr("Linear")},{value:'NEAREST',label:tr("Nearest")}]} onChange={v=>change('textureFilter',v,'commit')}/></Field>
    <p className="a-skybox__hint" role="status">{tr("Estimated water cost: ")}{estimate.low.toFixed(estimate.high<.1?2:1)}–{estimate.high.toFixed(estimate.high<.1?2:1)} {tr("ms/frame · ")}{Math.round(estimate.low/16.67*100)}–{Math.round(estimate.high/16.67*100)}{tr("% of a 60 FPS frame.")}</p>
    <p className="a-skybox__hint">{estimate.textureSize} × {estimate.textureSize} · {fmtBytes(estimate.textureBytes)} {tr("per texture · ")}{estimate.frames} {tr("frames · ")}{estimate.triangles+estimate.projectedTriangles} {tr("triangles · ")}{fmtBytes(estimate.cacheBytes)} {tr("animation RAM.")}</p>
    <p className="a-skybox__hint">{tr("Estimate for one visible surface at 640 × 448. Screen coverage, receivers and other objects change the cost. Motion sliders cap quality; the parameters below set the effect.")}</p>
    {mixedFields.includes('quality')&&<p className="a-skybox__hint">{tr("Selected objects have mixed water quality.")}</p>}
  </div>;
}
