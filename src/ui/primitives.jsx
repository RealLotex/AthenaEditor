// ═══════════════════════════════════════════════════════════════════════
//  PRIMITIVES — the controls every panel is built from.
//
//  Two behaviours worth knowing:
//
//   * Number fields keep their own draft string while focused, so typing
//     "-0.5" does not get rewritten to 0 after the "-". They commit on blur
//     and on Enter, and revert on Escape.
//   * Labels are drag-to-scrub. Dragging a label is one gesture and produces
//     one undo step, because every edit carries the same `tag`.
// ═══════════════════════════════════════════════════════════════════════

const { useState, useRef, useEffect, useCallback, useMemo, useLayoutEffect } =
  React;

/** Field row: label on the left, control on the right, help underneath. */
function Field({ label, help, error, required, stack, children, htmlFor }) {
  const controls = useRef(null);
  useLayoutEffect(() => {
    if (typeof label !== "string") return;
    const inputs = controls.current?.querySelectorAll("input,select,textarea") || [];
    for (const input of inputs) {
      if (!input.hasAttribute("aria-label") && !input.hasAttribute("aria-labelledby")) {
        const axis = input.closest(".a-vec__cell")?.querySelector(".a-vec__axis")?.textContent;
        input.setAttribute("aria-label", `${label}${axis ? ` ${axis}` : ""}`);
      }
      if (error) input.setAttribute("aria-invalid", "true");
      else input.removeAttribute("aria-invalid");
    }
  });
  return (
    <>
      <div className={`a-field${stack ? " a-field--stack" : ""}`}>
        {label !== undefined && (
          <label
            className="a-field__label"
            htmlFor={htmlFor}
            onClick={() => { if (!htmlFor) controls.current?.querySelector("input,select,textarea")?.focus(); }}
            title={help || label}
          >
            {label}
            {required && <span className="a-field__req">*</span>}
          </label>
        )}
        <div ref={controls} role="group" aria-label={typeof label === "string" ? label : undefined}>{children}</div>
      </div>
      {error && <div className="a-field__err">{error}</div>}
      {help && !error && <div className="a-field__help">{help}</div>}
    </>
  );
}

/**
 * Numeric input with a draft buffer and optional drag-to-scrub.
 * `onChange(value, phase)` where phase is "edit" during a drag and
 * "commit" when the gesture ends — panels use it to seal undo steps.
 */
function NumInput(
  { value, onChange, step = 0.1, min, max, integer, axis, disabled, title },
) {
  const [draft, setDraft] = useState(null);
  const drag = useRef(null);
  const shown = draft !== null ? draft : formatNum(value);

  const clampVal = useCallback((n) => {
    let v = n;
    if (integer) v = Math.round(v);
    if (min !== undefined && v < min) v = min;
    if (max !== undefined && v > max) v = max;
    return v;
  }, [integer, min, max]);

  const commit = (raw) => {
    setDraft(null);
    const n = parseFloat(raw);
    if (Number.isFinite(n)) onChange(clampVal(n), "commit");
    else onChange(clampVal(0), "commit");
  };

  const onPointerDown = (e) => {
    if (disabled) return;
    drag.current = { x: e.clientX, start: Number(value) || 0, moved: false };
    e.currentTarget.setPointerCapture(e.pointerId);
  };
  const onPointerMove = (e) => {
    const d = drag.current;
    if (!d) return;
    const dx = e.clientX - d.x;
    if (!d.moved && Math.abs(dx) < 3) return;
    d.moved = true;
    const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
    onChange(clampVal(d.start + dx * step * mult), "edit");
  };
  const onPointerUp = (e) => {
    const d = drag.current;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch (_e) {}
    if (d?.moved) onChange(clampVal(Number(value) || 0), "commit");
  };

  return (
    <div className="a-vec__cell">
      {axis && (
        <span
          className={`a-vec__axis a-vec__axis--${axis} a-scrub`}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          title={`Drag to change ${axis.toUpperCase()} — Shift x10, Alt x0.1`}
        >
          {axis.toUpperCase()}
        </span>
      )}
      <input
        className="a-input a-input--num"
        type="text"
        inputMode="decimal"
        disabled={disabled}
        title={title}
        value={shown}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            commit(e.currentTarget.value);
            e.currentTarget.blur();
          } else if (e.key === "Escape") {
            setDraft(null);
            e.currentTarget.blur();
          } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
            e.preventDefault();
            const mult = e.shiftKey ? 10 : e.altKey ? 0.1 : 1;
            const dir = e.key === "ArrowUp" ? 1 : -1;
            setDraft(null);
            onChange(
              clampVal((Number(value) || 0) + step * mult * dir),
              "commit",
            );
          }
        }}
      />
    </div>
  );
}

/** Three numeric cells with coloured axis handles. */
function Vec3Input(
  { value, onChange, step = 0.1, min, max, degrees, integer, uniformLock },
) {
  const [locked, setLocked] = useState(false);
  const v = value || { x: 0, y: 0, z: 0 };
  const toUI = (n) => (degrees ? (n || 0) * (180 / Math.PI) : n || 0);
  const fromUI = (n) => (degrees ? n * (Math.PI / 180) : n);

  const set = (axis, n, phase) => {
    const next = fromUI(n);
    if (locked && uniformLock) {
      const cur = v[axis] || 0;
      const ratio = Math.abs(cur) > 1e-6 ? next / cur : 1;
      onChange(
        Math.abs(cur) > 1e-6
          ? {
            x: (v.x || 0) * ratio,
            y: (v.y || 0) * ratio,
            z: (v.z || 0) * ratio,
          }
          : { x: next, y: next, z: next },
        phase,
        ["x", "y", "z"],
      );
    } else {
      onChange({ ...v, [axis]: next }, phase, [axis]);
    }
  };

  return (
    <div className="a-row" style={{ gap: 3 }}>
      <div className="a-vec a-vec--3 a-grow">
        {["x", "y", "z"].map((a) => (
          <NumInput
            key={a}
            axis={a}
            step={degrees ? Math.max(step, 1) : step}
            min={min}
            max={max}
            integer={integer}
            value={toUI(v[a])}
            onChange={(n, phase) => set(a, n, phase)}
          />
        ))}
      </div>
      {uniformLock && (
        <button
          className={`a-btn a-btn--icon a-btn--sm${
            locked ? " a-btn--on" : " a-btn--ghost"
          }`}
          onClick={() => setLocked((l) => !l)}
          title={locked ? "Uniform scale on" : "Uniform scale off"}
        >
          {locked ? "⛓" : "⛓"}
        </button>
      )}
    </div>
  );
}

/** Two cells for the X/Z pairs shadows use. */
function Vec2XZInput({ value, onChange, step = 0.1, min, integer }) {
  const v = value || { x: 0, z: 0 };
  return (
    <div className="a-vec a-vec--2">
      {["x", "z"].map((a) => (
        <NumInput
          key={a}
          axis={a}
          step={step}
          min={min}
          integer={integer}
          value={v[a]}
          onChange={(n, phase) => onChange({ ...v, [a]: n }, phase, [a])}
        />
      ))}
    </div>
  );
}

function TextInput(
  { value, onChange, placeholder, mono, invalid, onEnter, id },
) {
  const [draft, setDraft] = useState(null);
  return (
    <input
      id={id}
      className={`a-input${mono ? " a-mono" : ""}${
        invalid ? " a-input--invalid" : ""
      }`}
      value={draft !== null ? draft : (value ?? "")}
      placeholder={placeholder}
      onChange={(e) => setDraft(e.target.value)}
      onBlur={(e) => {
        setDraft(null);
        onChange(e.target.value, "commit");
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          setDraft(null);
          onChange(e.currentTarget.value, "commit");
          onEnter?.();
          e.currentTarget.blur();
        } else if (e.key === "Escape") {
          setDraft(null);
          e.currentTarget.blur();
        }
      }}
    />
  );
}

function Select({ value, onChange, options, placeholder, showHelp = false }) {
  const opts = options || [];
  const known = opts.some((o) => String(o.value) === String(value));
  const hint = opts.find((o) => String(o.value) === String(value))?.help;
  return (
    <>
      <select
        className="a-select"
        value={value ?? ""}
        onChange={(e) => {
          const raw = e.target.value;
          const match = opts.find((o) => String(o.value) === raw);
          onChange(match ? match.value : raw, "commit");
        }}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {!known && value
          ? <option value={value}>{`${value} (missing)`}</option>
          : null}
        {opts.map((o) => (
          <option key={String(o.value)} value={o.value}>{o.label}</option>
        ))}
      </select>
      {showHelp && hint && <div className="a-field__help">{hint}</div>}
    </>
  );
}

const Checkbox = ({ value, onChange, label }) => (
  <label className="a-row" style={{ cursor: "pointer" }}>
    <input
      className="a-check"
      type="checkbox"
      checked={!!value}
      onChange={(e) =>
        onChange(e.target.checked, "commit")}
    />
    {label && <span style={{ fontSize: 11 }}>{label}</span>}
  </label>
);

function colorWithHex(color, hex, range) {
  if (!/^#[0-9a-f]{6}$/i.test(hex)) throw Error("The picked color is invalid.");
  return {
    ...color,
    r: parseInt(hex.slice(1, 3), 16) * range / 255,
    g: parseInt(hex.slice(3, 5), 16) * range / 255,
    b: parseInt(hex.slice(5, 7), 16) * range / 255,
  };
}

function EyeDropperButton({ onPick }) {
  const controller = useRef(null);
  const [error, setError] = useState(null);
  useEffect(() => () => controller.current?.abort(), []);
  if (typeof window.EyeDropper !== "function") return null;
  return <>
    <button
      type="button"
      className="a-btn a-btn--icon a-btn--ghost a-btn--sm"
      aria-label="Pick color from screen"
      title="Pick color from screen"
      onClick={async (event) => {
        if (controller.current) return;
        const pending = new AbortController();
        controller.current = pending;
        setError(null);
        try {
          const view = event?.currentTarget?.ownerDocument?.defaultView || window;
          const { sRGBHex } = await new view.EyeDropper().open({ signal: pending.signal });
          if (!pending.signal.aborted) onPick(sRGBHex);
        } catch (failure) {
          if (failure.name !== "AbortError") setError("Could not pick a screen color.");
        } finally { controller.current = null; }
      }}
    >
      <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" aria-hidden="true">
        <path d="m14 5 5 5M3 21l2-6L16 4a3 3 0 0 1 4 4L9 19l-6 2z" />
      </svg>
    </button>
    {error && <span className="a-field__help" role="status">{error}</span>}
  </>;
}

/** 0..1 float colour, as the Lights and Shadows APIs expect. */
function Color01Input({ value, onChange, alpha }) {
  const c = value || { r: 0, g: 0, b: 0, a: 1 };
  const to255 = (n) => Math.round(clamp(n ?? 0, 0, 1) * 255);
  const hex = `#${
    [c.r, c.g, c.b].map((n) => to255(n).toString(16).padStart(2, "0")).join("")
  }`;
  return (
    <div className="a-row" style={{ gap: 4 }}>
      <input
        type="color"
        value={hex}
        style={{
          width: 26,
          height: 22,
          padding: 0,
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          background: "none",
          cursor: "pointer",
        }}
        onChange={(e) => {
          const v = e.target.value;
          onChange({
            ...c,
            r: parseInt(v.slice(1, 3), 16) / 255,
            g: parseInt(v.slice(3, 5), 16) / 255,
            b: parseInt(v.slice(5, 7), 16) / 255,
          }, "edit");
        }}
      />
      <div
        className={`a-vec a-vec--${alpha ? 2 : 1} a-grow`}
        style={alpha ? undefined : { gridTemplateColumns: "1fr" }}
      >
        {alpha && (
          <NumInput
            value={c.a ?? 1}
            step={0.05}
            min={0}
            max={1}
            title="Alpha 0..1"
            onChange={(n, p) => onChange({ ...c, a: n }, p)}
          />
        )}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            fontSize: 10,
            color: "var(--fg-dim)",
            fontFamily: "var(--font-mono)",
          }}
        >
          {alpha ? "alpha" : hex}
        </div>
      </div>
      <EyeDropperButton onPick={(hex) => onChange(colorWithHex(c, hex, 1), "commit")} />
    </div>
  );
}

/** 0..255 colour with alpha, for HUD elements (Color.new). */
function Color255Input({ value, onChange }) {
  const c = value || { r: 255, g: 255, b: 255, a: 128 };
  const hex = `#${
    [c.r, c.g, c.b].map((n) =>
      clamp(Math.round(n ?? 0), 0, 255).toString(16).padStart(2, "0")
    ).join("")
  }`;
  return (
    <div className="a-row" style={{ gap: 4 }}>
      <input
        type="color"
        value={hex}
        style={{
          width: 26,
          height: 22,
          padding: 0,
          border: "1px solid var(--line)",
          borderRadius: "var(--radius)",
          background: "none",
          cursor: "pointer",
        }}
        onChange={(e) => {
          const v = e.target.value;
          onChange({
            ...c,
            r: parseInt(v.slice(1, 3), 16),
            g: parseInt(v.slice(3, 5), 16),
            b: parseInt(v.slice(5, 7), 16),
          }, "edit");
        }}
      />
      <NumInput
        value={c.a ?? 128}
        step={4}
        min={0}
        max={255}
        integer
        title="Alpha 0..255 (128 = opaque on PS2)"
        onChange={(n, p) => onChange({ ...c, a: n }, p)}
      />
      <EyeDropperButton onPick={(hex) => onChange(colorWithHex(c, hex, 255), "commit")} />
    </div>
  );
}

/** Pick a file from the loaded asset list, filtered by category. */
function AssetSelect(
  { value, onChange, files, cat, placeholder = "— none —", showImportHint = true },
) {
  const options = useMemo(
    () =>
      files.filter((f) => f.cat === cat).map((f) => ({
        value: f.name,
        label: f.name,
      })),
    [files, cat],
  );
  const missing = value && !options.some((o) => o.value === value);
  return (
    <>
      <Select
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
      />
      {missing && (
        <div className="a-field__err">Not in the loaded project folder.</div>
      )}
      {!options.length && !value && showImportHint && (
        <div className="a-field__help">
          No {cat} loaded — use File ▸ Import Assets From Folder.
        </div>
      )}
    </>
  );
}

/** Pick another object in the scene by name. */
function ObjectSelect(
  { value, onChange, scene, filter, selfId, placeholder = "— this object —" },
) {
  const options = useMemo(() => {
    const list = allObjects(scene?.objects || [])
      .filter((o) => o.id !== selfId && (!filter || filter(o)))
      .map((o) => ({ value: o.name, label: o.name }));
    // Duplicate names are ambiguous as references; flag them in the list.
    const seen = new Map();
    for (const o of list) seen.set(o.value, (seen.get(o.value) || 0) + 1);
    return list.map((
      o,
    ) => (seen.get(o.value) > 1
      ? { ...o, label: `${o.label}  (ambiguous)` }
      : o)
    );
  }, [scene, filter, selfId]);
  const missing = value && !options.some((o) => o.value === value);
  return (
    <>
      <Select
        value={value}
        onChange={onChange}
        options={options}
        placeholder={placeholder}
      />
      {missing && (
        <div className="a-field__err">
          No object named "{value}" in this scene.
        </div>
      )}
    </>
  );
}

/** Collapsible group with a coloured identity dot. */
function Section({ title, icon, color, open, onToggle, actions, children }) {
  return (
    <div className="a-sec">
      <div className="a-sec__head">
        <button className="a-sec__toggle" aria-expanded={open} onClick={onToggle}>
        <span className={`a-sec__chev${open ? " a-sec__chev--open" : ""}`}>
          ▶
        </span>
        {icon && <span className="a-sec__icon" style={{ color }}>{icon}</span>}
        <span className="a-sec__title">{title}</span>
        </button>
        <span className="a-ph__actions" onClick={(e) => e.stopPropagation()}>
          {actions}
        </span>
      </div>
      {open && <div className="a-sec__body">{children}</div>}
    </div>
  );
}

const Empty = ({ children }) => <div className="a-empty">{children}</div>;
const Kbd = ({ children }) => <span className="a-kbd">{children}</span>;

/**
 * A fold for hand-written settings, matching the Inspector's own.
 *
 * `ComponentFields` gets this for free from `advanced: true` in the registry.
 * The Project and Scene panels are hand-written JSX, so they wrap their
 * advanced controls in this instead — same look, same preference, same
 * promise: nothing is removed, it is one click.
 */
function Advanced({ pinned, count, children, label = "Advanced" }) {
  const [open, setOpen] = useState(false);
  if (!pinned && !open) {
    return (
      <button
        className="a-adv__more"
        style={{ gridColumn: "1 / -1" }}
        onClick={() => setOpen(true)}
      >
        {label}
        {count ? ` (${count})` : ""}
      </button>
    );
  }
  return (
    <>
      <div className="a-sec__group a-sec__group--adv">
        {label}
        {!pinned && (
          <button
            className="a-adv__hide"
            onClick={() => setOpen(false)}
          >
            hide
          </button>
        )}
      </div>
      {children}
    </>
  );
}
function TrashIcon() {
  return (
    <svg
      width="14"
      height="14"
      viewBox="0 0 24 24"
      aria-hidden="true"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.7"
      strokeLinecap="round"
      strokeLinejoin="round"
    >
      <path d="M4 7h16M9 7V4h6v3M6 7l1 13h10l1-13M10 10v7M14 10v7" />
    </svg>
  );
}
