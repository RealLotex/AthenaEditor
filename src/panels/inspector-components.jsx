// ═══════════════════════════════════════════════════════════════════════
//  COMPONENT EDITOR — renders any component from its registry definition.
//
//  Adding a field to COMPONENTS is all it takes for it to appear here, with
//  validation, conditional visibility and help text. The previous Inspector
//  had a hand-written block per component, which is why the Shadow component
//  shipped with no UI at all.
// ═══════════════════════════════════════════════════════════════════════

function ComponentFields({ compKey, comp, obj, scene, project, files, onChange, onOpenScript, issues, alwaysAdvanced, mixedFields = [] }) {
  const def = COMPONENTS[compKey];
  const [open, setOpen] = useState(false);
  if (!def) return null;

  const visible = (def.fields || []).filter((f) => !f.when || f.when(comp, obj, scene));
  const errorFor = (fieldKey) =>
    issues?.find((i) => i.level === "error" && i.field === fieldKey)?.msg;

  // ── everyday first, the rest behind a disclosure ─────────────────────
  //
  // `advanced: true` on a field means "has a sane default and is a trap when
  // guessed at" — a bias, a solver tolerance, a framebuffer format. Nothing is
  // removed and nothing is unreachable: it is one click, or permanently open
  // from View ▸ Show Advanced Settings.
  //
  // An advanced field with an ERROR opens the section on its own. Hiding the
  // reason a thing is broken is worse than showing a knob nobody wanted.
  const everyday = visible.filter((f) => !f.advanced || f.required);
  const advanced = visible.filter((f) => f.advanced && !f.required);
  const advancedHasError = advanced.some((f) => errorFor(f.key)) ||
    (advanced.length > 0 && issues?.some(i => i.level === "error"));
  const showAdvanced = alwaysAdvanced || open || advancedHasError;

  const render = (fields) => {
    const groups = [];
    for (const f of fields) {
      const name = f.group || "";
      let g = groups.find((x) => x.name === name);
      if (!g) { g = { name, fields: [] }; groups.push(g); }
      g.fields.push(f);
    }
    return groups.map((g) => (
      <React.Fragment key={g.name || "_"}>
        {g.name && <div className="a-sec__group">{tr(g.name)}</div>}
        {g.fields.map((f) => (
          <FieldControl
            key={f.key}
            field={f}
            // A key may address a sub-property ("size.x"); see core/util.js.
            value={readPath(comp, f.key)}
            comp={comp}
            obj={obj}
            scene={scene}
            project={project}
            files={files}
            error={errorFor(f.key)}
            mixed={mixedFields.includes(f.key)}
            onOpenScript={onOpenScript}
            showHelp={showAdvanced && !!f.advanced}
            onChange={(v, phase, axes) => onChange(f.key, v, phase, axes)}
          />
        ))}
      </React.Fragment>
    ));
  };

  return (
    <>
      {compKey==='water'&&<WaterQualityControls comp={comp} obj={obj} files={files} onChange={onChange} mixedFields={mixedFields}/>}
      {render(everyday)}
      {advanced.length > 0 && (
        <Section title={tr("Advanced")} open={showAdvanced} onToggle={()=>{if(!alwaysAdvanced&&!advancedHasError)setOpen(value=>!value);}}>{showAdvanced && render(advanced)}</Section>
      )}
    </>
  );
}

function FieldControl({ field: f, value, comp, obj, scene, project, files, error, onChange, onOpenScript, showHelp, mixed }) {
  const common = { label: `${tr(f.label)}${mixed ? ' · '+tr('mixed') : ''}`, help: showHelp ? tr(f.help) : undefined, error, required: f.required };

  switch (f.type) {
    case 'eventRules':
      return <EventRulesEditor rules={value||[]} ownerId={obj.id} scene={scene} project={project} files={files} onChange={onChange}/>;
    case "vec3":
      return (
        <Field {...common}>
          <Vec3Input
            value={value} onChange={onChange}
            step={f.step} min={f.min} max={f.max}
            degrees={f.degrees} integer={f.integer} uniformLock={f.uniformLock}
          />
        </Field>
      );
    case "vec2xz":
      return (
        <Field {...common}>
          <Vec2XZInput value={value} onChange={onChange} step={f.step} min={f.min} integer={f.integer} />
        </Field>
      );
    case "number":
    case "int":
      return (
        <Field {...common}>
          <NumInput
            value={value} onChange={onChange}
            step={f.step ?? (f.type === "int" ? 1 : 0.1)}
            min={f.min} max={f.max} integer={f.type === "int" || f.integer}
          />
        </Field>
      );
    case "bool":
      return (
        <Field {...common} label={f.inlineLabel ? undefined : common.label} stack={f.inlineLabel}>
          <Checkbox value={value} onChange={onChange} label={f.inlineLabel ? common.label : undefined} />
        </Field>
      );
    case "text":
      return (
        <Field {...common}>
          <TextInput value={value} onChange={onChange} placeholder={f.placeholder} invalid={!!error} />
        </Field>
      );
    case "enum":
      return (
        <Field {...common}>
          <Select value={value} onChange={onChange} options={localizeEditorOptions(f.options)} showHelp={showHelp} />
        </Field>
      );
    case "asset":
      return (
        <Field {...common}>
          <AssetSelect value={value} onChange={onChange} files={files} cat={f.cat} />
          {f.key === "eventScript" && value && onOpenScript && <button className="a-btn a-btn--sm" onClick={() => onOpenScript(value)}>{tr("Edit Script")}</button>}
        </Field>
      );
    case "objectRef":
      return (
        <Field {...common}>
          <ObjectSelect value={value} onChange={onChange} scene={scene} filter={f.filter} selfId={obj.id} />
        </Field>
      );
    case "objectIdRef":
      return <Field {...common}><Select value={value || ""} onChange={onChange} options={[
        { value: "", label: f.placeholder || "Any object" },
        ...exportableObjects(scene?.objects || []).filter(o => o.id !== obj.id && o.components.rigidbody)
          .map(o => ({ value: o.id, label: o.name })),
      ]} /></Field>;
    case "sceneRef":
      return <Field {...common}><Select value={value || ""} onChange={onChange} options={[
        { value: "", label: tr("Choose a scene…") },
        ...(project?.scenes || []).map(s => ({ value: s.id, label: s.name })),
      ]} /></Field>;
    case "sequenceRef":
      return <Field {...common}><Select value={value||""} onChange={onChange} options={[
        {value:"",label:tr("Choose a sequence…")},...(scene.sequences||[]).map(s=>({value:s.id,label:s.name})),
      ]}/></Field>;
    case "rgb01":
      return (
        <Field {...common}>
          <Color01Input value={value} onChange={onChange} />
        </Field>
      );
    case "rgba01":
      return (
        <Field {...common}>
          <Color01Input value={value} onChange={onChange} alpha />
        </Field>
      );
    case "rgba255":
      return (
        <Field {...common}>
          <Color255Input value={value} onChange={onChange} />
        </Field>
      );
    default:
      return null;
  }
}

/** Inline error/warning list under a component's fields. */
function ComponentIssues({ issues }) {
  if (!issues?.length) return null;
  return (
    <div style={{ marginTop: 7 }}>
      {issues.map((i, n) => (
        <div
          key={n}
          className="a-row"
          style={{
            gap: 6, alignItems: "flex-start", padding: "4px 6px", marginTop: 3,
            borderRadius: "var(--radius)", lineHeight: 1.45,
            background: `color-mix(in srgb, var(--${i.level === "error" ? "err" : "warn"}) 12%, transparent)`,
          }}
        >
          <span style={{ color: `var(--${i.level === "error" ? "err" : "warn"})`, fontSize: 10 }}>
            {LEVEL_ICON[i.level]}
          </span>
          <span style={{ fontSize: 10.5, flex: 1 }}>{i.msg}</span>
        </div>
      ))}
    </div>
  );
}

/** Add-component menu, built from the registry. */
function AddComponentMenu({ obj, onAdd, onClose }) {
  const [query, setQuery] = useState("");
  const purpose = {
    model: "3D appearance", animator: "Play animations", light: "Light the scene",
    camera: "Set a viewpoint", sound: "Play audio", script: "Custom behavior",
    rigidbody: "Collisions and movement", shadow: "Cast a shadow",
  };
  const available = COMPONENT_KEYS.filter((k) => {
    const d = COMPONENTS[k];
    if (d.required || obj.components[k]) return false;
    if (!query.trim()) return true;
    return fuzzyScore(query, `${tr(d.label)} ${k} ${tr(purpose[k] || "")}`) > 0;
  });

  return (
    <Modal title={tr("Add component")} onClose={onClose} width={340}>
      <input
        className="a-input" placeholder={tr("Search components…")}
        aria-label={tr("Search components")}
        value={query} onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter" && available[0]) { onAdd(available[0]); onClose(); } }}
        style={{ marginBottom: 9 }}
      />
      {available.length === 0 && <Empty>{query.trim() ? `No component matches “${query}”.` : tr("Every component is already on this object.")}</Empty>}
      {available.map((k) => {
        const d = COMPONENTS[k];
        const missingDep = (d.requires || []).find((r) => !obj.components[r]);
        return (
          <button
            key={k}
            className="a-btn a-btn--wide"
            style={{ height: "auto", padding: "8px 10px", justifyContent: "flex-start", marginBottom: 4, textAlign: "left" }}
            onClick={() => { onAdd(k); onClose(); }}
          >
            <span aria-hidden="true" style={{ color: "var(--fg-dim)", fontSize: 15, width: 20, textAlign: "center", flexShrink: 0 }}>{d.icon}</span>
            <span style={{ flex: 1 }}>
              <span style={{ display: "block", color: "var(--fg-strong)", fontWeight: 600 }}>{tr(d.label)}</span>
              {purpose[k] && <span className="a-dim" style={{ display: "block", fontSize: 11 }}>{tr(purpose[k])}</span>}
              {missingDep && (
                <span style={{ display: "block", fontSize: 10, color: "var(--fg-dim)" }}>
                  {tr("Also adds ")}{tr(COMPONENTS[missingDep].label)}
                </span>
              )}
            </span>
          </button>
        );
      })}
    </Modal>
  );
}
