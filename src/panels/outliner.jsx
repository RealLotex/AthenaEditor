// ═══════════════════════════════════════════════════════════════════════
//  OUTLINER — the scene tree
//
//  Search, inline rename, drag to reparent, and per-object problem badges
//  so a broken reference is visible without opening the Inspector.
// ═══════════════════════════════════════════════════════════════════════

function Outliner({
  compact,
  scene,
  selectedIds,
  activeId,
  problems,
  onSelect,
  onRename,
  onToggleVisible,
  onDelete,
  onDuplicate,
  onReparent,
  onToggleExpand,
  onAdd,
  selectedUIId,
  onSelectUI,
  onAddUI,
  onDeleteUI,
  onToggleUIVisible,
}) {
  const [query, setQuery] = useState("");
  const [renaming, setRenaming] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);
  const dragId = useRef(null);

  const problemsByObject = useMemo(() => {
    const m = new Map();
    for (const p of problems || []) {
      if (!p.objectId) continue;
      const cur = m.get(p.objectId);
      // Worst level wins for the badge.
      if (!cur || LEVEL_RANK[p.level] < LEVEL_RANK[cur]) {
        m.set(p.objectId, p.level);
      }
    }
    return m;
  }, [problems]);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const keep = new Set();
    walk(scene?.objects || [], (o, parents) => {
      const hit = (o.name || "").toLowerCase().includes(q) ||
        Object.keys(o.components || {}).some((k) => k.includes(q));
      if (hit) {
        keep.add(o.id);
        for (const p of parents) keep.add(p.id);
      }
    });
    return keep;
  }, [scene, q]);

  const startDrag = (id) => {
    dragId.current = id;
  };
  const finishDrop = (targetId, where) => {
    const src = dragId.current;
    dragId.current = null;
    setDropTarget(null);
    if (!src || src === targetId) return;
    if (targetId && isAncestor(scene.objects, src, targetId)) return; // no cycles
    onReparent(src, targetId, where);
  };

  const renderNode = (obj, depth) => {
    if (matches && !matches.has(obj.id)) return null;
    const selected = selectedIds.includes(obj.id);
    const hasKids = (obj.children || []).length > 0;
    const open = obj.expanded !== false || !!q;
    const level = problemsByObject.get(obj.id);
    const drop = dropTarget?.id === obj.id ? dropTarget.where : null;

    return (
      <React.Fragment key={obj.id}>
        <div
          className={[
            "a-node",
            selected ? "a-node--sel" : "",
            obj.id === activeId ? "a-node--active" : "",
            obj.visible === false ? "a-node--hidden" : "",
            drop === "inside" ? "a-node--drop" : "",
            drop === "above" ? "a-node--drop-above" : "",
            drop === "below" ? "a-node--drop-below" : "",
          ].filter(Boolean).join(" ")}
          style={{ paddingLeft: 4 + depth * 12 }}
          draggable={renaming !== obj.id}
          onDragStart={(e) => {
            startDrag(obj.id);
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            const r = e.currentTarget.getBoundingClientRect();
            const y = (e.clientY - r.top) / r.height;
            setDropTarget({
              id: obj.id,
              where: y < 0.28 ? "above" : y > 0.72 ? "below" : "inside",
            });
          }}
          onDragLeave={() =>
            setDropTarget((d) => (d?.id === obj.id ? null : d))}
          onDrop={(e) => {
            e.preventDefault();
            finishDrop(obj.id, dropTarget?.where || "inside");
          }}
          onDragEnd={() => {
            dragId.current = null;
            setDropTarget(null);
          }}
          onMouseDown={(e) => {
            if (e.button !== 0 || renaming === obj.id) return;
            onSelect(obj.id, {
              additive: e.ctrlKey || e.metaKey,
              range: e.shiftKey,
            });
          }}
          onDoubleClick={() => setRenaming(obj.id)}
        >
          <span
            className="a-node__twist"
            onMouseDown={(e) => {
              e.stopPropagation();
              if (hasKids) onToggleExpand(obj.id);
            }}
          >
            {hasKids ? (open ? "▾" : "▸") : ""}
          </span>
          <span className="a-node__icon" style={{ color: objColor(obj) }}>
            {objIcon(obj)}
          </span>

          {renaming === obj.id
            ? (
              <input
                className="a-input"
                autoFocus
                defaultValue={obj.name}
                style={{ height: 18, flex: 1 }}
                onFocus={(e) => e.target.select()}
                onBlur={(e) => {
                  onRename(obj.id, e.target.value);
                  setRenaming(null);
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter") {
                    onRename(obj.id, e.currentTarget.value);
                    setRenaming(null);
                  } else if (e.key === "Escape") setRenaming(null);
                  e.stopPropagation();
                }}
                onMouseDown={(e) => e.stopPropagation()}
              />
            )
            : <span className="a-node__name" title={obj.name}>{obj.name}</span>}

          <span className="a-node__badges">
            {level === "error" && (
              <span className="a-node__err" title="Has errors">✕</span>
            )}
            {level === "warn" && (
              <span className="a-node__warn" title="Has warnings">▲</span>
            )}
            {obj.exportEnabled === false && (
              <span className="a-node__badge" title="Excluded from export">
                ⊘
              </span>
            )}
          </span>

          <button
            className="a-node__btn"
            title={obj.visible === false ? "Show (H)" : "Hide (H)"}
            aria-label={`${
              obj.visible === false ? "Show" : "Hide"
            } ${obj.name}`}
            onMouseDown={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onToggleVisible(obj.id);
            }}
            onDoubleClick={(e) => e.stopPropagation()}
          >
            {obj.visible === false ? "○" : "◉"}
          </button>
          <button
            className="a-node__btn a-node__delete"
            title={`Delete ${obj.name} (Delete)`}
            aria-label={`Delete ${obj.name}`}
            onMouseDown={(e) => e.stopPropagation()}
            onDoubleClick={(e) => e.stopPropagation()}
            onClick={(e) => {
              e.stopPropagation();
              onDelete(obj.id);
            }}
          >
            <TrashIcon />
          </button>
        </div>
        {open && (obj.children || []).map((c) => renderNode(c, depth + 1))}
      </React.Fragment>
    );
  };

  const uiEls = scene?.uiElements || [];

  return (
    <>
      {!compact && (
        <PanelHeader title="Outliner">
          <button
            className="a-btn a-btn--icon a-btn--ghost"
            title="Add object"
            onClick={onAdd}
          >
            +
          </button>
        </PanelHeader>
      )}

      <div
        style={{
          padding: "5px 6px",
          borderBottom: "1px solid var(--line)",
          display: "flex",
          gap: 6,
        }}
      >
        <input
          className="a-input"
          placeholder="Search objects…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") {
              setQuery("");
              e.currentTarget.blur();
            }
          }}
        />
        {compact && (
          <button
            className="a-btn a-btn--icon a-btn--ghost"
            title="Add object"
            aria-label="Add object"
            onClick={onAdd}
          >
            +
          </button>
        )}
      </div>

      <div
        className="a-scroll"
        onMouseDown={(e) => {
          if (e.target === e.currentTarget) onSelect(null, {});
        }}
        onDragOver={(e) => {
          e.preventDefault();
          setDropTarget({ id: null, where: "root" });
        }}
        onDrop={(e) => {
          e.preventDefault();
          finishDrop(null, "root");
        }}
      >
        <div className="a-tree">
          {(scene?.objects || []).map((o) => renderNode(o, 0))}
          {!scene?.objects?.length && (
            <Empty>
              Nothing here yet.<br />Use <Kbd>Ctrl</Kbd> <Kbd>K</Kbd>{" "}
              to add an object.
            </Empty>
          )}
          {matches && matches.size === 0 && (
            <Empty>No object matches “{query}”.</Empty>
          )}
        </div>

        {uiEls.length > 0 && (
          <>
            <div className="a-ph" style={{ position: "sticky", top: 0 }}>
              <span className="a-ph__title">HUD</span>
              <button
                className="a-btn a-btn--icon a-btn--ghost"
                title="Add HUD element"
                onClick={onAddUI}
              >
                +
              </button>
            </div>
            <div className="a-tree">
              {uiEls.map((el) => (
                <div
                  key={el.id}
                  className={`a-node${
                    selectedUIId === el.id ? " a-node--sel a-node--active" : ""
                  }${el.visible === false ? " a-node--hidden" : ""}`}
                  style={{ paddingLeft: 8 }}
                  onMouseDown={() => onSelectUI(el.id)}
                >
                  <span className="a-node__twist" />
                  <span
                    className="a-node__icon"
                    style={{ color: "var(--accent)" }}
                  >
                    {UI_ICON[el.type] || "▭"}
                  </span>
                  <span className="a-node__name">{el.name}</span>
                  <button
                    className="a-node__btn"
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onToggleUIVisible(el.id);
                    }}
                    aria-label={`${
                      el.visible === false ? "Show" : "Hide"
                    } ${el.name}`}
                    title={el.visible === false ? "Show" : "Hide"}
                  >
                    {el.visible === false ? "○" : "◉"}
                  </button>
                  <button
                    className="a-node__btn a-node__delete"
                    title={`Delete ${el.name}`}
                    aria-label={`Delete ${el.name}`}
                    onMouseDown={(e) => e.stopPropagation()}
                    onClick={(e) => {
                      e.stopPropagation();
                      onDeleteUI(el.id);
                    }}
                  >
                    <TrashIcon />
                  </button>
                </div>
              ))}
            </div>
          </>
        )}
      </div>
    </>
  );
}

const UI_ICON = {
  Text: "T",
  Image: "▣",
  Button: "▭",
  Panel: "▬",
  ProgressBar: "▰",
};
