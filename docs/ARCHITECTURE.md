# Architecture

## Why this shape

The editor used to be one 8,749-line HTML file. About 4,900 of those lines were embedded
tutorial prose sitting between the code generator and the UI, and the whole thing was
recompiled by in-browser Babel on every page load.

The constraint that shaped the original — *it must run by double-clicking a file, with no
install step* — is still honoured. `AthenaEditor.html` is self-contained, works from
`file://`, and needs no network. It is now a **build output** rather than the source.

```
src/**  ──esbuild──▶  one <script>  ──▶  AthenaEditor.html  (vendor inlined)
```

Benefits over the single file: edits are surgical, the code generator is unit-testable in
isolation, syntax errors name a file, and the 2.8 MB in-browser Babel dependency is gone.

## The shared-scope module system

There is no module loader. `tools/build.js` transforms each file in `tools/modules.js`
separately and concatenates them into one script, so all top-level declarations land in a
single scope.

This is unusual, so the build enforces the one rule that makes it safe: **it fails if two
modules declare the same top-level name.** That check is why the arrangement does not rot.

Load order only matters for code that *executes* at load time. In practice that is
`app.jsx` (which mounts React) and nothing else, so `app.jsx` is last.

`tests/_load.js` reproduces the same concatenation for the pure modules, which means tests
exercise the exact composition the browser gets.

## Data flow

```
                 ┌──────────────┐
   user input ──▶│   project    │◀── migrateProject() on every load
                 │  (one object)│
                 └──────┬───────┘
                        │
        ┌───────────────┼────────────────┐
        ▼               ▼                ▼
   validateScene   Viewport sync     generateProject
        │            (Three.js)            │
        ▼                                  ▼
   Problems panel                    main.js + scripts/
```

`project` is the only source of truth. It serialises whole to JSON, and every mutation
goes through `edit()` in `app.jsx`, which snapshots for undo before applying.

### Project versus Scene

A **project** is the shippable program; a **scene** is one loadable level. The dividing
question is whether two levels in the same game could sensibly disagree about a setting.

| Project | Scene |
|---|---|
| `display` — video mode, framebuffer PSM, vsync, alpha test, debug HUD | `objects[]`, `uiElements[]` |
| `dirs` — models, textures, sounds, fonts, scripts | `background` clear colour |
| `prefabs`, `scenes[]`, `startSceneId` | `camera` defaults, `physics`, `transitions[]` |

A PS2 program calls `Screen.setMode` once, so a per-scene framebuffer format is
meaningless — which is exactly what the pre-v3 schema allowed. `migrateProject()` lifts
those fields off the first scene and pushes a note for every scene that disagreed, so the
user is told rather than left to discover it when a level renders differently.

`startSceneId` is what the exported program boots; `activeSceneId` is which scene the
editor has open. They are independent, and export currently writes the active one —
multi-scene export is roadmap item 3.

### Undo coalescing

`edit(fn, tag)` passes `tag` to `historyPush`. Repeated edits with the same tag inside
550 ms collapse into one step, so a gizmo drag or a burst of typing is a single Ctrl+Z.
Pass `null` when an edit should always be discrete.

### Why `edit()` computes outside the state updater

```js
const prev = projectRef.current;
const next = deepClone(prev);
mutate(next, activeScene(next));
historyPush(historyRef.current, prev, tag);
projectRef.current = next;
setProject(next);
```

History is a side effect. Putting it inside `setProject(prev => ...)` would double-push
under React StrictMode and desynchronise if two edits land in the same tick. Reading and
writing `projectRef` synchronously keeps them in step.

## The component registry

`src/core/components.js` is the highest-leverage file. Each `COMPONENTS` entry declares:

| Key | Purpose |
|---|---|
| `make()` | default value |
| `fields[]` | drives the entire Inspector UI |
| `validate()` | component-specific rules for the Problems panel |
| `requires[]` | dependencies, with a one-click fix |
| `limit` / `limitMessage` | engine budgets (4 lights, 1 camera) |
| `icon` / `color` | identity in outliner, inspector, overlays |

`panels/inspector-components.jsx` renders any component from `fields[]` alone. A field
declares its `type` (`vec3`, `enum`, `asset`, `objectRef`, `rgba01`, …), optional `when()`
for conditional display, `group` for sectioning, and `help` text.

This is the fix for the concrete failure that motivated the rewrite: the Shadow component
existed in the data model and the code generator, but had no Inspector section, no entry in
the Add menu and no `addComp` branch — three hand-written places that had to be edited in
lockstep and were not. With the registry there is only one place.

## Codegen

Two phases, in `src/codegen/`:

**`resolve.js`** — scene to IR. Resolves caster/light references by name, bakes world
transforms down the hierarchy, dedups RenderData by mesh+settings, collects diagnostics,
and allocates every identifier through one `NameAllocator`.

**`emit*.js`** — pure functions writing into an `Emitter`. They never allocate names and
never touch project state.

`index.js` orders the phases. The ordering constraints are real:

- models before physics (mesh colliders reference RenderObjects)
- physics before shadows (`enableRaycast` needs `ode_space`)
- everything before `ctx` (it references all of it)
- everything before the frame loop — **nothing is declared inside `while (true)`**

That last one is enforced by a test. The old generator emitted HUD element definitions
inside the loop, so every `new Font(...)` was reallocated every frame.

## Viewport

`viewport/viewport.jsx` mirrors the object tree into nested `THREE.Group`s, one per object,
so parent transforms propagate exactly as the baked export will. Gizmo drags are converted
back into the selected object's **local** transform before reaching the project.

Dragging intersects the pointer ray with a plane derived from the active axis rather than
measuring screen-space pixels, which keeps the handle under the cursor at any camera angle.

`viewport/overlays.js` draws colliders, light directions, camera frustums and shadow
footprints. Without these, a Rigidbody or a Shadow is invisible and therefore not really
editable.

**The viewport is not an emulator.** No GS, no VU, no fill-rate model. Layout only.

## Validation

`validateScene` runs on every render (memoised on scene + files) and feeds the Problems
panel. Because a PS2 iteration cycle means burning an ISO or copying to a memory card, the
editor is deliberately noisy about anything that will misbehave.

Diagnostics also come back from `generateProject`, so problems only visible at emit time
(an unresolvable caster, an impossible dynamic trimesh body) surface in the same place.

Some carry a `fix` key the panel can apply in one click — see `FIXES` in
`panels/problems.jsx`.

## Persistence

- **Autosave** — `localStorage`, 4 s after the last edit. The old editor lost everything on
  a refresh.
- **Project file** — `<name>.athena.json`, structure only. Asset payloads are excluded
  because they are tens of megabytes.
- **Assets** — re-read from a picked folder. Only `3dmodels/ textures/ sounds/ fonts/
  scripts/` are scanned, so pointing at a whole game directory does not ingest build output.
- **Prefs** — panel sizes, theme, toggles, in `localStorage`.

`migrateProject()` runs on every load and is idempotent. It fills in fields added since a
file was saved and rewrites renamed ones. Legacy conversions live in `migrateComponent()`.

## Adding things

**A component** — `COMPONENTS` entry, an emitter in `codegen/`, a call in `codegen/index.js`,
a test. Optionally an overlay in `viewport/overlays.js`.

**A command** — one entry in the `commands` array in `app.jsx`. It appears in the menu, the
palette and the keyboard map automatically.

**A field type** — a case in `FieldControl` (`panels/inspector-components.jsx`) and a
control in `ui/primitives.jsx`.

**A module** — create the file, add it to `tools/modules.js`.
