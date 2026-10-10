function ShareFileModal({ file, onClose }) {
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const preview = useMemo(() => file.type.startsWith("image/") ? URL.createObjectURL(file) : null, [file]);
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview); }, [preview]);
  const supported = !!navigator.share && !!navigator.canShare?.({ files: [file] });
  return <Modal title={file.type.startsWith("image/") ? tr("Scene capture") : tr("Share export")} onClose={onClose}
    footer={<>
      <button className="a-btn" disabled={busy} onClick={() => downloadEditorFile(file)}>{tr("Download")}</button>
      {supported && <button className="a-btn a-btn--primary" disabled={busy} onClick={async () => {
        setBusy(true); setError("");
        try { if (await shareEditorFile(file) === "shared") onClose(); }
        catch (err) { setError(err.message || "Sharing failed. You can download the file instead."); }
        finally { setBusy(false); }
      }}>{tr("Share…")}</button>}
    </>}>
    {preview && <img src={preview} alt="Scene capture preview" style={{ width: "100%", maxHeight: "50vh", objectFit: "contain" }} />}
    <p>{file.name} · {fmtBytes(file.size)}</p>
    {!supported && <p className="a-dim">{tr("Sharing files is unavailable in this browser. Download the file to use it in another app.")}</p>}
    {error && <p role="status">{error}</p>}
  </Modal>;
}
