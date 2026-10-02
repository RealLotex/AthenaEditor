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
}) {
  const [openSections, setOpenSections] = useState({});
  const [adding, setAdding] = useState(false);
  const [filter, setFilter] = useState("");

  const toggle = (k) => setOpenSections((s) => ({ ...s, [k]: s[k] === false }));
  const isOpen = (k) => openSections[k] !== false;

  if (selectedAsset) {
    return <AssetInspector asset={selectedAsset} onUse={onUseAsset} />;
  }
  if (selectedUI) {
    return (
      <UIElementInspector
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
        <Empty>Select an object to edit it.</Empty>
      </>
    );
  }

  const objProblems = (problems || []).filter((p) => p.objectId === obj.id);
  const issuesFor = (key) =>
    objProblems.filter((p) => p.component === key).map((p) => ({
      level: p.level,
      msg: p.message,
    }));

  const keys = COMPONENT_KEYS.filter((k) => obj.components[k]);
  const shown = filter.trim()
    ? keys.filter((k) =>
      fuzzyScore(filter, COMPONENTS[k].label) > 0 ||
      (COMPONENTS[k].fields || []).some((f) => fuzzyScore(filter, f.label) > 0)
    )
    : keys;

  return (
    <>
      <PanelHeader title="Properties" />

      <div className="a-scroll">
        {/* header */}
        <div
          style={{
            padding: "8px",
            borderBottom: "1px solid var(--line)",
            background: "var(--bg-2)",
          }}
        >
          <div className="a-row" style={{ marginBottom: 6 }}>
            <span style={{ color: objColor(obj), fontSize: 15 }}>
              {objIcon(obj)}
            </span>
            <TextInput
              value={obj.name}
              onChange={(v) => onRenameObject(obj.id, v)}
            />
          </div>
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

        {keys.length > 4 && (
          <div
            style={{
              padding: "5px 6px",
              borderBottom: "1px solid var(--line)",
            }}
          >
            <input
              className="a-input"
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
              open={isOpen(key)}
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
                alwaysAdvanced={showAdvanced}
                onChange={(field, value, phase) =>
                  onUpdateComponent(obj.id, key, field, value, phase)}
              />
              <ComponentIssues issues={issues} />
            </Section>
          );
        })}

        {shown.length === 0 && filter && (
          <Empty>No property matches “{filter}”.</Empty>
        )}

        <div style={{ padding: 8 }}>
          <button className="a-btn a-btn--wide" onClick={() => setAdding(true)}>
            + Add Component
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
  { scene, selection, files, onUpdateComponent, onAddComponent, showAdvanced },
) {
  const shared = COMPONENT_KEYS.filter((k) =>
    selection.every((o) => o.components[k])
  );
  const [adding, setAdding] = useState(false);

  return (
    <>
      <PanelHeader title={`Inspector — ${selection.length} selected`}>
        <button className="a-btn a-btn--sm" onClick={() => setAdding(true)}>
          + Component
        </button>
      </PanelHeader>
      <div className="a-scroll">
        <div
          style={{
            padding: 8,
            borderBottom: "1px solid var(--line)",
            background: "var(--bg-2)",
          }}
        >
          <div className="a-dim" style={{ fontSize: 11, lineHeight: 1.5 }}>
            Editing {selection.length}{" "}
            objects. Changes apply to every selection that has the component.
          </div>
        </div>

        {shared.length === 0 && (
          <Empty>These objects share no components.</Empty>
        )}

        {shared.map((key) => {
          const def = COMPONENTS[key];
          const first = selection[0].components[key];
          return (
            <Section
              key={key}
              title={`${def.label} (all)`}
              icon={def.icon}
              color={def.color}
              open
              onToggle={() => {}}
            >
              <ComponentFields
                compKey={key}
                comp={first}
                obj={selection[0]}
                scene={scene}
                files={files}
                alwaysAdvanced={showAdvanced}
                onChange={(field, value, phase) => {
                  for (const o of selection) {
                    onUpdateComponent(o.id, key, field, value, phase);
                  }
                }}
              />
            </Section>
          );
        })}

        <div style={{ padding: 8 }}>
          <button className="a-btn a-btn--wide" onClick={() => setAdding(true)}>
            + Add To All
          </button>
        </div>
      </div>

      {adding && (
        <AddComponentMenu
          obj={{ components: {}, id: null }}
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
        <Field label="Type">
          <div className="a-mono a-dim">{asset.cat}</div>
        </Field>
        <Field label="Size">
          <div className="a-mono a-dim">{fmtBytes(asset.size)}</div>
        </Field>
        <Field label="Folder">
          <div className="a-mono a-dim">{asset.folder || "—"}</div>
        </Field>
        {asset.bounds && (
          <Field
            label="Bounds"
            help="Mesh extents — used by Rigidbody auto-fit."
          >
            <div className="a-mono a-dim">
              {["x", "y", "z"].map((a) => asset.bounds.size[a].toFixed(2)).join(
                " x ",
              )}
            </div>
          </Field>
        )}
        {asset.error && <div className="a-field__err">{asset.error}</div>}
        {asset.cat === "scripts" && asset.content && (
          <>
            <div className="a-sec__group">Preview</div>
            <pre
              className="a-code"
              style={{ maxHeight: 300 }}
            >{asset.content.slice(0, 4000)}</pre>
          </>
        )}
      </div>
    </>
  );
}
