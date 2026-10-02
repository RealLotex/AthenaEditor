// ═══════════════════════════════════════════════════════════════════════
//  HUD EDITOR — 2D overlay laid out at PS2 resolution
//
//  The canvas is a fixed 640x448 (NTSC) so pixel positions in the editor are
//  the pixel positions the engine draws at. Drag to move, drag an edge to
//  resize; both snap to whole pixels because Draw.rect takes integers.
// ═══════════════════════════════════════════════════════════════════════

const HUD_W = 640;
const HUD_H = 448;
const UI_TYPES = ["Text", "Panel", "Button", "ProgressBar", "Image"];

function HUDEditor({ scene, selectedId, files, onSelect, onUpdate, onAdd, onDelete, onDuplicate }) {
  const wrapRef = useRef(null);
  const [scale, setScale] = useState(1);
  const drag = useRef(null);
  useHUDfonts(wrapRef, files, scene?.uiElements || []);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const fit = () => {
      const pad = 32;
      setScale(Math.max(0.35, Math.min(
        (el.clientWidth - pad) / HUD_W,
        (el.clientHeight - pad) / HUD_H,
        1.8,
      )));
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const els = [...(scene?.uiElements || [])].sort((a, b) => (a.zindex || 0) - (b.zindex || 0));

  const onPointerDown = (e, el, handle) => {
    e.stopPropagation();
    onSelect(el.id);
    drag.current = {
      id: el.id, handle,
      startX: e.clientX, startY: e.clientY,
      x: el.x, y: el.y, w: el.width, h: el.height,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = Math.round((e.clientX - d.startX) / scale);
    const dy = Math.round((e.clientY - d.startY) / scale);
    if (!d.moved && Math.abs(dx) < 1 && Math.abs(dy) < 1) return;
    d.moved = true;
    if (d.handle === "move") {
      onUpdate(d.id, { x: clamp(d.x + dx, -200, HUD_W), y: clamp(d.y + dy, -200, HUD_H) }, "edit");
    } else {
      onUpdate(d.id, {
        width: Math.max(8, d.w + dx),
        height: Math.max(8, d.h + dy),
      }, "edit");
    }
  };

  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    try { e.currentTarget.releasePointerCapture(e.pointerId); } catch (_e) {}
    if (d?.moved) onUpdate(d.id, {}, "commit");
  };

  return (
    <div className="a-viewport" ref={wrapRef} style={{ display: "flex", alignItems: "center", justifyContent: "center" }}
      onMouseDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}>
      <div className="a-viewport__toolbar">
        {UI_TYPES.map((t) => (
          <button key={t} className="a-btn a-btn--sm" onClick={() => onAdd(t)} title={`Add ${t}`}>
            {UI_ICON[t]} {t}
          </button>
        ))}
      </div>

      <div
        style={{
          position: "relative", width: HUD_W * scale, height: HUD_H * scale,
          background: "var(--bg-0)", border: "1px solid var(--line-strong)",
          boxShadow: "0 6px 30px rgba(0,0,0,.5)", overflow: "hidden", flexShrink: 0,
        }}
        onMouseDown={(e) => { if (e.target === e.currentTarget) onSelect(null); }}
      >
        {/* safe-area guide — CRTs overscan the outer ~5% */}
        <div style={{
          position: "absolute", inset: `${HUD_H * scale * 0.05}px ${HUD_W * scale * 0.05}px`,
          border: "1px dashed var(--line-strong)", opacity: .5, pointerEvents: "none",
        }} />

        {els.map((el) => {
          const sel = el.id === selectedId;
          return (
            <div
              key={el.id}
              onPointerDown={(e) => onPointerDown(e, el, "move")}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              style={{
                position: "absolute",
                left: el.x * scale, top: el.y * scale,
                width: el.width * scale, height: el.height * scale,
                opacity: el.visible === false ? 0.35 : 1,
                outline: sel ? "1px solid var(--accent)" : "1px dashed rgba(140,170,200,.3)",
                outlineOffset: 0, cursor: "move", overflow: "hidden",
                display: "flex", alignItems: "center",
                ...hudElementStyle(el, scale, files),
              }}
              title={el.name}
            >
              {hudElementContent(el, scale)}
              {sel && (
                <div
                  onPointerDown={(e) => onPointerDown(e, el, "resize")}
                  onPointerMove={onPointerMove}
                  onPointerUp={onPointerUp}
                  style={{
                    position: "absolute", right: -3, bottom: -3, width: 8, height: 8,
                    background: "var(--accent)", cursor: "nwse-resize", borderRadius: 2,
                  }}
                />
              )}
            </div>
          );
        })}

        {!els.length && (
          <div className="a-viewport__empty" style={{ position: "absolute", inset: 0 }}>
            <div>No HUD elements.</div>
            <div className="a-dim">Add one from the toolbar above.</div>
          </div>
        )}
      </div>

      <div className="a-viewport__hud">
        <span className="a-viewport__chip">{HUD_W} x {HUD_H}</span>
        <span className="a-viewport__chip">{Math.round(scale * 100)}%</span>
      </div>
    </div>
  );
}

const rgba = (c, d) => {
  const o = c || d;
  // PS2 alpha is 0..128 where 128 means fully opaque.
  return `rgba(${o.r}, ${o.g}, ${o.b}, ${clamp((o.a ?? 128) / 128, 0, 1)})`;
};

function hudElementStyle(el, scale, files) {
  switch (el.type) {
    case "Panel":
    case "Button":
      return { background: rgba(el.bgColor, { r: 50, g: 50, b: 80, a: 200 }) };
    case "ProgressBar":
      return { background: rgba(el.barBgColor, { r: 30, g: 30, b: 30, a: 200 }) };
    case "Image": {
      const f = files.find((x) => x.name === el.image && x.cat === "textures");
      return f?.dataUrl
        ? { backgroundImage: `url(${f.dataUrl})`, backgroundSize: "100% 100%", imageRendering: el.imageFilter === "NEAREST" ? "pixelated" : "auto" }
        : { background: "repeating-linear-gradient(45deg, #1a2433 0 6px, #131b27 6px 12px)" };
    }
    default:
      return {};
  }
}

function hudElementContent(el, scale) {
  if (el.type === "ProgressBar") {
    return (
      <div style={{
        width: `${clamp(el.progress ?? 0.6, 0, 1) * 100}%`, height: "100%",
        background: rgba(el.barColor, { r: 0, g: 200, b: 100, a: 200 }),
      }} />
    );
  }
  if (el.type === "Text" || el.type === "Button") {
    return (
      <span style={{
        padding: el.type === "Button" ? `0 ${6 * scale}px` : 0,
        fontSize: (el.fontSize || 14) * scale,
        color: rgba(el.textColor, { r: 200, g: 200, b: 200, a: 128 }),
        fontFamily: el.fontFile && el.fontFile !== "default" ? `"${hudFontFamily(el.fontFile)}", var(--font-mono)` : "var(--font-mono)", whiteSpace: "pre", pointerEvents: "none",
      }}>{el.text}</span>
    );
  }
  return null;
}

// ── inspector for a HUD element ────────────────────────────────────────

function UIElementInspector({ el, files, onUpdate, onDelete, onImportFont }) {
  const set = (patch, phase) => onUpdate(el.id, patch, phase);
  const isText = el.type === "Text" || el.type === "Button";

  return (
    <>
      <PanelHeader title={`HUD — ${el.type}`}>
        <button className="a-btn a-btn--icon a-btn--sm a-btn--ghost a-btn--danger" title="Delete" onClick={() => onDelete(el.id)}>✕</button>
      </PanelHeader>
      <div className="a-scroll" style={{ padding: 8 }}>
        <Field label="Name"><TextInput value={el.name} onChange={(v) => set({ name: v })} /></Field>
        <Field label="Visible"><Checkbox value={el.visible !== false} onChange={(v) => set({ visible: v })} /></Field>

        <div className="a-sec__group">Layout</div>
        <Field label="Position">
          <div className="a-vec a-vec--2">
            <NumInput axis="x" value={el.x} step={1} integer onChange={(v, p) => set({ x: v }, p)} />
            <NumInput axis="y" value={el.y} step={1} integer onChange={(v, p) => set({ y: v }, p)} />
          </div>
        </Field>
        <Field label="Size">
          <div className="a-vec a-vec--2">
            <NumInput value={el.width} step={1} min={1} integer onChange={(v, p) => set({ width: v }, p)} />
            <NumInput value={el.height} step={1} min={1} integer onChange={(v, p) => set({ height: v }, p)} />
          </div>
        </Field>
        <Field label="Z Order" help="Higher draws on top.">
          <NumInput value={el.zindex || 0} step={1} integer onChange={(v, p) => set({ zindex: v }, p)} />
        </Field>

        {isText && (
          <>
            <div className="a-sec__group">Text</div>
            <Field label="Content"><TextInput value={el.text} onChange={(v) => set({ text: v })} /></Field>
            <Field label="Font Size"><NumInput value={el.fontSize} step={1} min={4} max={64} integer onChange={(v, p) => set({ fontSize: v }, p)} /></Field>
            <Field label="Font" help="Blank uses the built-in font.">
              <AssetSelect value={el.fontFile === "default" ? "" : el.fontFile} cat="fonts" files={files} showImportHint={!onImportFont}
                onChange={(v) => set({ fontFile: v || "default" })} placeholder="default" />
              {onImportFont && <HUDfontImport elementId={el.id} onImport={onImportFont} />}
            </Field>
            <Field label="Colour"><Color255Input value={el.textColor} onChange={(v, p) => set({ textColor: v }, p)} /></Field>
          </>
        )}

        {(el.type === "Panel" || el.type === "Button") && (
          <>
            <div className="a-sec__group">Background</div>
            <Field label="Colour"><Color255Input value={el.bgColor} onChange={(v, p) => set({ bgColor: v }, p)} /></Field>
          </>
        )}

        {el.type === "ProgressBar" && (
          <>
            <div className="a-sec__group">Bar</div>
            <Field label="Progress"><NumInput value={el.progress} step={0.05} min={0} max={1} onChange={(v, p) => set({ progress: v }, p)} /></Field>
            <Field label="Fill"><Color255Input value={el.barColor} onChange={(v, p) => set({ barColor: v }, p)} /></Field>
            <Field label="Track"><Color255Input value={el.barBgColor} onChange={(v, p) => set({ barBgColor: v }, p)} /></Field>
          </>
        )}

        {el.type === "Image" && (
          <>
            <div className="a-sec__group">Image</div>
            <Field label="Texture" required><AssetSelect value={el.image} cat="textures" files={files} onChange={(v) => set({ image: v })} /></Field>
            <Field label="Filter">
              <Select value={el.imageFilter} onChange={(v) => set({ imageFilter: v })}
                options={[{ value: "LINEAR", label: "Linear" }, { value: "NEAREST", label: "Nearest" }]} />
            </Field>
          </>
        )}

        <div className="a-sec__group">Script</div>
        <Field label="Module" help="Exports init(ctx) and update(ctx, pad).">
          <AssetSelect value={el.script?.file} cat="scripts" files={files}
            onChange={(v) => set({ script: { ...el.script, file: v } })} />
        </Field>
        <Field label="ctx Key">
          <TextInput value={el.script?.ctxKey} onChange={(v) => set({ script: { ...el.script, ctxKey: v } })} />
        </Field>
      </div>
    </>
  );
}
