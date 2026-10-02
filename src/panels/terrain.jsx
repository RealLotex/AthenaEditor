function TerrainWorkspace({ scene, object, files, onCreate, onApply, onSelect, atlasName }) {
  const [draft,setDraft]=useState(null), [tool,setTool]=useState({mode:"cliffs",size:1,level:3,strength:.5,surface:0,hillMode:"raise"}),
    [error,setError]=useState(""),[busy,setBusy]=useState(false),[width,setWidth]=useState(32),[depth,setDepth]=useState(32);
  const stroke=useRef(null), draftRef=useRef(null), frame=useRef(null), generation=useRef(0);
  const terrains=allObjects(scene.objects).filter(o=>o._terrain && o.components.model);
  useEffect(()=>{
    generation.current++;stroke.current=null;
    draftRef.current=object?._terrain||null;setDraft(draftRef.current);setError("");setBusy(false);
  },[object?.id,object?._terrain,scene.id]);
  useEffect(()=>()=>{generation.current++;},[]);
  const data=draft||object?._terrain;
  const paint=(point,phase,reverse)=>{
    if(phase==="cancel") {stroke.current=null;draftRef.current=object._terrain;setDraft(object._terrain);return;}
    if(phase==="end") {
      const next=draftRef.current;const before=stroke.current;stroke.current=null;
      if(before && JSON.stringify(before)!==JSON.stringify(next)) {
        try{onApply(object.id,next);}catch(e){setError(e.message);draftRef.current=object._terrain;setDraft(object._terrain);}
      }
      return;
    }
    if(phase==="start")stroke.current=deepClone(draftRef.current||object._terrain);
    if(!stroke.current)return;
    try{
      const next=terrainBrush(draftRef.current||object._terrain,point,{...tool,reverse});
      draftRef.current=next;setDraft(next);
    }catch(e){setError(e.message);}
  };
  const settings=async next=>{
    const token=++generation.current,id=object.id;
    setBusy(true);setError("");
    try {
      const filename=atlasName;
      const atlas=await terrainAtlasAsset(next,files,filename);
      if(token!==generation.current)return;
      onApply(id,next,atlas);
    }catch(e){if(token===generation.current)setError(e.message);}
    finally{if(token===generation.current)setBusy(false);}
  };
  const mode=value=>setTool(t=>({...t,mode:value,size:value==="hills"?6:1}));
  const renderedScene=useMemo(()=>{
    if(!data||!object?._terrain)return scene;
    const sc={...scene,background:scene.skybox?.enabled?scene.background:{r:83,g:125,b:192},objects:deepClone(scene.objects)};
    const o=findObj(sc.objects,object.id);if(o)o._terrainPreview=data;
    return sc;
  },[scene,data,object?.id]);
  useEffect(()=>{frame.current?.("selection");},[object?.id]);
  if(!object?._terrain || !object.components.model) return <div className="a-terrain-empty">
    <div className="a-terrain-empty__icon">▱</div><h2>Create terrain</h2>
    <p>Paint cliffs. Sculpt hills. Make it yours.</p>
    {terrains.length>0&&<select className="a-select" aria-label="Choose terrain" value="" onChange={e=>onSelect(e.target.value)}>
      <option value="">Edit an existing terrain…</option>{terrains.map(o=><option key={o.id} value={o.id}>{o.name}</option>)}
    </select>}
    <button className="a-btn a-btn--primary" disabled={busy} onClick={async()=>{
      setBusy(true);setError("");try{await onCreate(width,depth);}catch(e){setError(e.message);setBusy(false);}
    }}>{busy?"Creating…":"Create terrain"}</button>
    <details className="a-disclosure"><summary>Terrain size</summary>
      <label>Width <input className="a-input" type="number" aria-label="Terrain width" min="4" max="64" value={width} onChange={e=>setWidth(e.target.value)}/></label>
      <label>Depth <input className="a-input" type="number" aria-label="Terrain depth" min="4" max="64" value={depth} onChange={e=>setDepth(e.target.value)}/></label>
    </details>{error&&<p className="a-error" role="alert">{error}</p>}
  </div>;
  return <div className="a-terrain-workspace">
    <div className="a-terrain-toolbar" role="toolbar" aria-label="Terrain tools">
      <strong>{object.name}</strong>
      <div className="a-terrain-modes">{[["cliffs","Cliffs"],["hills","Hills"],["paint","Paint"]].map(([id,label])=>
        <button key={id} className={`a-btn ${tool.mode===id?"a-btn--primary":""}`} aria-pressed={tool.mode===id} onClick={()=>mode(id)}>{label}</button>)}</div>
      {tool.mode==="cliffs"&&<label>Height <input className="a-input" type="number" aria-label="Cliff level" min="0" max="16" value={tool.level} onChange={e=>setTool({...tool,level:Number(e.target.value)})}/></label>}
      {tool.mode==="hills"&&<select className="a-select" aria-label="Hill tool" value={tool.hillMode} onChange={e=>setTool({...tool,hillMode:e.target.value})}>
        <option value="raise">Raise / lower</option><option value="smooth">Smooth</option><option value="flatten">Flatten hills</option></select>}
      {tool.mode==="paint"&&<select className="a-select" aria-label="Terrain surface" value={tool.surface} onChange={e=>setTool({...tool,surface:Number(e.target.value)})}>
        <option value="0">Grass</option><option value="1">Dirt</option><option value="2">Stone</option></select>}
      <label className="a-terrain-size">Brush <input type="range" aria-label="Terrain brush size" min="1" max="16" step="1" value={tool.size} onChange={e=>setTool({...tool,size:Number(e.target.value)})}/><span>{tool.size}</span></label>
      <details className="a-terrain-options a-disclosure"><summary>Settings</summary><div className="a-terrain-settings">
        <label>Brush strength <input type="range" aria-label="Hill strength" min=".05" max="1" step=".05" value={tool.strength} onChange={e=>setTool({...tool,strength:Number(e.target.value)})}/></label>
        <label>Cliff softness <NumInput value={data.bevel} min={.02} max={.45} step={.01} onChange={(v,phase)=>{if(phase==="commit")onApply(object.id,{...data,bevel:v});}}/></label>
        <label>Tile size <NumInput value={data.cellSize} min={.1} max={100} step={.5} onChange={(v,phase)=>{if(phase==="commit")onApply(object.id,{...data,cellSize:v});}}/></label>
        <label>Level height <NumInput value={data.stepHeight} min={.1} max={100} step={.25} onChange={(v,phase)=>{if(phase==="commit")onApply(object.id,{...data,stepHeight:v});}}/></label>
        <div className="a-terrain-textures">{["Grass","Dirt","Stone","Cliffs"].map((label,i)=><label key={label}>{label}<select className="a-select" aria-label={`${label} terrain texture`} disabled={busy} value={data.textures?.[i]||""} onChange={e=>{
          const next=deepClone(data);next.textures||=["","","",""];next.textures[i]=e.target.value;settings(next);
        }}><option value="">Built-in</option>{files.filter(f=>f.cat==="textures"&&f.dataUrl&&f.editKind!=="terrain").map(f=><option key={f.id} value={f.name}>{f.name}</option>)}</select></label>)}</div>
        <span className="a-dim">{data.width} × {data.depth} tiles · Changes are saved with your project.</span>
      </div></details>
    </div>
    {error&&<p className="a-error" role="alert">{error}</p>}
    <div className="a-terrain-stage"><Viewport scene={renderedScene} files={files} selectedIds={[object.id]} activeId={object.id}
      onSelect={()=>{}} onTransform={()=>{}} gizmoMode="translate" gizmoSpace="world" showOverlays={false} shaded={true}
      onFrameRequest={frame} terrainTool={{...tool,objectId:object.id,cellSize:data.cellSize,disabled:busy}}
      onTerrainStroke={paint}/></div>
    <div className="a-terrain-help">{tool.mode==="cliffs"?"Drag to paint this height. Shift erases.":tool.mode==="hills"?"Drag to sculpt. Shift lowers.":"Drag to paint the ground. Shift restores grass."}
      <span>Alt + drag to orbit · Scroll to zoom · Arrow keys + Enter to paint precisely</span></div>
  </div>;
}
