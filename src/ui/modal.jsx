// ═══════════════════════════════════════════════════════════════════════
//  MODAL — dialog shell with focus trapping and Escape to close.
// ═══════════════════════════════════════════════════════════════════════

function Modal({ title, onClose, width = 420, footer, children }) {
  const ref = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeRef.current();
        return;
      }
      if (e.key !== "Tab" || !ref.current) return;
      // Keep focus inside the dialog.
      const focusable = [...ref.current.querySelectorAll(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      )].filter((el) => !el.disabled && el.getClientRects().length);
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey, true);
    const prev = document.activeElement;
    const root = ref.current;
    (root?.querySelector('input:not([type="checkbox"]), textarea, select') ||
      root?.querySelector("button"))?.focus();
    return () => {
      window.removeEventListener("keydown", onKey, true);
      if (prev instanceof HTMLElement) prev.focus();
    };
  }, []);

  return (
    <div
      className="a-overlay"
      style={{ alignItems: "center" }}
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="a-modal"
        style={{ width }}
        ref={ref}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="a-modal__head">
          <span className="a-modal__title">{title}</span>
          <button
            className="a-btn a-btn--icon a-btn--ghost"
            onClick={onClose}
            title="Close (Esc)"
            aria-label="Close dialog"
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
  { title, message, confirmLabel = "Confirm", danger, onConfirm, onClose },
) {
  return (
    <Modal
      title={title}
      onClose={onClose}
      width={380}
      footer={
        <>
          <button className="a-btn" onClick={onClose}>Cancel</button>
          <button
            className={`a-btn ${danger ? "a-btn--danger" : "a-btn--primary"}`}
            onClick={() => {
              onConfirm();
              onClose();
            }}
          >
            {confirmLabel}
          </button>
        </>
      }
    >
      <div style={{ fontSize: 12, lineHeight: 1.6 }}>{message}</div>
    </Modal>
  );
}
