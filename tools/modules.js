// Concatenation order for the build. All modules share one scope, so order
// matters only for top-level code that *runs* at load (theme registration,
// the ReactDOM mount in app/main.jsx); function and const declarations may
// reference each other freely.
//
// Adding a file? Put it in the right group and rebuild. The build fails loudly
// if a file is listed here but missing, or if two modules declare the same
// top-level name.

export const MODULES = [
  // ── foundation ────────────────────────────────────────────────────
  "core/util.js",
  "core/math.js",
  "core/shadowmath.js",
  "core/i18n.js",
  "core/imagesize.js",
  "core/skybox.js",
  "core/skybox-data.js",
  "core/theme.js",
  "core/components.js",
  "core/project.js",
  "core/history.js",
  "core/layout.js",
  "core/validate.js",
  "core/storage.js",
  "core/fsaccess.js",
  "core/installation.js",
  "core/panelwindows.js",

  // ── project templates (need core) ─────────────────────────────────
  // The registry goes last: it is the only one with top-level code that reads
  // the others, so keeping it there means the list reads in dependency order.
  "templates/assets.js",
  "templates/firstperson.js",
  "templates/thirdperson.js",
  "templates/sidescroller.js",
  "templates/topdown.js",
  "templates/registry.js",

  "editor/palette.js",
  "editor/mesh.js",
  "editor/textures.js",
  "editor/terrain-textures.js",
  "editor/skybox.js",
  "editor/assets.js",
  "editor/terrain.js",
  "editor/import.js",
  "editor/fonts.js",
  "editor/clipboard.js",
  "editor/share.js",
  "editor/prefabs.js",
  "editor/bake.js",
  "editor/bundle.js",
  "editor/play.js",

  // ── help content ──────────────────────────────────────────────────
  "docs/code.js",
  "docs/en.js",
  "docs/es.js",
  "docs/pt.js",

  // ── code generation (pure, unit-tested) ───────────────────────────
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

  // ── new project scaffolding (needs templates + codegen) ───────────
  "core/scaffold.js",

  // ── 3d viewport ───────────────────────────────────────────────────
  "viewport/loaders.js",
  "viewport/gizmos.js",
  "viewport/overlays.js",
  "viewport/skybox.js",
  "viewport/viewport.jsx",

  // ── reusable ui ───────────────────────────────────────────────────
  "ui/primitives.jsx",
  "ui/popover.js",
  "ui/toast.jsx",
  "ui/modal.jsx",
  "ui/boundary.jsx",
  "ui/dock.jsx",
  "ui/workspace.jsx",
  "ui/palette.jsx",

  // ── panels ────────────────────────────────────────────────────────
  "panels/outliner.jsx",
  "panels/inspector.jsx",
  "panels/inspector-components.jsx",
  "panels/skybox.jsx",
  "panels/inspector-scene.jsx",
  "panels/navigator.jsx",
  "panels/problems.jsx",
  "panels/uieditor.jsx",
  "panels/fonts.jsx",
  "panels/share.jsx",
  "panels/menubar.jsx",
  "panels/statusbar.jsx",
  "panels/scenetools.jsx",
  "panels/export.jsx",
  "panels/newproject.jsx",
  "panels/workspaces.jsx",
  "panels/terrain.jsx",
  "panels/assettools.jsx",
  "panels/play.jsx",
  "panels/install.jsx",
  "panels/recent.jsx",
  "panels/docs.jsx",

  // ── shell (must be last: mounts the app) ──────────────────────────
  "app.jsx",
];
