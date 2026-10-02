function SceneTools(
  { prefs, gizmoMode, onMode, onPref, onExport, onRun, onSkybox, playBusy, playing },
) {
  return (
    <div className="a-scene-tools">
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
      <button className="a-btn a-btn--sm a-btn--ghost" onClick={onSkybox}>Sky</button>
      <details className="a-view-options">
        <summary>View options</summary>
        <div className="a-view-options__pop">
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
      <span className="a-grow" />
      <button
        className="a-btn a-btn--sm a-btn--ghost"
        onClick={onExport}
        title="Export (Ctrl+E)"
      >
        Export
      </button>
      <button
        className="a-btn a-btn--primary a-run-button"
        onClick={onRun}
        disabled={playBusy}
        title="Run in PCSX2 (F5)"
      >
        {playBusy
          ? (playing ? "Stopping…" : "Preparing…")
          : playing
          ? "■ Stop"
          : "▶ Run"}
      </button>
    </div>
  );
}
