// ═══════════════════════════════════════════════════════════════════════
//  INSPECTOR — object header, component stack, multi-select editing
// ═══════════════════════════════════════════════════════════════════════

function Inspector({
  scene,
  project,
  selection,
  activeObject,
  selectedUI,
  selectedAsset,
  timelineSelection,
  onEditClip,
  onSelectClip,
  problems,
  files,
  onUpdateComponent,
  onAddComponent,
  onRemoveComponent,
  onResetComponent,
  onRenameObject,
  onSetFlag,
  onUpdateUI,
  onImportFont,
  onDeleteUI,
  showAdvanced,
  onUseAsset,
  onEditTerrain,
  onEditScene,
  onMoveAsset,
  onReimportAsset,
  onDeleteAsset,
}) {
  const [openSections, setOpenSections] = useState({});
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const selectionKey = timelineSelection?.clipId || selectedAsset?.id || selectedUI?.id || activeObject?.id || selection.map(o => o.id).join(":");

  useEffect(() => {
    setFilter("");
    setAdding(false);
  }, [selectionKey]);

  const toggle = (k) => setOpenSections((s) => ({ ...s, [k]: s[k] === false }));
  const isOpen = (k) => openSections[k] !== false;

  if(timelineSelection && (scene.sequences||[]).some(s=>s.id===timelineSelection.sequenceId&&s.tracks.some(t=>t.id===timelineSelection.trackId&&t.clips.some(c=>c.id===timelineSelection.clipId))))return <TimelineClipProperties scene={scene} files={files} selection={timelineSelection} onEdit={onEditClip} onSelect={onSelectClip}/>;
  if (selectedAsset) {
    return <AssetInspector key={selectedAsset.id || selectedAsset.name} asset={selectedAsset} onUse={onUseAsset}
      usage={assetUsage(project,selectedAsset)} folders={assetFolderTree(files,project.assetFolders)} onMove={onMoveAsset} onReimport={onReimportAsset} onDelete={onDeleteAsset}/>;
  }
  if (selectedUI) {
    return (
      <UIElementInspector
        key={selectedUI.id}
        el={selectedUI}
        files={files}
        onUpdate={onUpdateUI}
        onImportFont={onImportFont}
        onDelete={onDeleteUI}
      />
    );
  }

  if (selection.length > 1) {
    return (
      <MultiInspector
        scene={scene}
        project={project}
        selection={selection}
        files={files}
        problems={problems}
        showAdvanced={showAdvanced}
        onUpdateComponent={onUpdateComponent}
        onAddComponent={onAddComponent}
      />
    );
  }

  const obj = activeObject;
  if (!obj) {
    return (
      <>
        <PanelHeader title={tr("Properties")} />
        <Empty>{tr("Select an object in the scene.")}</Empty>
      </>
    );
  }

  const objProblems = (problems || []).filter((p) => p.objectId === obj.id);
  const issuesFor = (key) =>
    objProblems.filter((p) => p.component === key).map((p) => ({
      level: p.level,
      msg: p.message,
      field: p.field,
    }));

  const keys = COMPONENT_KEYS.filter((k) => obj.components?.[k]);
  // A query must never keep filtering after its control disappears.
  const canFilter = keys.length > 4;
  const query = canFilter ? filter.trim() : "";
  const shown = query
    ? keys.filter((k) =>
      issuesFor(k).some(i => i.level === "error") ||
      fuzzyScore(query, tr(COMPONENTS[k].label)) > 0 ||
      (COMPONENTS[k].fields || []).some((f) => fuzzyScore(query, tr(f.label)) > 0)
    )
    : keys;

  return (
    <>
      <PanelHeader title={tr("Properties")} />

      <div className="a-scroll" key={obj.id}>
        {/* header */}
        <div
          style={{
            padding: "8px",
            borderBottom: "1px solid var(--line)",
            background: "var(--bg-2)",
          }}
        >
          <Field label={tr("Name")}>
            <TextInput
              key={obj.id}
              value={obj.name}
              onChange={(v) => onRenameObject(obj.id, v)}
            />
          </Field>
          {obj._prefabId && (
            <p className="a-dim">
              {project.prefabs.find(p=>p._pid===obj._prefabId)?._variantParentId?tr("Prefab variant"):tr("Linked prefab")} · {project.prefabs.find(p=>p._pid===obj._prefabId)?.name} {tr("· update or revert from Edit → Prefabs")}</p>
          )}
          {obj._lightingBake && (
            <p className="a-dim">{tr("Baked lighting · restore from Tools")}</p>
          )}
          {obj._terrain && onEditTerrain && <button className="a-btn a-btn--primary a-btn--wide" onClick={onEditTerrain}>{tr("Edit terrain")}</button>}
          <details className="a-disclosure">
            <summary>{tr("Object options")}</summary>
            <div className="a-row" style={{ gap: 12, fontSize: 10.5 }}>
              <Checkbox
                value={obj.exportEnabled !== false}
                onChange={(v) => onSetFlag(obj.id, "exportEnabled", v)}
                label={tr("Export")}
              />
              <Checkbox
                value={obj.ctxEnabled !== false}
                onChange={(v) => onSetFlag(obj.id, "ctxEnabled", v)}
                label={tr("Available to scripts")}
              />
            </div>
          </details>
        </div>

        {objProblems.some(p => !p.component) && <div style={{ padding: "0 12px" }}>
          <ComponentIssues issues={objProblems.filter(p => !p.component).map(p => ({ level: p.level, msg: p.message }))} />
        </div>}

        {canFilter && (
          <div
            style={{
              padding: "5px 6px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <input
              className="a-input"
              aria-label={tr("Find a property")}
              placeholder={tr("Filter properties…")}
              value={filter}
              onChange={(e) => setFilter(e.target.value)}
            />
          </div>
        )}

        {shown.map((key) => {
          const def = COMPONENTS[key];
          const issues = issuesFor(key);
          const worst = issues.find((i) => i.level === "error")
            ? "err"
            : issues.length
            ? "warn"
            : null;
          return (
            <Section
              key={key}
              title={tr(def.label)}
              icon={<EditorIcon name={COMPONENT_ICONS[key]} size={23}/>}
              color={def.color}
              open={!!query || worst === "err" || isOpen(key)}
              onToggle={() => toggle(key)}
              actions={
                <>
                  {worst && (
                    <span style={{ color: `var(--${worst})`, fontSize: 10 }}>
                      {LEVEL_ICON[worst === "err" ? "error" : "warn"]}
                    </span>
                  )}
                  {!def.required && (
                    <button
                      className="a-btn a-btn--icon a-btn--sm a-btn--ghost a-btn--danger"
                      title={`${tr("Remove")} ${tr(def.label)}`}
                      aria-label={`${tr("Remove")} ${tr(def.label)}`}
                      onClick={() => onRemoveComponent(obj.id, key)}
                    >
                      ✕
                    </button>
                  )}
                  {onResetComponent&&['transform','light','camera','rigidbody'].includes(key)&&<button className="a-btn a-btn--icon a-btn--sm a-btn--ghost" title={`${tr("Reset")} ${tr(def.label)}`} aria-label={`${tr("Reset")} ${tr(def.label)}`} onClick={()=>onResetComponent(obj.id,key)}>↺</button>}
                </>
              }
            >
              <ComponentFields
                compKey={key}
                comp={obj.components[key]}
                obj={obj}
                scene={scene}
                project={project}
                files={files}
                onOpenScript={name => { const file = files.find(f => f.cat === "scripts" && f.name === name); if (file) onUseAsset?.(file); }}
                issues={issues}
                alwaysAdvanced={showAdvanced || !!query}
                onChange={(field, value, phase) =>
                  onUpdateComponent(obj.id, key, field, value, phase)}
              />
              <ComponentIssues issues={issues} />
            </Section>
          );
        })}

        {shown.length === 0 && query && (
          <Empty>{tr("No property matches “")}{query}”.</Empty>
        )}

        <div style={{ padding: 8 }}>
          <button className="a-btn a-btn--wide" onClick={() => setAdding(true)}>
            <EditorIcon name="plus" size={19}/>{tr("Add component")}</button>
        </div>
      </div>

      {adding && (
        <AddComponentMenu
          obj={obj}
          onAdd={(k) => onAddComponent(obj.id, k)}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}

/** Edits every selected object at once, for fields they have in common. */
function MultiInspector(
  { scene, project, selection, files, onUpdateComponent, onAddComponent, showAdvanced, problems },
) {
  const shared = COMPONENT_KEYS.filter((k) =>
    selection.every((o) => o.components?.[k])
  );
  const [adding, setAdding] = useState(false);
  const [openSections, setOpenSections] = useState({});

  return (
    <>
      <PanelHeader title={`${selection.length} objects selected`} />
      <div className="a-scroll">
        <div
          style={{
            padding: 8,
            borderBottom: "1px solid var(--line)",
            background: "var(--bg-2)",
          }}
        >
          <div className="a-dim" style={{ fontSize: 11, lineHeight: 1.5 }}>
            {tr("Changes apply to all selected objects.")}</div>
        </div>

        {shared.length === 0 && (
          <Empty>{tr("These objects share no components.")}</Empty>
        )}

        {shared.map((key) => {
          const def = COMPONENTS[key];
          const first = selection[0].components[key];
          const mixedFields = (def.fields || []).filter(f =>
            selection.some(o => JSON.stringify(readPath(o.components[key], f.key)) !== JSON.stringify(readPath(first, f.key)))
          ).map(f => f.key);
          const issues = (problems || []).filter(p => p.component === key && selection.some(o => o.id === p.objectId))
            .map(p => ({ level: p.level, msg: `${p.objectName || "Object"}: ${p.message}`, field: p.field }));
          return (
            <Section
              key={key}
              title={tr(def.label)}
              icon={def.icon}
              color={def.color}
              open={issues.some(i => i.level === "error") || openSections[key] !== false}
              onToggle={() => setOpenSections(s => ({ ...s, [key]: s[key] === false }))}
            >
              <ComponentFields
                compKey={key}
                comp={first}
                obj={selection[0]}
                scene={scene}
                project={project}
                files={files}
                alwaysAdvanced={showAdvanced}
                mixedFields={mixedFields}
                issues={issues}
                onChange={(field, value, phase, axes) => {
                  const fieldDef = def.fields.find(f => f.key === field);
                  const vector = fieldDef && ["vec3", "vec2xz"].includes(fieldDef.type);
                  const previous = readPath(first, field);
                  const changedAxes = vector && value && typeof value === "object"
                    ? axes || Object.keys(value).filter(axis => value[axis] !== previous?.[axis])
                    : null;
                  return Promise.all(selection.map(o => {
                    // An X edit must not replace another object's Y and Z
                    // with the first object's values.
                    const next = changedAxes
                      ? { ...readPath(o.components[key], field), ...Object.fromEntries(changedAxes.map(axis => [axis, value[axis]])) }
                      : value;
                    return onUpdateComponent(o.id, key, field, next, phase);
                  }));
                }}
              />
              <ComponentIssues issues={issues} />
            </Section>
          );
        })}

        <div style={{ padding: 8 }}>
          <button className="a-btn a-btn--wide" onClick={() => setAdding(true)}>
            {tr("Add component to all")}</button>
        </div>
      </div>

      {adding && (
        <AddComponentMenu
          obj={{ components: Object.fromEntries(shared.map(k => [k, true])), id: null }}
          onAdd={(k) => {
            for (const o of selection) onAddComponent(o.id, k);
          }}
          onClose={() => setAdding(false)}
        />
      )}
    </>
  );
}

/** Read-only details for a file picked in the Navigator. */
function AssetInspector({ asset, onUse, usage = [], folders = [], onMove, onReimport, onDelete }) {
  const input = useRef(null), [busy,setBusy] = useState(false), [error,setError] = useState(''), [confirmDelete,setConfirmDelete] = useState(false);
  const reimport = async file => {
    if (!file || busy) return;
    setBusy(true);setError('');
    try {await onReimport(asset,file);} catch(e) {setError(e.message);} finally {setBusy(false);if(input.current)input.current.value='';}
  };
  return (
    <>
      <PanelHeader title={tr("Asset")} />
      <div className="a-scroll" style={{ padding: 9 }}>
        <div
          style={{
            fontWeight: 700,
            color: "var(--fg-strong)",
            marginBottom: 8,
            wordBreak: "break-all",
          }}
        >
          {asset.name}
        </div>
        {asset.cat === "textures" && asset.dataUrl && (
          <img
            src={asset.dataUrl}
            alt=""
            style={{
              width: "100%",
              borderRadius: "var(--radius)",
              border: "1px solid var(--line)",
              imageRendering: "pixelated",
              background: "var(--bg-0)",
              marginBottom: 9,
            }}
          />
        )}
        {onUse && ["models", "textures", "scripts"].includes(asset.cat) && (
          <button
            className="a-btn a-btn--primary a-btn--wide"
            disabled={!!asset.error}
            onClick={() => onUse(asset)}
          >
            {asset.cat === "models"
              ? tr("Add to scene")
              : asset.cat === "scripts"
              ? tr("Edit script")
              : tr("Texture tools…")}
          </button>
        )}
        {asset.error && <div className="a-field__err" role="alert">{asset.error}</div>}
        {onMove && <Field label={tr("Library folder")}><select aria-label={tr("Asset library folder")} className="a-select" value={assetLibraryFolder(asset)} onChange={e=>onMove(asset,e.target.value)}>
          {[...new Set([assetLibraryFolder(asset),ASSET_CATEGORY_LABELS[asset.cat],...folders.map(f=>f.path).filter(path=>path.split('/')[0]===ASSET_CATEGORY_LABELS[asset.cat])])].map(path=><option key={path} value={path}>{path}</option>)}
        </select></Field>}
        {onReimport && <><input ref={input} hidden type="file" accept={'.'+asset.name.split('.').at(-1)} onChange={e=>reimport(e.target.files?.[0])}/>
          <button className="a-btn a-btn--wide" disabled={busy} onClick={()=>input.current?.click()}>{busy?tr("Reimporting…"):tr("Reimport…")}</button>
          <p className="a-dim">{tr("Replaces the file contents and keeps all assignments.")}</p></>}
        {error&&<p className="a-error" role="alert">{error}</p>}
        <details className="a-disclosure"><summary>{tr("Used by (")}{usage.length})</summary>{usage.length?usage.map((ref,i)=><p key={i}>{ref.label}</p>):<p className="a-dim">{tr("No references in this project.")}</p>}</details>
        {onDelete&&<button className="a-btn a-btn--danger a-btn--wide" disabled={busy} onClick={()=>setConfirmDelete(true)}>{tr("Remove asset…")}</button>}
        <details className="a-disclosure">
          <summary>{tr("File details")}</summary>
          <Field label={tr("Type")}>
            <div className="a-dim">{{ models: "Model", textures: "Image", scripts: "Script", sounds: "Audio", fonts: "Font" }[asset.cat] || asset.cat}</div>
          </Field>
          <Field label={tr("Size")}><div className="a-dim">{fmtBytes(asset.size)}</div></Field>
          <Field label={tr("Folder")}><div className="a-mono a-dim">{asset.folder || "—"}</div></Field>
          {asset.bounds && <Field label={tr("Dimensions")}>
            <div className="a-mono a-dim">
              {["x", "y", "z"].map((a) => asset.bounds.size[a].toFixed(2)).join(
                " x ",
              )}
            </div>
          </Field>}
        </details>
        {asset.cat === "scripts" && asset.content && (
          <details className="a-disclosure">
            <summary>{tr("Preview script")}</summary>
            <pre
              className="a-code"
              style={{ maxHeight: 300 }}
            >{asset.content.slice(0, 4000)}</pre>
          </details>
        )}
      </div>
      {confirmDelete&&<Modal title={`Remove ${asset.name}?`} onClose={()=>setConfirmDelete(false)} footer={<><button className="a-btn" onClick={()=>setConfirmDelete(false)}>{tr("Cancel")}</button><button className="a-btn a-btn--danger" onClick={()=>{onDelete(asset);setConfirmDelete(false);}}>{tr("Remove asset")}</button></>}>
        {usage.length?<><p role="alert">{tr("This asset is used in ")}{usage.length} {tr("places. Removing it leaves these references missing:")}</p><div className="a-asset-usage">{usage.map((ref,i)=><p key={i}>{ref.label}</p>)}</div></>:<p>{tr("This asset has no references in the project.")}</p>}
        <p>{tr("You can undo removal. Files on disk are kept.")}</p>
      </Modal>}
    </>
  );
}
