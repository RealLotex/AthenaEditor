function EditorControlsPanel({ mouse, hotkeys, commands, onMouse, onHotkeys }) {
  const settings = normalizeEditorMouse(mouse), [error, setError] = useState(""), [search, setSearch] = useState(""), [recording, setRecording] = useState(null);
  const [open, setOpen] = useState({ camera: true, selection: true, shortcuts: true });
  const toggle = key => setOpen(value => ({ ...value, [key]: !value[key] }));
  const bindMouse = (action, binding) => {
    const conflict = editorMouseConflict(settings, action, binding);
    if (conflict) { setError(`This mouse gesture is already assigned to ${conflict}. Change that binding first.`); return; }
    setError(""); onMouse({ ...settings, [action]: binding });
  };
  const bindKey = (command, keys) => {
    const conflict = editorHotkeyConflict(commands, command.id, keys);
    if (conflict) { setError(`${keys} is already assigned to ${conflict.title}. Clear that shortcut first.`); return; }
    setError(""); onHotkeys({ ...hotkeys, [command.id]: keys }); setRecording(null);
  };
  const preset = Object.entries(EDITOR_MOUSE_PRESETS).find(([, value]) => ["orbit", "pan", "dolly"].every(action => settings[action].button === value[action][0] && settings[action].modifier === value[action][1]))?.[0] || "custom";
  return <><PanelHeader title={tr("Controls")} /><div className="a-scroll" style={{ paddingBottom: 12 }}>
    <Section title={tr("Camera navigation")} open={open.camera} onToggle={() => toggle("camera")}>
      <Field label={tr("Preset")}><Select value={preset} options={[...Object.entries(EDITOR_MOUSE_PRESETS).map(([value, item]) => ({ value, label: item.name })), { value: "custom", label: tr("Custom") }]} onChange={id => { if (id !== "custom") { onMouse(editorMousePreset(id, settings)); setError(""); } }} /></Field>
      {[['orbit', 'Orbit'], ['pan', 'Pan'], ['dolly', 'Dolly']].map(([action, label]) => <Field key={action} label={tr(label)}>
        <div className="a-row"><Select value={settings[action].modifier} options={[{value:'none',label:tr("No modifier")},{value:'alt',label:tr("Alt")},{value:'ctrl',label:tr("Ctrl / Cmd")},{value:'shift',label:tr("Shift")}]} onChange={modifier => bindMouse(action, { ...settings[action], modifier })} />
        <Select value={settings[action].button} options={[{value:-1,label:tr("Disabled")},{value:0,label:tr("Left mouse")},{value:1,label:tr("Middle mouse")},{value:2,label:tr("Right mouse")}]} onChange={button => bindMouse(action, { ...settings[action], button:Number(button) })} /></div>
      </Field>)}
      {[['orbitSpeed','Orbit speed'],['panSpeed','Pan speed'],['zoomSpeed','Zoom speed']].map(([key,label]) => <Field key={key} label={tr(label)}><NumInput value={settings[key]} min={.1} max={5} step={.1} onChange={value => onMouse({...settings,[key]:value})} /></Field>)}
      <Field label={tr("Invert wheel")}><Checkbox value={settings.invertWheel} onChange={value => onMouse({...settings,invertWheel:value})} /></Field>
      <Field label={tr("Smooth navigation")}><Checkbox value={settings.damping} onChange={value => onMouse({...settings,damping:value})} /></Field>
      <div className="a-field__help">{tr("The wheel zooms. Mouse bindings also apply in Terrain; Alt keeps a navigation gesture separate from painting.")}</div>
    </Section>
    <Section title={tr("Selection")} open={open.selection} onToggle={() => toggle("selection")}>
      <Field label={tr("Drag threshold")} help={tr("Selection changes on release only when the pointer stays within this many screen pixels. A drag keeps the current selection.")}><NumInput value={settings.dragThreshold} min={1} max={30} step={1} integer onChange={value => onMouse({...settings,dragThreshold:value})} /></Field>
    </Section>
    <Section title={tr("Keyboard shortcuts")} open={open.shortcuts} onToggle={() => toggle("shortcuts")}>
      <input className="a-input" aria-label={tr("Find shortcut")} placeholder={tr("Find an action…")} value={search} onChange={event => setSearch(event.target.value)} />
      {commands.filter(command => (!command.hidden || command.defaultKeys) && !command.id.startsWith('layout.') && `${command.title} ${command.group}`.toLowerCase().includes(search.toLowerCase())).map(command => <div className="a-control-shortcut" key={command.id}>
        <span title={`${command.group} · ${command.title}`}>{command.title}<small className="a-dim" style={{display:'block'}}>{command.group}</small></span>
        <input className="a-input a-mono" aria-label={`Shortcut for ${command.title}`} readOnly value={recording === command.id ? 'Press a shortcut…' : command.keys || 'Unassigned'}
          onFocus={() => {setRecording(command.id);setError('');}} onBlur={() => setRecording(null)}
          onKeyDown={event => { event.preventDefault(); event.stopPropagation(); if(event.key==='Escape'){setRecording(null);event.currentTarget.blur();return;} if(['Control','Meta','Shift','Alt'].includes(event.key))return;
            const keys=keyComboOf(event); if(['Ctrl+W','Ctrl+T','Ctrl+Tab','Ctrl+L','Ctrl+R','Alt+F4'].includes(keys)){setError('That shortcut is reserved by the browser. Choose another.');return;} bindKey(command,keys);
          }} />
        <button className="a-btn a-btn--sm a-btn--ghost" aria-label={`Clear shortcut for ${command.title}`} onClick={() => bindKey(command,'')}>×</button>
      </div>)}
      <div className="a-field__help">{tr("Click a shortcut, then press its keys. Esc cancels recording. Text editing keeps its own shortcuts.")}</div>
    </Section>
    {error && <div className="a-field__err" role="alert" style={{padding:8}}>{error}</div>}
    <button className="a-btn" style={{margin:8}} onClick={() => {onMouse({...DEFAULT_EDITOR_MOUSE});onHotkeys({});setError('');}}>{tr("Restore default controls")}</button>
  </div></>;
}
