function PlaySettingsModal({ onClose, onReady, localAvailable = true, onExport }) {
  const [settings, setSettings] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!localAvailable) { setLoading(false); return; }
    let cancelled = false;
    editorPlayRequest("status")
      .then((next) => { if (!cancelled) setSettings(next); })
      .catch((e) => { if (!cancelled) setError(e.message); })
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
  }, []);
  const save = async () => {
    setBusy(true);
    setError("");
    try {
      await editorPlayRequest("settings", settings);
      onReady();
    } catch (e) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Modal
      title={localAvailable ? "Run in PCSX2" : "Run on your computer"}
      onClose={onClose}
      width={530}
      canDismiss={!busy}
      footer={
        <>
          <span className="a-grow" />
          <button className="a-btn a-btn--ghost" disabled={busy} onClick={onClose}>{localAvailable ? "Cancel" : "Close"}</button>
          {!localAvailable && <button className="a-btn a-btn--primary" onClick={onExport}>Export game…</button>}
          {settings && (
            <button
              className="a-btn a-btn--primary"
              disabled={busy || !settings.pcsx2?.trim() || !settings.runtime?.trim()}
              onClick={save}
            >
              {busy ? "Preparing…" : "Run game"}
            </button>
          )}
        </>
      }
    >
      {!localAvailable && <>
        <p className="a-run-status">Open <strong>Start AthEditor.vbs</strong> in your editor folder to try your game in PCSX2.</p>
        <p className="a-dim">You can keep editing and export your game here.</p>
      </>}
      {loading && <p role="status">Checking PCSX2…</p>}
      {settings && (
        <>
          <p className="a-run-status">
            {settings.available
              ? "The current scene is ready to play."
              : "Choose PCSX2 and the console player to run your game."}
          </p>
          <details className="a-disclosure" open={!settings.available}>
            <summary>Run settings</summary>
            <label className="a-setting-label">
              PCSX2 executable<input
                className="a-input"
                value={settings.pcsx2}
                onChange={(e) =>
                  setSettings({ ...settings, pcsx2: e.target.value })}
              />
            </label>
            <label className="a-setting-label">
              Console player<input
                className="a-input"
                value={settings.runtime}
                onChange={(e) =>
                  setSettings({ ...settings, runtime: e.target.value })}
              />
            </label>
            <p className="a-dim">
              PCSX2 needs a configured BIOS and HostFS enabled. These paths are remembered on this computer.
            </p>
          </details>
        </>
      )}
      {error && <p role="alert" className="a-error">{error}</p>}
    </Modal>
  );
}
