// ═══════════════════════════════════════════════════════════════════════
//  FILE SYSTEM ACCESS — write straight into the project folder
//
//  With a folder linked, Export writes main.js and the behaviour scripts in
//  place, and Ctrl+S writes the .athena.json beside them. No downloads, no
//  copying files out of ~/Downloads after every change.
//
//  Availability: Chrome and Edge, including from file://, which is where this
//  editor normally runs. Firefox and Safari have not shipped the API, so the
//  download path stays as the fallback and is what `isFSSupported()` gates.
//
//  The directory handle is kept in IndexedDB because handles are structured-
//  cloneable but not strings — localStorage cannot hold one.
//
//  Permissions may persist, or return to "prompt". Query on startup without
//  asking; request access only from the action that needs it.
// ═══════════════════════════════════════════════════════════════════════

const FS_DB = "athena.fs";
const FS_STORE = "handles";
const FS_KEY = "projectDir";
const FS_PROJECT_FILE_KEY = "projectFile";
const FS_RECENT_PROJECTS_KEY = "recentProjects";
// The AthenaEnv ELF, kept so New Project can drop a runnable runtime into
// every new folder. It is ~5 MB of binary, which is why it lives here and is
// not baked into the editor: AthenaEditor.html has to stay a file you can
// double-click, not a 13 MB download.
const FS_RUNTIME_KEY = "runtimeElf";

/** What the runtime is called inside a project folder. athena.ini boots it. */
const RUNTIME_ELF = "athena.elf";

const isFSSupported = () =>
  typeof window !== "undefined" &&
  typeof window.showDirectoryPicker === "function" &&
  typeof indexedDB !== "undefined";

const isProjectFilePickerSupported = (kind) =>
  typeof window !== "undefined" &&
  typeof window[kind === "open" ? "showOpenFilePicker" : "showSaveFilePicker"] === "function";

const PROJECT_FILE_TYPES = [{ description: "AthEditor project", accept: { "application/json": [PROJECT_EXTENSION, ".json"] } }];

async function fsPickProjectFile(pickerWindow = window) {
  const [handle] = await pickerWindow.showOpenFilePicker({ id: "atheditor-project-file", types: PROJECT_FILE_TYPES, multiple: false });
  return handle;
}

function fsPickProjectSave(name, startIn, pickerWindow = window) {
  return pickerWindow.showSaveFilePicker({
    id: "atheditor-project-file", suggestedName: name, types: PROJECT_FILE_TYPES,
    ...(startIn ? { startIn } : {}),
  });
}

async function fsWriteProjectFile(handle, json) {
  const writer = await handle.createWritable();
  try {
    await writer.write(json);
    await writer.close();
  } catch (error) {
    try { await writer.abort(); } catch { /* Keep the original write error. */ }
    throw error;
  }
}

function fsOpenDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(FS_DB, 1);
    req.onupgradeneeded = () => req.result.createObjectStore(FS_STORE);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

function fsIdb(mode, fn) {
  return fsOpenDB().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(FS_STORE, mode);
      let req;
      try { req = fn(tx.objectStore(FS_STORE)); }
      catch (error) { db.close(); reject(error); return; }
      tx.oncomplete = () => { db.close(); resolve(req?.result); };
      tx.onabort = tx.onerror = () => { db.close(); reject(tx.error); };
    }));
}

const fsSaveHandle = (handle, projectId) =>
  fsIdb("readwrite", (s) => s.put(projectId ? { handle, projectId } : handle, FS_KEY));
const fsLoadHandle = (projectId) => fsIdb("readonly", (s) => s.get(FS_KEY))
  .then((entry) => {
    // Old unowned handles remain readable by legacy callers, but cannot be
    // restored over an unrelated autosaved project.
    if (!entry?.handle) return projectId ? null : entry || null;
    return !projectId || entry.projectId === projectId ? entry.handle : null;
  }).catch(() => null);
const fsForgetHandle = () => fsIdb("readwrite", (s) => s.delete(FS_KEY)).catch(() => {});

const fsSaveProjectFile = (handle, projectId) =>
  fsIdb("readwrite", (s) => s.put({ handle, projectId }, FS_PROJECT_FILE_KEY));
const fsLoadProjectFile = (projectId) =>
  fsIdb("readonly", (s) => s.get(FS_PROJECT_FILE_KEY))
    .then((entry) => entry?.projectId === projectId && entry.handle?.kind === "file" ? entry.handle : null)
    .catch(() => null);
const fsForgetProjectFile = () =>
  fsIdb("readwrite", (s) => s.delete(FS_PROJECT_FILE_KEY)).catch(() => {});

const fsLoadRecentProjects = () => fsIdb("readonly", (s) => s.get(FS_RECENT_PROJECTS_KEY))
  .then((entries) => Array.isArray(entries) ? entries.filter((entry) => entry.handle?.kind === "file") : [])
  .catch(() => []);

// Serialize updates so simultaneous save/launch events cannot lose a recent.
let fsRecentWrite = Promise.resolve();
function fsRememberRecentProject(handle, project, folder = null) {
  fsRecentWrite = fsRecentWrite.catch(() => {}).then(async () => {
    const previous = await fsLoadRecentProjects();
    const entry = { handle, folder, projectId: project.id, name: project.name, at: Date.now() };
    const entries = [entry, ...previous.filter((item) => item.projectId !== project.id)].slice(0, 8);
    await fsIdb("readwrite", (s) => s.put(entries, FS_RECENT_PROJECTS_KEY));
    return entries;
  });
  return fsRecentWrite;
}

/** Remember an athena.elf so every later New Project can copy it in. */
const fsSaveRuntime = (entry) => fsIdb("readwrite", (s) => s.put(entry, FS_RUNTIME_KEY));
const fsLoadRuntime = () => fsIdb("readonly", (s) => s.get(FS_RUNTIME_KEY)).catch(() => null);
const fsForgetRuntime = () => fsIdb("readwrite", (s) => s.delete(FS_RUNTIME_KEY)).catch(() => {});

/** Ask the user for the project folder. Must run inside a user gesture. */
async function fsPickFolder(pickerWindow = window) {
  const handle = await pickerWindow.showDirectoryPicker({ mode: "readwrite", id: "athena-project" });
  return handle;
}

/**
 * Ask for the folder a NEW project goes in.
 *
 * `id` is deliberately different from fsPickFolder's, so the browser remembers
 * "where I keep my projects" separately from "the project I have open" and the
 * dialog starts somewhere useful. The picker's own New Folder button is how a
 * folder gets created — there is no API for making one outside a picked tree.
 */
async function fsPickNewProjectFolder(pickerWindow = window) {
  return pickerWindow.showDirectoryPicker({ mode: "readwrite", id: "athena-new-project" });
}

/**
 * Current permission without prompting: "granted" | "prompt" | "denied".
 * Safe to call on startup.
 */
async function fsPermissionState(handle, mode = "readwrite") {
  if (!handle?.queryPermission) return "denied";
  try {
    return await handle.queryPermission({ mode });
  } catch (_e) {
    return "denied";
  }
}

/** Prompt if needed. Must run inside a user gesture. */
async function fsEnsurePermission(handle, mode = "readwrite", pickerWindow = null) {
  if (!handle) return false;
  if (await fsPermissionState(handle, mode) === "granted") return true;
  try {
    // A click in a detached panel activates that window. Request permissions
    // through a handle in its realm, rather than the inactive editor window.
    const target = pickerWindow && pickerWindow !== window && pickerWindow.structuredClone
      ? pickerWindow.structuredClone(handle) : handle;
    return await target.requestPermission({ mode }) === "granted";
  } catch (_e) {
    return false;
  }
}

/** Resolve "scripts/Player.js" into a file handle, creating directories. */
async function fsFileHandle(root, path, { create = true } = {}) {
  const parts = path.split("/").filter(Boolean);
  const file = parts.pop();
  let dir = root;
  for (const part of parts) dir = await dir.getDirectoryHandle(part, { create });
  return dir.getFileHandle(file, { create });
}

async function fsReadTextIfPresent(root, path) {
  try {
    const handle = await fsFileHandle(root, path, { create: false });
    return await (await handle.getFile()).text();
  } catch (_e) {
    return null;   // missing file, or a directory in the way
  }
}

async function fsWriteText(root, path, text) {
  const handle = await fsFileHandle(root, path);
  const w = await handle.createWritable();
  await w.write(text);
  await w.close();
}

/** True if `path` already exists as a file. */
async function fsExists(root, path) {
  try {
    await fsFileHandle(root, path, { create: false });
    return true;
  } catch (_e) {
    return false;
  }
}

/** Does this folder already have something in it? */
async function fsIsEmpty(root) {
  for await (const _entry of root.entries()) return false;
  return true;
}

/**
 * Lay out a new project folder.
 *
 * Nothing is overwritten — a path that already exists is reported as skipped
 * instead. Aiming New Project at a folder that already holds a game should
 * cost the user a toast, not their work.
 *
 * `runtime` is an optional { name, data } for athena.elf. Without it the
 * folder is complete apart from the executable, which the caller says out loud
 * rather than leaving to be discovered at boot.
 */
async function fsScaffoldProject(root, plan, runtime = null) {
  for (const dir of plan.dirs) await root.getDirectoryHandle(dir, { create: true });

  const written = [];
  const skipped = [];
  for (const f of plan.files) {
    if (await fsExists(root, f.path)) { skipped.push(f.path); continue; }
    await fsWriteText(root, f.path, f.text);
    written.push(f.path);
  }

  if (runtime?.data) {
    if (await fsExists(root, RUNTIME_ELF)) skipped.push(RUNTIME_ELF);
    else {
      const handle = await fsFileHandle(root, RUNTIME_ELF);
      const w = await handle.createWritable();
      await w.write(runtime.data);
      await w.close();
      written.push(RUNTIME_ELF);
    }
  }

  return { written, skipped };
}

/** Marker the generator puts in main.js, used to recognise our own output. */
const GENERATED_MARKER = "Generated by AthEditor";
const LEGACY_GENERATED_MARKER = "Generated by the AthenaEnv Level Editor";

/**
 * Write an export into the folder.
 *
 * Three cases, and telling them apart is the whole point:
 *
 *   * The file on disk is already byte-identical. Nothing to write, nothing to
 *     ask. This is the normal case for behaviour scripts, which the generator
 *     reads back off disk in the first place — asking every single export
 *     whether to overwrite a file with itself trains people to click through
 *     the one prompt that matters.
 *   * main.js exists, is not empty, and lacks the generator's marker. Someone
 *     wrote it by hand; ask before replacing it.
 *   * A script differs from what we would write. The editor's copy is stale or
 *     the project's embedded copy has diverged, so the edit on disk is about
 *     to be lost. Ask.
 *
 * Returning false from `confirmOverwrite` aborts without touching anything;
 * a partial export is worse than none.
 */
async function fsWriteExport(root, result, { confirmOverwrite } = {}) {
  const files = [
    { path: "main.js", content: result.main, generated: true },
    ...(result.sceneFiles || []).map(s => ({ path: s.filename, content: s.content, generated: true })),
    ...result.scripts.map((s) => ({ path: s.filename, content: s.content, generated: false })),
    ...(result.assets || []).map(a=>({path:a.filename,content:a.dataUrl?assetDataBytes(a.dataUrl):a.content,binary:!!a.dataUrl})),
  ];

  const pending = [];
  const unchanged = [];
  const conflicts = [];

  for (const f of files) {
    if(f.binary) {
      let bytes=null;
      try {bytes=new Uint8Array(await (await (await fsFileHandle(root,f.path,{create:false})).getFile()).arrayBuffer());}catch(e){if(e.name!=="NotFoundError")throw e;}
      if(bytes&&bytes.length===f.content.length&&bytes.every((b,i)=>b===f.content[i])){unchanged.push(f.path);continue;}
      if(bytes?.length)conflicts.push({path:f.path,kind:"edited"});
      pending.push(f);continue;
    }
    const existing = await fsReadTextIfPresent(root, f.path);
    if (existing === f.content) { unchanged.push(f.path); continue; }
    if (existing && existing.trim()) {
      // An empty main.js is what a fresh AthenaEnv folder ships with, so it is
      // not a conflict. A generated one is ours to replace.
      const ours = f.generated && [GENERATED_MARKER, LEGACY_GENERATED_MARKER].some((marker) => existing.includes(marker));
      if (!ours) conflicts.push({ path: f.path, kind: f.generated ? "handwritten" : "edited" });
    }
    pending.push(f);
  }

  if (conflicts.length && confirmOverwrite && !(await confirmOverwrite(conflicts))) {
    return { written: [], unchanged, skipped: true };
  }

  const written = [];
  for (const f of pending) {
    await fsWriteText(root, f.path, f.content);
    written.push(f.path);
  }
  return { written, unchanged, skipped: false };
}

function assetDataBytes(dataUrl) {
  const binary=atob(dataUrl.slice(dataUrl.indexOf(',')+1));
  return Uint8Array.from(binary,c=>c.charCodeAt(0));
}

// ── reading assets back out of a linked folder ─────────────────────────

const FS_ASSET_DIRS = new Set(["3dmodels", "textures", "sounds", "fonts", "scripts"]);

const fsReadAsDataUrl = (file) =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(new Error(`Could not read ${file.name}`));
    r.readAsDataURL(file);
  });

/**
 * Walk the linked folder for assets and the project file, mirroring what the
 * folder picker produces so both paths feed the same code.
 */
async function fsReadProjectFolder(root, dirs = {}, onProgress, { readProject = true } = {}) {
  const wanted = new Set([...FS_ASSET_DIRS, ...Object.values(dirs).filter(Boolean)]);
  const assets = [];
  let projectJSON = null;
  let projectHandle = null;
  let seen = 0;

  for await (const [name, handle] of root.entries()) {
    if (handle.kind === "file") {
      if (readProject && isProjectFilename(name) && !projectJSON) {
        try { projectJSON = await (await handle.getFile()).text(); projectHandle = handle; } catch (_e) { /* keep going */ }
      }
      continue;
    }
    if (!wanted.has(name.toLowerCase())) continue;
    // `name` — the top-level asset directory — stays the reported folder however
    // deep the file sits, because that is what the rest of the editor matches
    // against (resolve.js compares a font's folder to project.dirs.fonts).
    await fsReadAssetDir(handle, name, assets, () => onProgress?.(++seen, name));
  }
  return { assets, projectJSON, projectHandle };
}

/**
 * Read one asset directory, descending into its sub-directories.
 *
 * It used to look at immediate children only, so textures/ui/hud.png was
 * invisible to the linked folder while the folder-import path found it — two
 * readers that disagreed about what the project contained.
 *
 * The depth cap is a guard against a symlink loop, not a design limit; nobody
 * nests art six levels deep on a console with 32 MB of RAM.
 */
async function fsReadAssetDir(dirHandle, topName, assets, tick, depth = 0, prefix = "") {
  if (depth > 6) return;
  for await (const [childName, childHandle] of dirHandle.entries()) {
    if (childHandle.kind === "directory") {
      await fsReadAssetDir(childHandle, topName, assets, tick, depth + 1, `${prefix}${childName}/`);
      continue;
    }
    tick();
    const cat = categorize(childName);
    const entry = { id: uid(), name: childName, cat, folder: topName, sourcePath: `${prefix}${childName}` };
    try {
      const file = await childHandle.getFile();
      entry.size = file.size;
      // See assetChanged() in core/storage.js: size alone misses a re-export
      // that lands on the same byte count, which is common.
      entry.mtime = file.lastModified;
      if (cat === "models" && childName.toLowerCase().endsWith(".obj")) entry.content = await file.text();
      else if (cat === "models") { entry.dataUrl = await fsReadAsDataUrl(file); entry.isGltf = true; }
      else if (cat === "scripts") entry.content = await file.text();
      else entry.dataUrl = await fsReadAsDataUrl(file);
      // Pixel dimensions, read from the header. A texture too big for the GS
      // is the difference between a program that boots and one that does not,
      // and there is no way to see it from the file size alone.
      if (cat === "textures") {
        const size = imageSizeOfAsset(entry);
        if (size) entry.image = size;
      }
    } catch (e) {
      entry.error = e.message;
    }
    assets.push(entry);
  }
}
