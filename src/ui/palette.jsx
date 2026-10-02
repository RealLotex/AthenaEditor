// ═══════════════════════════════════════════════════════════════════════
//  COMMAND PALETTE — Ctrl+K
//
//  Every command in the editor is registered once (in app.jsx) and reached
//  three ways: menu, shortcut, palette. That keeps the menus from being the
//  only place a feature is discoverable.
// ═══════════════════════════════════════════════════════════════════════

/** Subsequence match with a score — "sha" finds "Add Shadow". */
function fuzzyScore(needle, haystack) {
  const n = needle.toLowerCase();
  const h = haystack.toLowerCase();
  if (!n) return 1;
  const direct = h.indexOf(n);
  if (direct === 0) return 1000;
  if (direct > 0) return 700 - direct;
  let hi = 0, score = 0, streak = 0;
  for (const ch of n) {
    const at = h.indexOf(ch, hi);
    if (at < 0) return -1;
    streak = at === hi ? streak + 1 : 0;
    score += 10 + streak * 5 - Math.min(at - hi, 8);
    hi = at + 1;
  }
  return score;
}

function CommandPalette({ commands, scope, onClose }) {
  const [query, setQuery] = useState("");
  const [index, setIndex] = useState(0);
  const [showAll, setShowAll] = useState(false);
  const listRef = useRef(null);

  const results = useMemo(() => {
    const usable = commands.filter((c) => !c.hidden && (!c.enabled || c.enabled()) &&
      (!scope || (scope === "hud" ? c.id.startsWith("add.ui.") : c.group === "Add" && !c.id.startsWith("add.ui."))));
    if (!query.trim()) return (scope === "objects" && !showAll
      ? usable.filter(c => ["add.primitive.cube", "add.primitive.plane", "add.primitive.sphere", "add.terrain", "add.model", "add.light", "add.camera"].includes(c.id))
      : usable).slice(0, 40);
    return usable
      .map((c) => ({ c, s: Math.max(fuzzyScore(query, c.title), fuzzyScore(query, c.group || "")) }))
      .filter((r) => r.s > 0)
      .sort((a, b) => b.s - a.s)
      .slice(0, 40)
      .map((r) => r.c);
  }, [commands, query, scope, showAll]);

  useEffect(() => { setIndex(0); }, [query]);
  useEffect(() => {
    listRef.current?.querySelector('[data-on="1"]')?.scrollIntoView({ block: "nearest" });
  }, [index, results]);

  const run = (cmd) => { onClose(); cmd.run(); };

  return (
    <Modal title={scope ? (scope === "hud" ? "Add HUD element" : "Add object") : "Command palette"}
      onClose={onClose} width={560} initialFocus=".a-palette__input">
        <input
          className="a-palette__input"
          aria-label={scope ? "Find an object to add" : "Find a command"}
          placeholder={scope ? "Find an object…" : "Type a command…"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "ArrowDown") { e.preventDefault(); setIndex((i) => Math.min(i + 1, results.length - 1)); }
            else if (e.key === "ArrowUp") { e.preventDefault(); setIndex((i) => Math.max(i - 1, 0)); }
            else if (e.key === "Enter") { e.preventDefault(); if (results[index]) run(results[index]); }
            else if (e.key === "Escape") { e.preventDefault(); onClose(); }
          }}
        />
        <div className="a-palette__list" ref={listRef}>
          {results.length === 0 && <div className="a-palette__empty">No {scope ? "object" : "command"} matches “{query}”.</div>}
          {results.map((c, i) => (
            <button
              key={c.id}
              data-on={i === index ? "1" : "0"}
              className={`a-palette__item${i === index ? " a-palette__item--on" : ""}`}
              onMouseEnter={() => setIndex(i)}
              onClick={() => run(c)}
            >
              <span style={{ width: 16, textAlign: "center", color: c.color }}>{c.icon || "›"}</span>
              <span>
                {!scope && c.group && <span className="a-dim">{c.group} ▸ </span>}
                {c.title}
              </span>
              {c.keys && <span className="a-btn__key">{c.keys}</span>}
            </button>
          ))}
        </div>
        {scope === "objects" && !query.trim() && !showAll && <button className="a-btn a-btn--ghost a-palette__more" onClick={() => { setShowAll(true); setIndex(0); }}>More objects…</button>}
    </Modal>
  );
}

/** Turn a KeyboardEvent into the "Ctrl+Shift+K" form used by the registry. */
function keyComboOf(e) {
  const parts = [];
  if (e.ctrlKey || e.metaKey) parts.push("Ctrl");
  if (e.altKey) parts.push("Alt");
  if (e.shiftKey) parts.push("Shift");
  let k = e.key;
  if (k === " ") k = "Space";
  else if (k.length === 1) k = k.toUpperCase();
  parts.push(k);
  return parts.join("+");
}
