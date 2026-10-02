// ═══════════════════════════════════════════════════════════════════════
//  TOASTS — non-blocking feedback.
//  Replaces alert(), which froze the editor and lost the message.
// ═══════════════════════════════════════════════════════════════════════

let _toastSeq = 0;

function useToasts() {
  const [toasts, setToasts] = useState([]);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((list) => list.filter((t) => t.id !== id));
    const t = timers.current.get(id);
    if (t) { clearTimeout(t); timers.current.delete(id); }
  }, []);

  const push = useCallback((text, opts = {}) => {
    const id = ++_toastSeq;
    const kind = opts.kind || "info";
    // Errors stay until dismissed; everything else fades.
    const ms = opts.ms ?? (kind === "error" ? 0 : 3600);
    setToasts((list) => [...list.slice(-4), { id, text, sub: opts.sub, kind, action: opts.action }]);
    if (ms > 0) timers.current.set(id, setTimeout(() => dismiss(id), ms));
    return id;
  }, [dismiss]);

  useEffect(() => () => { for (const t of timers.current.values()) clearTimeout(t); }, []);

  const api = useMemo(() => ({
    info: (t, o) => push(t, { ...o, kind: "info" }),
    ok: (t, o) => push(t, { ...o, kind: "ok" }),
    warn: (t, o) => push(t, { ...o, kind: "warn" }),
    error: (t, o) => push(t, { ...o, kind: "error" }),
  }), [push]);

  return [toasts, api, dismiss];
}

const TOAST_ICON = { info: "i", ok: "✓", warn: "▲", error: "✕" };

function Toasts({ toasts, onDismiss }) {
  if (!toasts.length) return null;
  return (
    <div className="a-toasts">
      {toasts.map((t) => (
        <div key={t.id} className={`a-toast a-toast--${t.kind}`} role="status">
          <span style={{ color: `var(--${t.kind === "error" ? "err" : t.kind === "warn" ? "warn" : t.kind === "ok" ? "ok" : "info"})` }}>
            {TOAST_ICON[t.kind]}
          </span>
          <div className="a-toast__text">
            {t.text}
            {t.sub && <div className="a-toast__sub">{t.sub}</div>}
          </div>
          {t.action && (
            <button className="a-btn a-btn--sm" onClick={() => { t.action.run(); onDismiss(t.id); }}>
              {t.action.label}
            </button>
          )}
          <button className="a-node__btn" onClick={() => onDismiss(t.id)} title="Dismiss">✕</button>
        </div>
      ))}
    </div>
  );
}
