// ═══════════════════════════════════════════════════════════════════════
//  STORAGE — autosave, project files, asset folders
//
//  Autosave is the safety net the old editor lacked: a browser refresh threw
//  the whole scene away. Only the project structure is persisted; assets are
//  re-read from disk on demand because they can be tens of megabytes.
// ═══════════════════════════════════════════════════════════════════════

const AUTOSAVE_KEY = "athena.editor.project";
// The one before it. A save that turns out to be unreadable used to be the
// end of the story, because there was a single slot and it had already been
// overwritten. Two slots cost one extra copy and mean the last KNOWN-GOOD
// state is still there when the newest one cannot be parsed.
const AUTOSAVE_PREV_KEY = "athena.editor.project.prev";
const PREFS_KEY = "athena.editor.prefs";
const AUTOSAVE_MS = 4000;
// A hard ceiling on how long work can go unsaved. AUTOSAVE_MS is a debounce,
// and a debounce alone never fires during a sustained gesture: dragging a
// gizmo or scrubbing a number restarts the timer on every frame, so a minute
// of continuous work could reach a crash with nothing written at all.
const AUTOSAVE_MAX_MS = 15000;

/**
 * Write the project to the browser.
 *
 * Returns { ok, reason } rather than a bare boolean: a quota failure is
 * permanent for that project and the user has to hear about it once, instead
 * of silently getting no autosave for the rest of the session.
 */
function saveAutosave(project) {
  let text;
  try {
    text = JSON.stringify({ at: Date.now(), project });
  } catch (e) {
    return { ok: false, reason: "unserialisable", message: e.message };
  }
  try {
    // Rotate first: whatever is currently stored has been read back
    // successfully at least once, which is more than can be said for what is
    // about to replace it.
    const current = localStorage.getItem(AUTOSAVE_KEY);
    if (current) {
      try { localStorage.setItem(AUTOSAVE_PREV_KEY, current); } catch (_e) { /* room for one is enough */ }
    }
    localStorage.setItem(AUTOSAVE_KEY, text);
    return { ok: true };
  } catch (e) {
    // Out of room. Drop the backup and try once more — one saved project beats
    // two that could not be written.
    try {
      localStorage.removeItem(AUTOSAVE_PREV_KEY);
      localStorage.setItem(AUTOSAVE_KEY, text);
      return { ok: true, reason: "droppedBackup" };
    } catch (_e2) {
      return { ok: false, reason: "quota", message: e.message };
    }
  }
}

/** Parse one slot. Returns null when absent, throws when present and broken. */
function readAutosaveSlot(key) {
  const raw = localStorage.getItem(key);
  if (!raw) return null;
  const { at, project } = JSON.parse(raw);
  if (!project?.scenes?.length) throw new Error("the saved project has no scenes");
  const notes = [];
  return { at, project: migrateProject(project, notes), notes, raw };
}

/**
 * Restore the most recent autosave that can actually be read.
 *
 * "Absent" and "present but unreadable" are different answers and used to give
 * the same one — null, which boots a blank project. The user then saw a brand
 * new scene with their real work still sitting in localStorage, until the
 * first edit overwrote it. Now a broken newest slot falls back to the previous
 * one, and either way the raw text is handed back so the caller can offer it
 * as a download before anything overwrites it.
 */
function loadAutosave() {
  let failure = null;
  for (const key of [AUTOSAVE_KEY, AUTOSAVE_PREV_KEY]) {
    let raw = null;
    try { raw = localStorage.getItem(key); } catch (_e) { return null; }
    if (!raw) continue;
    try {
      const slot = readAutosaveSlot(key);
      if (slot) return failure ? { ...slot, recoveredFrom: failure } : slot;
    } catch (e) {
      // Remember the first failure; a good older slot still wins over it.
      failure = failure || { key, raw, message: e.message };
    }
  }
  return failure ? { unreadable: failure } : null;
}

const clearAutosave = () => {
  for (const key of [AUTOSAVE_KEY, AUTOSAVE_PREV_KEY]) {
    try { localStorage.removeItem(key); } catch (_e) {}
  }
};

function savePrefs(prefs) {
  try { localStorage.setItem(PREFS_KEY, JSON.stringify(prefs)); } catch (_e) {}
}

function loadPrefs(defaults) {
  try {
    const raw = localStorage.getItem(PREFS_KEY);
    return raw ? { ...defaults, ...JSON.parse(raw) } : { ...defaults };
  } catch (_e) {
    return { ...defaults };
  }
}

// ── downloads ──────────────────────────────────────────────────────────

function downloadText(filename, text, mime = "application/json") {
  const blob = new Blob([text], { type: `${mime};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/** Saved projects carry loaded assets so reopening them is portable. */
function projectToJSON(project, files = []) {
  const meta = files.map(({ content: _c, dataUrl: _d, mesh: _m, ...rest }) => rest);
  const portable = editorAssets(project, files).filter(f => f.cat !== "scripts" && (f.content !== undefined || f.dataUrl))
    .map(({ mesh: _mesh, ...file }) => ({ ...file, owned: file.owned === true }));
  const scripts = editorAssets(project, files).filter(f => f.cat === "scripts" && typeof f.content === "string")
    .map(f => ({ name: f.name, content: f.content, edited: f.edited === true || f.owned === true }));
  return JSON.stringify({ ...project, assets: portable, scripts, _filesMeta: meta }, null, 2);
}

// ── reading files ──────────────────────────────────────────────────────

const readAs = (file, mode) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error(`Could not read ${file.name}`));
    if (mode === "text") r.readAsText(file);
    else r.readAsDataURL(file);
  });

const ASSET_DIRS = new Set(["3dmodels", "textures", "sounds", "fonts", "scripts"]);

/**
 * Read a picked folder into asset entries.
 * Only files inside a known asset directory are taken, so pointing the picker
 * at a whole game folder does not pull in build output or node_modules.
 *
 * @param dirs  the project's own directory names. They are configurable, so a
 *              project that renamed 3dmodels/ to meshes/ was read by the linked
 *              folder path and silently ignored by this one.
 */
async function readAssetFolder(fileList, onProgress, dirs = null) {
  const out = [];
  let projectJSON = null;
  const files = [...fileList];
  const wanted = new Set([
    ...ASSET_DIRS,
    ...Object.values(dirs || {}).filter(Boolean).map((d) => String(d).toLowerCase()),
  ]);

  for (let i = 0; i < files.length; i++) {
    const file = files[i];
    const parts = (file.webkitRelativePath || file.name).split("/");
    const name = file.name;
    const ext = name.split(".").pop().toLowerCase();
    onProgress?.(i + 1, files.length, name);

    if (isProjectFilename(name)) {
      if (!projectJSON) {
        try { projectJSON = await readAs(file, "text"); } catch (_e) { /* keep going */ }
      }
      continue;
    }
    if (!parts.slice(0, -1).some((p) => wanted.has(p.toLowerCase()))) continue;

    const cat = categorize(name);
    const entry = {
      id: uid(), name, cat, size: file.size,
      // What tells a re-export apart from the copy already in memory. A mesh
      // saved again from Blender often has the identical byte count.
      mtime: file.lastModified,
      folder: parts[parts.length - 2] || "",
      sourcePath: parts.slice(parts.findIndex(p=>wanted.has(p.toLowerCase()))+1).join("/"),
    };
    try {
      if (cat === "models") {
        if (ext === "obj") entry.content = await readAs(file, "text");
        else { entry.dataUrl = await readAs(file, "dataUrl"); entry.isGltf = true; }
      } else if (cat === "scripts") {
        entry.content = await readAs(file, "text");
      } else {
        entry.dataUrl = await readAs(file, "dataUrl");
      }
      // Pixel dimensions, read from the header. A texture too big for the GS
      // stops the program booting, and nothing about the file size says so.
      if (cat === "textures") {
        const size = imageSizeOfAsset(entry);
        if (size) entry.image = size;
      }
    } catch (e) {
      entry.error = e.message;
    }
    out.push(entry);
  }
  return { assets: out, projectJSON };
}

/**
 * Has this file changed on disk since the copy we are holding?
 *
 * Size alone is not enough and it was the bug: re-exporting a mesh from Blender
 * very often lands on the same byte count, and the edit was then thrown away
 * entirely — the viewport kept showing the old geometry no matter how many
 * times the folder was re-read. `lastModified` moves on every save, so both
 * readers capture it (readAssetFolder here, fsReadProjectFolder in fsaccess).
 */
function assetChanged(previous, next) {
  if (!previous || !next) return true;
  if ((next.size ?? -1) !== (previous.size ?? -1)) return true;
  if (next.mtime !== undefined && previous.mtime !== undefined) return next.mtime !== previous.mtime;
  // No timestamp on either side — an older autosave, or a scaffolded entry.
  // Fall back to the payload itself rather than assuming nothing changed.
  return (next.dataUrl ?? next.content) !== (previous.dataUrl ?? previous.content);
}

/**
 * A token that changes whenever an asset's CONTENT changes.
 *
 * The viewport caches a built mesh against this. It deliberately does not
 * include anything that varies for other reasons — `bounds`, for one, is
 * written back by the viewport itself once a mesh has loaded, and keying on it
 * would make every load invalidate its own cache entry and rebuild forever.
 */
function assetRevision(file) {
  if (!file) return "missing";
  const payload = file.dataUrl ?? file.content ?? "";
  return `${file.id}:${file.size ?? -1}:${file.mtime ?? "-"}:${payload.length}`;
}

/**
 * Merge freshly read assets over the current set, keeping ids stable so
 * component references by filename keep resolving.
 */
function mergeAssets(previous, fresh) {
  const byName = new Map(fresh.map((f) => [f.name, f]));
  const kept = previous
    .filter((f) => byName.has(f.name))
    .map((f) => {
      const next = byName.get(f.name);
      // Only re-take the payload when the file actually changed on disk — but
      // `bounds` must go with it, or a re-exported mesh keeps the collider that
      // auto-fitted to the old one.
      if(assetChanged(f,next))return {...next,id:f.id,bounds:undefined};
      return next.sourcePath!==f.sourcePath ? {...f,sourcePath:next.sourcePath} : f;
    });
  const keptNames = new Set(kept.map((f) => f.name));
  return [...kept, ...fresh.filter((f) => !keptNames.has(f.name))];
}
