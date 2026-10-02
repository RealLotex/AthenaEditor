// ═══════════════════════════════════════════════════════════════════════
//  HELP — in-editor reference, English / Spanish / Portuguese
//
//  Page content lives in src/docs/<lang>.js; code samples are shared from
//  src/docs/code.js so a corrected example is corrected in every language.
//  The long-form reference stays in docs/ as Markdown, where it is
//  searchable and diffable.
// ═══════════════════════════════════════════════════════════════════════

const DOC_TABLES = { en: DOCS_EN, es: DOCS_ES, pt: DOCS_PT };

// Page order and grouping. Titles come from the language table.
const DOC_ORDER = [
  { id: "interface", section: "editor", icon: "⬡" },
  { id: "workflow", section: "editor", icon: "▸" },
  { id: "projectScene", section: "editor", icon: "⧉" },
  { id: "components", section: "editor", icon: "◈" },
  { id: "templates", section: "editor", icon: "✦" },
  { id: "scripting", section: "scripting", icon: "⌨" },
  { id: "physics", section: "scripting", icon: "⬡" },
  { id: "shadows", section: "scripting", icon: "◐" },
  { id: "hud", section: "scripting", icon: "▭" },
  { id: "engineNotes", section: "engine", icon: "!" },
];

const docsFor = (lang) => DOC_TABLES[lang] || DOCS_EN;

/** Flattened text of a page, for the search box. */
function pageText(page) {
  if (!page) return "";
  const out = [page.title];
  for (const b of page.blocks || []) {
    if (b.h) out.push(b.h);
    if (b.p) out.push(b.p);
    if (b.note) out.push(b.note);
    if (b.ul) out.push(...b.ul);
    if (b.kv) for (const [k, v] of b.kv) out.push(k, v);
    if (b.code) out.push(DOC_CODE[b.code] || "");
  }
  return out.join("\n");
}

function DocBlocks({ blocks }) {
  return (
    <>
      {(blocks || []).map((b, i) => {
        if (b.h) {
          return <div key={i} className="a-sec__group" style={{ marginTop: i ? 16 : 4 }}>{b.h}</div>;
        }
        if (b.p) {
          return <p key={i} style={{ fontSize: 12, lineHeight: 1.7, marginBottom: 9 }}>{b.p}</p>;
        }
        if (b.ul) {
          return (
            <ul key={i} style={{ margin: "0 0 10px 17px", fontSize: 12, lineHeight: 1.7 }}>
              {b.ul.map((li, j) => <li key={j} style={{ marginBottom: 3 }}>{li}</li>)}
            </ul>
          );
        }
        if (b.kv) {
          return (
            <div key={i} style={{ marginBottom: 11 }}>
              {b.kv.map(([k, v], j) => (
                <div key={j} style={{ display: "grid", gridTemplateColumns: "160px 1fr", gap: 10, padding: "5px 0", borderBottom: "1px solid var(--line)" }}>
                  <span style={{ color: "var(--fg-strong)", fontWeight: 600, fontSize: 11.5 }}>{k}</span>
                  <span style={{ fontSize: 11.5, lineHeight: 1.6 }}>{v}</span>
                </div>
              ))}
            </div>
          );
        }
        if (b.code) {
          return <pre key={i} className="a-code" style={{ margin: "0 0 11px" }}>{DOC_CODE[b.code] || ""}</pre>;
        }
        if (b.note) {
          return (
            <div key={i} className="a-row" style={{
              gap: 8, alignItems: "flex-start", padding: "8px 10px", margin: "0 0 11px",
              borderRadius: "var(--radius)", lineHeight: 1.6,
              background: "color-mix(in srgb, var(--info) 12%, transparent)",
              borderLeft: "2px solid var(--info)",
            }}>
              <span style={{ color: "var(--info)", fontSize: 11, marginTop: 1 }}>i</span>
              <span style={{ fontSize: 11.5, flex: 1 }}>{b.note}</span>
            </div>
          );
        }
        return null;
      })}
    </>
  );
}

function HelpModal({ onClose, buildStamp, lang, onLang }) {
  const [pageId, setPageId] = useState(DOC_ORDER[0].id);
  const [query, setQuery] = useState("");
  const table = docsFor(lang);

  const q = query.trim().toLowerCase();
  const matches = useMemo(() => {
    if (!q) return null;
    const hits = new Set();
    for (const entry of DOC_ORDER) {
      if (pageText(table[entry.id]).toLowerCase().includes(q)) hits.add(entry.id);
    }
    return hits;
  }, [q, table]);

  // Keep the selection valid while filtering.
  useEffect(() => {
    if (matches && matches.size && !matches.has(pageId)) setPageId([...matches][0]);
  }, [matches, pageId]);

  const visible = DOC_ORDER.filter((e) => !matches || matches.has(e.id));
  const sections = ["editor", "scripting", "engine"];
  const page = table[pageId] || DOCS_EN[pageId];

  return (
    <Modal
      title={t("help.title")}
      onClose={onClose}
      width={Math.min(880, window.innerWidth - 60)}
      footer={
        <>
          <span className="a-grow a-dim" style={{ fontSize: 10.5, alignSelf: "center" }}>
            {t("help.build")} {buildStamp} · {t("help.fullDocs")}
          </span>
          <button className="a-btn" onClick={onClose}>{t("common.close")}</button>
        </>
      }
    >
      <div className="a-row" style={{ gap: 8, marginBottom: 11 }}>
        <input
          className="a-input a-grow"
          placeholder={t("help.search")}
          value={query}
          autoFocus
          onChange={(e) => setQuery(e.target.value)}
        />
        <select
          className="a-select"
          style={{ width: 118 }}
          value={lang}
          onChange={(e) => onLang(e.target.value)}
          title={t("common.language")}
        >
          {LANGS.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
        </select>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "184px 1fr", gap: 14, minHeight: 380 }}>
        <div style={{ borderRight: "1px solid var(--line)", paddingRight: 10, overflow: "auto", maxHeight: "56vh" }}>
          {visible.length === 0 && (
            <div className="a-empty" style={{ padding: "14px 4px" }}>{t("help.noMatch")} “{query}”.</div>
          )}
          {sections.map((section) => {
            const entries = visible.filter((e) => e.section === section);
            if (!entries.length) return null;
            return (
              <React.Fragment key={section}>
                <div className="a-sec__group" style={{ marginTop: 6 }}>{t(`help.section.${section}`)}</div>
                {entries.map((e) => {
                  const p = table[e.id] || DOCS_EN[e.id];
                  return (
                    <button
                      key={e.id}
                      className={`a-btn a-btn--wide${pageId === e.id ? " a-btn--on" : " a-btn--ghost"}`}
                      style={{ justifyContent: "flex-start", marginBottom: 2, height: 25 }}
                      onClick={() => setPageId(e.id)}
                    >
                      <span style={{ width: 16, textAlign: "center", opacity: .8 }}>{e.icon}</span>
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{p.title}</span>
                    </button>
                  );
                })}
              </React.Fragment>
            );
          })}
        </div>

        <div style={{ overflow: "auto", maxHeight: "56vh", paddingRight: 4 }}>
          {page && (
            <>
              <h2 style={{ fontSize: 15, color: "var(--fg-strong)", marginBottom: 10 }}>{page.title}</h2>
              <DocBlocks blocks={page.blocks} />
            </>
          )}
        </div>
      </div>
    </Modal>
  );
}
