function SkyboxEditor({ scene, files, onUpdate, onApply }) {
  const sky = normalizedSkybox(scene.skybox), input = useRef(null), alive = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [dragging, setDragging] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const asset = files.find(f => f.cat === "textures" && f.name === sky.texture);
  const preset = SKYBOX_PRESETS.find(p => p.id === sky.preset);
  const own = files.filter(f => f.cat === "textures" && f.dataUrl && f.editKind === "skybox" && !f.skyboxPreset);
  const choose = (settings, next) => { setError(""); onApply({ ...sky, ...settings, enabled: true }, next); };
  const upload = async file => {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const next = await importSkyboxTexture(file);
      if (alive.current) choose({ preset: "", texture: next.name }, next);
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setBusy(false); }
  };
  const slider = (key, label, max, step, display) => <label className="a-skybox__slider">
    <span>{label}<output>{display}</output></span>
    <input type="range" aria-label={label} min="0" max={max} step={step} value={sky[key]} disabled={busy}
      onChange={e => onUpdate(`skybox.${key}`, Number(e.target.value), "edit")} />
  </label>;
  return <div className={`a-skybox${dragging ? " a-skybox--drag" : ""}`} aria-busy={busy}
    onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.stopPropagation(); setDragging(true); } }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
    onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); upload(e.dataTransfer.files[0]); }}>
    <div className={`a-skybox__hero${sky.enabled && asset ? "" : " a-skybox__hero--off"}`}>
      {asset && <img src={asset.dataUrl} alt="Selected sky panorama" style={{ filter: `brightness(${sky.brightness})`, objectPosition: `${sky.rotation / 360 * 100}% center` }} />}
      <div className="a-skybox__hero-caption"><strong>{sky.enabled ? (preset?.name || asset?.skyboxLabel || "Custom sky") : "Scene background"}</strong></div>
      {sky.enabled && <button className="a-skybox__remove" aria-label="Remove sky" disabled={busy} onClick={() => onUpdate("skybox.enabled", false)}>×</button>}
    </div>
    <div className="a-skybox__grid" aria-label="Sky presets">{SKYBOX_PRESETS.map(p => <button key={p.id}
      className={`a-skybox__tile${sky.enabled && sky.preset === p.id ? " a-skybox__tile--on" : ""}`} aria-pressed={sky.enabled && sky.preset === p.id}
      disabled={busy} onClick={() => choose({ preset: p.id }, skyboxPresetAsset(p.id))} title={p.mood}>
      <img src={SKYBOX_PRESET_IMAGES[p.id]} alt="" loading="lazy" /><span>{p.name}</span><i aria-hidden="true">✓</i>
    </button>)}</div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label="Import sky panorama" onChange={e => { upload(e.target.files[0]); e.target.value = ""; }} />
    <button className="a-skybox__upload" disabled={busy} onClick={() => input.current.click()}><span aria-hidden="true">＋</span>{busy ? "Preparing…" : "Import panorama…"}</button>
    <p className="a-skybox__hint">{dragging ? "Drop your panorama here." : "Drop a 360° panorama · PNG, JPG or WebP"}</p>
    {error && <div className="a-skybox__error" role="alert">{error}</div>}
    {own.length > 0 && <div className="a-skybox__own"><span>Imported skies</span><div className="a-skybox__grid">{own.map(f => <button key={f.id || f.name} title={f.name} disabled={busy}
      className={`a-skybox__tile${sky.enabled && !sky.preset && sky.texture === f.name ? " a-skybox__tile--on" : ""}`}
      aria-pressed={sky.enabled && !sky.preset && sky.texture === f.name} onClick={() => choose({ preset: "", texture: f.name })}>
      <img src={f.dataUrl} alt="" /><span>{f.skyboxLabel || f.name}</span><i aria-hidden="true">✓</i></button>)}</div></div>}
    {sky.enabled && asset && <div className="a-skybox__adjustments">
      {slider("rotation", "Rotation", 359, 1, `${Math.round(sky.rotation)}°`)}
      {slider("brightness", "Brightness", 1, .01, `${Math.round(sky.brightness * 100)}%`)}
      <details><summary>Use a project image</summary><select className="a-select" aria-label="Sky image" value={sky.texture} disabled={busy}
        onChange={async e => { const f = files.find(f => f.name === e.target.value && f.cat === "textures"); if (!f) return;
          setBusy(true); setError(""); try { const next = await prepareSkyboxTexture(f); if (alive.current) choose({ preset: "" }, next); }
          catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setBusy(false); }
        }}><option value={sky.texture}>{asset.skyboxLabel || asset.name}</option>{files.filter(f => f.cat === "textures" && f.dataUrl && f.name !== sky.texture).map(f => <option key={f.id || f.name} value={f.name}>{f.name}</option>)}</select></details>
    </div>}
  </div>;
}
