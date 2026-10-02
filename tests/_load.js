// Loads a subset of src/ the same way the browser does — one shared scope,
// no module system — and hands back its top-level bindings.
//
//   const { generateProject, COMPONENTS } = await load();
//
// Only pass files that are free of DOM/React/Three references; that is every
// module under core/ and codegen/.
import * as esbuild from "npm:esbuild@0.24.0";
import { fromFileUrl } from "jsr:@std/path@1";

const ROOT = fromFileUrl(new URL("..", import.meta.url)).replace(/[\\/]$/, "");

export const PURE_MODULES = [
  "core/util.js",
  "core/math.js",
  "core/shadowmath.js",
  "core/imagesize.js",
  "core/skybox.js",
  "core/skybox-data.js",
  "core/components.js",
  "core/project.js",
  "core/layout.js",
  "core/validate.js",
  "editor/mesh.js",
  "editor/textures.js",
  "editor/terrain-textures.js",
  "editor/skybox.js",
  "editor/assets.js",
  "editor/terrain.js",
  "editor/prefabs.js",
  "codegen/emit.js",
  "codegen/skybox.js",
  "codegen/resolve.js",
  "codegen/models.js",
  "codegen/lights.js",
  "codegen/sounds.js",
  "codegen/physics.js",
  "codegen/shadows.js",
  "codegen/uigen.js",
  "codegen/ctx.js",
  "codegen/index.js",
];

const TOP_LEVEL =
  /^(?:const|let|var)\s+([A-Za-z_$][\w$]*)|^(?:async\s+)?function\s*\*?\s*([A-Za-z_$][\w$]*)|^class\s+([A-Za-z_$][\w$]*)/gm;

let cached = null;

export async function load(modules = PURE_MODULES, { readSource } = {}) {
  if (cached && modules === PURE_MODULES && !readSource) return cached;

  const parts = [];
  const names = new Set();
  for (const rel of modules) {
    const src = readSource ? await readSource(rel) : await Deno.readTextFile(`${ROOT}/src/${rel}`);
    for (const m of src.matchAll(TOP_LEVEL)) names.add(m[1] || m[2] || m[3]);
    const { code } = await esbuild.transform(src, {
      loader: rel.endsWith(".jsx") ? "jsx" : "js", target: "es2020", sourcefile: `src/${rel}`,
    });
    parts.push(`// ── src/${rel} ──\n${code}`);
  }

  // The name scan is a regex, so it also picks up declarations that live
  // inside template literals (a template's controller source, for instance).
  // Reading each one behind a try/catch keeps those harmless.
  const list = [...names];
  const body = `${parts.join("\n")}
const __out = {};
${list.map((n) => `try { __out[${JSON.stringify(n)}] = ${n}; } catch (_e) {}`).join("\n")}
return __out;`;
  let exports;
  try {
    exports = new Function(body)();
  } catch (e) {
    throw new Error(`test loader: ${e.message}`);
  }
  const result = exports;
  if (modules === PURE_MODULES && !readSource) cached = result;
  return result;
}

export async function shutdown() {
  await esbuild.stop();
}
