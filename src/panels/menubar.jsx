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
    canRunLocally = true,
  },
) {
  const [open, setOpen] = useState(null);
  const [nativeTitlebar, setNativeTitlebar] = useState(false);
  const barRef = useRef(null);
  const focusMenu = useRef(null);
  useDetailsPopovers(barRef,'.a-scene-switcher, .a-language-picker');

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
    if (focusMenu.current) {
      const controls = barRef.current ? visibleEditorControls(barRef.current, '.a-menu__pop button, .a-menu__pop summary') : [];
      (focusMenu.current === "last" ? controls[controls.length - 1] : controls[0])?.focus();
      focusMenu.current = null;
    }
    const close = (e) => {
      if (!barRef.current?.contains(e.target)) setOpen(null);
    };
    const esc = (e) => {
      if (e.key === "Escape") {
        e.preventDefault(); setOpen(null);
        barRef.current?.querySelector(`[data-menu="${open}"]`)?.focus();
      }
    };
    window.addEventListener("mousedown", close);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", close);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const groups = useMemo(() => {
    const order = ["File", "Edit", "Add", "Scene", "View", "Help"];
    const byGroup = new Map(order.map((g) => [g, []]));
    for (const c of commands) {
        if (c.hidden || !c.group || ['view.panel.viewport','view.panel.game','view.panel.timeline','view.panel.terrain','view.panel.hud','view.panel.problems'].includes(c.id)) continue;
      const sceneAction=c.group==='Tools'||['view.terrain','view.timeline','view.skybox','view.hud','file.play','file.playSettings'].includes(c.id)||c.group==='File'&&c.id.includes('scene');
      const group=sceneAction?'Scene':c.group;
      if(byGroup.has(group))byGroup.get(group).push(c);
    }
    return order.map((g) => ({ name: g, items: byGroup.get(g) })).filter((g) =>
      g.items.length
    );
  }, [commands]);

  const action = (id) => commands.find((c) => c.id === id);
  const invoke = (id) => {
    const command = action(id);
    setOpen(null);
    if (command && (!command.enabled || command.enabled())) command.run();
  };
  const item = (c) => (
    <button
      key={c.id}
      className="a-menu__item"
      disabled={c.enabled ? !c.enabled() : false}
      aria-pressed={c.checked?c.checked():undefined}
      onClick={() => {
        setOpen(null);
        barRef.current?.querySelector(`[data-menu="${open}"]`)?.focus();
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
            "add.water",
            "add.empty",
            "add.light",
            "add.camera",
          ].includes(c.id),
      );
      take("Particle effects", (c) => c.id.startsWith("add.particles."));
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
    } else if(g.name==='Scene'){
      take(null,c=>['view.sceneProperties','view.skybox','view.lighting','view.events','view.terrain','view.timeline','view.hud'].includes(c.id));
      take('Play',c=>c.id.startsWith('file.play'));
      take('Scenes',c=>c.id.includes('scene'));
      take('Selected object',()=>true);
    } else if (g.name === "View") {
      take('Editor tabs',c=>c.id.startsWith('view.panel.')||['view.viewport','view.game','view.problems'].includes(c.id));
      take(
        "Layout presets",
        (c) => c.id.startsWith("view.layout.") && c.id !== "view.layout.reset",
      );
      take(
        null,
        (c) => ["view.frame", "view.frameall", "view.problems"].includes(c.id),
      );
      take("View settings", () => true);
    } else if (g.name === "Help") {
      take(null, (c) => !c.id.startsWith("help.lang"));
      take("Language", () => true);
    } else take(null, () => true);
    return groups;
  };

  return (
    <div className={`a-menubar${nativeTitlebar ? " a-menubar--native" : ""}`} ref={barRef}
      onBlur={(e) => { if (e.relatedTarget && !e.currentTarget.contains(e.relatedTarget)) setOpen(null); }}
      onFocus={(e) => { if (!e.target.closest(".a-menu")) setOpen(null); }}
      onKeyDown={(e) => {
        const trigger = e.target.closest(".a-menu__btn");
        if (trigger && ["ArrowLeft", "ArrowRight"].includes(e.key)) {
          const buttons = [...barRef.current.querySelectorAll(".a-menu__btn")];
          const next = buttons[(buttons.indexOf(trigger) + (e.key === "ArrowRight" ? 1 : -1) + buttons.length) % buttons.length];
          e.preventDefault(); e.stopPropagation(); next.focus();
          if (open) setOpen(next.dataset.menu);
        } else if (trigger && ["ArrowDown", "ArrowUp"].includes(e.key)) {
          e.preventDefault(); e.stopPropagation();
          const direction = e.key === "ArrowUp" ? "last" : "first";
          if (open === trigger.dataset.menu) {
            const controls = visibleEditorControls(barRef.current, '.a-menu__pop button, .a-menu__pop summary');
            (direction === "last" ? controls[controls.length - 1] : controls[0])?.focus();
          } else { focusMenu.current = direction; setOpen(trigger.dataset.menu); }
        } else if (e.target.closest(".a-menu__pop") && ["ArrowDown", "ArrowUp", "Home", "End"].includes(e.key)) {
          const controls = visibleEditorControls(barRef.current, '.a-menu__pop button, .a-menu__pop summary');
          const at = controls.indexOf(e.target);
          const next = e.key === "Home" ? 0 : e.key === "End" ? controls.length - 1 :
            (at + (e.key === "ArrowDown" ? 1 : -1) + controls.length) % controls.length;
          e.preventDefault(); e.stopPropagation(); controls[next]?.focus();
        }
      }}>
      <div className="a-brand">
        <EditorIcon name="cube" size={30}/>
        <div>
          <div className="a-brand__name">
            <input
              className="a-input"
              aria-label={tr("Project name")}
              value={project.name}
              onChange={(e) => onRenameProject(e.target.value)}
              title={tr("Project name")}
            />
          </div>
        </div>
      </div>
      <span className="a-header-divider"/>
      <details className="a-scene-switcher">
        <summary aria-label={`${tr('Current scene')}: ${scene.name}`} title={tr("Current scene")}><EditorIcon name="cube" size={18}/><span>{scene.name}</span><EditorIcon name="chevron" size={15}/></summary>
        <div className="a-scene-switcher__pop">
          <div className="a-menu-label">{tr("Scenes")}</div>
          {project.scenes.map(s=><button key={s.id} className="a-menu__item" aria-current={s.id===scene.id?'true':undefined} onClick={e=>{e.currentTarget.closest('details').open=false;onSwitchScene(s.id);}}><EditorIcon name="cube" size={18}/>{s.name}{s.id===scene.id&&<span className="a-grow"/>}{s.id===scene.id&&'✓'}</button>)}
          <button className="a-menu__item" onClick={e=>{e.currentTarget.closest('details').open=false;invoke('file.newscene');}}><EditorIcon name="plus" size={18}/>{tr("New scene…")}</button>
        </div>
      </details>
      <span className="a-header-divider"/>

      {groups.map((g) => (
        <div className="a-menu" key={g.name}>
          <button
            className={`a-menu__btn${
              open === g.name ? " a-menu__btn--open" : ""
            }`}
            aria-expanded={open === g.name}
            aria-haspopup="true"
            data-menu={g.name}
            onClick={(e) => {
              e.stopPropagation();
              setOpen(open === g.name ? null : g.name);
            }}
          >
            {tr(g.name==='Add'?'Create':g.name)}
          </button>
          {open === g.name && (
            <div className="a-menu__pop">
              {sections(g).map((section, i) =>
                section.label
                  ? (g.name==='Add'&&section.label==='More objects'||section.label==='Layout presets'||section.label==='Language'?(
                    <details className="a-menu-disclosure" key={tr(section.label)}>
                      <summary>{tr(section.label)}</summary>
                      {section.items.map(item)}
                    </details>
                  ):<div className="a-menu-section" key={tr(section.label)}><div className="a-menu-section__label">{tr(section.label)}</div>{section.items.map(item)}</div>)
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
        {['undo','redo'].map(name=>action(`edit.${name}`)&&<button key={name} className="a-btn a-btn--ghost a-header-history" aria-label={name==='undo'?tr("Undo"):tr("Redo")} title={name==='undo'?tr("Undo (Ctrl+Z)"):tr("Redo (Ctrl+Shift+Z)")} disabled={action(`edit.${name}`).enabled?!action(`edit.${name}`).enabled():false} onClick={()=>invoke(`edit.${name}`)}><EditorIcon name={name}/></button>)}
        {action("file.save") && <button className="a-btn a-btn--ghost" onClick={() => invoke("file.save")}
          title={projectFileName ? `Save ${projectFileName} (Ctrl+S)` : tr("Save a project file (Ctrl+S)")}>
          <EditorIcon name="save" size={18}/>{tr("Save")}{dirty && <span className="a-save-dot" aria-label={tr("Unsaved changes")} />}
        </button>}
        {canRunLocally && action("file.play") && <button className="a-btn a-run-button" onClick={() => invoke("file.play")}
          disabled={!!playBusy || !!(action("file.play").enabled && !action("file.play").enabled())}
          title={tr("Try the open scene in PCSX2 (F5)")}>
          <EditorIcon name={playing?'stop':'play'} size={18}/>{playBusy ? (playing ? "Stopping…" : "Preparing…") : playing ? tr("Stop game") : tr("Play")}
        </button>}
        {action("file.export") && <button className="a-btn a-btn--primary a-export-button" onClick={() => invoke("file.export")}><EditorIcon name="export" size={19}/>{tr("Export Game…")}</button>}
        <details className="a-language-picker">
          <summary className="a-btn a-btn--ghost" title={t('common.language')} aria-label={t('common.language')}>🌐 {LANGS.find(l=>l.id===getLang())?.label}</summary>
          <div className="a-language-picker__pop">
            {LANGS.map(l=><button key={l.id} className="a-menu__item" aria-pressed={getLang()===l.id} onClick={e=>{e.currentTarget.closest('details').open=false;invoke(`help.lang.${l.id}`);}}>{l.label}{getLang()===l.id&&' ✓'}</button>)}
          </div>
        </details>
      </div>
    </div>
  );
}
