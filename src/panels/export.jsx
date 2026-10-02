// ═══════════════════════════════════════════════════════════════════════
//  EXPORT — preview and download the generated program
// ═══════════════════════════════════════════════════════════════════════

function ExportModal({ result, projectName, onClose, onReveal }) {
  const [detailsOpen, setDetailsOpen] = useState(false);
  const files = useMemo(
    () => [{ filename: "main.js", content: result.main }, ...(result.sceneFiles || []), ...result.scripts],
    [result],
  );
  const [active, setActive] = useState("main.js");
  const [copied, setCopied] = useState(false);
  const [sharing, setSharing] = useState(false), [shareError, setShareError] = useState("");
  const bundleFile = useMemo(() => new File([exportBundle(result)], `${ident(projectName, "game")}.zip`, { type: "application/zip" }), [result, projectName]);
  const canShare = !!navigator.share && !!navigator.canShare?.({ files: [bundleFile] });
  const current = files.find((f) => f.filename === active) || files[0];

  const errors = result.diagnostics.filter((d) => d.level === "error");
  const warnings = result.diagnostics.filter((d) => d.level === "warn");

  const copy = async () => {
    if (await copyText(current.content)) {
      setCopied(true); setTimeout(() => setCopied(false), 1600);
    } else setShareError("Copy is unavailable. You can download the game folder.");
  };

  const downloadAll = () => downloadEditorFile(bundleFile);

  return (
    <Modal
      title="Export game"
      onClose={onClose}
      width={Math.min(detailsOpen ? 900 : 560, window.innerWidth - 32)}
      initialFocus=".a-btn--primary"
      footer={
        <>
          <span className="a-grow a-dim" style={{ fontSize: 10.5, alignSelf: "center" }}>
            Unzip the folder and add your console player (athena.elf).
          </span>
          <button className="a-btn a-btn--primary" disabled={errors.length > 0} onClick={downloadAll}>
            Download game folder
          </button>
          {canShare && <button className="a-btn" disabled={sharing || errors.length > 0} onClick={async () => {
            setSharing(true); setShareError("");
            try { await shareEditorFile(bundleFile); } catch (error) { setShareError(error.message); }
            finally { setSharing(false); }
          }}>Share…</button>}
        </>
      }
    >
      <section className="a-export-summary" aria-labelledby="export-summary-title">
        <h2 id="export-summary-title">{errors.length ? `Fix ${errors.length} error${errors.length > 1 ? "s" : ""} to export` : "Your game is ready"}</h2>
        <p className="a-export-summary__name">{projectName}</p>
        <p className="a-dim">{result.sceneCount || 1} scene{result.sceneCount > 1 ? "s" : ""} · {(result.assets || []).length} assets included</p>
      </section>
      {(errors.length > 0 || warnings.length > 0) && (
        <div style={{ marginBottom: 11 }}>
          {errors.map((d, i) => (
            <button key={`e${i}`} className="a-prob a-prob--error a-prob--link" onClick={() => { onReveal(d); onClose(); }}>
              <span className="a-prob__icon">✕</span>
              <span className="a-prob__text">
                {d.sceneName && result.sceneCount > 1 && <span className="a-prob__where">{d.sceneName} · </span>}{d.objectName && <span className="a-prob__where">{d.objectName} — </span>}{d.message}
              </span>
            </button>
          ))}
          {warnings.slice(0, 6).map((d, i) => (
            <button key={`w${i}`} className="a-prob a-prob--warn a-prob--link" onClick={() => { onReveal(d); onClose(); }}>
              <span className="a-prob__icon">▲</span>
              <span className="a-prob__text">
                {d.objectName && <span className="a-prob__where">{d.objectName} — </span>}{d.message}
              </span>
            </button>
          ))}
          {warnings.length > 6 && <div className="a-dim" style={{ padding: "5px 9px", fontSize: 10.5 }}>+{warnings.length - 6} more in the Problems panel.</div>}
        </div>
      )}

      <details className="a-disclosure" onToggle={(e) => setDetailsOpen(e.currentTarget.open)}><summary>Code and export details</summary>
      <div className="a-row" style={{ marginBottom: 12 }}>
        <span className="a-grow a-dim">Generated files</span>
        <button className="a-btn a-btn--ghost" onClick={copy}>{copied ? "Copied" : `Copy ${current.filename}`}</button>
      </div>
      <div className="a-row" style={{ gap: 12, marginBottom: 9, flexWrap: "wrap" }}>
        {Object.entries({
          Objects: result.stats.models,
          Meshes: result.stats.renderDatas,
          Lights: result.stats.lights,
          Bodies: result.stats.bodies,
          Shadows: result.stats.shadows,
          HUD: result.stats.uiElements,
        }).map(([k, v]) => (
          <span key={k} className="a-dim" style={{ fontSize: 10.5 }}>
            {k} <span style={{ color: "var(--fg-strong)", fontFamily: "var(--font-mono)" }}>{v}</span>
          </span>
        ))}
        {result.stats.vramLocked > 0 && (
          <span className="a-dim" style={{ fontSize: 10.5 }}>
            VRAM locked{" "}
            <span style={{ color: result.stats.vramLocked > 1048576 ? "var(--warn)" : "var(--fg-strong)", fontFamily: "var(--font-mono)" }}>
              {fmtBytes(result.stats.vramLocked)}
            </span>
          </span>
        )}
      </div>

      <div className="a-tabs" style={{ borderRadius: "var(--radius) var(--radius) 0 0", border: "1px solid var(--line)", borderBottom: "none" }}>
        {files.map((f) => (
          <button key={f.filename} className={`a-tab${active === f.filename ? " a-tab--on" : ""}`} onClick={() => setActive(f.filename)}>
            {f.filename}
          </button>
        ))}
      </div>
      <pre className="a-code" style={{ maxHeight: "48vh", borderRadius: "0 0 var(--radius) var(--radius)" }}>
        {current.content}
      </pre>
      </details>
      {errors.length > 0 && <p role="status">Fix the errors above, then export again.</p>}
      {shareError && <p role="status">{shareError}</p>}
    </Modal>
  );
}
