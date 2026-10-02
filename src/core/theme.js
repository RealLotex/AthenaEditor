// ═══════════════════════════════════════════════════════════════════════
//  THEME — the JS side of the design system.
//
//  Colours live in styles.css as custom properties. This module only reads
//  them, so there is exactly one place to change a colour.
// ═══════════════════════════════════════════════════════════════════════

const cssVar = (name, fallback = "") => {
  if (typeof getComputedStyle !== "function") return fallback;
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim() || fallback;
};

const THEMES = ["dark", "light"];

function applyTheme(name) {
  document.documentElement.setAttribute("data-theme", THEMES.includes(name) ? name : "dark");
}

/** Component identity colour, for the Inspector and Outliner. */
const compColor = (key) => COMPONENTS[key]?.color || cssVar("--fg-dim", "#5a7089");

/** Three.js needs numbers, not CSS strings. */
function hexToInt(hex, fallback = 0x888888) {
  const m = /^#?([0-9a-f]{6})$/i.exec(String(hex).trim());
  return m ? parseInt(m[1], 16) : fallback;
}

const LEVEL_ICON = { error: "✕", warn: "▲", info: "i" };
const LEVEL_LABEL = { error: "Error", warn: "Warning", info: "Note" };
