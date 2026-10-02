// ═══════════════════════════════════════════════════════════════════════
//  APP — state, commands, keyboard, layout
//
//  One rule holds the editor together: every action is a command in the
//  registry below. Menus, the palette and the keyboard all read from it, so
//  a feature cannot exist in one and be missing from the others.
//
//  State is a single `project` object mutated through edit(), which snapshots
//  for undo and tags the gesture so a drag collapses to one step.
// ═══════════════════════════════════════════════════════════════════════

// Chords that mean the same thing whether or not the cursor is in a text
// field. Everything else — Ctrl+A/C/V/X/Z/Y and every bare key — belongs to
// the field while you are typing in it.
const TYPING_SAFE_CHORDS = new Set([
  "Ctrl+S",
  "Ctrl+Shift+S",
  "Ctrl+E",
  "Ctrl+K",
  "F1",
  "F5",
]);

const DEFAULT_PREFS = {
  theme: "dark",
  showOverlays: false,
  // Advanced Inspector fields inline instead of behind a disclosure. Off by
  // default so a first project is a short list of things that matter; every
  // field stays one click away either way.
  showAdvanced: false,
  shaded: false,
  snap: false,
  snapSize: 0.5,
  gizmoSpace: "world",
  lang: null, // null = follow the browser the first time
};

function App() {
  const installation = useEditorInstallation();
  const canRunLocally = !!document.querySelector?.('meta[name="athena-launch-token"]');
  const actionWindowRef = useRef(window);
  const actionWindow = () => actionWindowRef.current?.closed ? window : actionWindowRef.current;
  useEffect(() => {
    const focus = () => { actionWindowRef.current = window; };
    window.addEventListener("focus", focus);
    return () => window.removeEventListener("focus", focus);
  }, []);
  // ── state ────────────────────────────────────────────────────────────
  // One read, reused: loadAutosave() parses and migrates, so calling it twice
  // would do the work twice and produce two different note arrays.
  // `unreadable` means there IS a saved project and it could not be parsed.
  // That is not the same as having none, and treating it as none was how a
  // corrupt autosave turned into a blank editor with the real work still in
  // localStorage — until the first edit wrote over it.
  const bootRef = useRef(null);
  if (bootRef.current === null) {
    bootRef.current = loadAutosave() || { project: null, at: null, notes: [] };
  }

  const [project, setProject] = useState(() =>
    bootRef.current.project || migrateProject(mkProject())
  );
  const [restoredAt] = useState(() => bootRef.current.at);
  const [welcome, setWelcome] = useState(() => !bootRef.current.project);
  const projectRef = useRef(project);
  projectRef.current = project;

  const historyRef = useRef(createHistory());
  const clipboardRef = useRef([]);
  const clipboardReadRef = useRef({ version: 0, busy: false });
  const appliedShareReceipts = useRef(new Set());
  const frameRef = useRef(null);
  const captureRef = useRef(null);
  const [shareFile, setShareFile] = useState(null);

  const [diskFiles, setFiles] = useState([]);
  const files = useMemo(() => editorAssets(project, diskFiles), [
    project,
    diskFiles,
  ]);
  const [loadingAssets, setLoadingAssets] = useState(false);
  // Linked project folder — Export and Save write straight into it.
  const folderRef = useRef(null);
  const folderReadRef = useRef(0);
  const projectFileRef = useRef(null);
  const projectSessionRef = useRef(0);
  const savingProjectRef = useRef(false);
  const [projectFileName, setProjectFileName] = useState(null);
  const [downloadedFileName, setDownloadedFileName] = useState(null);
  const [folderName, setFolderName] = useState(null);
  const [folderNeedsGrant, setFolderNeedsGrant] = useState(false);
  const [folderNeedsReadAccess, setFolderNeedsReadAccess] = useState(false);
  const [windowReset, setWindowReset] = useState(0);
  const [recentProjects, setRecentProjects] = useState([]);
  const recentReadRef = useRef(0);
  const rememberProject = useCallback(async (handle, project, folder = null) => {
    const read = ++recentReadRef.current;
    try {
      const entries = await fsRememberRecentProject(handle, project, folder);
      if (read === recentReadRef.current) setRecentProjects(entries);
    } catch { /* Saving still works without persistent browser storage. */ }
  }, []);
  useEffect(() => {
    let cancelled = false;
    const read = recentReadRef.current;
    fsLoadRecentProjects().then((entries) => {
      if (!cancelled && read === recentReadRef.current) setRecentProjects(entries);
    });
    return () => { cancelled = true; };
  }, []);
  const resetProjectDestination = useCallback(() => {
    projectSessionRef.current++;
    projectFileRef.current = null;
    setProjectFileName(null);
    setDownloadedFileName(null);
    folderRef.current = null;
    setFolderName(null);
    setFolderNeedsGrant(false);
    setFolderNeedsReadAccess(false);
    fsForgetProjectFile();
    fsForgetHandle();
  }, []);
  // The athena.elf New Project copies into new folders — { name, size }.
  const [runtime, setRuntime] = useState(null);
  const [selectedIds, setSelectedIds] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [selectedUIId, setSelectedUIId] = useState(null);
  const [selectedAssetId, setSelectedAssetId] = useState(null);
  const [selectedPrefabId, setSelectedPrefabId] = useState(null);
  const [openScript, setOpenScript] = useState(null);
  const [problemFilter, setProblemFilter] = useState("all");
  const [gizmoMode, setGizmoMode] = useState("translate");
  const [modal, setModal] = useState(null);
  // Read by the keyboard handler, which must not re-subscribe on every modal
  // change just to know whether one is open.
  const modalRef = useRef(null);
  modalRef.current = modal;
  const [exportResult, setExportResult] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [playBusy, setPlayBusy] = useState(false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [paletteScope, setPaletteScope] = useState(null);
  const openAddPalette = (scope = "objects") => { setPaletteScope(scope); setPaletteOpen(true); };
  const [dirty, setDirty] = useState(false);
  // Mirrored in a ref because adoptProject is an async callback that must not
  // re-create itself on every keystroke — it would tear the modal down.
  const dirtyRef = useRef(false);
  dirtyRef.current = dirty;
  const [autosavedAt, setAutosavedAt] = useState(restoredAt);

  const [prefs, setPrefs] = useState(() => {
    const p = loadPrefs(DEFAULT_PREFS);
    if (!p.lang) p.lang = detectLang();
    p.layout = p.layout ? normalizeDockLayout(p.layout) : layoutPreset("Focus");
    return p;
  });
  const [mainTab, setMainTabState] = useState(() =>
    dockGroups(prefs.layout.tree).find((g) =>
      ["viewport", "hud", "uv", "scripts", "terrain"].includes(g.active)
    )?.active || "viewport"
  );
  const setPref = useCallback(
    (patch) => setPrefs((p) => ({ ...p, ...patch })),
    [],
  );
  const focusPanel = useCallback((id) => {
    if (["viewport", "hud", "uv", "scripts", "terrain"].includes(id)) setMainTabState(id);
    setPrefs((p) => ({ ...p, layout: activateDockPanel(p.layout, id) }));
  }, []);
  const setMainTab = focusPanel;
  const setBottomTab = focusPanel;
  const setRightTab = useCallback(
    (id) =>
      focusPanel(
        id === "scene"
          ? "sceneSettings"
          : id === "project"
          ? "projectSettings"
          : id,
      ),
    [focusPanel],
  );
  const setLayoutPreset = useCallback((name) => {
    setWindowReset((value) => value + 1);
    setPrefs((p) => ({ ...p, layout: layoutPreset(name) }));
    setMainTabState("viewport");
  }, []);
  // setLang must run before the first render that reads t(), so it is done
  // here rather than in an effect.
  setLang(prefs.lang);
  useEffect(() => {
    savePrefs(prefs);
    applyTheme(prefs.theme);
  }, [prefs]);

  const [toasts, toast, dismissToast] = useToasts();

  const scene = activeScene(project);
  const selection = useMemo(
    () =>
      allObjects(scene?.objects || []).filter((o) =>
        selectedIds.includes(o.id)
      ),
    [scene, selectedIds],
  );
  const activeObject = activeId
    ? findObj(scene?.objects || [], activeId)
    : null;
  const selectedUI = selectedUIId
    ? (scene?.uiElements || []).find((e) => e.id === selectedUIId)
    : null;
  const selectedAsset = selectedAssetId
    ? files.find((f) => f.id === selectedAssetId)
    : null;

  // ── mutation ─────────────────────────────────────────────────────────
  // Computing outside the updater keeps history in step with state even when
  // several edits land in one tick.
  const edit = useCallback((mutate, tag = null) => {
    const prev = projectRef.current;
    const next = deepClone(prev);
    mutate(next, activeScene(next));
    if (JSON.stringify(next) === JSON.stringify(prev)) {
      if (tag === null) historySeal(historyRef.current);
      return;
    }
    historyPush(historyRef.current, prev, tag);
    projectRef.current = next;
    setProject(next);
    setDirty(true);
  }, []);

  const createTerrain = async (width=32,depth=32) => {
    const session=projectSessionRef.current, sceneId=activeScene(projectRef.current).id;
    const currentFiles=editorAssets(projectRef.current,diskFiles);
    const atlas=await terrainAtlasAsset(makeTerrain(width,depth),currentFiles,freeAssetName(currentFiles,"terrain_atlas","png"));
    if(session!==projectSessionRef.current || activeScene(projectRef.current).id!==sceneId)return;
    let id;
    edit((p,sc)=>{id=addEditorTerrain(p,sc,width,depth,atlas,diskFiles).id;});
    setSelectedIds([id]);setActiveId(id);setMainTab("terrain");
  };

  const useAsset = useCallback((asset, position) => {
    if (asset.cat === "scripts") {
      setOpenScript({ name: asset.name, key: uid() });
      setMainTab("scripts");
    } else if (asset.cat === "textures") {
      setSelectedAssetId(asset.id);
      setModal("textures");
    } else if (asset.cat === "models") {
      let id;
      edit((p, sc) => {
        id = placeModelAsset(sc, asset, position)?.id;
      });
      if (!id) return;
      setSelectedIds([id]);
      setActiveId(id);
      setSelectedAssetId(null);
      setSelectedUIId(null);
      focusPanel("inspector");
      setMainTab("viewport");
    }
  }, [edit, focusPanel]);

  const importModel = useCallback(async (file) => {
    const session = projectSessionRef.current, sceneId = projectRef.current.activeSceneId;
    const { assets } = await readImportedAssets([{ file }]);
    if (session !== projectSessionRef.current || sceneId !== projectRef.current.activeSceneId) return false;
    if (assets[0]?.cat !== "models") throw Error("This model could not be read. Choose an OBJ, GLB or glTF file.");
    let id;
    edit((p, sc) => {
      const { imported } = importProjectAssets(p, assets, "", files);
      id = placeModelAsset(sc, imported[0])?.id;
    });
    if (!id) return false;
    setSelectedIds([id]); setActiveId(id); setSelectedAssetId(null); setSelectedUIId(null);
    focusPanel("inspector"); setMainTab("viewport");
    return true;
  }, [edit, files, focusPanel]);

  const undo = useCallback(() => {
    const restored = historyUndo(historyRef.current, projectRef.current);
    if (!restored) {
      toast.info("Nothing to undo");
      return;
    }
    projectRef.current = restored;
    setProject(restored);
    setDirty(true);
  }, [toast]);

  const redo = useCallback(() => {
    const restored = historyRedo(historyRef.current, projectRef.current);
    if (!restored) {
      toast.info("Nothing to redo");
      return;
    }
    projectRef.current = restored;
    setProject(restored);
    setDirty(true);
  }, [toast]);

  // ── autosave ─────────────────────────────────────────────────────────
  //
  // A debounce alone never fires during a sustained gesture — dragging a gizmo
  // restarts the timer every frame — so there is a hard ceiling too: if
  // nothing has been written for AUTOSAVE_MAX_MS while the project is dirty,
  // it is written regardless.
  const lastSaveRef = useRef(Date.now());
  const quotaWarnedRef = useRef(false);

  const runAutosave = useCallback(() => {
    const r = saveAutosave(projectRef.current);
    if (r.ok) {
      lastSaveRef.current = Date.now();
      setAutosavedAt(lastSaveRef.current);
      return;
    }
    // Once per session. Repeating it every four seconds would be its own bug.
    if (quotaWarnedRef.current) return;
    quotaWarnedRef.current = true;
    toast.error("Autosave could not write", {
      sub: r.reason === "quota"
        ? "The browser's storage is full. Save to a file (Ctrl+S) — nothing is being kept for you."
        : `Your work is not being autosaved: ${r.message}`,
      ms: 0,
    });
  }, [toast]);

  useEffect(() => {
    if (!dirty) return;
    const overdue = Date.now() - lastSaveRef.current >= AUTOSAVE_MAX_MS;
    if (overdue) {
      runAutosave();
      return;
    }
    const t = setTimeout(runAutosave, AUTOSAVE_MS);
    return () => clearTimeout(t);
  }, [project, dirty, runAutosave]);

  useEffect(() => {
    const warn = (e) => {
      if (dirty) {
        e.preventDefault();
        e.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [dirty]);

  // ── migration reporting ──────────────────────────────────────────────
  // migrateProject() can rewrite settings — most notably the v2 -> v3 lift of
  // render settings from scenes to the project. Telling the user beats having
  // them discover it when a scene renders differently.
  const reportMigration = useCallback((notes) => {
    if (!notes?.length) return;
    toast.warn(notes[0], {
      sub: notes.length > 1
        ? `${notes.length - 1} more change${
          notes.length > 2 ? "s" : ""
        } — see the console.`
        : undefined,
      ms: 0,
    });
    if (notes.length > 1) {
      for (const n of notes.slice(1)) console.warn("[project migration]", n);
    }
  }, [toast]);

  useEffect(() => {
    reportMigration(bootRef.current.notes);
  }, []);

  // A saved project that could not be read. Offer it as a file before anything
  // overwrites it — the next edit is four seconds away.
  useEffect(() => {
    const bad = bootRef.current.unreadable;
    if (!bad) return;
    toast.error("Your last autosave could not be read", {
      sub:
        "The editor started empty rather than pretending nothing was there. " +
        "Download the raw copy now — the next edit replaces it.",
      ms: 0,
      action: {
        label: "Download it",
        run: () => {
          const blob = new Blob([bad.raw], { type: "application/json" });
          const a = document.createElement("a");
          a.href = URL.createObjectURL(blob);
          a.download = "unreadable-autosave.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(a.href), 1000);
        },
      },
    });
  }, [toast]);

  // A recovered older slot is worth saying out loud: what is on screen is not
  // the newest thing the user did.
  useEffect(() => {
    const from = bootRef.current.recoveredFrom;
    if (!from) return;
    toast.warn("Restored an earlier autosave", {
      sub:
        "The most recent one was unreadable, so the previous save was used. Check for missing work.",
      ms: 0,
    });
  }, [toast]);

  // ── validation ───────────────────────────────────────────────────────
  // Guarded because this runs in App's own body, above every PanelBoundary: a
  // throw inside any COMPONENTS[].validate would take the whole editor down
  // rather than one panel. Reporting the failure as a diagnostic keeps the
  // Problems panel — the place you would go to find out what is wrong — alive
  // and pointing at the real cause.
  const problems = useMemo(() => {
    try {
      return validateScene(scene, files, project);
    } catch (e) {
      console.error("[validate]", e);
      return [{
        level: "error",
        message: `Checking the scene failed: ${e.message}`,
      }];
    }
  }, [scene, files, project]);

  // ── selection ────────────────────────────────────────────────────────
  const select = useCallback((id, opts = {}) => {
    setSelectedAssetId(null);
    setSelectedUIId(null);
    if (!id) {
      setSelectedIds([]);
      setActiveId(null);
      return;
    }
    focusPanel("inspector");
    if (opts.additive) {
      setSelectedIds((
        prev,
      ) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
      setActiveId(id);
    } else if (opts.range && activeId) {
      const flat = allObjects(scene?.objects || []).map((o) => o.id);
      const a = flat.indexOf(activeId), b = flat.indexOf(id);
      if (a >= 0 && b >= 0) {
        const range = flat.slice(Math.min(a, b), Math.max(a, b) + 1);
        setSelectedIds((prev) => [...new Set([...prev, ...range])]);
      }
      setActiveId(id);
    } else {
      setSelectedIds([id]);
      setActiveId(id);
    }
  }, [activeId, scene, focusPanel]);

  const reveal = useCallback((objectId, sceneId) => {
    if (!objectId && !sceneId) return;
    // Expand every ancestor so the node is visible in the outliner.
    edit((p, sc) => {
      if (sceneId) {
        const target = p.scenes.find(s => s.id === sceneId);
        if (target) { p.activeSceneId = sceneId; sc = target; }
      }
      walk(sc.objects, (o, parents) => {
        if (o.id === objectId) {
          for (const par of parents) par.expanded = true;
        }
      });
    });
    const target = activeScene(projectRef.current);
    if (objectId && target?.uiElements?.some(el => el.id === objectId)) {
      setMainTab("hud"); setRightTab("inspector");
      setSelectedIds([]); setActiveId(null); setSelectedUIId(objectId);
    } else if (objectId) {
      setMainTab("viewport"); setRightTab("inspector"); select(objectId);
    } else {
      setSelectedIds([]); setActiveId(null); setSelectedUIId(null);
      setMainTab("viewport"); setRightTab("scene");
    }
  }, [select, edit]);

  // ── object operations ────────────────────────────────────────────────
  const addObject = useCallback((componentKey) => {
    const name = componentKey ? COMPONENTS[componentKey].label : "Empty";
    let newId = null;
    edit((p, sc) => {
      const o = mkObject(uniqueName(name, sc.objects));
      if (componentKey) {
        o.components[componentKey] = makeComponent(componentKey);
        for (const dep of COMPONENTS[componentKey].requires || []) {
          if (!o.components[dep]) o.components[dep] = makeComponent(dep);
        }
      }
      sc.objects.push(o);
      newId = o.id;
    });
    if (newId) {
      select(newId);
    }
    toast.ok(`Added ${name}`);
  }, [edit, toast, select]);

  const deleteSelection = useCallback(() => {
    if (selectedUIId) {
      edit((p, sc) => {
        sc.uiElements = sc.uiElements.filter((e) => e.id !== selectedUIId);
      });
      setSelectedUIId(null);
      return;
    }
    if (!selectedIds.length) return;
    const n = selectedIds.length;
    edit((p, sc) => {
      sc.objects = removeObjects(sc.objects, selectedIds);
    });
    setSelectedIds([]);
    setActiveId(null);
    toast.info(`Deleted ${n} object${n > 1 ? "s" : ""}`, {
      action: { label: "Undo", run: undo },
    });
  }, [selectedIds, selectedUIId, edit, toast, undo]);

  const deleteObject = useCallback((id) => {
    const ids = selectedIds.includes(id) ? selectedIds : [id];
    edit((p, sc) => {
      sc.objects = removeObjects(sc.objects, ids);
    });
    setSelectedIds((prev) =>
      prev.filter((selected) =>
        !!findObj(activeScene(projectRef.current).objects, selected)
      )
    );
    if (!findObj(activeScene(projectRef.current).objects, activeId)) {
      setActiveId(null);
    }
    toast.info(`Deleted ${ids.length} object${ids.length === 1 ? "" : "s"}`, {
      action: { label: "Undo", run: undo },
    });
  }, [selectedIds, activeId, edit, toast, undo]);

  const deleteUIObject = useCallback((id) => {
    edit((p, sc) => {
      sc.uiElements = sc.uiElements.filter((el) => el.id !== id);
    });
    if (selectedUIId === id) setSelectedUIId(null);
    toast.info("Deleted HUD element", { action: { label: "Undo", run: undo } });
  }, [selectedUIId, edit, toast, undo]);

  const duplicateSelection = useCallback(() => {
    if (selectedUI) {
      let id;
      edit((p, sc) => {
        const copies = cloneHUDElements([selectedUI], sc.uiElements, 12);
        sc.uiElements.push(...copies); id = copies[0].id;
      });
      setSelectedUIId(id); setSelectedIds([]); setActiveId(null);
      return;
    }
    if (!selection.length) return;
    const ids = [];
    edit((p, sc) => {
      const sources = selectionRoots(sc.objects, selectedIds);
      const copies = cloneObjects(sources, sc.objects);
      for (const [i, src] of sources.entries()) {
        const copy = copies[i];
        const parent = findParent(sc.objects, src.id);
        (parent ? parent.children : sc.objects).push(copy);
        ids.push(copy.id);
      }
    });
    setSelectedIds(ids);
    setActiveId(ids[ids.length - 1]);
  }, [selectedIds, selectedUI, edit]);

  const reparent = useCallback((srcId, targetId, where) => {
    edit((p, sc) => {
      const src = findObj(sc.objects, srcId);
      if (!src || (targetId && isAncestor(sc.objects, srcId, targetId))) return;
      const copy = deepClone(src);
      sc.objects = removeObjects(sc.objects, [srcId]);
      if (!targetId || where === "root") {
        sc.objects.push(copy);
        return;
      }
      const target = findObj(sc.objects, targetId);
      if (!target) {
        sc.objects.push(copy);
        return;
      }
      if (where === "inside") {
        target.children.push(copy);
        target.expanded = true;
      } else {
        const parent = findParent(sc.objects, targetId);
        const list = parent ? parent.children : sc.objects;
        const at = list.findIndex((o) => o.id === targetId);
        list.splice(where === "above" ? at : at + 1, 0, copy);
      }
    }, null);
  }, [edit]);

  const updateComponent = useCallback((objId, compKey, field, value, phase) => {
    edit((p, sc) => {
      const o = findObj(sc.objects, objId);
      if (!o?.components[compKey]) return;
      // `field` may be a dotted path — see readPath/writePath in core/util.js.
      writePath(o.components[compKey], field, value);
    }, phase === "edit" ? `comp:${objId}:${compKey}:${field}` : null);
  }, [edit]);

  const updateTransform = useCallback((objId, transform, phase) => {
    edit((p, sc) => {
      const o = findObj(sc.objects, objId);
      if (o) o.components.transform = transform;
    }, phase === "edit" ? `xform:${objId}` : null);
  }, [edit]);

  const updateScene = useCallback((path, value, phase) => {
    edit(
      (p, sc) => writePath(sc, path, value),
      phase === "edit" ? `scene:${path}` : null,
    );
  }, [edit]);

  const updateProject = useCallback((path, value, phase) => {
    edit(
      (p) => writePath(p, path, value),
      phase === "edit" ? `project:${path}` : null,
    );
  }, [edit]);

  const updateUI = useCallback((id, patch, phase) => {
    edit((p, sc) => {
      const el = sc.uiElements.find((e) => e.id === id);
      if (el) Object.assign(el, patch);
    }, phase === "edit" ? `ui:${id}` : null);
  }, [edit]);

  // ── assets ───────────────────────────────────────────────────────────
  const importHUDfont = useCallback(async (id, blob, name, sourceWindow) => {
    const session = projectSessionRef.current;
    const sceneId = activeScene(projectRef.current).id;
    const asset = await readHUDfont(await blob, name, sourceWindow);
    if (session !== projectSessionRef.current) return false;
    let attached;
    edit((p) => { attached = attachHUDfont(p, sceneId, id, asset, files); });
    if (attached) toast.ok(`Imported ${attached.name}`, { sub: "The font is saved and exported with the project." });
    return !!attached;
  }, [edit, files, toast]);

  const pickFolder = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.webkitdirectory = true;
    input.multiple = true;
    input.onchange = async () => {
      if (!input.files?.length) return;
      setLoadingAssets(true);
      try {
        const { assets, projectJSON } = await readAssetFolder(
          input.files,
          null,
          projectRef.current?.dirs,
        );
        setFiles((prev) => mergeAssets(prev, assets));
        if (projectJSON) {
          try {
            const notes = [];
            const loaded = await adoptProject(JSON.parse(projectJSON), notes);
            if (loaded) {
              reportMigration(notes);
              toast.ok(`Loaded ${loaded.name}`, {
                sub: `${assets.length} assets`,
              });
            } else {
              toast.info("Kept your project", {
                sub: `${assets.length} assets loaded from the folder`,
              });
            }
          } catch (e) {
            toast.error("The project file could not be read", {
              sub: e.message,
            });
          }
        } else {
          toast.ok(`Loaded ${assets.length} assets`);
        }
        const failed = assets.filter((a) => a.error);
        if (failed.length) {
          toast.warn(`${failed.length} file(s) could not be read`, {
            sub: failed[0].name,
          });
        }
      } catch (e) {
        toast.error("Could not read that folder", { sub: e.message });
      } finally {
        setLoadingAssets(false);
      }
    };
    input.click();
  }, [toast, reportMigration]);

  // ── linked folder ────────────────────────────────────────────────────
  // Asset refreshes never reload the scene or change its save destination.
  const readFolderAssets = useCallback(async (handle, {
    request = true, notify = true, isActive = () => true,
  } = {}) => {
    if (!handle) return false;
    const session = projectSessionRef.current;
    const read = ++folderReadRef.current;
    const current = () => isActive() && session === projectSessionRef.current &&
      folderRef.current === handle && read === folderReadRef.current;
    try {
      const permission = await fsPermissionState(handle, "read");
      if (!current()) return false;
      const allowed = permission === "granted" ||
        (request && await fsEnsurePermission(handle, "read", actionWindow()));
      if (!current()) return false;
      setFolderNeedsReadAccess(!allowed);
      if (!allowed) {
        if (notify) toast.warn(`Allow access to load assets from ${handle.name}/`);
        return false;
      }
      setLoadingAssets(true);
      const { assets } = await fsReadProjectFolder(
        handle, projectRef.current.dirs, undefined, { readProject: false },
      );
      if (!current()) return false;
      setFiles((previous) => mergeAssets(previous, assets));
      const failed = assets.filter((asset) => asset.error);
      if (failed.length) toast.warn(`${failed.length} file(s) could not be read`, {
        sub: failed[0].name,
      });
      else if (notify) toast.ok(`Loaded ${assets.length} assets from ${handle.name}/`);
      return true;
    } catch (error) {
      if (current()) {
        setFolderNeedsReadAccess(true);
        toast.error("Could not load project assets", { sub: error.message });
      }
      return false;
    } finally {
      if (read === folderReadRef.current) setLoadingAssets(false);
    }
  }, [toast]);
  const reloadFolderAssets = useCallback(
    () => readFolderAssets(folderRef.current), [readFolderAssets],
  );

  // Restore only this project's folder. Query access without prompting, and
  // load its external assets while keeping the browser's recovered scene.
  useEffect(() => {
    if (!isFSSupported()) return;
    let cancelled = false;
    const session = projectSessionRef.current;
    (async () => {
      const handle = await fsLoadHandle(projectRef.current.id);
      if (
        cancelled || !handle || session !== projectSessionRef.current ||
        folderRef.current
      ) return;
      folderRef.current = handle;
      setFolderName(handle.name);
      const permission = await fsPermissionState(handle);
      if (
        !cancelled && session === projectSessionRef.current &&
        folderRef.current === handle
      ) {
        setFolderNeedsGrant(permission !== "granted");
        await readFolderAssets(handle, {
          request: false, notify: false, isActive: () => !cancelled,
        });
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    if (!isProjectFilePickerSupported("save")) return;
    let cancelled = false;
    const session = projectSessionRef.current;
    fsLoadProjectFile(projectRef.current.id).then((handle) => {
      if (
        cancelled || !handle || session !== projectSessionRef.current ||
        projectFileRef.current
      ) return;
      projectFileRef.current = handle;
      setProjectFileName(handle.name);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  /** Read assets and the project file out of the linked folder. */
  const syncFromFolder = useCallback(async (handle) => {
    const read = ++folderReadRef.current;
    const session = projectSessionRef.current;
    setLoadingAssets(true);
    try {
      const { assets, projectJSON, projectHandle } = await fsReadProjectFolder(
        handle,
        projectRef.current.dirs,
      );
      if (read !== folderReadRef.current || session !== projectSessionRef.current) return false;
      if (projectJSON) {
        const notes = [];
        const loaded = await adoptProject(JSON.parse(projectJSON), notes);
        if (loaded) {
          setFiles(assets);
          reportMigration(notes);
          toast.ok(`Loaded ${loaded.name}`, {
            sub: `${assets.length} assets from ${handle.name}/`,
          });
        } else {
          return false;
        }
      } else {
        setFiles((prev) => mergeAssets(prev, assets));
        toast.ok(`Linked ${handle.name}/`, { sub: `${assets.length} assets` });
      }
      folderRef.current = handle;
      setFolderName(handle.name);
      setFolderNeedsGrant(false);
      setFolderNeedsReadAccess(false);
      projectFileRef.current = projectHandle;
      setProjectFileName(projectHandle?.name || null);
      try {
        await fsSaveHandle(handle, projectRef.current.id);
        if (projectHandle) {
          await fsSaveProjectFile(projectHandle, projectRef.current.id);
          await rememberProject(projectHandle, projectRef.current, handle);
        } else await fsForgetProjectFile();
      } catch {
        /* Access still works for this session if storage is unavailable. */
      }
      return true;
    } catch (e) {
      toast.error("Could not read the linked folder", { sub: e.message });
    } finally {
      if (read === folderReadRef.current) setLoadingAssets(false);
    }
  }, [toast, reportMigration, rememberProject]);

  const linkFolder = useCallback(async () => {
    if (!isFSSupported()) {
      toast.warn("This browser cannot write files directly", {
        sub: "Chrome or Edge support it. Export will download instead.",
        ms: 0,
      });
      return;
    }
    try {
      const handle = await fsPickFolder(actionWindow());
      await syncFromFolder(handle);
    } catch (e) {
      if (e.name !== "AbortError") {
        toast.error("Could not link that folder", { sub: e.message });
      }
    }
  }, [toast, syncFromFolder]);

  // ── the AthenaEnv runtime ────────────────────────────────────────────
  // The editor cannot produce athena.elf, so it remembers one the user points
  // it at and copies that into every project it scaffolds.
  useEffect(() => {
    // Only IndexedDB is needed to remember it — a browser that cannot write
    // folders can still be pointed at an ELF for when one that can opens the
    // same profile.
    if (typeof indexedDB === "undefined") return;
    let cancelled = false;
    fsLoadRuntime().then((r) => {
      if (!cancelled && r) setRuntime({ name: r.name, size: r.size });
    }).catch(() => {});
    return () => {
      cancelled = true;
    };
  }, []);

  const pickRuntime = useCallback(() => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = ".elf";
    input.onchange = async () => {
      const f = input.files?.[0];
      if (!f) return;
      try {
        const data = await f.arrayBuffer();
        await fsSaveRuntime({ name: f.name, size: f.size, data });
        setRuntime({ name: f.name, size: f.size });
        toast.ok(`${f.name} remembered`, {
          sub: "It will be copied into every project you create.",
        });
      } catch (e) {
        toast.error("Could not read that file", { sub: e.message });
      }
    };
    input.click();
  }, [toast]);

  /**
   * Create a project and lay its folder out on disk.
   *
   * Order matters: the picker must run inside the click that triggered this,
   * and the project is only adopted once a folder has actually been chosen.
   * Returns false if the user backed out, so the dialog can stay open.
   */
  const scaffoldProject = useCallback(async (next, template) => {
    let handle;
    try {
      handle = await fsPickNewProjectFolder();
    } catch (e) {
      if (e.name !== "AbortError") {
        toast.error("Could not open that folder", { sub: e.message });
      }
      return false;
    }

    try {
      const wasEmpty = await fsIsEmpty(handle);
      const plan = planScaffold(next, template);
      const runtimeEntry = await fsLoadRuntime();
      const { written, skipped } = await fsScaffoldProject(
        handle,
        plan,
        runtimeEntry,
      );

      // Link it, so Export and Ctrl+S go straight here from now on.
      await fsSaveHandle(handle, next.id);
      folderRef.current = handle;
      setFolderName(handle.name);
      setFolderNeedsGrant(false);
      setFolderNeedsReadAccess(false);
      const projectPath = `${ident(next.name, "project")}${PROJECT_EXTENSION}`;
      if (!skipped.includes(projectPath)) {
        projectFileRef.current = await fsFileHandle(handle, projectPath, {
          create: false,
        });
        setProjectFileName(projectFileRef.current.name);
        await fsSaveProjectFile(projectFileRef.current, next.id).catch(
          () => {},
        );
        await rememberProject(projectFileRef.current, next, handle);
      }

      // main.js is written by the normal export path — one place owns
      // generated code, and it already knows what it is safe to replace.
      // Declining rather than prompting: a folder that already holds someone's
      // main.js is not a folder a new project should be writing over.
      const result = generateProject(next, editorAssets(next, diskFiles));
      const exported = await fsWriteExport(handle, result, {
        confirmOverwrite: async () => false,
      });
      if (!exported.skipped && projectRef.current === next) setDirty(false);

      const notes = [];
      if (!runtimeEntry) {
        notes.push(
          "athena.elf is missing — choose the console player and prepare again",
        );
      }
      if (exported.skipped) {
        notes.push("main.js already existed and was left alone");
      }
      if (skipped.length) {
        notes.push(`${skipped.length} existing file(s) left alone`);
      } else if (!wasEmpty) notes.push("the folder was not empty");
      toast.ok(`Created ${next.name} in ${handle.name}/`, {
        sub: notes.length
          ? notes.join(" · ")
          : `${written.length + exported.written.length} files written`,
        ms: notes.length ? 0 : undefined,
      });
      return true;
    } catch (e) {
      toast.error("Could not create the project folder", { sub: e.message });
      console.error(e);
      return false;
    }
  }, [toast, diskFiles, rememberProject]);

  const unlinkFolder = useCallback(async () => {
    await fsForgetHandle();
    folderRef.current = null;
    setFolderName(null);
    setFolderNeedsGrant(false);
    setFolderNeedsReadAccess(false);
    toast.info("Folder unlinked", {
      sub: projectFileRef.current
        ? "Export will download. Save still uses the project file."
        : "Choose a file on your next save.",
    });
  }, [toast]);

  /** Handle with permission confirmed, or null. Call inside a user gesture. */
  const activeFolder = useCallback(async () => {
    const handle = folderRef.current;
    if (!handle) return null;
    const ok = await fsEnsurePermission(handle, "readwrite", actionWindow());
    setFolderNeedsGrant(!ok);
    if (!ok) {
      toast.warn(`Write access to ${handle.name}/ was declined`, {
        sub: "Falling back to a download.",
      });
    }
    return ok ? handle : null;
  }, [toast]);

  const noteBounds = useCallback((fileName, bounds) => {
    setFiles((prev) =>
      prev.some((f) => f.name === fileName && !f.bounds)
        ? prev.map((
          f,
        ) => (f.name === fileName && !f.bounds ? { ...f, bounds } : f))
        : prev
    );
  }, []);

  // ── project files ────────────────────────────────────────────────────
  const saveProject = useCallback(async ({ saveAs = false } = {}) => {
    if (savingProjectRef.current) return false;
    savingProjectRef.current = true;
    const p = projectRef.current, session = projectSessionRef.current;
    const suggestedName = `${ident(p.name, "project")}${PROJECT_EXTENSION}`;
    try {
      let handle = saveAs ? null : projectFileRef.current;
      if (!handle && isProjectFilePickerSupported("save")) {
        // Open the picker before serializing assets or awaiting any other work.
        handle = await fsPickProjectSave(
          projectFileRef.current?.name || suggestedName,
          projectFileRef.current || folderRef.current,
          actionWindow(),
        );
      }
      if (handle) {
        if (!(await fsEnsurePermission(handle, "readwrite", actionWindow()))) {
          toast.warn("The project was not saved", {
            sub:
              "Write access was declined. Use Save Project As to choose another file.",
          });
          return false;
        }
        await fsWriteProjectFile(handle, projectToJSON(p, files));
        if (session === projectSessionRef.current) {
          projectFileRef.current = handle;
          setProjectFileName(handle.name);
          setDirty(projectRef.current !== p);
          await fsSaveProjectFile(handle, p.id).catch(() => {});
          await rememberProject(handle, p, folderRef.current);
        }
        toast.ok(`Saved ${handle.name}`);
        return true;
      }
      // Browsers without file pickers keep the existing folder/download path.
      const folder = saveAs ? null : await activeFolder();
      const json = projectToJSON(p, files);
      if (folder) await fsWriteText(folder, suggestedName, json);
      else downloadText(suggestedName, json);
      if (session === projectSessionRef.current) {
        setDirty(projectRef.current !== p);
        if (!folder) { setDownloadedFileName(suggestedName); setProjectFileName(null); }
        else { setProjectFileName(suggestedName); setDownloadedFileName(null); }
      }
      toast.ok(folder ? `Saved ${suggestedName}` : "Project downloaded", {
        sub: folder ? `in ${folder.name}/` : undefined,
      });
      return true;
    } catch (e) {
      if (e.name !== "AbortError") {
        toast.error("Could not save the project", { sub: e.message });
      }
      return false;
    } finally {
      savingProjectRef.current = false;
    }
  }, [files, toast, activeFolder, rememberProject]);

  /**
   * The single gate every project-replacing path goes through.
   *
   * Three of them existed — Open Project File, Import Assets From Folder and
   * Reload From Linked Folder — and all three replaced the project outright,
   * reset undo and cleared the dirty flag with no question asked. Two of the
   * three are reachable from buttons whose labels are about ASSETS, so losing
   * an afternoon to one was a matter of clicking the wrong ↻.
   *
   * Returns the migrated project, or null when the user backs out. Throws when
   * the file is not a project at all, so callers keep their existing catch.
   */
  const adoptProject = useCallback(async (parsed, notes) => {
    if (!looksLikeProject(parsed)) {
      throw new Error(
        "It has no scenes and no version, so it is not an AthEditor project.",
      );
    }
    if (projectRef.current && dirtyRef.current) {
      const ok = await new Promise((resolve) => {
        let done = false;
        const once = (v) => {
          if (!done) {
            done = true;
            resolve(v);
          }
        };
        setModal({
          kind: "confirmReplace",
          name: parsed.name || "that project",
          resolve: once,
        });
      });
      if (!ok) return null;
    }
    const loaded = migrateProject(parsed, notes);
    resetProjectDestination();
    projectRef.current = loaded;
    setProject(loaded);
    setWelcome(false);
    historyRef.current = createHistory();
    setSelectedIds([]);
    setActiveId(null);
    setSelectedUIId(null);
    setDirty(false);
    return loaded;
  }, [resetProjectDestination]);

  const loadProjectFile = useCallback(async (file, handle = null, recent = null) => {
      try {
        const notes = [];
        const loaded = await adoptProject(
          JSON.parse(await file.text()),
          notes,
        );
        if (!loaded) return false;
        const session = projectSessionRef.current;
        setFiles([]);
        projectFileRef.current = handle;
        setProjectFileName(handle?.name || null);
        if (handle) {
          await fsSaveProjectFile(handle, loaded.id).catch(() => {});
          if (session !== projectSessionRef.current) return false;
          const folder = recent?.projectId === loaded.id ? recent.folder : null;
          if (folder) {
            folderRef.current = folder;
            setFolderName(folder.name);
            const permission = await fsPermissionState(folder);
            if (session !== projectSessionRef.current || folderRef.current !== folder) return false;
            setFolderNeedsGrant(permission !== "granted");
            await fsSaveHandle(folder, loaded.id).catch(() => {});
            await readFolderAssets(folder, { request: false, notify: false });
          }
          await rememberProject(handle, loaded, folder);
        }
        reportMigration(notes);
        toast.ok(`Loaded ${loaded.name}`);
        return true;
      } catch (e) {
        toast.error("That file is not a valid project", { sub: e.message });
        return false;
      }
  }, [toast, reportMigration, adoptProject, readFolderAssets, rememberProject]);

  const openProjectHandle = useCallback(async (handle, recent = null, reuse = false) => {
    try {
      if (reuse && projectFileRef.current && (handle === projectFileRef.current ||
        await projectFileRef.current.isSameEntry?.(handle))) {
        window.focus?.();
        return true;
      }
      if (!handle || !(await fsEnsurePermission(handle, "read", actionWindow()))) {
        toast.warn("Allow access to open this project");
        return false;
      }
      if (!recent) for (const entry of recentProjects) {
        if (entry.handle === handle || await entry.handle.isSameEntry?.(handle)) { recent = entry; break; }
      }
      return await loadProjectFile(await handle.getFile(), handle, recent);
    } catch (error) {
      if (error.name !== "AbortError") toast.error("Could not open the project file", { sub: error.message });
      return false;
    }
  }, [loadProjectFile, toast, recentProjects]);

  const openProjectFile = useCallback(async () => {
    if (isProjectFilePickerSupported("open")) {
      try {
        const handle = await fsPickProjectFile(actionWindow());
        if (!handle) return false;
        return await openProjectHandle(handle);
      } catch (e) {
        if (e.name !== "AbortError") {
          toast.error("Could not open the project file", { sub: e.message });
        }
        return false;
      }
    }
    const input = document.createElement("input");
    input.type = "file";
    input.accept = `${PROJECT_EXTENSION},.json`;
    input.onchange = () => input.files?.[0] && loadProjectFile(input.files[0]);
    input.click();
  }, [toast, loadProjectFile, openProjectHandle]);

  const importDroppedAssets = useCallback(async (transfer, destination = "", options = {}) => {
    const session = projectSessionRef.current;
    const receiptKey = options.receiptId && `${session}/${options.receiptId}`;
    if (receiptKey && (appliedShareReceipts.current.has(receiptKey) || projectRef.current.assets.some((asset) => asset.shareReceipt === options.receiptId))) return true;
    // captureDroppedFiles must be invoked before returning from the drop event.
    const captured = captureDroppedFiles(transfer);
    setLoadingAssets(true);
    try {
      const { assets, rejected } = await readImportedAssets(await captured);
      if (session !== projectSessionRef.current || options.isActive?.() === false) return false;
      if (options.receiptId) assets.forEach((asset) => { asset.shareReceipt = options.receiptId; });
      const accepted = assets.filter((asset) => !destination || destination.split("/")[0] === ASSET_CATEGORY_LABELS[asset.cat]);
      rejected.push(...assets.filter((asset) => !accepted.includes(asset)).map((asset) => asset.name));
      let result;
      if (accepted.length) edit((project) => { result = importProjectAssets(project, accepted, destination, files); });
      if (rejected.length) toast.warn(`${rejected.length} file(s) were not imported`, {
        sub: `Unsupported, unreadable, or outside the selected asset category: ${rejected.slice(0, 3).join(", ")}`,
      });
      if (result?.imported.length) toast.ok(`Imported ${result.imported.length} assets`, { sub: "Saved with the project. Undo removes this import." });
      if (receiptKey && result?.imported.length) appliedShareReceipts.current.add(receiptKey);
      return !!result?.imported.length;
    } catch (error) {
      toast.error("Could not import dropped files", { sub: error.message });
      return false;
    } finally { setLoadingAssets(false); }
  }, [edit, files, toast]);

  const pasteObjects = useCallback((payload) => {
    let ids;
    const hud = payload.kind === "atheditor.hud";
    edit((p, sc) => { ids = hud ? pasteHUDClipboard(p, sc, payload, files) : pasteObjectClipboard(p, sc, payload, files); });
    if (ids.length) {
      setSelectedIds(hud ? [] : ids); setActiveId(hud ? null : ids.at(-1));
      setSelectedUIId(hud ? ids.at(-1) : null); setSelectedAssetId(null);
      setMainTab(hud ? "hud" : "viewport"); focusPanel("inspector");
    }
    return !!ids.length;
  }, [edit, files, focusPanel]);
  const pasteSystemClipboard = useCallback(async () => {
    if (clipboardReadRef.current.busy) return false;
    const version = ++clipboardReadRef.current.version;
    clipboardReadRef.current.busy = true;
    const session = projectSessionRef.current, sceneId = projectRef.current.activeSceneId;
    try {
      const data = await readEditorClipboard(actionWindow());
      if (session !== projectSessionRef.current || sceneId !== projectRef.current.activeSceneId || version !== clipboardReadRef.current.version) return false;
      if (data?.payload) return pasteObjects(data.payload);
      if (data?.files?.length) return importDroppedAssets({ files: data.files }, "Textures/Clipboard", { isActive: () => version === clipboardReadRef.current.version });
      if (data) { toast.info("The clipboard has no images or AthEditor elements."); return false; }
    } catch (error) {
      if (version !== clipboardReadRef.current.version || session !== projectSessionRef.current || sceneId !== projectRef.current.activeSceneId) return false;
      // An invalid payload must not silently paste an older internal copy.
      if (!["NotAllowedError", "SecurityError", "NotSupportedError"].includes(error.name)) { toast.error("Could not paste", { sub: error.message }); return false; }
      if (!clipboardItemCount(clipboardRef.current)) toast.warn("System clipboard access is unavailable", { sub: "Copy an element in the editor, or use your browser's Paste command." });
    } finally {
      if (version === clipboardReadRef.current.version) clipboardReadRef.current.busy = false;
    }
    return clipboardItemCount(clipboardRef.current) ? pasteObjects(clipboardRef.current) : false;
  }, [pasteObjects, importDroppedAssets, toast]);
  const handleEditorPaste = useCallback((event) => {
    const el = event.target;
    if (modalRef.current || paletteOpen || el?.nodeType === 1 && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
    const transfer = event.clipboardData;
    if (!transfer) return;
    const text = transfer.getData("text/plain");
    if (isEditorClipboardText(text)) {
      clipboardReadRef.current.version++; clipboardReadRef.current.busy = false;
      event.preventDefault();
      try { pasteObjects(parseObjectClipboard(text)); } catch (error) { toast.error("Could not paste", { sub: error.message }); }
    } else if ([...(transfer.files || [])].some((file) => /^image\//.test(file.type))) {
      clipboardReadRef.current.version++; clipboardReadRef.current.busy = false;
      event.preventDefault();
      importDroppedAssets({ files: [...transfer.files].filter((file) => /^image\//.test(file.type)) }, "Textures/Clipboard");
    }
  }, [pasteObjects, importDroppedAssets, paletteOpen, toast]);
  useEffect(() => {
    window.addEventListener("paste", handleEditorPaste);
    return () => window.removeEventListener("paste", handleEditorPaste);
  }, [handleEditorPaste]);

  const copySelection = useCallback((event) => {
    if (!selectedUI && !selectedIds.length) return false;
    const payload = selectedUI ? makeHUDClipboard(projectRef.current, scene, [selectedUI.id], files) : makeObjectClipboard(projectRef.current, scene, selectedIds, files);
    const count = clipboardItemCount(payload), label = selectedUI ? "HUD element" : "object";
    if (!count) return false;
    clipboardRef.current = payload;
    const copied = () => toast.info(`Copied ${count} ${label}${count === 1 ? "" : "s"}`);
    // Native Copy exposes a synchronous clipboardData transfer, including when
    // navigator.clipboard is unavailable or the browser runs its Copy command.
    if (event?.clipboardData) {
      event.clipboardData.setData("text/plain", (selectedUI ? HUD_CLIPBOARD_PREFIX : EDITOR_CLIPBOARD_PREFIX) + JSON.stringify(payload));
      event.preventDefault(); copied(); return true;
    }
    let written;
    try { written = writeObjectClipboard(payload, actionWindow()); }
    catch (error) { toast.warn("Copied inside the editor", { sub: error.message }); return false; }
    if (written) return written.then(copied, error => toast.warn("Copied inside the editor", { sub: error.message }));
    copied(); return true;
  }, [selectedUI, selectedIds, scene, files, toast]);
  const handleEditorCopy = useCallback((event) => {
    const el = event.target;
    if (modalRef.current || paletteOpen || el?.nodeType === 1 && (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT" || el.isContentEditable)) return;
    if (event.clipboardData) copySelection(event);
  }, [copySelection, paletteOpen]);
  useEffect(() => {
    window.addEventListener("copy", handleEditorCopy);
    return () => window.removeEventListener("copy", handleEditorCopy);
  }, [handleEditorCopy]);

  const shareReceipts = useRef(new Set()), receiveShareRef = useRef(null);
  receiveShareRef.current = async (id) => {
    if (shareReceipts.current.has(id)) return;
    shareReceipts.current.add(id);
    try { await receiveSharedImages(id, importDroppedAssets); }
    catch (error) { toast.error("Could not receive shared images", { sub: error.message }); }
    finally { shareReceipts.current.delete(id); }
  };
  useEffect(() => {
    if (!navigator.serviceWorker) return;
    const message = (event) => {
      if (event.data?.type === "atheditor.shared-images") receiveShareRef.current(event.data.id);
    };
    const pending = async () => {
      if (!navigator.serviceWorker.controller) return;
      try {
        const response = await fetch("/__shared-images", { cache: "no-store" });
        if (response.ok) for (const id of await response.json()) await receiveShareRef.current(id);
      } catch { /* Pending files remain in the worker until access returns. */ }
    };
    navigator.serviceWorker.addEventListener("message", message);
    navigator.serviceWorker.addEventListener("controllerchange", pending);
    window.addEventListener("focus", pending);
    pending();
    return () => {
      navigator.serviceWorker.removeEventListener("message", message);
      navigator.serviceWorker.removeEventListener("controllerchange", pending);
      window.removeEventListener("focus", pending);
    };
  }, []);

  // OS launches reuse this window. Queue arrivals so replacement confirmations
  // cannot overwrite each other, and never reload an editing document.
  const launchHandlerRef = useRef(null);
  const launchChainRef = useRef(Promise.resolve());
  launchHandlerRef.current = async (params) => {
    const handles = params.files || [];
    if (handles.length) {
      for (const handle of handles) {
        if (!isProjectFilename(handle.name)) continue;
        if (!(await openProjectHandle(handle, null, true))) break;
      }
      return;
    }
    let action;
    try { action = new URL(params.targetURL || window.location?.href).searchParams.get("action"); }
    catch { return; }
    if (action === "new") setModal("newProject");
    if (action === "recent") setModal("recentProjects");
    let shared;
    try { shared = new URL(params.targetURL || window.location.href).searchParams.get("shared"); } catch { /* No URL. */ }
    if (shared) await receiveShareRef.current(shared);
  };
  useEffect(() => {
    let cancelled = false;
    const consume = (params) => {
      launchChainRef.current = launchChainRef.current.catch(() => {}).then(() => {
        if (!cancelled) return launchHandlerRef.current(params);
      });
      return launchChainRef.current;
    };
    if (window.launchQueue?.setConsumer) window.launchQueue.setConsumer(consume);
    else if (window.location?.href) consume({ targetURL: window.location.href });
    return () => { cancelled = true; };
  }, []);

  /** Generate, and write to the linked folder when there is one. */
  const runExport = useCallback(async ({ preview = false } = {}) => {
    let result;
    try {
      result = generateProject(projectRef.current, files);
    } catch (e) {
      toast.error("Export failed", { sub: e.message });
      console.error(e);
      return;
    }
    setExportResult(result);

    const errs = result.diagnostics.filter((d) => d.level === "error").length;
    if (errs) {
      setModal("export");
      toast.error("Resolve the export errors to download or run the game.");
      return;
    }
    const folder = preview ? null : await activeFolder();

    if (folder) {
      try {
        const { written, unchanged, skipped } = await fsWriteExport(
          folder,
          result,
          {
            // ConfirmModal calls onConfirm then onClose, so the resolver is
            // guarded rather than relying on a second resolve() being ignored.
            confirmOverwrite: (conflicts) =>
              new Promise((resolve) => {
                let done = false;
                const once = (v) => {
                  if (!done) {
                    done = true;
                    resolve(v);
                  }
                };
                setModal({
                  kind: "confirmOverwrite",
                  conflicts,
                  resolve: once,
                });
              }),
          },
        );
        if (skipped) {
          toast.info("Nothing written", {
            sub: "Open Export to copy the code by hand.",
          });
          return;
        }
        if (!written.length) {
          toast.ok(`${folder.name}/ is already up to date`, {
            sub: `${unchanged.length} file(s) unchanged`,
          });
          return;
        }
        const summary = `Wrote ${written.length} file${
          written.length > 1 ? "s" : ""
        } to ${folder.name}/`;
        const detail = errs
          ? `${errs} error${errs > 1 ? "s" : ""} — check Problems`
          : [
            ...written,
            ...(unchanged.length ? [`(${unchanged.length} unchanged)`] : []),
          ].join("   ");
        if (errs) toast.warn(summary, { sub: detail });
        else toast.ok(summary, { sub: detail });
        return;
      } catch (e) {
        toast.error("Could not write to the linked folder", { sub: e.message });
        // fall through to the preview so the work is not lost
      }
    }

    setModal("export");
    if (errs) {
      toast.warn(`Fix ${errs} error${errs > 1 ? "s" : ""} to export`, {
        sub: "Choose an error to go to the affected item.",
      });
    }
  }, [files, toast, activeFolder]);

  const runGame = useCallback(async () => {
    if (playBusy) return;
    if (!canRunLocally) { setModal("play"); return; }
    setPlayBusy(true);
    try {
      const status = await editorPlayRequest("status");
      if (status.running) {
        await editorPlayRequest("stop", {});
        setPlaying(false);
        return;
      }
      if (!status.available) {
        setModal("play");
        return;
      }
      const result = generateProject(projectRef.current, files, { sceneId: projectRef.current.activeSceneId });
      if (result.diagnostics.some((d) => d.level === "error")) {
        setBottomTab("problems");

        toast.error("Resolve the scene's errors before running.");
        return;
      }
      await editorPlayRequest("launch", {
        main: result.main,
        scripts: result.scripts,
        sceneFiles: result.sceneFiles,
        assets: result.assets,
      });
      setPlaying(true);
      toast.ok("Game running in PCSX2");
    } catch (e) {
      toast.error("Could not run the game", {
        sub: e.message,
        ms: 0,
        action: { label: "Run settings", run: () => setModal("play") },
      });
    } finally {
      setPlayBusy(false);
    }
  }, [files, playBusy, toast, canRunLocally]);

  useEffect(() => {
    if (!canRunLocally) return;
    let cancelled = false;
    const refresh = () =>
      editorPlayRequest("status").then((s) => {
        if (!cancelled) setPlaying(s.running);
      }).catch(() => {});
    refresh();
    if (!playing) {
      return () => {
        cancelled = true;
      };
    }
    const timer = setInterval(refresh, 2000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [playing, canRunLocally]);

  const applyProblemFix = useCallback((p) => {
    let ok = false;
    edit((draft) => {
      ok = applyFix(p, draft, draft.activeSceneId);
    });
    if (ok) toast.ok("Fixed");
  }, [edit, toast]);

  // ── commands ─────────────────────────────────────────────────────────
  const commands = useMemo(() => {
    const cmds = [
      // Ctrl+Alt+N, not Ctrl+N: browsers reserve Ctrl+N for a new window and never
      // deliver the keydown to the page, so the menu was advertising a chord that
      // could not fire — and pressing it threw the user into a blank window.
      {
        id: "file.new",
        group: "File",
        title: "New Project…",
        icon: "✦",
        keys: "Ctrl+Alt+N",
        run: () => setModal("newProject"),
      },
      {
        id: "file.recent", group: "File", title: "Recent Projects…",
        run: () => setModal("recentProjects"),
      },
      // Four ways to point the editor at a folder used to be on this menu with
      // labels that did not distinguish them — one of them read like a status
      // line and opened a picker. Each title now states what it does, and the
      // read-only importer hides itself once linking has made it redundant.
      {
        id: "file.link",
        group: "File",
        icon: "⇄",
        keys: "Ctrl+Shift+O",
        title: folderName ? "Change Project Folder…" : "Open Existing Folder…",
        run: linkFolder,
        enabled: () => isFSSupported(),
      },
      {
        id: "file.relink",
        group: "File",
        title: folderName
          ? `Reload Assets From ${folderName}/`
          : "Reload From Linked Folder",
        hidden: !folderName,
        run: reloadFolderAssets,
      },
      {
        id: "file.unlink",
        group: "File",
        title: "Unlink Folder",
        hidden: !folderName,
        run: unlinkFolder,
      },
      {
        // Not dead code: this is the only asset path on Firefox and Safari,
        // which ship webkitdirectory but not the File System Access API, and
        // the only way to read a folder without granting write access. Once a
        // folder IS linked on a browser that can, Reload covers everything it
        // does, so showing both is the duplication people complain about.
        id: "file.open",
        group: "File",
        icon: "▤",
        title: "Import Assets…",
        run: pickFolder,
        hidden: isFSSupported() && !!folderName,
      },
      {
        id: "file.openjson",
        group: "File",
        title: "Open Project File…",
        keys: "Ctrl+O",
        run: openProjectFile,
      },
      {
        id: "file.save",
        group: "File",
        title: "Save Project",
        icon: "▼",
        keys: "Ctrl+S",
        run: saveProject,
        sep: true,
      },
      {
        id: "file.saveas",
        group: "File",
        title: "Save Project As…",
        keys: "Ctrl+Shift+S",
        run: () => saveProject({ saveAs: true }),
      },
      {
        id: "file.play",
        group: "File",
        title: playing ? "Stop game" : "Run game…",
        keys: "F5",
        run: runGame,
        enabled: () => !playBusy,
      },
      {
        id: "file.playSettings",
        group: "File",
        title: "Run settings…",
        hidden: !canRunLocally,
        run: () => setModal("play"),
      },
      {
        id: "file.export",
        group: "File",
        icon: "⬆",
        keys: "Ctrl+E",
        title: folderName ? `Export to ${folderName}/` : "Export…",
        run: () => runExport(),
      },
      {
        id: "file.exportPreview",
        group: "File",
        title: "Export — Preview Code…",
        hidden: !folderName,
        run: () => runExport({ preview: true }),
      },
      {
        id: "file.newscene",
        group: "File",
        title: "New Scene",
        sep: true,
        run: () => {
          let id = null;
          edit((p) => {
            const src = activeScene(p);
            const ns = mkScene(`Scene_${p.scenes.length + 1}`);
            // Only genuinely per-scene settings carry over. Display, alpha test
            // and asset folders live on the project now, so there is nothing
            // left to copy and nothing left to drift apart.
            if (src) {
              ns.background = deepClone(src.background);
              ns.camera = deepClone(src.camera);
              ns.physics = deepClone(src.physics);
            }
            p.scenes.push(ns);
            p.activeSceneId = ns.id;
            id = ns.id;
          });
          if (id) {
            setSelectedIds([]);
            setActiveId(null);
            toast.ok("Scene created");
          }
        },
      },
      {
        id: "file.deletescene",
        group: "File",
        title: "Delete Scene",
        enabled: () => project.scenes.length > 1,
        run: () => setModal("confirmDeleteScene"),
      },

      {
        id: "edit.undo",
        group: "Edit",
        title: "Undo",
        icon: "↶",
        keys: "Ctrl+Z",
        run: undo,
        enabled: () => canUndo(historyRef.current),
      },
      {
        id: "edit.redo",
        group: "Edit",
        title: "Redo",
        icon: "↷",
        keys: "Ctrl+Shift+Z",
        run: redo,
        enabled: () => canRedo(historyRef.current),
      },
      {
        id: "edit.duplicate",
        group: "Edit",
        title: "Duplicate",
        keys: "Ctrl+D",
        sep: true,
        enabled: () => selection.length > 0 || !!selectedUI,
        run: duplicateSelection,
      },
      {
        id: "edit.copy",
        group: "Edit",
        title: "Copy",
        keys: "Ctrl+C",
        enabled: () => selection.length > 0 || !!selectedUI,
        run: () => copySelection(),
      },
      {
        id: "edit.paste",
        group: "Edit",
        title: "Paste",
        keys: "Ctrl+V",
        enabled: () => !!actionWindow().navigator?.clipboard || clipboardItemCount(clipboardRef.current) > 0,
        run: () => actionWindow().navigator?.clipboard ? pasteSystemClipboard() : clipboardItemCount(clipboardRef.current) && pasteObjects(clipboardRef.current),
      },
      {
        id: "edit.copyCapture", group: "Edit", title: "Copy scene capture", sep: true,
        enabled: () => !!captureRef.current,
        run: async () => {
          try {
            const blob = captureRef.current();
            const copied = writeCaptureClipboard(blob, actionWindow());
            if (!copied) { await blob; toast.info("Image clipboard is unavailable in this browser."); return; }
            await copied;
            toast.ok("Scene capture copied");
          } catch (error) { toast.error("Could not copy scene capture", { sub: error.message }); }
        },
      },
      {
        id: "file.shareCapture", group: "File", title: "Share scene capture…",
        enabled: () => !!captureRef.current,
        run: async () => {
          try {
            const file = new File([await captureRef.current()], `${ident(projectRef.current.name, "scene")}.png`, { type: "image/png" });
            setShareFile(file); setModal("shareFile");
          } catch (error) { toast.error("Could not capture the scene", { sub: error.message }); }
        },
      },
      {
        id: "edit.delete",
        group: "Edit",
        title: "Delete",
        keys: "Del",
        enabled: () => selectedIds.length > 0 || !!selectedUIId,
        run: deleteSelection,
      },
      {
        // The only way to clear a selection was clicking empty space — which in
        // the viewport is the same gesture that starts an orbit. Hidden from the
        // menus because Escape is universal and a menu row for it is noise; the
        // palette still finds it.
        id: "edit.deselect",
        group: "Edit",
        title: "Deselect All",
        keys: "Escape",
        hidden: true,
        enabled: () =>
          selectedIds.length > 0 || !!selectedUIId || !!selectedAssetId,
        run: () => {
          select(null);
          setSelectedAssetId(null);
        },
      },
      {
        id: "edit.selectall",
        group: "Edit",
        title: "Select All",
        keys: "Ctrl+A",
        sep: true,
        run: () => {
          const all = allObjects(scene?.objects || []).map((o) => o.id);
          setSelectedIds(all);
          setActiveId(all[all.length - 1] || null);
        },
      },
      {
        id: "edit.prefab",
        group: "Edit",
        title: "Save Selection as Prefab",
        enabled: () => !!activeObject,
        run: () => {
          edit((p, sc) => savePrefab(p, findObj(sc.objects, activeObject.id)));
          setBottomTab("prefabs");
          toast.ok("Prefab saved");
        },
      },
    ];

    cmds.push(
      ...LAYOUT_PRESETS.map((name) => ({
        id: `view.layout.${name}`,
        group: "View",
        title: name,
        icon: prefs.layout.preset === name ? "✓" : "",
        run: () => setLayoutPreset(name),
      })),
      ...Object.entries(DOCK_PANELS).map(([id, title]) => ({
        id: `view.panel.${id}`,
        group: "View",
        title: `Show ${title}`,
        run: () => focusPanel(id),
      })),
      {
        id: "view.layout.reset",
        group: "View",
        title: "Reset layout",
        run: () => setLayoutPreset("Focus"),
      },
      {
        id: "tools.uv",
        group: "Tools",
        title: "Edit UVs",
        enabled: () => !!activeObject?.components.model,
        run: () => setMainTab("uv"),
      },
      {
        id: "tools.scripts",
        group: "Tools",
        title: "Edit Scripts",
        run: () => setMainTab("scripts"),
      },
      {
        id: "tools.textures",
        group: "Tools",
        title: "Texture Tools…",
        run: () => setModal("textures"),
      },
      {
        id: "tools.bake",
        group: "Tools",
        title: "Bake Lighting…",
        run: () => setModal("bake"),
      },
      {
        id: "tools.unbake",
        group: "Tools",
        title: "Restore Original Lighting",
        hidden: !activeObject?._lightingBake,
        enabled: () => !!activeObject?._lightingBake,
        run: () =>
          edit((p, sc) => {
            const obj = findObj(sc.objects, activeObject.id);
            obj.components.model = deepClone(obj._lightingBake.model);
            delete obj._lightingBake;
          }),
      },
      {
        id: "file.console",
        group: "File",
        title: "Prepare Console Folder…",
        run: () => setModal("console"),
        enabled: () => isFSSupported(),
      },
      {
        id: "edit.prefabRevert",
        group: "Edit",
        title: "Revert Prefab Instance",
        hidden: !activeObject?._prefabId,
        enabled: () =>
          !!activeObject?._prefabId &&
          project.prefabs.some((f) => f._pid === activeObject._prefabId),
        run: () =>
          edit((p, sc) => {
            const obj = findObj(sc.objects, activeObject.id),
              pf = p.prefabs.find((f) => f._pid === obj._prefabId);
            Object.assign(obj, refreshPrefab(obj, pf, sc.objects, true));
          }),
      },
      {
        id: "edit.prefabDetach",
        group: "Edit",
        title: "Detach Prefab Instance",
        hidden: !activeObject?._prefabId,
        enabled: () => !!activeObject?._prefabId,
        run: () =>
          edit((p, sc) => {
            const obj = findObj(sc.objects, activeObject.id);
            delete obj._prefabId;
            delete obj._prefabBase;
          }),
      },
    );
    for (const kind of PROTOTYPE_KINDS) {
      cmds.push({
        id: `add.primitive.${kind}`,
        group: "Add",
        title: kind[0].toUpperCase() + kind.slice(1),
        run: () => {
          let id;
          edit((p, sc) => {
            id = addPrototype(p, sc, kind, files).id;
          });
          select(id);
          setMainTab("viewport");
        },
      });
    }

    cmds.push({id:"add.terrain",group:"Add",title:"Terrain",icon:"▱",run:()=>setMainTab("terrain")});
    cmds.push({id:"view.terrain",group:"View",title:"Terrain Editor",run:()=>setMainTab("terrain")});
    cmds.push({id:"view.skybox",group:"View",title:"Sky",icon:"◒",run:()=>focusPanel("sceneSettings")});

    // Add-object commands, generated from the registry.
    cmds.push({
      id: "add.empty",
      group: "Add",
      title: "Empty Object",
      icon: "◇",
      run: () => addObject(null),
    });
    for (const key of COMPONENT_KEYS) {
      const d = COMPONENTS[key];
      if (d.required) continue;
      cmds.push({
        id: `add.${key}`,
        group: "Add",
        title: d.label,
        icon: d.icon,
        color: d.color,
        run: () => key === "model" ? setModal("model") : addObject(key),
      });
    }
    for (const t of UI_TYPES) {
      cmds.push({
        id: `add.ui.${t}`,
        group: "Add",
        title: `HUD ${t}`,
        icon: UI_ICON[t],
        run: () => {
          let id = null;
          edit((p, sc) => {
            const el = mkUIEl(t);
            el.name = uniqueName(el.name, []);
            sc.uiElements.push(el);
            id = el.id;
          });
          setMainTab("hud");
          setSelectedUIId(id);
          setSelectedIds([]); setActiveId(null); setSelectedAssetId(null);
        },
      });
    }

    cmds.push(
      {
        id: "view.viewport",
        group: "View",
        title: "Viewport",
        keys: "1",
        run: () => setMainTab("viewport"),
      },
      {
        id: "view.hud",
        group: "View",
        title: "HUD Editor",
        keys: "2",
        run: () => setMainTab("hud"),
      },
      {
        id: "view.left",
        hidden: true,
        group: "View",
        title: "Toggle Outliner",
        sep: true,
        run: () =>
          setPref({ layout: toggleDockPanel(prefs.layout, "outliner") }),
      },
      {
        id: "view.right",
        hidden: true,
        group: "View",
        title: "Toggle Inspector",
        run: () =>
          setPref({ layout: toggleDockPanel(prefs.layout, "inspector") }),
      },
      {
        id: "view.bottom",
        hidden: true,
        group: "View",
        title: "Toggle Bottom Panel",
        run: () => {
          const group = dockLocation(prefs.layout, "assets").group;
          if (group) {
            setPref({
              layout: updateDockNode(prefs.layout, group.id, {
                collapsed: !group.collapsed,
              }),
            });
          } else focusPanel("assets");
        },
      },
      {
        id: "view.problems",
        group: "View",
        title: "Show Problems",
        run: () => {
          setBottomTab("problems");
        },
      },
      {
        id: "view.overlays",
        group: "View",
        title: `Component Overlays: ${prefs.showOverlays ? "On" : "Off"}`,
        sep: true,
        run: () => setPref({ showOverlays: !prefs.showOverlays }),
      },
      {
        id: "view.advanced",
        group: "View",
        title: `Advanced Settings: ${prefs.showAdvanced ? "Shown" : "Hidden"}`,
        run: () => setPref({ showAdvanced: !prefs.showAdvanced }),
      },
      {
        id: "view.shaded",
        group: "View",
        title: `Lighting: ${prefs.shaded ? "Shaded" : "Flat"}`,
        run: () => setPref({ shaded: !prefs.shaded }),
      },
      {
        id: "view.snap",
        group: "View",
        title: `Grid Snap: ${prefs.snap ? "On" : "Off"}`,
        keys: "G",
        run: () => setPref({ snap: !prefs.snap }),
      },
      {
        id: "view.space",
        group: "View",
        title: `Gizmo Space: ${prefs.gizmoSpace}`,
        keys: "X",
        run: () =>
          setPref({
            gizmoSpace: prefs.gizmoSpace === "world" ? "local" : "world",
          }),
      },
      {
        id: "view.theme",
        group: "View",
        title: `Theme: ${prefs.theme}`,
        sep: true,
        run: () =>
          setPref({ theme: prefs.theme === "dark" ? "light" : "dark" }),
      },
      {
        id: "view.frame",
        group: "View",
        title: "Frame Selection",
        keys: "F",
        run: () => frameRef.current?.("selection"),
      },
      {
        id: "view.frameall",
        group: "View",
        title: "Frame All",
        keys: "A",
        run: () => frameRef.current?.("all"),
      },
      {
        id: "gizmo.translate",
        group: "View",
        title: "Move Tool",
        keys: "W",
        hidden: true,
        run: () => setGizmoMode("translate"),
      },
      {
        id: "gizmo.rotate",
        group: "View",
        title: "Rotate Tool",
        keys: "E",
        hidden: true,
        run: () => setGizmoMode("rotate"),
      },
      {
        id: "gizmo.scale",
        group: "View",
        title: "Scale Tool",
        keys: "R",
        hidden: true,
        run: () => setGizmoMode("scale"),
      },
      {
        id: "view.hide",
        group: "View",
        title: "Hide / Show Selection",
        keys: "H",
        hidden: true,
        run: () =>
          edit((p, sc) => {
            for (const id of selectedIds) {
              mutObj(sc.objects, id, (o) => {
                o.visible = o.visible === false;
              });
            }
          }),
      },
      {
        id: "help.docs",
        group: "Help",
        title: "Help & Shortcuts",
        icon: "?",
        keys: "F1",
        run: () => setModal("help"),
      },
      {
        id: "help.install",
        group: "Help",
        title: "Install AthEditor…",
        hidden: !installation.available,
        run: () => installation.install(() => setModal("install")),
      },
      ...LANGS.map((l) => ({
        id: `help.lang.${l.id}`,
        group: "Help",
        title: `${t("common.language")}: ${l.label}`,
        hidden: prefs.lang === l.id,
        run: () => {
          setPref({ lang: l.id });
          setLang(l.id);
        },
      })),
      {
        id: "help.reset",
        group: "Help",
        title: "Reset Layout",
        run: () => {
          setLayoutPreset("Focus");
          toast.ok("Layout reset");
        },
      },
    );

    return cmds;
  }, [
    pickFolder,
    openProjectFile,
    saveProject,
    runExport,
    focusPanel,
    select,
    setMainTab,
    setBottomTab,
    setLayoutPreset,
    runGame,
    playing,
    playBusy,
    undo,
    redo,
    duplicateSelection,
    copySelection,
    pasteObjects,
    pasteSystemClipboard,
    deleteSelection,
    addObject,
    edit,
    selection,
    selectedIds,
    selectedUIId,
    activeObject,
    scene,
    project.scenes.length,
    project.prefabs,
    files,
    prefs,
    setPref,
    toast,
    folderName,
    linkFolder,
    unlinkFolder,
    activeFolder,
    syncFromFolder,
    reloadFolderAssets,
    openProjectHandle,
    installation.available,
  ]);

  const commandsRef = useRef(commands);
  commandsRef.current = commands;

  // ── keyboard ─────────────────────────────────────────────────────────
  const handleEditorKey = useCallback((e) => {
      const el = e.target;
      const typing = el?.nodeType === 1 &&
        (el.tagName === "INPUT" || el.tagName === "TEXTAREA" ||
          el.tagName === "SELECT" || el.isContentEditable);

      const combo = keyComboOf(e);

      if ((modalRef.current || el?.closest?.('[role="dialog"]')) && combo !== "Ctrl+S") return;
      if (combo === "Ctrl+K") {
        e.preventDefault();
        setPaletteScope(null);
        setPaletteOpen(true);
        return;
      }
      if (e.key === "Escape" && paletteOpen) {
        setPaletteOpen(false);
        return;
      }
      if (paletteOpen) return;

      // A dialog is a modal context: "every command is always available" is
      // the wrong rule there. Delete used to delete the objects behind an open
      // Help or Confirm dialog, and 1/2/W/E/R changed the tab and the gizmo
      // under it — Modal only intercepts Escape and Tab, and it focuses the ✕
      // button, which is not a text field, so bare keys passed straight
      // through. Escape is handled by Modal itself.
      const bare = !e.ctrlKey && !e.metaKey && !e.altKey;

      // Bare keys never fire from a text field...
      if (typing && bare) return;
      // ...and neither do the EDITING chords, which the browser owns while you
      // are typing. Ctrl+A in the project-name box used to select every object
      // in the scene instead of the text; Ctrl+C copied the objects and left
      // the clipboard alone; Ctrl+Z undid the whole project edit rather than
      // the word. Only the chords that mean the same thing wherever you are
      // keep working from inside a field.
      if (typing && !TYPING_SAFE_CHORDS.has(combo)) return;
      // Some browsers/windows never dispatch paste to a non-editable canvas.
      // Read during activation (or use the internal copy); do not also dispatch
      // a native paste for the same chord. Native/context-menu paste remains handled.
      if (combo === "Ctrl+V") {
        const clipboard = actionWindow().navigator?.clipboard;
        if (clipboard?.read || clipboard?.readText || clipboardItemCount(clipboardRef.current)) {
          const paste = commandsRef.current.find(c => c.id === "edit.paste");
          if (paste && (!paste.enabled || paste.enabled())) { e.preventDefault(); paste.run(); }
        }
        return;
      }

      const cmd = commandsRef.current.find((c) =>
        c.keys && normalizeCombo(c.keys) === combo
      );
      if (cmd && (!cmd.enabled || cmd.enabled())) {
        e.preventDefault();
        cmd.run();
        return;
      }
      if (bare && (e.key === "Delete" || e.key === "Backspace")) {
        e.preventDefault();
        commandsRef.current.find((c) => c.id === "edit.delete")?.run();
      }
  }, [paletteOpen]);
  useEffect(() => {
    window.addEventListener("keydown", handleEditorKey);
    return () => window.removeEventListener("keydown", handleEditorKey);
  }, [handleEditorKey]);
  useEffect(() => {
    if (modal || paletteOpen) window.focus?.();
  }, [modal, paletteOpen]);

  // ── render ───────────────────────────────────────────────────────────
  const panelContents = {
    terrain: <TerrainWorkspace key={project.id} scene={scene} object={activeObject} files={files}
      atlasName={terrainAtlasName(project,activeId,diskFiles)} onCreate={createTerrain}
      onSelect={id => select(id)}
      onApply={(id,data,atlas)=>edit(p=>applyEditorTerrain(p,id,data,diskFiles,atlas))}/>,
    viewport: (
      <>
        <SceneTools
          onSceneSettings={() => focusPanel("sceneSettings")}
          onAdd={() => openAddPalette()}
          onFrame={() => commands.find(c => c.id === (selection.length ? "view.frame" : "view.frameall"))?.run()}
          hasSelection={selection.length > 0}
          prefs={prefs}
          gizmoMode={gizmoMode}
          onMode={setGizmoMode}
          onPref={setPref}
        />
        <Viewport
          scene={scene}
          files={files}
          selectedIds={selectedIds}
          activeId={activeId}
          onSelect={select}
          onTransform={updateTransform}
          onMeshBounds={noteBounds}
          gizmoMode={gizmoMode}
          gizmoSpace={prefs.gizmoSpace}
          snap={prefs.snap}
          snapSize={prefs.snapSize}
          showOverlays={prefs.showOverlays}
          shaded={prefs.shaded}
          onFrameRequest={frameRef}
          onCaptureRequest={captureRef}
          onPlaceAsset={useAsset}
        />
      </>
    ),
    hud: (
      <HUDEditor
        scene={scene}
        files={files}
        selectedId={selectedUIId}
        onSelect={(id) => { setSelectedUIId(id); setSelectedIds([]); setActiveId(null); setSelectedAssetId(null); if (id) focusPanel("inspector"); }}
        onUpdate={updateUI}
        onAdd={(t) => {
          let id = null;
          edit((p, sc) => {
            const el = mkUIEl(t);
            sc.uiElements.push(el);
            id = el.id;
          });
          setSelectedUIId(id);
          setSelectedIds([]); setActiveId(null); setSelectedAssetId(null);
        }}
        onDelete={(id) => {
          edit((p, sc) => {
            sc.uiElements = sc.uiElements.filter((e) => e.id !== id);
          });
          setSelectedUIId(null);
        }}
      />
    ),
    uv: (
      <UVWorkspace
        object={activeObject}
        files={files}
        onApply={(id, content) =>
          edit((p) => applyEditorUV(p, id, content, diskFiles))}
      />
    ),
    scripts: (
      <ScriptWorkspace
        openScript={openScript}
        key={project.id}
        project={project}
        files={files}
        object={activeObject}
        onSeal={() => edit(() => {})}
        onSave={(name, content, tag) =>
          edit((p) => saveEditorScript(p, name, content), tag)}
        onAttach={(id, name) =>
          edit((p, sc) => {
            const obj = findObj(sc.objects, id);
            obj.components.script = {
              ...makeComponent("script"),
              ...obj.components.script,
              file: name,
            };
          })}
      />
    ),
    outliner: (
      <Outliner
        compact
        scene={scene}
        selectedIds={selectedIds}
        activeId={activeId}
        problems={problems}
        onSelect={select}
        onRename={(id, name) =>
          edit((p, sc) => renameObject(sc, id, name), `rename:${id}`)}
        onToggleVisible={(id) =>
          edit((p, sc) =>
            mutObj(sc.objects, id, (o) => {
              o.visible = o.visible === false;
            })
          )}
        onToggleExpand={(id) =>
          edit((p, sc) =>
            mutObj(sc.objects, id, (o) => {
              o.expanded = o.expanded === false;
            }), null)}
        onReparent={reparent}
        onDelete={deleteObject}
        onDeleteUI={deleteUIObject}
        onAdd={() => openAddPalette()}
        selectedUIId={selectedUIId}
        onSelectUI={(id) => {
          setSelectedUIId(id);
          setSelectedIds([]);
          setActiveId(null);
          setMainTab("hud");
        }}
        onAddUI={() => openAddPalette("hud")}
        onToggleUIVisible={(id) =>
          edit((p, sc) => {
            const el = sc.uiElements.find((x) => x.id === id);
            if (el) el.visible = el.visible === false;
          })}
      />
    ),
    inspector: (
      <Inspector
        onEditScene={() => focusPanel("sceneSettings")}
        onEditTerrain={()=>setMainTab("terrain")}
        onUseAsset={useAsset}
        showAdvanced={prefs.showAdvanced}
        scene={scene}
        selection={selection}
        activeObject={activeObject}
        selectedUI={selectedUI}
        selectedAsset={selectedAsset}
        problems={problems}
        files={files}
        onUpdateComponent={updateComponent}
        onAddComponent={(id, key) =>
          edit((p, sc) =>
            mutObj(sc.objects, id, (o) => {
              if (!o.components[key]) {
                o.components[key] = makeComponent(key);
              }
              for (
                const dep of COMPONENTS[key].requires || []
              ) {
                if (!o.components[dep]) {
                  o.components[dep] = makeComponent(dep);
                }
              }
            })
          )}
        onRemoveComponent={(id, key) =>
          edit((p, sc) =>
            mutObj(sc.objects, id, (o) => {
              delete o.components[key];
            })
          )}
        onRenameObject={(id, name) =>
          edit(
            (p, sc) => renameObject(sc, id, name),
            `rename:${id}`,
          )}
        onSetFlag={(id, flag, v) =>
          edit((p, sc) =>
            mutObj(sc.objects, id, (o) => {
              o[flag] = v;
            })
          )}
        onUpdateUI={updateUI}
        onImportFont={importHUDfont}
        onDeleteUI={(id) => {
          edit((p, sc) => {
            sc.uiElements = sc.uiElements.filter((e) => e.id !== id);
          });
          setSelectedUIId(null);
        }}
      />
    ),
    sceneSettings: (
      <SceneSettings
        onSelectObject={(id) => { select(id, {}); focusPanel("inspector"); }}
        showAdvanced={prefs.showAdvanced}
        scene={scene}
        project={project}
        files={files}
        onApplySkybox={(settings, asset) => {
          const sceneId = scene.id;
          edit((p) => {
            const target = p.scenes.find(s => s.id === sceneId);
            if (target) applySkybox(p, target, settings, asset, diskFiles);
          });
        }}
        onUpdate={updateScene}
        onAddTransition={(targetId) =>
          edit((p, sc) => {
            const target = p.scenes.find((s) => s.id === targetId);
            if (
              target &&
              !sc.transitions.some((t) => t.targetSceneId === targetId)
            ) {
              sc.transitions.push({
                id: uid(),
                name: uniqueName(ident(target.name, "scene"), sc.transitions),
                targetSceneId: targetId,
              });
            }
          })}
        onRemoveTransition={(targetId) =>
          edit((p, sc) => {
            sc.transitions = sc.transitions.filter((t) =>
              t.targetSceneId !== targetId
            );
          })}
      />
    ),
    projectSettings: (
      <ProjectSettings
        showAdvanced={prefs.showAdvanced}
        project={project}
        onUpdate={updateProject}
        onSetStartScene={(id) => {
          edit((p) => {
            p.startSceneId = id;
          });
          toast.ok("Start scene set");
        }}
      />
    ),
    assets: (
      <>
        {files.length > 0 && <div className="a-library-actions">
          <button className="a-btn a-btn--ghost a-btn--sm" onClick={pickFolder}>
            Import assets…
          </button>
        </div>}
        <Navigator
          revealAssetName={mainTab === "uv"
            ? activeObject?.components.model?.file
            : null}
          onOpenAsset={useAsset}
          compact
          files={files}
          prefabs={project.prefabs}
          tab="assets"
          onTab={setBottomTab}
          loading={loadingAssets}
          selectedAssetId={selectedAssetId}
          onSelectAsset={(id) => {
            setSelectedAssetId(id);
            if (mainTab === "uv" || mainTab === "scripts") return;
            focusPanel("inspector");
            setSelectedIds([]);
            setActiveId(null);
            setSelectedUIId(null);
          }}
          onOpenFolder={pickFolder}
          onDropAssets={importDroppedAssets}
          // ↻ says "re-read from disk", so it must re-read the linked
          // folder rather than open the OS picker. Wired to pickFolder
          // it was the same button twice, and pointing the picker at
          // the wrong folder drops every asset entry the components
          // refer to (mergeAssets keeps only names present in both).
          folderName={folderName}
          onReload={reloadFolderAssets}
          selectedPrefabId={selectedPrefabId}
          onSelectPrefab={setSelectedPrefabId}
          onSavePrefab={() =>
            commands.find((c) => c.id === "edit.prefab")?.run()}
          onInstancePrefab={(pf) => {
            let id = null;
            edit((p, sc) => {
              const copy = placePrefab(pf, sc.objects);
              sc.objects.push(copy);
              id = copy.id;
            });
            if (id) {
              select(id);
            }
          }}
          onDeletePrefab={(pid) =>
            edit((p) => {
              p.prefabs = p.prefabs.filter((x) => x._pid !== pid);
              for (const sc of p.scenes) {
                for (const obj of allObjects(sc.objects)) {
                  if (obj._prefabId === pid) {
                    delete obj._prefabId;
                    delete obj._prefabBase;
                  }
                }
              }
            })}
        />
      </>
    ),
    prefabs: (
      <>
        <div className="a-library-actions">
          <button
            className="a-btn a-btn--ghost a-btn--sm"
            disabled={!activeObject}
            onClick={() => commands.find((c) => c.id === "edit.prefab")?.run()}
          >
            Save selection as prefab
          </button>
        </div>
        <Navigator
          revealAssetName={mainTab === "uv"
            ? activeObject?.components.model?.file
            : null}
          onOpenAsset={useAsset}
          compact
          files={files}
          prefabs={project.prefabs}
          tab="prefabs"
          onTab={setBottomTab}
          loading={loadingAssets}
          selectedAssetId={selectedAssetId}
          onSelectAsset={(id) => {
            setSelectedAssetId(id);
            if (mainTab === "uv" || mainTab === "scripts") return;
            focusPanel("inspector");
            setSelectedIds([]);
            setActiveId(null);
            setSelectedUIId(null);
          }}
          onOpenFolder={pickFolder}
          onDropAssets={importDroppedAssets}
          // ↻ says "re-read from disk", so it must re-read the linked
          // folder rather than open the OS picker. Wired to pickFolder
          // it was the same button twice, and pointing the picker at
          // the wrong folder drops every asset entry the components
          // refer to (mergeAssets keeps only names present in both).
          folderName={folderName}
          onReload={reloadFolderAssets}
          selectedPrefabId={selectedPrefabId}
          onSelectPrefab={setSelectedPrefabId}
          onSavePrefab={() =>
            commands.find((c) => c.id === "edit.prefab")?.run()}
          onInstancePrefab={(pf) => {
            let id = null;
            edit((p, sc) => {
              const copy = placePrefab(pf, sc.objects);
              sc.objects.push(copy);
              id = copy.id;
            });
            if (id) {
              select(id);
            }
          }}
          onDeletePrefab={(pid) =>
            edit((p) => {
              p.prefabs = p.prefabs.filter((x) => x._pid !== pid);
              for (const sc of p.scenes) {
                for (const obj of allObjects(sc.objects)) {
                  if (obj._prefabId === pid) {
                    delete obj._prefabId;
                    delete obj._prefabBase;
                  }
                }
              }
            })}
        />
      </>
    ),
    problems: (
      <ProblemsPanel
        problems={problems}
        filter={problemFilter}
        onFilter={setProblemFilter}
        onReveal={reveal}
        onFix={applyProblemFix}
      />
    ),
  };

  return (
    <div className="a-app">
      {welcome ? <WelcomeScreen onCreate={() => setModal("newProject")} onOpen={openProjectFile}
        recentProjects={recentProjects} onRecent={entry => openProjectHandle(entry.handle, entry)} /> : <>
      <PanelBoundary name="The menu bar" resetKey={project}>
        <MenuBar
          project={project}
          scene={scene}
          commands={commands}
          dirty={dirty}
          projectFileName={projectFileName}
          playBusy={playBusy}
          playing={playing}
          canRunLocally={canRunLocally}
          onSwitchScene={(id) => {
            edit((p) => {
              p.activeSceneId = id;
            });
            setSelectedIds([]);
            setActiveId(null);
          }}
          onRenameProject={(name) =>
            edit((p) => {
              p.name = name;
            }, "projectName")}
        />
      </PanelBoundary>

      <DockWorkspace
        resetWindowsKey={windowReset}
        projectName={project.name}
        onKeyDown={handleEditorKey}
        onCopy={handleEditorCopy}
        onPaste={handleEditorPaste}
        onWindowFocus={(view) => { actionWindowRef.current = view; }}
        onError={(error) => toast.error("Could not open the panel window", { sub: error.message })}
        layout={prefs.layout}
        onChange={(layout) => setPref({ layout })}
        onActive={(id) => {
          if (
            ["viewport", "hud", "uv", "scripts", "terrain"].includes(id)
          ) setMainTabState(id);
        }}
        panels={Object.fromEntries(
          Object.entries(panelContents).map((
            [id, content],
          ) => [
            id,
            <PanelBoundary key={id} name={DOCK_PANELS[id]} resetKey={project}>
              {content}
            </PanelBoundary>,
          ]),
        )}
      />

      <PanelBoundary name="The status bar" resetKey={project}>
        <StatusBar
          scene={scene}
          selection={selection}
          problems={problems}
          files={files}
          autosavedAt={autosavedAt}
          downloadedFileName={downloadedFileName}
          buildStamp={window.__ATHENA_BUILD__ || "dev"}
          onShowProblems={() => {
            setBottomTab("problems");
          }}
          folderName={folderName}
          folderNeedsGrant={folderNeedsGrant}
          folderNeedsReadAccess={folderNeedsReadAccess}
          projectFileName={projectFileName}
          dirty={dirty}
          onLinkFolder={linkFolder}
          onSave={saveProject}
          onResumeFolder={reloadFolderAssets}
        />
      </PanelBoundary>
      </>}

      {
        /* Dialogs and toasts are the last things standing when something has
          already gone wrong, so they get a boundary of their own. The reset
          key is the modal itself: dismissing a broken dialog clears it. */
      }
      <PanelBoundary name="This dialog" resetKey={modal}>
        {paletteOpen && (
          <CommandPalette
            commands={commands}
            scope={paletteScope}
            onClose={() => setPaletteOpen(false)}
          />
        )}
        {modal === "export" && exportResult && (
          <ExportModal
            result={exportResult}
            projectName={project.name}
            onClose={() => setModal(null)}
            onReveal={(d) => reveal(d.objectId, d.sceneId)}
          />
        )}
        {modal === "play" && (
          <PlaySettingsModal
            localAvailable={canRunLocally}
            onExport={() => { setModal(null); runExport(); }}
            onClose={() => setModal(null)}
            onReady={() => {
              setModal(null);
              runGame();
            }}
          />
        )}
        {modal === "model" && <ModelPicker files={files} onChoose={useAsset} onImport={importModel} onClose={() => setModal(null)} />}
        {modal === "install" && (
          <InstallEditorModal onClose={() => setModal(null)} />
        )}
        {modal === "shareFile" && shareFile && <ShareFileModal file={shareFile} onClose={() => { setModal(null); setShareFile(null); }} />}
        {modal?.kind === "confirmReplace" && (
          <ConfirmModal
            title="Replace the project you are working on?"
            danger
            confirmLabel="Discard changes"
            onSave={saveProject}
            message={
              <>
                <p>
                  Save your changes before opening <b>{modal.name}</b>.
                </p>
              </>
            }
            onConfirm={() => modal.resolve(true)}
            onClose={() => {
              modal.resolve(false);
              setModal(null);
            }}
          />
        )}
        {modal?.kind === "confirmOverwrite" && (
          <ConfirmModal
            title="Overwrite changed files?"
            danger
            confirmLabel="Overwrite"
            message={
              <>
                <p style={{ marginBottom: 8 }}>
                  These files in <b>{folderName}/</b>{" "}
                  differ from what the editor is about to write:
                </p>
                <pre className="a-code" style={{ marginBottom: 8 }}>
                {modal.conflicts.map((c) =>
                  `${c.path}   — ${c.kind === "handwritten" ? "not written by this editor" : "edited outside the editor"}`
                ).join("\n")}
                </pre>
                <p>
                  Exporting replaces them. Files that already match are left
                  alone.
                </p>
              </>
            }
            onConfirm={() => modal.resolve(true)}
            onClose={() => {
              modal.resolve(false);
              setModal(null);
            }}
          />
        )}
        {(modal === "textures" || modal === "bake") &&
          React.createElement(
            modal === "textures" ? TextureToolsModal : BakeLightingModal,
            {
              initialTexture: selectedAsset?.cat === "textures"
                ? selectedAsset.name
                : null,
              files,
              scene,
              onClose: () => setModal(null),
              onApply: (result) => {
                edit((p) => {
                  const sc = p.scenes.find((s) => s.id === result.sceneId);
                  if (!sc) throw Error("The scene was removed.");
                  for (const asset of result.outputs) {
                    putProjectAsset(p, {
                      ...asset,
                      editKind: result.kind ||
                        (modal === "bake" ? "bake" : "optimize"),
                    });
                  }
                  for (const update of result.updates) {
                    const obj = findObj(sc.objects, update.id);
                    if (obj) {
                      obj.components.model = update.model;
                      if (update.bakeSource) {
                        obj._lightingBake = {
                          model: deepClone(update.bakeSource),
                        };
                      }
                    }
                  }
                });
                toast.ok("Assets applied");
              },
            },
          )}
        {modal === "console" && (
          <ConsoleFolderModal
            project={project}
            runtime={runtime}
            onPickRuntime={pickRuntime}
            onScaffold={scaffoldProject}
            onClose={() => setModal(null)}
          />
        )}
        {modal === "newProject" && (
          <NewProjectModal
            dirty={dirty}
            onSave={saveProject}
            onClose={() => setModal(null)}
            onCreate={async (next, template) => {
              if (!(await adoptProject(next, []))) return false;
              projectRef.current = next;
              setProject(next);
              setWelcome(false);
              historyRef.current = createHistory();
              setSelectedIds([]);
              setActiveId(null);
              setSelectedUIId(null);
              setSelectedAssetId(null);
              setDirty(true);
              setFiles([]);
              resetProjectDestination();
              setPref({ showOverlays: false });
              setLayoutPreset("Focus");
              setSelectedPrefabId(null);
              toast.ok(`Created ${next.name}`);
              return true;
            }}
          />
        )}
        {modal === "help" && (
          <HelpModal
            onClose={() => setModal(null)}
            buildStamp={window.__ATHENA_BUILD__ || "dev"}
            lang={prefs.lang}
            onLang={(l) => {
              setPref({ lang: l });
              setLang(l);
            }}
          />
        )}
        {modal === "recentProjects" && (
          <RecentProjectsModal
            projects={recentProjects}
            onClose={() => setModal(null)}
            onOpen={(entry) => {
              setModal(null);
              return openProjectHandle(entry.handle, entry);
            }}
          />
        )}
        {modal === "confirmDeleteScene" && (
          <ConfirmModal
            title="Delete scene"
            danger
            confirmLabel="Delete"
            message={`Delete "${scene.name}" and everything in it? This can be undone with Ctrl+Z.`}
            onConfirm={() => {
              edit((p) => {
                const deletedId = p.activeSceneId;
                p.scenes = p.scenes.filter((s) => s.id !== p.activeSceneId);
                p.activeSceneId = p.scenes[0].id;
                if (p.startSceneId === deletedId) {
                  p.startSceneId = p.activeSceneId;
                }
                for (const s of p.scenes) {
                  s.transitions = (s.transitions || []).filter((t) =>
                    t.targetSceneId !== deletedId
                  );
                }
              });
              setSelectedIds([]);
              setActiveId(null);
            }}
            onClose={() => setModal(null)}
          />
        )}
      </PanelBoundary>

      <PanelBoundary name="Notifications" resetKey={toasts}>
        <Toasts toasts={toasts} onDismiss={dismissToast} />
      </PanelBoundary>
    </div>
  );
}

/** "Ctrl+Shift+Z" in any casing/order -> the canonical form keyComboOf emits. */
function normalizeCombo(spec) {
  const parts = spec.split("+").map((s) => s.trim());
  const mods = { Ctrl: false, Alt: false, Shift: false };
  let key = "";
  for (const p of parts) {
    const lower = p.toLowerCase();
    if (lower === "ctrl" || lower === "cmd" || lower === "meta") {
      mods.Ctrl = true;
    } else if (lower === "alt") mods.Alt = true;
    else if (lower === "shift") mods.Shift = true;
    else key = p;
  }
  if (key.toLowerCase() === "del") key = "Delete";
  if (key.length === 1) key = key.toUpperCase();
  const out = [];
  if (mods.Ctrl) out.push("Ctrl");
  if (mods.Alt) out.push("Alt");
  if (mods.Shift) out.push("Shift");
  out.push(key);
  return out.join("+");
}

// AppBoundary is the outermost thing rendered: if App itself cannot render,
// the only job left is getting the user's project back out of the browser.
ReactDOM.createRoot(document.getElementById("root")).render(
  <AppBoundary>
    <App />
  </AppBoundary>,
);
