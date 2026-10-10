function GameCameraOptions({scene,onUpdate,onEditCamera}) {
  const ref=useRef(null), [open,setOpen]=useState(false), camera=resolveSceneCamera(scene).obj;
  const dialog=open && <Modal title={tr("Game camera")} onClose={()=>setOpen(false)}>
    <div className="cin-camera-settings">
      <Field label={tr("Orbit with gamepad")}><Checkbox value={scene.defaultCameraRig!==false} onChange={value=>onUpdate('defaultCameraRig',value)}/></Field>
      {camera && <button className="a-btn" onClick={()=>{setOpen(false);onEditCamera?.(camera.id);}}>{tr("Edit ")}{camera.name} {tr("in Properties")}</button>}
      <div className="a-sec__group">{camera?tr("Fallback camera"):tr("Scene camera")}</div>
      <Field label={tr("Field of view")}><NumInput value={scene.camera.fov} min={1} max={179} step={1} onChange={(value,phase)=>onUpdate('camera.fov',value,phase)}/></Field>
      <Field label={tr("Near")}><NumInput value={scene.camera.near} min={.01} step={.1} onChange={(value,phase)=>onUpdate('camera.near',value,phase)}/></Field>
      <Field label={tr("Far")}><NumInput value={scene.camera.far} min={1} step={10} onChange={(value,phase)=>onUpdate('camera.far',value,phase)}/></Field>
    </div>
    </Modal>;
  return <div className="cin-camera-options" ref={ref}>
    <button className="a-btn a-btn--ghost a-btn--sm" aria-label={tr("Game camera settings")} onClick={()=>setOpen(true)}><EditorIcon name="camera" size={17}/> {tr("Camera settings")}</button>
    {dialog && ref.current ? ReactDOM.createPortal(dialog,ref.current.ownerDocument.body) : dialog}
  </div>;
}

function SceneTools(
  { prefs, gizmoMode, onMode, onPref, hasSelection, onAdd, onFrame, onSceneSettings },
) {
  const ref = useRef(null);
  useDetailsPopovers(ref, ".a-view-options");
  return (
    <div className="a-scene-tools" ref={ref}>
      <div className="a-transform-tools" role="group" aria-label={tr("Scene tools")}>
      {[["select", "Select", "Q", "select"], ["translate", "Move", "W", "move"], ["rotate", "Rotate", "E", "rotate"], ["scale", "Scale", "R", "scale"]].map(([mode, label, key, icon]) => {
        const shortcut=Object.hasOwn(prefs.hotkeys||{},`gizmo.${mode}`)?prefs.hotkeys[`gizmo.${mode}`]:key;
        return (
        <button
          key={mode}
          className={`a-btn a-btn--sm ${
            gizmoMode === mode ? "a-btn--on" : "a-btn--ghost"
          }`}
          title={`${tr(label)}${shortcut?` (${shortcut})`:''}`}
          aria-label={tr(label)}
          aria-pressed={gizmoMode === mode}
          disabled={mode!=='select'&&!hasSelection}
          onClick={() => onMode(mode)}
        >
          <EditorIcon name={icon} size={22}/>
        </button>
      );})}
      </div>
      <label className="a-gizmo-space"><EditorIcon name="globe" size={20}/><select className="a-select" aria-label={tr("Transform space")} value={prefs.gizmoSpace} onChange={e=>onPref({gizmoSpace:e.target.value})}><option value="world">{tr("Global")}</option><option value="local">{tr("Local")}</option></select></label>
      <span className="a-grow" />
      <select className="a-select" aria-label={tr("Scene view angle")} title={tr("Scene view angle")} value={prefs.viewportFov ?? 100} onChange={e=>onPref({viewportFov:Number(e.target.value)})}>
        <option value="60">{tr("60° · Standard")}</option><option value="90">{tr("90° · Wide")}</option><option value="100">{tr("100° · Panoramic")}</option><option value="120">{tr("120° · Ultra wide")}</option>
      </select>
      <button className={`a-btn a-btn--sm ${prefs.shaded?'a-btn--on':'a-btn--ghost'}`} aria-label={tr("Preview lighting")} title={tr("Preview lighting")} aria-pressed={prefs.shaded} onClick={()=>onPref({shaded:!prefs.shaded})}><EditorIcon name="sun" size={21}/></button>
      <button className={`a-btn a-btn--sm ${prefs.showOverlays?'a-btn--on':'a-btn--ghost'}`} aria-label={tr("Component guides")} title={tr("Component guides")} aria-pressed={prefs.showOverlays} onClick={()=>onPref({showOverlays:!prefs.showOverlays})}><EditorIcon name="grid" size={21}/></button>
      <button className="a-btn a-btn--ghost a-btn--sm" onClick={onFrame} aria-label={hasSelection?tr("Focus selection"):tr("Show whole scene")} title={hasSelection?tr("Focus selection"):tr("Show whole scene")}><EditorIcon name="focus" size={21}/></button>
      <button className="a-btn a-btn--ghost a-btn--sm" onClick={onAdd} aria-label={tr("Add object")} title={tr("Add object")}><EditorIcon name="plus" size={21}/></button>
      <details className="a-view-options">
        <summary aria-label={tr("Scene options")} title={tr("Scene options")}><EditorIcon name="more" size={21}/></summary>
        <div className="a-view-options__pop">
          <button className="a-btn a-btn--ghost" onClick={(e) => { e.currentTarget.closest("details").open = false; onSceneSettings(); }}>{tr("Edit world…")}</button>
          {hasSelection && <>
          <label>
            <input
              type="checkbox"
              checked={prefs.snap}
              onChange={(e) => onPref({ snap: e.target.checked })}
            />{" "}
            {tr("Grid snap")}</label>
          {prefs.snap && (
            <input
              aria-label={tr("Snap step")}
              className="a-input"
              type="number"
              min=".01"
              step=".1"
              value={prefs.snapSize}
              onChange={(e) =>
                onPref({ snapSize: Math.max(.01, Number(e.target.value)) })}
            />
          )}
          </>}
          <label>
            <input
              type="checkbox"
              checked={prefs.showOverlays}
              onChange={(e) => onPref({ showOverlays: e.target.checked })}
            />{" "}
            {tr("Component guides")}</label>
          <label>
            <input
              type="checkbox"
              checked={prefs.shaded}
              onChange={(e) => onPref({ shaded: e.target.checked })}
            />{" "}
            {tr("Preview lighting")}</label>
        </div>
      </details>
    </div>
  );
}
