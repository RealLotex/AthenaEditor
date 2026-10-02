// ═══════════════════════════════════════════════════════════════════════
//  MENU BAR — menus are built from the same command registry as the
//  palette and the shortcuts, so nothing can be reachable one way only.
// ═══════════════════════════════════════════════════════════════════════

function MenuBar(
  {
    project,
    scene,
    commands,
    onSwitchScene,
    onRenameProject,
    dirty,
    projectFileName,
    playBusy,
    playing,
  },
) {
  const [open, setOpen] = useState(null);
  const [nativeTitlebar, setNativeTitlebar] = useState(false);
  const barRef = useRef(null);

  useEffect(() => {
    document.title = `${project.name}${dirty ? " *" : ""} — AthEditor`;
  }, [project.name, dirty]);
  useEffect(() => {
    const overlay = navigator.windowControlsOverlay;
    if (!overlay) return;
    const update = () => setNativeTitlebar(!!overlay.visible);
    update();
    overlay.addEventListener("geometrychange", update);
    return () => overlay.removeEventListener("geometrychange", update);
  }, []);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (!barRef.current?.contains(e.target)) setOpen(null);
    };
    const esc = (e) => {
      if (e.key === "Escape") setOpen(null);
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const groups = useMemo(() => {
    const order = ["File", "Edit", "Add", "Tools", "View", "Help"];
    const byGroup = new Map(order.map((g) => [g, []]));
    for (const c of commands) {
      if (c.hidden || !c.group || !byGroup.has(c.group)) continue;
      byGroup.get(c.group).push(c);
    }
    return order.map((g) => ({ name: g, items: byGroup.get(g) })).filter((g) =>
      g.items.length
    );
  }, [commands]);

  const action = (id) => commands.find((c) => c.id === id);
  const invoke = (id) => {
    const command = action(id);
    if (command && (!command.enabled || command.enabled())) command.run();
  };
  const item = (c) => (
    <button
      key={c.id}
      className="a-menu__item"
      disabled={c.enabled ? !c.enabled() : false}
      onClick={() => {
        setOpen(null);
        c.run();
      }}
    >
      <span style={{ width: 15, textAlign: "center", color: c.color }}>
        {c.icon || ""}
      </span>
      <span className="a-grow">{c.title}</span>
      {c.keys && <span className="a-btn__key">{c.keys}</span>}
    </button>
  );
  const sections = (g) => {
    const groups = [];
    let remaining = [...g.items];
    const take = (label, predicate) => {
      const chosen = remaining.filter(predicate);
      remaining = remaining.filter((c) => !predicate(c));
      if (chosen.length) groups.push({ label, items: chosen });
    };
    if (g.name === "Add") {
      take(
        null,
        (c) =>
          [
            "add.primitive.cube",
            "add.primitive.plane",
            "add.primitive.sphere",
            "add.terrain",
            "add.empty",
            "add.light",
            "add.camera",
          ].includes(c.id),
      );
      take("HUD elements", (c) => c.id.startsWith("add.ui."));
      take("More objects", () => true);
    } else if (g.name === "File") {
      take(
        null,
        (c) =>
          [
            "file.new",
            "file.openjson",
            "file.recent",
            "file.save",
            "file.saveas",
            "file.play",
            "file.export",
          ]
            .includes(c.id),
      );
      take("Scenes", (c) => c.id.includes("scene"));
      take("Project folder", (c) => ["file.link", "file.relink", "file.unlink", "file.scaffold"].includes(c.id));
      take("More options", () => true);
    } else if (g.name === "Edit") {
      take(null, (c) => !c.id.toLowerCase().includes("prefab"));
      take("Prefabs", () => true);
    } else if (g.name === "View") {
      take(
        "Layout presets",
        (c) => c.id.startsWith("view.layout.") && c.id !== "view.layout.reset",
      );
      take(
        null,
        (c) => ["view.frame", "view.frameall", "view.problems"].includes(c.id),
      );
      take("Workspaces", (c) => ["view.viewport", "view.hud", "view.terrain"].includes(c.id));
      take(
        "Panels",
        (c) => c.id.startsWith("view.panel."),
      );
      take("View settings", () => true);
    } else if (g.name === "Help") {
      take(null, (c) => !c.id.startsWith("help.lang"));
      take("Language", () => true);
    } else take(null, () => true);
    return groups;
  };

  return (
    <div className={`a-menubar${nativeTitlebar ? " a-menubar--native" : ""}`} ref={barRef}>
      <div className="a-brand">
        <div>
          <div className="a-brand__name">
            <input
              className="a-input"
              aria-label="Project name"
              value={project.name}
              onChange={(e) => onRenameProject(e.target.value)}
              title="Project name"
            />
          </div>
        </div>
      </div>

      {groups.map((g) => (
        <div className="a-menu" key={g.name}>
          <button
            className={`a-menu__btn${
              open === g.name ? " a-menu__btn--open" : ""
            }`}
            aria-expanded={open === g.name}
            aria-haspopup="true"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(open === g.name ? null : g.name);
            }}
          >
            {g.name}
          </button>
          {open === g.name && (
            <div className="a-menu__pop">
              {sections(g).map((section, i) =>
                section.label
                  ? (
                    <details className="a-menu-disclosure" key={section.label}>
                      <summary>{section.label}</summary>
                      {section.items.map(item)}
                    </details>
                  )
                  : (
                    <React.Fragment key={i}>
                      {section.items.map(item)}
                    </React.Fragment>
                  )
              )}
            </div>
          )}
        </div>
      ))}

      <div className="a-grow" />

      <div className="a-project-actions">
        {project.scenes.length > 1 && <select
          className="a-select"
          value={project.activeSceneId}
          onChange={(e) => onSwitchScene(e.target.value)}
          title="Active scene"
          aria-label="Current scene"
        >
          {project.scenes.map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>}
        {action("file.save") && <button className="a-btn a-btn--ghost" onClick={() => invoke("file.save")}
          title={projectFileName ? `Save ${projectFileName} (Ctrl+S)` : "Save a project file (Ctrl+S)"}>
          Save{dirty && <span className="a-save-dot" aria-label="Unsaved changes" />}
        </button>}
        {action("file.export") && <button className="a-btn a-btn--ghost a-export-button" onClick={() => invoke("file.export")}>Export…</button>}
        {action("file.play") && <button className="a-btn a-btn--primary a-run-button" onClick={() => invoke("file.play")}
          disabled={!!playBusy || !!(action("file.play").enabled && !action("file.play").enabled())}
          title="Try the open scene in PCSX2 (F5)">
          {playBusy ? (playing ? "Stopping…" : "Preparing…") : playing ? "Stop game" : "Run game"}
        </button>}
      </div>
    </div>
  );
}
