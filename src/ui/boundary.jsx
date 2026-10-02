// ═══════════════════════════════════════════════════════════════════════
//  ERROR BOUNDARIES — one panel throwing must not cost you your work
//
//  React unmounts the whole tree when a render throws and nothing catches it,
//  so a single bad value in the Inspector used to leave a blank white page —
//  with the project still in memory, still unsaved, and no way to get at it.
//
//  Two levels, because they answer different questions:
//
//   * PanelBoundary wraps each panel. The rest of the editor keeps working, so
//     you can undo whatever caused it, or just carry on in another panel.
//   * AppBoundary wraps everything. If the editor itself cannot render, the
//     only thing that matters is not losing the project, so it offers the
//     autosave and a download of whatever JSON is still readable.
//
//  Both show the real error and a Copy Details button. A stack trace the user
//  can paste is worth more than a friendly message that says nothing.
// ═══════════════════════════════════════════════════════════════════════

/** What a caught error looks like once it is safe to render. */
function describeError(error, info) {
  const parts = [
    `${error?.name || "Error"}: ${error?.message || String(error)}`,
    error?.stack ? `\n${error.stack}` : "",
    info?.componentStack ? `\ncomponent stack:${info.componentStack}` : "",
  ];
  return parts.join("").trim();
}

/** Put text on the clipboard, falling back to a selectable textarea. */
async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (_e) {
    // file:// and some browsers refuse the async clipboard. Fall back to the
    // old execCommand path rather than leaving the button dead.
    try {
      const ta = document.createElement("textarea");
      ta.value = text;
      ta.style.position = "fixed";
      ta.style.opacity = "0";
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand("copy");
      document.body.removeChild(ta);
      return ok;
    } catch (_e2) {
      return false;
    }
  }
}

class PanelBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, copied: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    // The console still gets the real thing: the card below is a summary, and
    // a developer with devtools open should not have to read it there.
    console.error(`[${this.props.name || "panel"}]`, error, info?.componentStack);
    this.props.onError?.(error, info);
  }

  componentDidUpdate(prev) {
    // A boundary that latches forever is a dead panel. When the thing it was
    // rendering changes — the user undid the edit, or selected something else —
    // give it another go.
    if (this.state.error && prev.resetKey !== this.props.resetKey) {
      this.setState({ error: null, info: null, copied: false });
    }
  }

  render() {
    const { error, info, copied } = this.state;
    if (!error) return this.props.children;

    const name = this.props.name || "This panel";
    const details = describeError(error, info);
    return (
      <div className="a-boundary" role="alert">
        <div className="a-boundary__title">{name} could not be drawn</div>
        <div className="a-boundary__msg">{error?.message || String(error)}</div>
        <div className="a-boundary__hint">
          The rest of the editor still works, and your project is untouched. Undo the last
          change (Ctrl+Z) and it should come back.
        </div>
        <div className="a-row" style={{ gap: 6, marginTop: 8, justifyContent: "center" }}>
          <button
            className="a-btn a-btn--sm"
            onClick={() => this.setState({ error: null, info: null, copied: false })}
          >
            Try again
          </button>
          <button
            className="a-btn a-btn--sm"
            onClick={async () => this.setState({ copied: await copyText(details) })}
          >
            {copied ? "Copied" : "Copy details"}
          </button>
        </div>
      </div>
    );
  }
}

/**
 * The last line of defence.
 *
 * Nothing here may depend on the editor's own state, because the reason it is
 * on screen is that that state could not be rendered. It reads the autosave
 * straight out of storage and offers it as a file.
 */
class AppBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null, info: null, copied: false, saved: false };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    this.setState({ info });
    console.error("[editor]", error, info?.componentStack);
  }

  /**
   * Hand the user their project as a file, however broken the editor is.
   *
   * The autosave is stored as `{ at, project }` (core/storage.js), so the
   * wrapper is peeled off: what lands on disk has to be a real .athena.json
   * that File ▸ Open Project File will take, not something only this code
   * understands. If even that fails, the raw record is written instead —
   * unusable is still better than nothing when the alternative is losing it.
   */
  download() {
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      if (!raw) return false;
      let text = raw;
      try {
        const parsed = JSON.parse(raw);
        if (parsed?.project) text = JSON.stringify(parsed.project, null, 2);
      } catch (_e) { /* keep the raw record */ }
      const blob = new Blob([text], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "recovered.athena.json";
      a.click();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
      return true;
    } catch (_e) {
      return false;
    }
  }

  render() {
    const { error, info, copied, saved } = this.state;
    if (!error) return this.props.children;

    let when = null;
    try {
      const raw = localStorage.getItem(AUTOSAVE_KEY);
      const at = raw ? JSON.parse(raw)?.at : null;
      if (at) when = new Date(at).toLocaleString();
    } catch (_e) { /* the autosave is unreadable too; say so below */ }

    const details = describeError(error, info);
    return (
      <div className="a-crash">
        <div className="a-crash__card">
          <div className="a-crash__title">The editor stopped</div>
          <div className="a-crash__msg">{error?.message || String(error)}</div>
          <div className="a-crash__hint">
            {when
              ? <>Your work was autosaved <b>{when}</b>. Download it before reloading — the
                copy in the browser survives a reload, but a file cannot be lost.</>
              : <>No autosave could be read, so download may produce nothing. If you have a
                project folder linked, the last export and save are still on disk.</>}
          </div>
          <div className="a-row" style={{ gap: 8, marginTop: 14, justifyContent: "center" }}>
            <button
              className="a-btn a-btn--primary"
              onClick={() => this.setState({ saved: this.download() })}
            >
              {saved ? "Downloaded" : "Download project JSON"}
            </button>
            <button className="a-btn" onClick={() => location.reload()}>
              Reload the editor
            </button>
            <button
              className="a-btn"
              onClick={async () => this.setState({ copied: await copyText(details) })}
            >
              {copied ? "Copied" : "Copy details"}
            </button>
          </div>
          <pre className="a-crash__stack">{details}</pre>
        </div>
      </div>
    );
  }
}
