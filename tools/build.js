// ═══════════════════════════════════════════════════════════════════════
//  BUILD — src/**  ->  AthenaEditor.html
//
//  Every source file is transformed independently (so a syntax error names
//  one file, not a 9000-line blob), then concatenated into a single script
//  that runs in the browser with no module loader and no network.
//
//    deno task build          normal build
//    deno task build --cdn    smaller html, loads React/Three from a CDN
//    deno task build --watch  rebuild on change
// ═══════════════════════════════════════════════════════════════════════
import * as esbuild from "npm:esbuild@0.24.0";
import { fromFileUrl } from "jsr:@std/path@1";
import { MODULES } from "./modules.js";

const ROOT = fromFileUrl(new URL("..", import.meta.url)).replace(/[\\/]$/, "");
const p = (...s) => `${ROOT}/${s.join("/")}`;

const VENDOR = [
  "react.js", "react-dom.js", "three.js", "OrbitControls.js", "GLTFLoader.js",
];
const CDN = [
  "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js",
  "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js",
  "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js",
];

// Top-level `const X =` / `function X(` / `class X` declarations. Because every
// module lands in one shared scope, a duplicate name silently shadows another
// module's export. Cheap to detect here, miserable to debug in the browser.
const TOP_LEVEL = /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)|^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)/gm;

/**
 * Top-level declarations, skipping anything inside a multi-line template
 * literal. Templates embed whole controller scripts as backtick strings, and
 * a `const` on a line in there is not a declaration in this module.
 */
function collectTopLevel(src) {
  const names = [];
  let inTemplate = false;
  for (const line of src.split("\n")) {
    if (!inTemplate) {
      const m = TOP_LEVEL.exec(line);
      TOP_LEVEL.lastIndex = 0;
      if (m) names.push(m[1] || m[2] || m[3]);
    }
    // Unescaped backticks toggle template state; an odd count per line flips it.
    const ticks = (line.match(/(^|[^\\])`/g) || []).length;
    if (ticks % 2 === 1) inTemplate = !inTemplate;
  }
  return names;
}

export async function build({ cdn = false, quiet = false } = {}) {
  const t0 = performance.now();
  const chunks = [];
  const manifest = [];
  const owner = new Map();      // identifier -> first module that declared it
  const collisions = [];
  let line = 0;

  for (const rel of MODULES) {
    let src;
    try {
      src = await Deno.readTextFile(p("src", rel));
    } catch {
      throw new Error(`build: missing source file src/${rel} (listed in tools/modules.js)`);
    }

    for (const name of collectTopLevel(src)) {
      if (owner.has(name) && owner.get(name) !== rel) {
        collisions.push(`  ${name}  —  src/${owner.get(name)}  vs  src/${rel}`);
      } else owner.set(name, rel);
    }

    let out;
    try {
      const r = await esbuild.transform(src, {
        loader: rel.endsWith(".jsx") ? "jsx" : "js",
        jsx: "transform",
        jsxFactory: "React.createElement",
        jsxFragment: "React.Fragment",
        target: "es2020",
        sourcefile: `src/${rel}`,
      });
      out = r.code;
    } catch (e) {
      const err = e.errors?.[0];
      if (err) {
        throw new Error(
          `build: ${err.text}\n    at src/${rel}:${err.location?.line}:${err.location?.column}\n` +
          `    ${err.location?.lineText ?? ""}`,
        );
      }
      throw e;
    }

    const banner = `\n// ${"═".repeat(66)}\n// src/${rel}\n// ${"═".repeat(66)}\n`;
    const body = banner + out;
    const nLines = body.split("\n").length;
    manifest.push({ file: `src/${rel}`, from: line + 1, to: line + nLines });
    line += nLines;
    chunks.push(body);
  }

  if (collisions.length) {
    throw new Error(
      `build: duplicate top-level identifiers across modules — they share one scope:\n${collisions.join("\n")}`,
    );
  }

  const css = await Deno.readTextFile(p("src", "styles.css"));
  const js = chunks.join("\n");

  let head;
  if (cdn) {
    head = CDN.map((u) => `<script src="${u}"></script>`).join("\n");
  } else {
    const parts = [];
    for (const v of VENDOR) parts.push(await Deno.readTextFile(p("vendor", v)));
    head = `<script>\n${parts.join("\n;\n")}\n</script>`;
  }

  const stamp = new Date().toISOString().slice(0, 16).replace("T", "-").replace(":", "-");
  const vendorLicense = await Deno.readTextFile(p("vendor", "LICENSE-MIT.txt"));
  const html = `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>AthEditor</title>
<!--
  GENERATED FILE — do not edit.
  Source lives in src/. Rebuild with:  deno task build
  Build: v${stamp}-GMT
  Bundled dependencies:
${vendorLicense}
-->
<style>
${css}
</style>
</head>
<body>
<div id="root"></div>
<noscript>This editor requires JavaScript.</noscript>
${head}
<script>
window.__ATHENA_BUILD__ = "v${stamp}-GMT";
${js}
</script>
</body>
</html>
`;

  // Readers must never see a truncated build, and Windows can lock a mapped
  // HTML file while it is being served. Replace a complete file atomically.
  const temporary = p(`.AthenaEditor-${crypto.randomUUID()}.tmp`);
  try {
    await Deno.writeTextFile(temporary, html);
    await Deno.rename(temporary, p("AthenaEditor.html"));
  } finally { await Deno.remove(temporary).catch(() => {}); }
  await Deno.writeTextFile(
    p("build-manifest.json"),
    JSON.stringify({ build: `v${stamp}-GMT`, cdn, modules: manifest }, null, 2),
  );

  if (!quiet) {
    const ms = (performance.now() - t0).toFixed(0);
    console.log(
      `AthenaEditor.html  ${(html.length / 1024).toFixed(0)} KB  ` +
      `(${MODULES.length} modules, ${owner.size} top-level names, ${ms}ms${cdn ? ", cdn" : ""})`,
    );
  }
  return html;
}

if (import.meta.main) {
  const cdn = Deno.args.includes("--cdn");
  const watch = Deno.args.includes("--watch");
  try {
    await build({ cdn });
  } catch (e) {
    console.error(e.message);
    if (!watch) { await esbuild.stop(); Deno.exit(1); }
  }
  if (watch) {
    console.log("watching src/ …");
    let timer;
    for await (const _ of Deno.watchFs(p("src"))) {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        try { await build({ cdn }); } catch (e) { console.error(e.message); }
      }, 80);
    }
  }
  await esbuild.stop();
}
