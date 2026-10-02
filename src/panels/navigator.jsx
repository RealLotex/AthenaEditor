const CAT_META = {
  models: { icon: "◈", color: "var(--c-model)" },
  textures: { icon: "▣", color: "var(--fg-dim)" },
  sounds: { icon: "♫", color: "var(--c-sound)" },
  fonts: { icon: "A", color: "var(--fg-dim)" },
  scripts: { icon: "⌨", color: "var(--c-script)" },
  other: { icon: "▪", color: "var(--fg-dim)" },
};

function Navigator({
  compact,
  files,
  prefabs,
  tab,
  onTab,
  selectedAssetId,
  onSelectAsset,
  onOpenAsset,
  onOpenFolder,
  onDropAssets,
  loading,
  selectedPrefabId,
  onSelectPrefab,
  onInstancePrefab,
  onDeletePrefab,
  onSavePrefab,
  revealAssetName,
}) {
  const [query, setQuery] = useState(""), [folder, setFolder] = useState("");
  const [dropTarget, setDropTarget] = useState(null);
  const dropProps = (destination) => ({
    onDragOver: (event) => {
      if (tab !== "assets" || ![...(event.dataTransfer.types || [])].includes("Files")) return;
      event.preventDefault(); event.stopPropagation();
      event.dataTransfer.dropEffect = "copy";
      setDropTarget(destination);
    },
    onDrop: (event) => {
      if (tab !== "assets" || ![...(event.dataTransfer.types || [])].includes("Files")) return;
      event.preventDefault(); event.stopPropagation();
      setDropTarget(null);
      onDropAssets?.(event.dataTransfer, destination);
    },
  });
  const tree = useMemo(() => assetFolderTree(files), [files]);
  useEffect(() => {
    if (folder && !tree.some((f) => f.path === folder)) setFolder("");
  }, [tree, folder]);
  useEffect(() => {
    const asset = files.find((f) => f.id === selectedAssetId);
    if (asset && folder && !assetLibraryFolder(asset).startsWith(folder + "/") && assetLibraryFolder(asset) !== folder) setFolder("");
  }, [selectedAssetId]);
  useEffect(() => {
    const asset = files.find((f) => f.name === revealAssetName);
    if (asset) {
      setFolder("");
      setQuery("");
    }
  }, [revealAssetName]);
  const q = query.trim().toLowerCase();
  const shown = files.filter((f) =>
    q ? f.name.toLowerCase().includes(q) : !folder || assetLibraryFolder(f) === folder || assetLibraryFolder(f).startsWith(folder + "/")
  ).sort((a, b) => a.name.localeCompare(b.name));
  const assetCard = (f) => {
    const meta = CAT_META[f.cat] || CAT_META.other;
    return (
      <button
        key={f.id}
        className={`a-asset${selectedAssetId === f.id ? " a-asset--sel" : ""}`}
        aria-label={f.name}
        aria-pressed={selectedAssetId === f.id}
        draggable={f.cat === "models" && !f.error}
        onDragStart={(e) => {
          if (f.cat !== "models" || f.error) return;
          e.dataTransfer.setData(MODEL_DRAG_TYPE, f.id);
          e.dataTransfer.effectAllowed = "copy";
        }}
        onClick={() => onSelectAsset(f.id)}
        onDoubleClick={() => onOpenAsset?.(f)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && onOpenAsset && ["models", "scripts", "textures"].includes(f.cat)) {
            e.preventDefault(); e.stopPropagation(); onOpenAsset(f);
          }
        }}
        title={`${f.name}\n${fmtBytes(f.size)}${f.error ? `\n${f.error}` : ""}`}
      >
        {f.cat === "textures" && f.dataUrl
          ? <img className="a-asset__thumb" src={f.dataUrl} alt="" />
          : (
            <span
              className="a-asset__icon"
              style={{ color: f.error ? "var(--err)" : meta.color }}
            >
              {meta.icon}
            </span>
          )}
        <span className="a-asset__name">{f.name}</span>
        <span className="a-asset__meta">
          {f.error ? "Needs attention" : ASSET_CATEGORY_LABELS[f.cat] || "Other"}
        </span>
      </button>
    );
  };
  return (
    <div
      className="a-asset-import"
      {...dropProps(folder)}
      onDragLeave={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget)) setDropTarget(null);
      }}
    >
      {!compact && (
        <div className="a-tabs">
          <button className="a-tab" onClick={() => onTab("assets")}>
            Assets
          </button>
          <button className="a-tab" onClick={() => onTab("prefabs")}>
            Prefabs
          </button>
          <span className="a-grow" />
          <button
            className="a-btn a-btn--ghost"
            disabled={loading}
            onClick={tab === "assets" ? onOpenFolder : onSavePrefab}
          >
            {tab === "assets" ? "Import assets…" : "Save Selection"}
          </button>
        </div>
      )}
      {tab === "assets"
        ? (
          <>
            {(files.length > 8 || query) && <div className="a-library-bar">
              <input
                className="a-input a-library-search"
                aria-label="Search assets"
                placeholder="Search assets…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>}
            {!!tree.length && <details className="a-library-filter a-disclosure">
              <summary>{folder && !q ? folder : "Browse folders"}</summary>
              <select className="a-select" aria-label="Filter assets by folder" value={folder}
                onChange={(e) => { setFolder(e.target.value); setQuery(""); }}>
                <option value="">All assets</option>
                {tree.map(f => <option key={f.path} value={f.path}>{f.path}</option>)}
              </select>
              {!!folder && <button className="a-btn a-btn--ghost" onClick={() => { setFolder(""); setQuery(""); }}>Show all assets</button>}
            </details>}
            <div className="a-library">
              <div className="a-scroll a-library-content">
                {!files.length
                  ? (
                    <Empty>
                      <p>Add models, images or scripts to your game.</p>
                      <button className="a-btn" disabled={loading} onClick={onOpenFolder}>Import assets…</button>
                    </Empty>
                  )
                  : (
                    <div className="a-assets">
                      {shown.map(assetCard)}
                      {!shown.length && (
                        <Empty>{q ? `No assets match “${query}”.` : "This folder is empty."}
                          <button className="a-btn a-btn--ghost" onClick={() => { setQuery(""); setFolder(""); }}>Show all assets</button>
                        </Empty>
                      )}
                    </div>
                  )}
              </div>
            </div>
          </>
        )
        : (
          <div className="a-scroll">
            {!prefabs.length
              ? (
                <Empty>
                  Select an object and choose Save Selection to reuse it.
                </Empty>
              )
              : (
                <div className="a-assets">
                  {prefabs.map((p) => (
                    <div
                      key={p._pid}
                      className={`a-asset${
                        selectedPrefabId === p._pid ? " a-asset--sel" : ""
                      }`}
                      onClick={() => onSelectPrefab(p._pid)}
                      onDoubleClick={() => onInstancePrefab(p)}
                      title={`${p.name} — double-click to place`}
                    >
                      <span
                        className="a-asset__icon"
                        style={{ color: objColor(p) }}
                      >
                        {objIcon(p)}
                      </span>
                      <span className="a-asset__name">{p.name}</span>
                      <div className="a-row">
                        <button
                          className="a-btn a-btn--sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            onInstancePrefab(p);
                          }}
                        >
                          Place
                        </button>
                        <button
                          className="a-btn a-btn--icon a-btn--ghost a-btn--danger"
                          aria-label={`Delete prefab ${p.name}`}
                          onClick={(e) => {
                            e.stopPropagation();
                            onDeletePrefab(p._pid);
                          }}
                        >
                          <TrashIcon />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
          </div>
        )}
      {dropTarget !== null && (
        <div className="a-import-hint" role="status">
          Drop to import into {dropTarget || "Assets"}
        </div>
      )}
    </div>
  );
}

function ModelPicker({ files, onChoose, onImport, onClose }) {
  const models = files.filter(f => f.cat === "models");
  const [query, setQuery] = useState(""), [busy, setBusy] = useState(false), [error, setError] = useState("");
  const importing = useRef(false);
  const input = useRef(null);
  const shown = models.filter(f => f.name.toLowerCase().includes(query.trim().toLowerCase()));
  const importFile = async (file) => {
    if (!file || importing.current) return;
    importing.current = true; setBusy(true); setError("");
    try { if (await onImport(file) !== false) onClose(); }
    catch (e) { setError(e.message || "Could not add this model. Try another file."); }
    finally { importing.current = false; setBusy(false); if (input.current) input.current.value = ""; }
  };
  return <Modal title="Add a model" onClose={onClose} width={480} canDismiss={!busy}
    initialFocus={models.length ? ".a-model-choice" : ".a-btn--primary"}
    footer={<><span className="a-grow" /><button className="a-btn a-btn--ghost" disabled={busy} onClick={onClose}>Cancel</button>
      <button className={`a-btn ${models.length ? "a-btn--ghost" : "a-btn--primary"}`} disabled={busy} onClick={() => input.current?.click()}>{busy ? "Adding…" : "Import model…"}</button></>}>
    <input ref={input} type="file" accept=".obj,.glb,.gltf" hidden disabled={busy} onChange={e => importFile(e.target.files?.[0])} />
    {models.length > 8 && <input className="a-input" aria-label="Find a model" placeholder="Find a model…" value={query} onChange={e => setQuery(e.target.value)} />}
    {models.length ? <div className="a-model-choices">{shown.map(f => <button key={f.id} className="a-model-choice" disabled={busy || !!f.error}
      onClick={() => { onChoose(f); onClose(); }}><span aria-hidden="true">◈</span><span>{f.name}</span>{f.error && <small>{f.error}</small>}</button>)}
      {!shown.length && <Empty>No model matches “{query}”.</Empty>}</div>
      : <p className="a-new-project__intro">Choose a model to place in your scene.</p>}
    {error && <p className="a-error a-modal__error" role="alert">{error}</p>}
  </Modal>;
}

function FolderIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d="M3 6h7l2 2h9v11H3z" />
    </svg>
  );
}
