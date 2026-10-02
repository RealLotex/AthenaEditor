// ═══════════════════════════════════════════════════════════════════════
//  INSPECTOR — object header, component stack, multi-select editing
// ═══════════════════════════════════════════════════════════════════════

function Inspector({
  scene,
  selection,
  activeObject,
  selectedUI,
  selectedAsset,
  problems,
  files,
  onUpdateComponent,
  onAddComponent,
  onRemoveComponent,
  onRenameObject,
  onSetFlag,
  onUpdateUI,
  onImportFont,
  onDeleteUI,
  showAdvanced,
  onUseAsset,
  onEditTerrain,
  onEditScene,
}) {
  const [openSections, setOpenSections] = useState({});
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");
  const selectionKey = selectedAsset?.id || selectedUI?.id || activeObject?.id || selection.map(o => o.id).join(":");

  useEffect(() => {
    setFilter("");
    setAdding(false);
  }, [selectionKey]);

  const toggle = (k) => setOpenSections((s) => ({ ...s, [k]: s[k] === false }));
  const isOpen = (k) => openSections[k] !== false;

  if (selectedAsset) {
    return <AssetInspector key={selectedAsset.id || selectedAsset.name} asset={selectedAsset} onUse={onUseAsset} />;
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
        <PanelHeader title="Properties" />
        <Empty>Select an object in the scene.</Empty>
        {onEditScene && <div style={{ padding: "0 12px" }}>
          <button className="a-btn a-btn--wide" onClick={onEditScene}>Scene settings</button>
        </div>}
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
      fuzzyScore(query, COMPONENTS[k].label) > 0 ||
      (COMPONENTS[k].fields || []).some((f) => fuzzyScore(query, f.label) > 0)
    )
    : keys;

  return (
    <>
      <PanelHeader title="Properties" />

      <div className="a-scroll" key={obj.id}>
        {/* header */}
        <div
          style={{
            padding: "8px",
            borderBottom: "1px solid var(--line)",
            background: "var(--bg-2)",
          }}
        >
          <Field label="Name">
            <TextInput
              key={obj.id}
              value={obj.name}
              onChange={(v) => onRenameObject(obj.id, v)}
            />
          </Field>
          {obj._prefabId && (
            <p className="a-dim">
              Linked prefab · update or revert from Edit → Prefabs
            </p>
          )}
          {obj._lightingBake && (
            <p className="a-dim">Baked lighting · restore from Tools</p>
          )}
          {obj._terrain && onEditTerrain && <button className="a-btn a-btn--primary a-btn--wide" onClick={onEditTerrain}>Edit terrain</button>}
          <details className="a-disclosure">
            <summary>Object options</summary>
            <div className="a-row" style={{ gap: 12, fontSize: 10.5 }}>
              <Checkbox
                value={obj.exportEnabled !== false}
                onChange={(v) => onSetFlag(obj.id, "exportEnabled", v)}
                label="Export"
              />
              <Checkbox
                value={obj.ctxEnabled !== false}
                onChange={(v) => onSetFlag(obj.id, "ctxEnabled", v)}
                label="Available to scripts"
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
              aria-label="Find a property"
              placeholder="Filter properties…"
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
              title={def.label}
              icon={def.icon}
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
                      title={`Remove ${def.label}`}
                      aria-label={`Remove ${def.label}`}
                      onClick={() => onRemoveComponent(obj.id, key)}
                    >
                      ✕
                    </button>
                  )}
                </>
              }
            >
              <ComponentFields
                compKey={key}
                comp={obj.components[key]}
                obj={obj}
                scene={scene}
                files={files}
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
          <Empty>No property matches “{query}”.</Empty>
        )}

        <div style={{ padding: 8 }}>
          <button className="a-btn a-btn--wide" onClick={() => setAdding(true)}>
            Add component
          </button>
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
  { scene, selection, files, onUpdateComponent, onAddComponent, showAdvanced, problems },
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
            Changes apply to all selected objects.
          </div>
        </div>

        {shared.length === 0 && (
          <Empty>These objects share no components.</Empty>
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
              title={def.label}
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
                  for (const o of selection) {
                    // An X edit must not replace another object's Y and Z
                    // with the first object's values.
                    const next = changedAxes
                      ? { ...readPath(o.components[key], field), ...Object.fromEntries(changedAxes.map(axis => [axis, value[axis]])) }
                      : value;
                    onUpdateComponent(o.id, key, field, next, phase);
                  }
                }}
              />
              <ComponentIssues issues={issues} />
            </Section>
          );
        })}

        <div style={{ padding: 8 }}>
          <button className="a-btn a-btn--wide" onClick={() => setAdding(true)}>
            Add component to all
          </button>
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
function AssetInspector({ asset, onUse }) {
  return (
    <>
      <PanelHeader title="Asset" />
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
            onClick={() => onUse(asset)}
          >
            {asset.cat === "models"
              ? "Add to scene"
              : asset.cat === "scripts"
              ? "Edit script"
              : "Texture tools…"}
          </button>
        )}
        {asset.error && <div className="a-field__err" role="alert">{asset.error}</div>}
        <details className="a-disclosure">
          <summary>File details</summary>
          <Field label="Type">
            <div className="a-dim">{{ models: "Model", textures: "Image", scripts: "Script", sounds: "Audio", fonts: "Font" }[asset.cat] || asset.cat}</div>
          </Field>
          <Field label="Size"><div className="a-dim">{fmtBytes(asset.size)}</div></Field>
          <Field label="Folder"><div className="a-mono a-dim">{asset.folder || "—"}</div></Field>
          {asset.bounds && <Field label="Dimensions">
            <div className="a-mono a-dim">
              {["x", "y", "z"].map((a) => asset.bounds.size[a].toFixed(2)).join(
                " x ",
              )}
            </div>
          </Field>}
        </details>
        {asset.cat === "scripts" && asset.content && (
          <details className="a-disclosure">
            <summary>Preview script</summary>
            <pre
              className="a-code"
              style={{ maxHeight: 300 }}
            >{asset.content.slice(0, 4000)}</pre>
          </details>
        )}
      </div>
    </>
  );
}
