// ═══════════════════════════════════════════════════════════════════════
//  UTIL — pure helpers. No DOM, no React, no Three. Safe to unit test.
// ═══════════════════════════════════════════════════════════════════════

let _uidSeq = 0;
const uid = () => `i${++_uidSeq}_${Math.random().toString(36).slice(2, 6)}`;

const v3 = (x = 0, y = 0, z = 0) => ({ x, y, z });
const rgb = (r = 0, g = 0, b = 0) => ({ r, g, b });
const clamp = (n, lo, hi) => (n < lo ? lo : n > hi ? hi : n);

const deepClone = (o) =>
  typeof structuredClone === "function" ? structuredClone(o) : JSON.parse(JSON.stringify(o));

// ── numeric emission ───────────────────────────────────────────────────
// Everything that reaches generated PS2 source goes through these. A NaN or
// an Infinity in the output is a syntax error on hardware, so they are
// clamped to 0 here rather than propagating.
const num = (n, fallback = 0) => (typeof n === "number" && Number.isFinite(n) ? n : fallback);

/** Round for emission — 3 decimals is well under float32 precision. */
const f3 = (n, fallback = 0) => {
  const v = num(n, fallback);
  return Math.round(v * 1000) / 1000;
};

/**
 * Round a COEFFICIENT for emission.
 *
 * f3 is right for a position: a millimetre of error in a world coordinate is
 * nothing. It is wrong for a number that multiplies one. A rotation cosine
 * rounded to 0.707 is off by 7e-4, which at 200 units from the origin displaces
 * a shadow by 14 cm. Six decimals still sits inside float32's ~7 digits, so
 * nothing is lost on the way to the VU.
 */
const f6 = (n, fallback = 0) => {
  const v = num(n, fallback);
  return Math.round(v * 1e6) / 1e6;
};

/**
 * A valid JS float literal. QuickJS treats `40` and `40.0` identically, but
 * the engine's own examples use float literals and keeping them makes the
 * generated source readable as graphics code.
 * The old `f3(n)+".0"` produced "40.5.0" for any fractional input.
 */
const fl = (n, fallback = 0) => {
  const v = f3(n, fallback);
  return Number.isInteger(v) ? v.toFixed(1) : String(v);
};

/** A valid JS integer literal. */
const il = (n, fallback = 0) => String(Math.trunc(num(n, fallback)));

/**
 * A number, shown without lying about it.
 *
 * Rounding to four decimals is right for a position and destructive for a
 * solver tolerance: the physics CFM default of 1e-5 rendered as "0", and
 * NumInput commits whatever is displayed on blur — so clicking into the field
 * and clicking away silently set CFM to zero, which is a different simulation.
 * Anything that would round away to nothing keeps its exponent instead.
 */
const formatNum = (n) => {
  if (typeof n !== "number" || !Number.isFinite(n)) return "0";
  const rounded = Math.round(n * 10000) / 10000;
  if (rounded === 0 && n !== 0) return String(n);
  return String(rounded);
};

// ── identifiers ────────────────────────────────────────────────────────
const RESERVED = new Set([
  "break", "case", "catch", "class", "const", "continue", "debugger", "default",
  "delete", "do", "else", "enum", "export", "extends", "false", "finally",
  "for", "function", "if", "import", "in", "instanceof", "new", "null",
  "return", "super", "switch", "this", "throw", "true", "try", "typeof",
  "var", "void", "while", "with", "yield", "let", "static", "await", "async",
  // globals the generated program relies on — shadowing these breaks the scene
  "Screen", "Render", "Camera", "Lights", "Color", "Image", "Font", "Draw",
  "Sound", "Pads", "ODE", "Shadows", "RenderData", "RenderObject",
  "AnimCollection", "System", "os", "std", "console", "Math", "ctx", "pad",
]);

/**
 * Turn an arbitrary object name into a legal, non-colliding JS identifier.
 * Unicode names ("Café", "敵") collapse to underscores rather than producing
 * an empty string, which used to yield `const  = ...`.
 */
const ident = (name, fallback = "obj") => {
  let s = String(name ?? "").normalize("NFKD").replace(/[̀-ͯ]/g, "");
  s = s.replace(/[^A-Za-z0-9_$]+/g, "_").replace(/^_+|_+$/g, "").toLowerCase();
  if (!s || /^[0-9]/.test(s)) s = `${fallback}_${s}`.replace(/_+$/, "");
  if (RESERVED.has(s)) s = `${s}_`;
  return s || fallback;
};

/** Escape for embedding inside a double-quoted JS string literal. */
const jsStr = (s) =>
  String(s ?? "")
    .replace(/\\/g, "\\\\")
    .replace(/"/g, '\\"')
    .replace(/\n/g, "\\n")
    .replace(/\r/g, "\\r")
    .replace(/\t/g, "\\t")
    .replace(/\u2028/g, "\\u2028")
    .replace(/\u2029/g, "\\u2029");

// ── dotted paths ───────────────────────────────────────────────────────
// A component field key may address a sub-property ("size.x") when only part
// of a structured value is meaningful — a live shadow's extent along the light
// is derived, so only its width is the user's to set.

const readPath = (root, path) =>
  String(path).split(".").reduce((o, k) => (o === undefined || o === null ? o : o[k]), root);

/** Write a dotted path, creating intermediate objects. */
function writePath(root, path, value) {
  const parts = String(path).split(".");
  let ref = root;
  for (let i = 0; i < parts.length - 1; i++) {
    if (ref[parts[i]] === undefined || ref[parts[i]] === null) ref[parts[i]] = {};
    ref = ref[parts[i]];
  }
  ref[parts[parts.length - 1]] = value;
  return root;
}

// ── vectors ────────────────────────────────────────────────────────────
const vlen = (v) => Math.hypot(num(v?.x), num(v?.y), num(v?.z));
const vnorm = (v, dflt = { x: 0, y: 1, z: 0 }) => {
  const L = vlen(v);
  if (L < 1e-6) return { ...dflt };
  return { x: num(v.x) / L, y: num(v.y) / L, z: num(v.z) / L };
};
const vcross = (a, b) => ({
  x: a.y * b.z - a.z * b.y,
  y: a.z * b.x - a.x * b.z,
  z: a.x * b.y - a.y * b.x,
});

// ── assets ─────────────────────────────────────────────────────────────
const EXT_CAT = {
  obj: "models", gltf: "models", glb: "models",
  png: "textures", jpg: "textures", jpeg: "textures", bmp: "textures", tga: "textures",
  ogg: "sounds", wav: "sounds", adp: "sounds", adpcm: "sounds", mp3: "sounds",
  ttf: "fonts", otf: "fonts",
  js: "scripts",
};
const categorize = (name) => EXT_CAT[String(name).split(".").pop().toLowerCase()] || "other";
const PROJECT_EXTENSION = ".atheditor";
const isProjectFilename = (name) => /\.(atheditor|athena\.json)$/i.test(name);

const fmtBytes = (n) => {
  if (!n && n !== 0) return "—";
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / 1048576).toFixed(1)} MB`;
};
