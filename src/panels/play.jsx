function PlaySettingsModal({ onClose, onReady }) {
  const [settings, setSettings] = useState(null),
    [error, setError] = useState(""),
    [loading, setLoading] = useState(true),
    [busy, setBusy] = useState(false);
  useEffect(() => {
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
      title="Run in PCSX2"
      onClose={onClose}
      width={530}
      footer={
        <>
          <button className="a-btn" onClick={onClose}>Cancel</button>
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
