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
      title={localAvailable ? tr("Run in PCSX2") : tr("Run on your computer")}
      onClose={onClose}
      width={530}
      canDismiss={!busy}
      footer={
        <>
          <span className="a-grow" />
          <button className="a-btn a-btn--ghost" disabled={busy} onClick={onClose}>{localAvailable ? tr("Cancel") : tr("Close")}</button>
          {!localAvailable && <button className="a-btn a-btn--primary" onClick={onExport}>{tr("Export game…")}</button>}
          {settings && (
            <button
              className="a-btn a-btn--primary"
              disabled={busy || !settings.pcsx2?.trim() || !settings.runtime?.trim()}
              onClick={save}
            >
              {busy ? tr("Preparing…") : tr("Run game")}
            </button>
          )}
        </>
      }
    >
      {!localAvailable && <>
        <p className="a-run-status">{tr("Open ")}<strong>{tr("Start AthEditor.vbs")}</strong> {tr("in your editor folder to try your game in PCSX2.")}</p>
        <p className="a-dim">{tr("You can keep editing and export your game here.")}</p>
      </>}
      {loading && <p role="status">{tr("Checking PCSX2…")}</p>}
      {settings && (
        <>
          <p className="a-run-status">
            {settings.available
              ? tr("The current scene is ready to play.")
              : tr("Choose PCSX2 and the console player to run your game.")}
          </p>
          <details className="a-disclosure" open={!settings.available}>
            <summary>{tr("Run settings")}</summary>
            <label className="a-setting-label">
              {tr("PCSX2 executable")}<input
                className="a-input"
                value={settings.pcsx2}
                onChange={(e) =>
                  setSettings({ ...settings, pcsx2: e.target.value })}
              />
            </label>
            <label className="a-setting-label">
              {tr("Console player")}<input
                className="a-input"
                value={settings.runtime}
                onChange={(e) =>
                  setSettings({ ...settings, runtime: e.target.value })}
              />
            </label>
            <p className="a-dim">
              {tr("PCSX2 needs a configured BIOS and HostFS enabled. These paths are remembered on this computer.")}</p>
          </details>
        </>
      )}
      {error && <p role="alert" className="a-error">{error}</p>}
    </Modal>
  );
}
