function NewProjectModal({ onCreate, onClose, dirty, onSave }) {
  const [picked, setPicked] = useState(PROJECT_TEMPLATES[0].id),
    [name, setName] = useState("My Project");
  const template = PROJECT_TEMPLATES.find((t) => t.id === picked);
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const create = async () => {
    if (busy || !name.trim()) return;
    setBusy(true); setError("");
    try {
      if (await onCreate(createEditorProject(template, name.trim()), template) !== false) onClose();
    } catch (e) { setError(e.message); }
    finally { setBusy(false); }
  };
  return (
    <Modal
      title="Create a project"
      onClose={onClose}
      width={420}
      footer={
        <>
          <span className="a-grow" />
          <button className="a-btn" onClick={onClose}>Cancel</button>
          <button
            className="a-btn a-btn--primary"
            disabled={busy || !name.trim()}
            onClick={create}
          >
            {busy ? "Creating…" : "Create project"}
          </button>
        </>
      }
    >
      <Field label="Project name" htmlFor="new-project-name" stack>
        <input id="new-project-name" className="a-input" value={name} maxLength={100}
          onChange={e => setName(e.target.value)} onKeyDown={e => { if (e.key === "Enter") { e.preventDefault(); create(); } }} />
      </Field>
      <Field label="Template" htmlFor="new-project-template" stack>
        <select
          id="new-project-template"
          className="a-select"
          value={picked}
          onChange={(e) => setPicked(e.target.value)}
        >
          {PROJECT_TEMPLATES.map((t) => (
            <option key={t.id} value={t.id}>{t.label}</option>
          ))}
        </select>
      </Field>
      <p className="a-dim">{template.blurb}</p>
      {error && <p role="alert">{error}</p>}
    </Modal>
  );
}

function WelcomeScreen({ onCreate, onOpen, recentProjects, onRecent }) {
  return <main className="a-welcome">
    <div className="a-welcome__content">
      <span className="a-welcome__brand">AthEditor</span>
      <h1>Create a PlayStation 2 game.</h1>
      <p>Start with a scene, add objects and try your game.</p>
      <div className="a-welcome__actions">
        <button className="a-btn a-btn--primary" onClick={onCreate}>Create project</button>
        <button className="a-btn a-btn--ghost" onClick={onOpen}>Open project…</button>
      </div>
      {recentProjects.length > 0 && <section className="a-welcome__recent" aria-label="Recent projects">
        <h2>Recent projects</h2>
        {recentProjects.slice(0, 5).map(entry => <button key={entry.projectId} onClick={() => onRecent(entry)}>
          <strong>{entry.name}</strong><span>{entry.handle.name}</span>
        </button>)}
      </section>}
    </div>
  </main>;
}

function ConsoleFolderModal(
  { project, runtime, onPickRuntime, onScaffold, onClose },
) {
  const [busy, setBusy] = useState(false);
  return (
    <Modal
      title="Prepare console folder"
      onClose={onClose}
      width={430}
      footer={
        <>
          <span className="a-grow" />
          <button className="a-btn" onClick={onClose}>Cancel</button>
          <button
            className="a-btn a-btn--primary"
            disabled={busy || !runtime}
            onClick={async () => {
              setBusy(true);
              try {
                if (await onScaffold(project, null)) onClose();
              } finally {
                setBusy(false);
              }
            }}
          >
            {busy ? "Preparing…" : "Choose folder and prepare"}
          </button>
        </>
      }
    >
      <p>Create a folder with your game, assets and the console player.</p>
      {!runtime && (
        <p>
          Choose the console player once. It will be remembered for your next
          projects.
        </p>
      )}
      <button className="a-btn" onClick={onPickRuntime}>
        {runtime ? "Replace console player" : "Choose console player"}
      </button>
      {runtime && <p className="a-dim">{runtime.name}</p>}
      <details className="a-disclosure">
        <summary>Advanced options</summary>
        <p className="a-dim">
          The console player is AthenaEnv (athena.elf). The standard folder
          layout is selected automatically.
        </p>
      </details>
    </Modal>
  );
}
