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
    if (asset) setFolder(assetLibraryFolder(asset));
  }, [selectedAssetId]);
  useEffect(() => {
    const asset = files.find((f) => f.name === revealAssetName);
    if (asset) {
      setFolder(assetLibraryFolder(asset));
      setQuery("");
    }
  }, [revealAssetName]);
  const q = query.trim().toLowerCase();
  const shown = files.filter((f) =>
    q ? f.name.toLowerCase().includes(q) : assetLibraryFolder(f) === folder
  ).sort((a, b) => a.name.localeCompare(b.name));
  const children = tree.filter((f) =>
    f.path.split("/").slice(0, -1).join("/") === folder
  );
  const assetCard = (f) => {
    const meta = CAT_META[f.cat] || CAT_META.other;
    return (
      <button
        key={f.id}
        className={`a-asset${selectedAssetId === f.id ? " a-asset--sel" : ""}`}
        onClick={() => onSelectAsset(f.id)}
        onDoubleClick={() => onOpenAsset?.(f)}
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
          {q ? assetLibraryFolder(f) : fmtBytes(f.size)}
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
            <div className="a-library-bar">
              <nav className="a-library-breadcrumb" aria-label="Asset folder">
                <button
                  {...dropProps("")}
                  onClick={() => {
                    setFolder("");
                    setQuery("");
                  }}
                >
                  Assets
                </button>
                {!q &&
                  folder.split("/").filter(Boolean).map((part, i, parts) => (
                    <React.Fragment key={i}>
                      <span>/</span>
                      <button
                        {...dropProps(parts.slice(0, i + 1).join("/"))}
                        onClick={() =>
                          setFolder(parts.slice(0, i + 1).join("/"))}
                      >
                        {part}
                      </button>
                    </React.Fragment>
                  ))}
                {q && <span className="a-dim">/ Search results</span>}
              </nav>
              <input
                className="a-input a-library-search"
                aria-label="Search assets"
                placeholder="Search assets…"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
            <div className="a-library">
              <nav
                className="a-library-folders a-scroll"
                aria-label="Asset folders"
              >
                <button
                  {...dropProps("")}
                  className={`a-folder-row${
                    !folder ? " a-folder-row--on" : ""
                  }`}
                  onClick={() => {
                    setFolder("");
                    setQuery("");
                  }}
                >
                  All assets<span>{files.length}</span>
                </button>
                {tree.map((f) => (
                  <button
                    {...dropProps(f.path)}
                    key={f.path}
                    className={`a-folder-row${
                      folder === f.path ? " a-folder-row--on" : ""
                    }`}
                    style={{ paddingLeft: 12 + f.depth * 12 }}
                    title={f.path}
                    onClick={() => {
                      setFolder(f.path);
                      setQuery("");
                    }}
                  >
                    <FolderIcon />
                    <span className="a-folder-label">{f.label}</span>
                    <span>{f.count}</span>
                  </button>
                ))}
              </nav>
              <div className="a-scroll a-library-content">
                {!files.length
                  ? (
                    <Empty>
                      No assets yet. Add a primitive or import a folder.
                    </Empty>
                  )
                  : (
                    <div className="a-assets">
                      {!q &&
                        children.map((f) => (
                          <button
                            {...dropProps(f.path)}
                            className="a-asset a-asset--folder"
                            key={f.path}
                            onClick={() => setFolder(f.path)}
                          >
                            <FolderIcon />
                            <span className="a-asset__name">{f.label}</span>
                            <span className="a-asset__meta">
                              {f.count} asset{f.count === 1 ? "" : "s"}
                            </span>
                          </button>
                        ))}
                      {shown.map(assetCard)}
                      {q && !shown.length && (
                        <Empty>No assets match “{query}”.</Empty>
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
