function PlaySettingsModal({ onClose, onReady }) {
  const [settings, setSettings] = useState(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  useEffect(() => {
    editorPlayRequest("status").then(setSettings).catch((e) =>
      setError(e.message)
    );
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
          <button className="a-btn" onClick={onClose}>Close</button>
          {settings && (
            <button
              className="a-btn a-btn--primary"
              disabled={busy}
              onClick={save}
            >
              {busy ? "Preparing…" : "Save and run"}
            </button>
          )}
        </>
      }
    >
      <p className="a-lead">Run the current scene with one click.</p>
      <p className="a-dim">
        The editor prepares a temporary game folder automatically. Your project
        stays open while you play.
      </p>
      {settings && (
        <>
          <p className="a-run-status">
            {settings.available
              ? "PCSX2 is ready to run."
              : "Choose PCSX2 and the console player once."}
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
              PCSX2 needs a configured BIOS and HostFS enabled. Paths are
              remembered on this computer.
            </p>
          </details>
        </>
      )}
      {error && <p role="alert" className="a-error">{error}</p>}
    </Modal>
  );
}
