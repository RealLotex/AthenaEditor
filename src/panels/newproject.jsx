const PROJECT_STARTING_POINTS = {
  "third-person": {
    label: "Third-person game",
    copy: "A character and a ground to explore, ready to make your own.",
  },
  "first-person": {
    label: "First-person game",
    copy: "Walk, look around and jump through the eyes of your player.",
  },
  "side-scroller": {
    label: "Platform game",
    copy: "Run and jump between platforms, with a camera that follows you.",
  },
  "top-down": {
    label: "Top-down game",
    copy: "Move a character through a scene viewed from above.",
  },
  empty: {
    label: "Blank scene",
    copy: "Start with a camera and a light, and build everything yourself.",
  },
};

function NewProjectModal({ onCreate, onClose }) {
  // A first project should give the user something to change immediately.
  const recommended = PROJECT_TEMPLATES.find((t) => t.id === "third-person") || PROJECT_TEMPLATES[0];
  const [picked, setPicked] = useState(recommended.id),
    [name, setName] = useState("My Game");
  const template = PROJECT_TEMPLATES.find((t) => t.id === picked);
  const startingPoint = PROJECT_STARTING_POINTS[picked] || { label: template.label, copy: template.blurb };
  const choices = [recommended, ...PROJECT_TEMPLATES.filter((t) => t.id !== recommended.id)];
  const [busy, setBusy] = useState(false), [error, setError] = useState("");
  const creating = useRef(false);
  const create = async () => {
    if (creating.current || !name.trim()) return;
    creating.current = true;
    setBusy(true); setError("");
    try {
      if (await onCreate(createEditorProject(template, name.trim()), template) !== false) onClose();
    } catch (e) { setError(e?.message || "Could not create your project. Try again."); }
    finally { creating.current = false; setBusy(false); }
  };
  return (
    <Modal
      title="Create a project"
      onClose={onClose}
      width={460}
      initialFocus="#new-project-name"
      canDismiss={!busy}
      footer={
        <>
          <span className="a-grow" />
          <button className="a-btn a-btn--ghost" disabled={busy} onClick={onClose}>Cancel</button>
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
          autoComplete="off" disabled={busy}
          onFocus={e => e.currentTarget.select()}
          onChange={e => { setName(e.target.value); setError(""); }}
          onKeyDown={e => { if (e.key === "Enter" && !e.nativeEvent?.isComposing) { e.preventDefault(); return create(); } }} />
      </Field>
      <section className="a-new-project__starting-point" aria-label="Starting point">
        <span className="a-new-project__starting-label">Starting point</span>
        <strong className="a-new-project__choice-title">{startingPoint.label}</strong>
        <p className="a-new-project__choice-copy">{startingPoint.copy}</p>
        <details className="a-disclosure a-new-project__options">
          <summary>Change starting point</summary>
          <fieldset className="a-new-project__choices" aria-label="Starting point" disabled={busy}>
            {choices.map((item) => {
              const choice = PROJECT_STARTING_POINTS[item.id] || { label: item.label, copy: item.blurb };
              return <label key={item.id} className="a-new-project__choice">
                <input type="radio" className="a-check" name="new-project-template"
                  value={item.id} checked={picked === item.id} onChange={() => setPicked(item.id)} />
                <span>
                  <strong className="a-new-project__choice-title">{choice.label}</strong>
                  <span className="a-new-project__choice-copy">{choice.copy}</span>
                </span>
              </label>;
            })}
          </fieldset>
        </details>
      </section>
      {error && <p className="a-error a-modal__error" role="alert">{error}</p>}
    </Modal>
  );
}

function WelcomeScreen({ onCreate, onOpen, recentProjects, onRecent }) {
  return <main className="a-welcome">
    <div className="a-welcome__content">
      <span className="a-welcome__brand">Athena Editor</span>
      <h1>Create a PlayStation 2 game.</h1>
      <p>Start with a playable scene, shape it and try your game.</p>
      <div className="a-welcome__actions">
        <button className="a-btn a-btn--primary" onClick={onCreate}>Create project</button>
        <button className="a-btn a-btn--ghost" onClick={onOpen}>Open project…</button>
      </div>
      {recentProjects.length > 0 && <section className="a-welcome__recent" aria-label="Recent projects">
        <h2>Recent projects</h2>
        {recentProjects.slice(0, 5).map(entry => <button key={entry.projectId} onClick={() => onRecent(entry)}>
          <strong>{entry.name}</strong><span>{entry.handle?.name}</span>
        </button>)}
      </section>}
    </div>
  </main>;
}

function ConsoleFolderModal(
  { project, runtime, onPickRuntime, onScaffold, onClose },
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const preparing = useRef(false);
  const prepare = async () => {
    if (!runtime) { onPickRuntime(); return; }
    if (preparing.current) return;
    preparing.current = true;
    setBusy(true); setError("");
    try {
      if (await onScaffold(project, null)) onClose();
    } catch (e) {
      setError(e?.message || "Could not prepare the folder. Try again.");
    } finally {
      preparing.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title="Prepare for PlayStation 2"
      onClose={onClose}
      width={430}
      initialFocus=".a-btn--primary"
      canDismiss={!busy}
      footer={
        <>
          <span className="a-grow" />
          <button className="a-btn a-btn--ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className="a-btn a-btn--primary"
            disabled={busy}
            onClick={prepare}
          >
            {busy ? "Preparing…" : runtime ? "Choose folder…" : "Choose console player…"}
          </button>
        </>
      }
    >
      <p className="a-new-project__intro">Put your game in a folder you can copy to your console.</p>
      {!runtime && (
        <p className="a-dim">
          Choose the console player file (athena.elf) once. It will be remembered
          for your next game.
        </p>
      )}
      {runtime && <details className="a-disclosure">
        <summary>Console player</summary>
        <p className="a-dim">{runtime.name}</p>
        <button className="a-btn" disabled={busy} onClick={onPickRuntime}>Replace console player…</button>
      </details>}
      {error && <p className="a-error a-modal__error" role="alert">{error}</p>}
    </Modal>
  );
}
