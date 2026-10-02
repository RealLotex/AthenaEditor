// ═══════════════════════════════════════════════════════════════════════
//  HISTORY — undo/redo with coalescing
//
//  The old editor pushed a full project snapshot on every state change, so
//  dragging a gizmo produced ~200 undo steps and typing a name produced one
//  per keystroke. Edits that share a tag inside COALESCE_MS collapse into a
//  single step here, which is what makes Ctrl+Z behave the way people expect
//  (one undo = one gesture).
// ═══════════════════════════════════════════════════════════════════════

const HISTORY_LIMIT = 120;
const COALESCE_MS = 550;

function createHistory() {
  return { past: [], future: [], lastTag: null, lastAt: 0 };
}

/**
 * Record `prevState` as an undo point.
 * @param tag  gesture identity, e.g. "move:i3_ab" or "rename:i7_cd".
 *             Repeated edits with the same tag inside the window are merged.
 *             Pass null to always create a discrete step.
 */
function historyPush(h, prevState, tag = null) {
  const now = Date.now();
  const merge = tag !== null && tag === h.lastTag && now - h.lastAt < COALESCE_MS;
  h.lastTag = tag;
  h.lastAt = now;
  if (merge) return h;          // the snapshot already on top predates the gesture

  h.past.push(prevState);
  if (h.past.length > HISTORY_LIMIT) h.past.shift();
  h.future.length = 0;
  return h;
}

/** Ends the current gesture so the next edit always starts a new step. */
function historySeal(h) {
  h.lastTag = null;
  h.lastAt = 0;
  return h;
}

function historyUndo(h, current) {
  if (!h.past.length) return null;
  historySeal(h);
  h.future.push(current);
  return h.past.pop();
}

function historyRedo(h, current) {
  if (!h.future.length) return null;
  historySeal(h);
  h.past.push(current);
  return h.future.pop();
}

const canUndo = (h) => h.past.length > 0;
const canRedo = (h) => h.future.length > 0;
