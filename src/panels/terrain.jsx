function TerrainWorkspace({ scene, object, files, onCreate, onApply, onSelect, atlasName, mouseControls, guidedTool }) {
  const [draft,setDraft]=useState(null), [tool,setTool]=useState({mode:"cliffs",size:1,level:3,strength:.5,surface:0,hillMode:"raise"}),
    [error,setError]=useState(""),[busy,setBusy]=useState(false),[width,setWidth]=useState(32),[depth,setDepth]=useState(32);
  const stroke=useRef(null), draftRef=useRef(null), frame=useRef(null), generation=useRef(0),publishFrame=useRef(0);
  const terrains=allObjects(scene.objects).filter(o=>o._terrain && o.components.model);
  useEffect(()=>{if(guidedTool)setTool(value=>({...value,mode:guidedTool,size:9,hillMode:'raise'}));},[guidedTool]);
  useEffect(()=>{
    generation.current++;stroke.current=null;
    draftRef.current=object?._terrain||null;setDraft(draftRef.current);setError("");setBusy(false);
  },[object?.id,object?._terrain,scene.id]);
  useEffect(()=>()=>{generation.current++;cancelAnimationFrame(publishFrame.current);},[]);
  const data=draft||object?._terrain;
  const paint=(point,phase,reverse)=>{
    if(phase==="cancel") {stroke.current=null;draftRef.current=object._terrain;setDraft(object._terrain);return;}
    if(phase==="end") {
      const next=draftRef.current;const before=stroke.current;stroke.current=null;
      if(before && JSON.stringify(before)!==JSON.stringify(next)) {
        try{settings(next);}catch(e){setError(e.message);draftRef.current=object._terrain;setDraft(object._terrain);}
      }
      return;
    }
    if(phase==="start")stroke.current=deepClone(draftRef.current||object._terrain);
    if(!stroke.current)return;
    try{
      const next=terrainBrush(draftRef.current||object._terrain,point,{...tool,reverse});
      draftRef.current=next;if(!publishFrame.current)publishFrame.current=requestAnimationFrame(()=>{publishFrame.current=0;setDraft(draftRef.current);});
    }catch(e){setError(e.message);}
  };
  const settings=async next=>{
    const token=++generation.current,id=object.id;
    setBusy(true);setError("");
    try {
      const filename=atlasName;
      const [atlas,prepared]=await Promise.all([terrainAtlasAsset(next,files,filename),prepareTerrainPreview(next,object.name)]);
      if(token!==generation.current)return;
      onApply(id,next,atlas,prepared);
    }catch(e){if(token===generation.current)setError(e.message);}
    finally{if(token===generation.current)setBusy(false);}
  };
  const mode=value=>setTool(t=>({...t,mode:value,size:value==="hills"?6:1}));
  const renderedScene=useMemo(()=>{
    if(!data||!object?._terrain)return scene;
    const sc={...scene,environment:{...scene.environment,fog:{...scene.environment?.fog,enabled:false}},background:scene.skybox?.enabled?scene.background:{r:83,g:125,b:192},objects:scene.objects};
    const attach=objects=>objects.map(o=>o.id===object.id?{...o,_terrainPreview:data}:o.children?.length?{...o,children:attach(o.children)}:o);sc.objects=attach(scene.objects);
    return sc;
  },[scene,data,object?.id]);
  useEffect(()=>{frame.current?.("selection");},[object?.id]);
  if(!object?._terrain || !object.components.model) return <div className="a-terrain-empty">
    <div className="a-terrain-empty__icon">▱</div><h2>{tr("Create terrain")}</h2>
    <p>{tr("Paint cliffs. Sculpt hills. Make it yours.")}</p>
    {terrains.length>0&&<select className="a-select" aria-label={tr("Choose terrain")} value="" onChange={e=>onSelect(e.target.value)}>
      <option value="">{tr("Edit an existing terrain…")}</option>{terrains.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
    </select>}
    <button data-tour="create-terrain" className="a-btn a-btn--primary" disabled={busy} onClick={async()=>{
      setBusy(true);setError("");try{await onCreate(width,depth);}catch(e){setError(e.message);setBusy(false);}
    }}>{busy?tr("Creating…"):tr("Create terrain")}</button>
    <details className="a-disclosure"><summary>{tr("Terrain size")}</summary>
      <label>{tr("Width ")}<input className="a-input" type="number" aria-label={tr("Terrain width")} min="4" max="64" value={width} onChange={e=>setWidth(e.target.value)}/></label>
      <label>{tr("Depth ")}<input className="a-input" type="number" aria-label={tr("Terrain depth")} min="4" max="64" value={depth} onChange={e=>setDepth(e.target.value)}/></label>
    </details>{error&&<p className="a-error" role="alert">{error}</p>}
  </div>;
  return <div className="a-terrain-workspace">
    <div className="a-terrain-toolbar" role="toolbar" aria-label={tr("Terrain tools")}>
      <strong>{object.name}</strong>
      <div className="a-terrain-modes">{[["cliffs","Cliffs"],["hills","Hills"],["paint","Paint"]].map(([id,label])=>
        <button data-tour={'terrain-'+id} key={id} className={`a-btn ${tool.mode===id?"a-btn--primary":""}`} aria-pressed={tool.mode===id} onClick={()=>mode(id)}>{label}</button>)}</div>
      {tool.mode==="cliffs"&&<label>{tr("Height ")}<input className="a-input" type="number" aria-label={tr("Cliff level")} min="0" max="16" value={tool.level} onChange={e=>setTool({...tool,level:Number(e.target.value)})}/></label>}
      {tool.mode==="hills"&&<select className="a-select" aria-label={tr("Hill tool")} value={tool.hillMode} onChange={e=>setTool({...tool,hillMode:e.target.value})}>
        <option value="raise">{tr("Raise / lower")}</option><option value="smooth">{tr("Smooth")}</option><option value="flatten">{tr("Flatten hills")}</option></select>}
      {tool.mode==="paint"&&<select className="a-select" aria-label={tr("Terrain surface")} value={tool.surface} onChange={e=>setTool({...tool,surface:Number(e.target.value)})}>
        <option value="0">{tr("Grass")}</option><option value="1">{tr("Dirt")}</option><option value="2">{tr("Stone")}</option></select>}
      <label><input type="checkbox" aria-label={tr("Blend terrain textures")} checked={!!data.blend} disabled={busy} onChange={e=>settings({...data,blend:e.target.checked})}/>{tr("Smooth texture transitions")}</label>
      {data.blend&&<><label>{tr("Texture ")}<select className="a-select" aria-label={tr("Blended terrain resolution")} value={data.blendSize||512} disabled={busy} onChange={e=>settings({...data,blendSize:+e.target.value})}>{[256,512,1024].map(size=><option key={size} value={size}>{size} × {size}</option>)}</select></label>
      <label>{tr("Colors ")}<select className="a-select" aria-label={tr("Blended terrain bit depth")} value={data.blendBits||8} disabled={busy} onChange={e=>settings({...data,blendBits:+e.target.value})}><option value="4">{tr("4 bits")}</option><option value="8">{tr("8 bits")}</option></select></label></>}
      <span className="a-dim" role="status" aria-label={tr("Terrain texture memory")}>{(()=>{const size=data.blend?data.blendSize||512:256,bits=data.blend?data.blendBits||8:8;return `${size} × ${size} · ${bits===4?16:256} colors · ${fmtBytes(gsSurfaceBytes(size,size,`T${bits}`)+(bits===4?256:1024))} VRAM`;})()}</span>
      <label className="a-terrain-size">{tr("Brush ")}<input type="range" aria-label={tr("Terrain brush size")} min="1" max="16" step="1" value={tool.size} onChange={e=>setTool({...tool,size:Number(e.target.value)})}/><span>{tool.size}</span></label>
      <details className="a-terrain-options a-disclosure"><summary>{tr("Settings")}</summary><div className="a-terrain-settings">
        <label>{tr("Brush strength ")}<input type="range" aria-label={tr("Hill strength")} min=".05" max="1" step=".05" value={tool.strength} onChange={e=>setTool({...tool,strength:Number(e.target.value)})}/></label>
        <label>{tr("Cliff softness ")}<NumInput value={data.bevel} min={.02} max={.45} step={.01} onChange={(v,phase)=>{if(phase==="commit")onApply(object.id,{...data,bevel:v});}}/></label>
        <label>{tr("Tile size ")}<NumInput value={data.cellSize} min={.1} max={100} step={.5} onChange={(v,phase)=>{if(phase==="commit")onApply(object.id,{...data,cellSize:v});}}/></label>
        <label>{tr("Level height ")}<NumInput value={data.stepHeight} min={.1} max={100} step={.25} onChange={(v,phase)=>{if(phase==="commit")onApply(object.id,{...data,stepHeight:v});}}/></label>
        <div className="a-terrain-textures">{["Grass","Dirt","Stone","Cliffs"].map((label,i)=><label key={label}>{tr(label)}<select className="a-select" aria-label={`${label} terrain texture`} disabled={busy} value={data.textures?.[i]||""} onChange={e=>{
          const next=deepClone(data);next.textures||=["","","",""];next.textures[i]=e.target.value;settings(next);
        }}><option value="">{tr("Built-in")}</option>{files.filter(f=>f.cat==="textures"&&f.dataUrl&&f.editKind!=="terrain").map(f=><option key={f.id} value={f.name}>{f.name}</option>)}</select></label>)}</div>
        <span className="a-dim">{data.width} × {data.depth} {tr("tiles · Changes are saved with your project.")}</span>
      </div></details>
    </div>
    {error&&<p className="a-error" role="alert">{error}</p>}
    <div className="a-terrain-stage"><Viewport scene={renderedScene} files={files} selectedIds={[object.id]} activeId={object.id}
      onSelect={()=>{}} onTransform={()=>{}} gizmoMode="translate" gizmoSpace="world" showOverlays={false} shaded={true} mouseControls={mouseControls}
      onFrameRequest={frame} terrainTool={{...tool,objectId:object.id,cellSize:data.cellSize,disabled:busy}}
      onTerrainStroke={paint}/></div>
    <div className="a-terrain-help">{tool.mode==="cliffs"?tr("Drag to paint this height. Shift erases."):tool.mode==="hills"?tr("Drag to sculpt. Shift lowers."):tr("Drag to paint the ground. Shift restores grass.")}
      <span>{tr("Alt + drag to orbit · Scroll to zoom · Arrow keys + Enter to paint precisely")}</span></div>
  </div>;
}
