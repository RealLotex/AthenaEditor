// ═══════════════════════════════════════════════════════════════════════
//  EMIT — line buffer + identifier allocator for the generated program.
// ═══════════════════════════════════════════════════════════════════════

class Emitter {
  constructor() {
    this.lines = [];
    this.depth = 0;
    this.diagnostics = [];
  }

  /** Write one or more lines at the current indentation. */
  w(...lines) {
    const pad = "    ".repeat(this.depth);
    for (const l of lines) this.lines.push(l === "" ? "" : pad + l);
    return this;
  }

  /** Blank line — collapsed if the buffer already ends with one. */
  nl() {
    if (this.lines.length && this.lines[this.lines.length - 1] !== "") this.lines.push("");
    return this;
  }

  /** Run `fn` one indentation level deeper. */
  block(fn) {
    this.depth++;
    try { fn(this); } finally { this.depth--; }
    return this;
  }

  /** A boxed banner comment. */
  section(title) {
    this.nl();
    this.w(`// ${"─".repeat(66)}`);
    this.w(`// ${title}`);
    this.w(`// ${"─".repeat(66)}`);
    return this;
  }

  comment(...lines) {
    for (const l of lines) this.w(`// ${l}`);
    return this;
  }

  /**
   * Record a problem and leave a breadcrumb in the output. Diagnostics surface
   * in the editor's Problems panel; the comment survives into main.js so a
   * half-configured scene explains itself on hardware too.
   */
  problem(level, message, ref) {
    this.diagnostics.push({ level, message, ...ref });
    this.w(`// ${level === "error" ? "!!" : "??"} ${message}`);
    return this;
  }

  toString() {
    // Collapse runs of blank lines and drop trailing whitespace.
    const out = [];
    for (const l of this.lines) {
      const t = l.replace(/\s+$/, "");
      if (t === "" && out.length && out[out.length - 1] === "") continue;
      out.push(t);
    }
    while (out.length && out[out.length - 1] === "") out.pop();
    return out.join("\n") + "\n";
  }
}

/**
 * Hands out unique JS identifiers. Every generated name goes through one
 * allocator per file, so a scene with two objects called "Box" cannot produce
 * a duplicate `const` — which used to be a hard syntax error on hardware.
 */
class NameAllocator {
  constructor() {
    this.used = new Set();
  }

  /** A unique identifier derived from `base`. */
  take(base, fallback = "obj") {
    const root = ident(base, fallback);
    if (!this.used.has(root)) { this.used.add(root); return root; }
    let i = 2;
    while (this.used.has(`${root}_${i}`)) i++;
    this.used.add(`${root}_${i}`);
    return `${root}_${i}`;
  }

  /** Reserve a literal name (for the generator's own variables). */
  reserve(...names) {
    for (const n of names) this.used.add(n);
    return this;
  }
}
