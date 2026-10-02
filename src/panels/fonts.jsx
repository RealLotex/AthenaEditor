function HUDfontImport({ elementId, onImport }) {
  const [fonts, setFonts] = useState(null);
  const [choice, setChoice] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const ref = useRef(null), generation = useRef(0);
  useEffect(() => { generation.current++; setError(""); setBusy(false); return () => { generation.current++; }; }, [elementId]);
  const sourceWindow = () => ref.current?.ownerDocument.defaultView || window;
  const importFont = async (blob, name) => {
    const version = generation.current;
    setBusy(true); setError("");
    try { await onImport(elementId, blob, name, sourceWindow()); }
    catch (err) { if (version === generation.current) setError(err.message); }
    finally { if (version === generation.current) setBusy(false); }
  };
  return <details ref={ref} className="a-font-import">
    <summary>Import font…</summary>
    <div style={{ display: "grid", gap: 6, paddingTop: 6 }}>
      {typeof window.queryLocalFonts === "function" && <button className="a-btn a-btn--sm" disabled={busy} onClick={async () => {
        const version = generation.current;
        setBusy(true); setError("");
        try {
          const available = await sourceWindow().queryLocalFonts();
          if (version !== generation.current) return;
          const sorted = [...available].sort((a, b) => a.fullName.localeCompare(b.fullName));
          setFonts(sorted); setChoice(sorted[0]?.postscriptName || "");
          if (!sorted.length) setError("No fonts were made available. You can import a font file instead.");
        } catch (err) {
          if (version === generation.current && err.name !== "AbortError") setError("Font access was unavailable. You can import a font file instead.");
        } finally { if (version === generation.current) setBusy(false); }
      }}>Choose installed font…</button>}
      {fonts?.length > 0 && <>
        <select className="a-select" aria-label="Installed font" value={choice} disabled={busy} onChange={(event) => setChoice(event.target.value)}>
          {fonts.map((font) => <option key={font.postscriptName} value={font.postscriptName}>{font.fullName}</option>)}
        </select>
        <button className="a-btn a-btn--sm a-btn--primary" disabled={busy || !choice} onClick={() => {
          const font = fonts.find((font) => font.postscriptName === choice);
          if (font) importFont(font.blob(), font.postscriptName);
        }}>Use font</button>
      </>}
      <label className="a-btn a-btn--sm" style={{ cursor: busy ? "wait" : "pointer" }}>Import font file…
        <input type="file" accept=".ttf,.otf" disabled={busy} style={{ display: "none" }} onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          if (file) importFont(file, file.name.replace(/\.[^.]+$/, ""));
        }} />
      </label>
      {busy && <span className="a-dim" role="status">Loading font…</span>}
      {error && <span role="status">{error}</span>}
    </div>
  </details>;
}
