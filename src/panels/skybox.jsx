function SkyboxEditor({ scene, project, files, onUpdate, onApply, onWideCamera }) {
  const [pending, setPending] = useState(null);
  const sky = { ...normalizedSkybox(scene.skybox), ...pending }, input = useRef(null), alive = useRef(true);
  const [busy, setBusy] = useState(false), [error, setError] = useState(""), [dragging, setDragging] = useState(false);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);
  const asset = files.find(f => f.cat === "textures" && f.name === sky.texture);
  const preset = SKYBOX_PRESETS.find(p => p.id === sky.preset);
  const own = files.filter(f => f.cat === "textures" && f.dataUrl && f.editKind === "skybox" && !f.skyboxPreset);
  const choose = async (settings, next) => {
    if (busy) return;
    const value = { ...sky, ...(!sky.texture ? { textureSize: 1024, bitDepth: 4, upperOnly: true } : {}), ...settings, enabled: true };
    setError(""); setPending(value); setBusy(true);
    try {
      await new Promise(resolve => setTimeout(resolve, 0)); // Paint Preparing before converting pixels.
      if (next) next = await prepareSkyboxLayout(next, value);
      if (alive.current) onApply(value, next);
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) { setBusy(false); setPending(null); } }
  };
  const upload = async file => {
    if (!file || busy) return;
    setBusy(true); setError("");
    try {
      const next = await importSkyboxTexture(file);
      if (alive.current) await choose({ preset: "", texture: next.name }, next);
    } catch (e) { if (alive.current) setError(e.message); }
    finally { if (alive.current) setBusy(false); }
  };
  const slider = (key, label, max, step, display) => <label className="a-skybox__slider">
    <span>{tr(label)}<output>{display}</output></span>
    <input type="range" aria-label={tr(label)} min="0" max={max} step={step} value={sky[key]} disabled={busy}
      onChange={e => onUpdate(`skybox.${key}`, Number(e.target.value), "edit")} />
  </label>;
  return <div className={`a-skybox${dragging ? " a-skybox--drag" : ""}`} aria-busy={busy}
    onDragOver={e => { if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); e.stopPropagation(); setDragging(true); } }}
    onDragLeave={e => { if (!e.currentTarget.contains(e.relatedTarget)) setDragging(false); }}
    onDrop={e => { e.preventDefault(); e.stopPropagation(); setDragging(false); upload(e.dataTransfer.files[0]); }}>
    <div className={`a-skybox__hero${sky.enabled && asset ? "" : " a-skybox__hero--off"}`}>
      {asset && <img src={asset.dataUrl} alt={tr("Selected sky panorama")} style={{ filter: `brightness(${sky.brightness})` }} />}
      <div className="a-skybox__hero-caption"><strong>{sky.enabled ? (preset ? tr(preset.name) : asset?.skyboxLabel || tr("Custom sky")) : tr("Scene background")}</strong></div>
      {sky.enabled && <button className="a-skybox__remove" aria-label={tr("Remove sky")} disabled={busy} onClick={() => onUpdate("skybox.enabled", false)}>×</button>}
    </div>
    <div className="a-skybox__grid" aria-label={tr("Sky presets")}>{SKYBOX_PRESETS.map(p => <button key={p.id}
      className={`a-skybox__tile${sky.enabled && sky.preset === p.id ? " a-skybox__tile--on" : ""}`} aria-pressed={sky.enabled && sky.preset === p.id}
      disabled={busy} onClick={() => choose({ preset: p.id }, skyboxPresetAsset(p.id))} title={tr(p.mood)}>
      <img src={SKYBOX_PRESET_IMAGES[p.id]} alt="" loading="lazy" /><span>{tr(p.name)}</span><i aria-hidden="true">✓</i>
    </button>)}</div>
    <input ref={input} type="file" accept="image/png,image/jpeg,image/webp" hidden aria-label={tr("Import sky panorama")} onChange={e => { upload(e.target.files[0]); e.target.value = ""; }} />
    <button className="a-skybox__upload" disabled={busy} onClick={() => input.current.click()}><span aria-hidden="true">＋</span>{busy ? tr("Preparing…") : tr("Import panorama…")}</button>
    <p className="a-skybox__hint">{dragging ? tr("Drop your panorama here.") : tr("360° × 180° panorama · PNG, JPG or WebP")}</p>
    {error && <div className="a-skybox__error" role="alert">{error}</div>}
    {own.length > 0 && <div className="a-skybox__own"><span>{tr("Imported skies")}</span><div className="a-skybox__grid">{own.map(f => <button key={f.id || f.name} title={f.name} disabled={busy}
      className={`a-skybox__tile${sky.enabled && !sky.preset && sky.texture === f.name ? " a-skybox__tile--on" : ""}`}
      aria-pressed={sky.enabled && !sky.preset && sky.texture === f.name} onClick={() => choose({ preset: "", texture: f.name }, f)}>
      <img src={f.dataUrl} alt="" /><span>{f.skyboxLabel || f.name}</span><i aria-hidden="true">✓</i></button>)}</div></div>}
    {sky.enabled && asset && <div className="a-skybox__adjustments">
      <label className="a-skybox__slider"><span>{tr("Color depth")}<output>{sky.bitDepth} {tr("bits · ")}{sky.bitDepth === 4 ? "16" : sky.bitDepth === 8 ? "256" : "32,768"} {tr("colors")}</output></span>
        <input type="range" aria-label={tr("Sky color depth")} min="0" max="2" step="1" value={SKYBOX_BIT_DEPTHS.indexOf(sky.bitDepth)} disabled={busy} onChange={e=>choose({bitDepth:SKYBOX_BIT_DEPTHS[Number(e.target.value)]},asset)} />
      </label>
      <label className="a-skybox__slider"><span>{tr("Panorama resolution")}<output>{sky.textureSize*2} × {sky.textureSize / (sky.upperOnly ? 2 : 1)}</output></span>
        <input type="range" aria-label={tr("Sky texture size")} min="0" max={SKYBOX_TEXTURE_SIZES.length - 1} step="1" value={SKYBOX_TEXTURE_SIZES.indexOf(sky.textureSize)} disabled={busy} onChange={e=>choose({textureSize:SKYBOX_TEXTURE_SIZES[Number(e.target.value)]},asset)} />
      </label>
      <label><input type="checkbox" aria-label={tr("Remove lower sky hemisphere")} checked={sky.upperOnly} disabled={busy} onChange={e=>choose({upperOnly:e.target.checked},asset)} /> {tr("Remove lower hemisphere")}</label>
      {sky.upperOnly&&<>
        <Field label={tr("Lower backdrop")}><select className="a-select" aria-label={tr("Lower sky backdrop")} value={sky.backdropMode} disabled={busy} onChange={e=>onUpdate("skybox.backdropMode",e.target.value)}>
          {SKYBOX_BACKDROPS.map((mode,i)=><option key={mode} value={mode}>{tr(["Solid color","Gradient","Foggy gradient","Mirror"][i])}</option>)}
        </select></Field>
        {sky.backdropMode!=="mirror"&&<>
          {(sky.backdropMode==="solid"?["backdropColor"]:["horizonColor","backdropColor"]).map(key=><Field key={key} label={tr(key==="horizonColor"?"Horizon color":"Backdrop color")}>
            <Color01Input value={Object.fromEntries(["r","g","b"].map(c=>[c,sky[key][c]/255]))} onChange={(v,p)=>onUpdate(`skybox.${key}`,Object.fromEntries(["r","g","b"].map(c=>[c,Math.round(v[c]*255)])),p)} />
          </Field>)}
          {sky.backdropMode==="foggy"&&slider("fogHeight","Fog height above horizon",60,1,`${sky.fogHeight}°`)}
        </>}
        <p className="a-skybox__hint">{tr("Backdrops use vertex colors; Mirror reuses the sky. No extra texture VRAM.")}</p>
      </>}
      <p className="a-skybox__hint">{busy ? tr("Preparing sky textures…") : <>{sky.textureSize * 2} × {sky.textureSize / (sky.upperOnly ? 2 : 1)} {tr("panorama · ")}{sky.tiles.length ? `${sky.tiles.length} tiles (up to ${sky.textureSize} px each)` : tr("one texture")} · {fmtBytes(sky.tiles.length ? sky.tiles.reduce((sum, name)=>sum + (textureVRAMBytes(files.find(f=>f.cat === "textures" && f.name === name)) || 0), 0) : textureVRAMBytes(asset) || 0)} {tr("VRAM")}</>}</p>
      {(() => { const original = skyboxSourceSize(asset), enlarged = original && (original.width < sky.textureSize * 2 || original.height < sky.textureSize); return original && <p className={`a-skybox__hint${enlarged ? " a-skybox__error" : ""}`} role="status">{tr("Original: ")}{original.width} × {original.height}{enlarged ? tr(" · Enlarged; no additional detail. Import a larger original.") : tr(" · Converted directly from original")}</p>; })()}
      {skyboxNeedsSourceRefresh(scene, files) && <button className="a-btn" disabled={busy} onClick={() => choose({}, asset)}>{tr("Refresh from original")}</button>}
      {project && (()=>{const b=sceneVRAMBudget(scene,files,project);return <p className={`a-skybox__hint${b.total > b.capacity ? " a-skybox__error" : ""}`} role="status">{tr("Scene estimate: ")}{fmtBytes(b.total)} {tr("/ 4.0 MB · ")}{b.formats.join(" + ")}{b.total > b.capacity ? tr(" · See Problems") : ""}</p>;})()}
      <label><input type="checkbox" aria-label={tr("Sky linear filtering")} checked={sky.textureFilter === "LINEAR"} disabled={busy} onChange={e=>onUpdate("skybox.textureFilter", e.target.checked ? "LINEAR" : "NEAREST")} /> {tr("Linear filtering")}</label>
      {onWideCamera && <button className="a-btn a-btn--ghost" onClick={onWideCamera}>{tr("Use wide Game camera · 100°")}</button>}
      {slider("rotation", "Rotation", 359, 1, `${Math.round(sky.rotation)}°`)}
      {slider("brightness", "Brightness", 1, .01, `${Math.round(sky.brightness * 100)}%`)}
      <details><summary>{tr("Use a project image")}</summary><select className="a-select" aria-label={tr("Sky image")} value={sky.texture} disabled={busy}
        onChange={async e => { const f = files.find(f => f.name === e.target.value && f.cat === "textures"); if (!f) return;
          setBusy(true); setError(""); try { const next = await prepareSkyboxTexture(f); if (alive.current) await choose({ preset: "" }, next); }
          catch (e) { if (alive.current) setError(e.message); } finally { if (alive.current) setBusy(false); }
        }}><option value={sky.texture}>{asset.skyboxLabel || asset.name}</option>{files.filter(f => f.cat === "textures" && f.dataUrl && f.editKind !== "skyboxTile" && f.name !== sky.texture).map(f => <option key={f.id || f.name} value={f.name}>{f.name}</option>)}</select></details>
    </div>}
  </div>;
}
