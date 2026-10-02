function SceneTools(
  { prefs, gizmoMode, onMode, onPref, hasSelection, onAdd, onFrame, onSceneSettings },
) {
  const ref = useRef(null);
  useDetailsPopovers(ref, ".a-view-options");
  return (
    <div className="a-scene-tools" ref={ref}>
      <button className="a-btn a-btn--ghost" onClick={onAdd}>+ Add object</button>
      {hasSelection && <div className="a-transform-tools" role="group" aria-label="Transform selected objects">
      {[["translate", "Move", "W"], ["rotate", "Rotate", "E"], [
        "scale",
        "Scale",
        "R",
      ]].map(([mode, label, key]) => (
        <button
          key={mode}
          className={`a-btn a-btn--sm ${
            gizmoMode === mode ? "a-btn--on" : "a-btn--ghost"
          }`}
          title={`${label} (${key})`}
          aria-pressed={gizmoMode === mode}
          onClick={() => onMode(mode)}
        >
          {label}
        </button>
      ))}
      </div>}
      <span className="a-grow" />
      <button className="a-btn a-btn--ghost a-btn--sm" onClick={onFrame}>{hasSelection ? "Focus selection" : "Show whole scene"}</button>
      <details className="a-view-options">
        <summary>Scene options</summary>
        <div className="a-view-options__pop">
          <button className="a-btn a-btn--ghost" onClick={(e) => { e.currentTarget.closest("details").open = false; onSceneSettings(); }}>Edit sky and scene…</button>
          {hasSelection && <>
          <label>
            Move relative to<select
              className="a-select"
              value={prefs.gizmoSpace}
              onChange={(e) => onPref({ gizmoSpace: e.target.value })}
            >
              <option value="world">Scene</option>
              <option value="local">Object</option>
            </select>
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.snap}
              onChange={(e) => onPref({ snap: e.target.checked })}
            />{" "}
            Grid snap
          </label>
          {prefs.snap && (
            <input
              aria-label="Snap step"
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
            Component guides
          </label>
          <label>
            <input
              type="checkbox"
              checked={prefs.shaded}
              onChange={(e) => onPref({ shaded: e.target.checked })}
            />{" "}
            Preview lighting
          </label>
        </div>
      </details>
    </div>
  );
}
