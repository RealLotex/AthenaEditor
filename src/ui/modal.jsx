// ═══════════════════════════════════════════════════════════════════════
//  MODAL — dialog shell with focus trapping and Escape to close.
// ═══════════════════════════════════════════════════════════════════════

function Modal({ title, onClose, width = 420, footer, children, initialFocus, canDismiss = true }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  const dismissRef = useRef(canDismiss);
  closeRef.current = onClose;
  dismissRef.current = canDismiss;

  useEffect(() => {
    const focusableIn = (root) => visibleEditorControls(root,
      'button, [href], input, select, textarea, summary, [tabindex]:not([tabindex="-1"])',
    );
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        if (dismissRef.current) closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      // Disclosures and disabled fieldsets must follow the same keyboard path
      // as their visible controls. A background render must not reset focus.
      const focusable = focusableIn(ref.current);
      if (!focusable.length) {
        e.preventDefault();
        ref.current.focus();
        return;
      }
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && (document.activeElement === first || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && (document.activeElement === last || !ref.current.contains(document.activeElement))) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.activeElement;
    const root = ref.current;
    if (root) {
      const focusable = focusableIn(root);
      const requested = initialFocus ? root.querySelector(initialFocus) : null;
      const firstField = focusable.find((el) => el.matches('input:not([type="checkbox"]):not([type="radio"]), textarea, select'));
      const firstContent = focusable.find((el) => el.closest(".a-modal__body"));
      const firstAction = focusable.find((el) => el.closest(".a-modal__foot"));
      (focusable.includes(requested) ? requested : firstField || firstContent || firstAction || focusable[0] || root).focus();
    }
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (prev instanceof HTMLElement && prev.isConnected) prev.focus();
    };
  }, []);

  return (
    <div
      className="a-overlay"
      style={{ alignItems: "center" }}
      onMouseDown={(e) => {
        if (canDismiss && e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="a-modal"
        style={{ width }}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        aria-busy={!canDismiss || undefined}
        tabIndex={-1}
      >
        <div className="a-modal__head">
          <h2 className="a-modal__title">{title}</h2>
          <button
            className="a-btn a-btn--icon a-btn--ghost"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close dialog"
            disabled={!canDismiss}
          >
            ✕
          </button>
        </div>
        <div className="a-modal__body">{children}</div>
        {footer && <div className="a-modal__foot">{footer}</div>}
      </div>
    </div>
  );
}

/** Replacement for window.confirm — never blocks the render loop. */
function ConfirmModal(
  { title, message, onSave, saveLabel = "Save and continue", confirmLabel = onSave ? "Discard changes" : "Confirm", danger, onConfirm, onClose },
) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const saving = useRef(false);
  const saveAndContinue = async () => {
    if (saving.current) return;
    saving.current = true;
    setBusy(true); setError("");
    try {
      if (await onSave() !== true) return;
      onConfirm();
      onClose();
    } catch (e) {
      setError(e?.message || "Could not save your changes. Try again.");
    } finally {
      saving.current = false;
      setBusy(false);
    }
  };
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={380}
      canDismiss={!busy}
      initialFocus={onSave ? ".a-modal__foot .a-btn--primary" : undefined}
      footer={
        <>
          <button className="a-btn a-btn--ghost" disabled={busy} onClick={onClose}>Cancel</button>
          <button
            className={`a-btn ${danger || onSave ? "a-btn--danger" : "a-btn--primary"}`}
            disabled={busy}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
          {onSave && <button className="a-btn a-btn--primary" disabled={busy} onClick={saveAndContinue}>
            {busy ? "Saving…" : saveLabel}
          </button>}
        </>
      }
    >
      <div>{message}</div>
      {error && <p className="a-error a-modal__error" role="alert">{error}</p>}
    </Modal>
  );
}
