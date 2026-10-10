// ═══════════════════════════════════════════════════════════════════════
//  PROBLEMS — everything that will misbehave, before it reaches hardware
//
//  Iterating on a PS2 means burning an ISO or copying to a memory card, so
//  a broken caster reference or a rigidbody on a scene with physics off is
//  expensive to discover. This panel makes those visible while editing, with
//  a one-click fix where a fix is unambiguous.
// ═══════════════════════════════════════════════════════════════════════

function ProblemsPanel({ problems, onReveal, onFix, filter, onFilter }) {
  const [query,setQuery]=useState('');
  const counts = countByLevel(problems);
  const shown = problems.filter(p=>(filter==='all'||p.level===filter)&&[p.message,p.objectName,COMPONENTS[p.component]?.label].filter(Boolean).some(text=>tr(text).toLowerCase().includes(query.trim().toLowerCase())));

  return (
    <>
      <PanelHeader title={tr("Problems")}>
        <div className="a-row" style={{ gap: 2 }}>
          {[
            ["all", `All ${problems.length}`, null],
            ["error", `${counts.error}`, "err"],
            ["warn", `${counts.warn}`, "warn"],
            ["info", `${counts.info}`, "info"],
          ].map(([key, label, tone]) => (
            <button
              key={key}
              className={`a-btn a-btn--sm${filter === key ? " a-btn--on" : " a-btn--ghost"}`}
              onClick={() => onFilter(key)}
              title={key === "all" ? tr("Show everything") : `Show ${key}s only`}
            >
              {tone && <span style={{ color: `var(--${tone})` }}>{LEVEL_ICON[key]}</span>}
              {label}
            </button>
          ))}
        </div>
      </PanelHeader>

      <div className="a-toolbar"><input className="a-input" aria-label={tr("Search problems")} placeholder={tr("Search problems…")} value={query} onChange={e=>setQuery(e.target.value)}/>{query&&<button className="a-btn a-btn--ghost" aria-label={tr("Clear problem search")} onClick={()=>setQuery('')}>×</button>}</div>

      <div className="a-scroll">
        {shown.length === 0 && (
          <Empty>
            {problems.length === 0
              ? <>{tr("No problems found.")}<br /><span className="a-dim">{tr("This scene is ready to export.")}</span></>
              : <>{tr(query?'No problems match the search.':'Nothing at this level.')}</>}
          </Empty>
        )}
        {shown.map((p, i) => (
          <div
            key={i}
            className={`a-prob a-prob--${p.level}`}
            role={p.objectId?'button':undefined}
            tabIndex={p.objectId?0:undefined}
            onKeyDown={e=>{if(e.target===e.currentTarget&&p.objectId&&['Enter',' '].includes(e.key)){e.preventDefault();onReveal(p.objectId,p.sceneId);}}}
            onClick={() => p.objectId && onReveal(p.objectId,p.sceneId)}
            title={p.objectId ? tr("Select this object") : undefined}
          >
            <span className="a-prob__icon">{LEVEL_ICON[p.level]}</span>
            <span className="a-prob__text">
              {p.objectName && <span className="a-prob__where">{p.objectName}</span>}
              {p.component && COMPONENTS[p.component] && (
                <span style={{ color: COMPONENTS[p.component].color }}>
                  {p.objectName ? " · " : ""}{tr(COMPONENTS[p.component].label)}
                </span>
              )}
              {p.component === "vram" && <span>{tr("VRAM")}</span>}
              {(p.objectName || p.component) && " — "}
              {p.message}
            </span>
            {fixLabel(p) && (
              <button
                className="a-btn a-btn--sm a-prob__fix"
                onClick={(e) => { e.stopPropagation(); onFix(p); }}
              >
                {fixLabel(p)}
              </button>
            )}
          </div>
        ))}
      </div>
    </>
  );
}

/**
 * Repairs the Problems panel can apply. Each takes the diagnostic and a
 * mutable project draft.
 */
const FIXES = {
  enablePhysics: {
    label: "Enable physics",
    apply: (p, draft, sceneId) => {
      const scene = draft.scenes.find((s) => s.id === sceneId);
      if (scene) { scene.physics = scene.physics || {}; scene.physics.enabled = true; }
    },
  },
  renameDuplicates: {
    label: "Rename",
    apply: (p, draft, sceneId) => {
      const scene = draft.scenes.find((s) => s.id === sceneId);
      if (!scene) return;
      const seen = new Set();
      walk(scene.objects, (o) => {
        if (!seen.has(o.name)) { seen.add(o.name); return; }
        let i = 2;
        while (seen.has(`${o.name}_${i}`)) i++;
        o.name = `${o.name}_${i}`;
        seen.add(o.name);
      });
    },
  },
};

// A diagnostic's `fix` comes in three shapes, and all three have to be handled
// here because validate.js and COMPONENTS both produce them:
//
//   "renameDuplicates"                a key into FIXES above
//   "add:model"                       generated on demand for a dependency
//   { path, value, label }            set one path to one value
//
// The third used to crash the panel outright: `p.fix?.startsWith` guards null
// but not an object, so rendering a diagnostic that carried one threw
// "p.fix.startsWith is not a function" and took the Problems panel with it —
// and the panel is where you go when something is wrong. It was also never
// applied, because `FIXES[{...}]` keys as "[object Object]".
// isPathFix / fixKey / applyPathFix live in core/validate.js so they can be
// unit-tested without a DOM — this is the code that used to take the panel
// down, and it had no test because it was unreachable from tests/.

function applyFix(p, draft, sceneId) {
  if (isPathFix(p.fix)) return applyPathFix(p, draft, sceneId);

  const key = fixKey(p.fix);
  if (!key) return false;
  if (key.startsWith("add:")) {
    const compKey = key.slice(4);
    const scene = draft.scenes.find((s) => s.id === sceneId);
    const obj = scene && findObj(scene.objects, p.objectId);
    if (obj && COMPONENTS[compKey] && !obj.components[compKey]) {
      obj.components[compKey] = makeComponent(compKey);
    }
    return true;
  }
  const fix = FIXES[key];
  if (!fix) return false;
  fix.apply(p, draft, sceneId);
  return true;
}

function fixLabel(p) {
  if (isPathFix(p.fix)) return tr(p.fix.label || "Fix");
  const key = fixKey(p.fix);
  if (!key) return undefined;
  if (key.startsWith("add:")) return `${tr("Add")} ${tr(COMPONENTS[key.slice(4)]?.label || key.slice(4))}`;
  return FIXES[key] ? tr(FIXES[key].label) : undefined;
}
