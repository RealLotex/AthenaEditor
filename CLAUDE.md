# AthenaEnv Level Editor

A browser-based visual editor for **AthenaEnv**, a QuickJS runtime for the PlayStation 2.
You compose 3D scenes and HUDs, attach behaviour scripts, and export a `main.js` that runs
on real hardware.

> **Read this file first. Then read `docs/ATHENAENV-API.md` before touching anything that
> emits engine calls.** The engine has several bindings whose signatures do not match its
> own README, and getting one wrong silently disables a whole subsystem.

**Planned work lives in `docs/ROADMAP.md`** — twenty sequenced items. Check it before
designing anything new. Current status is in `state.md`.

---

## Commands

```bash
deno task build     # src/ -> AthenaEditor.html
deno task watch     # rebuild on save
deno task serve     # the editor on 127.0.0.1, reloading itself on every build
deno task test      # automated regression suite; current results in docs/PRODUCTION-VERIFICATION.md
deno task check     # build + test
deno task ps2run    # run a fixture in PCSX2 and assert on what it did
                    #   --template <id>  run a project template instead, with faked stick input
```

Deno 2.9 is the only requirement. There is no Node, no npm install, no package.json.
`esbuild` and `@std/path` are fetched once and cached by Deno.

**`AthenaEditor.html` is a build artifact. Never edit it.** Edit `src/` and rebuild.
`AthenaEditor.legacy.html` is the pre-rewrite single-file version, kept for reference only.

To try a change: `deno task build`, then open `AthenaEditor.html` in a browser.
It runs from `file://` with no server — React and Three.js are vendored into the file.

---

## Layout

```
src/
  core/         util, math, i18n, imagesize, components, project, history, validate, storage
                theme, fsaccess (writing into a linked folder), scaffold (a new folder)
  templates/    the five New Project starting points, registry.js + their placeholder meshes
  docs/         Help page content, one module per language + shared code samples
  codegen/      scene -> main.js. Pure, no DOM, fully unit-tested.
  viewport/     Three.js scene mirror, gizmos, component overlays
  ui/           primitives, toasts, modal, dock, command palette
  panels/       outliner, inspector, navigator, problems, HUD editor, menus, export
  app.jsx       state, command registry, keyboard, layout  (mounts the app — must be last)
  styles.css    the whole design system

tools/
  build.js      concatenate + transform + inline vendor -> AthenaEditor.html
  modules.js    THE MODULE ORDER. Add new files here or they will not be built.
  sample.js     print a generated main.js for a representative scene
  fetch-vendor.js

tests/          Deno tests. _load.js runs core+codegen exactly as the browser does.
docs/           architecture, verified engine API, codegen contract
reference/AthenaEnv/   upstream clone — the source of truth for engine behaviour
vendor/         React + Three, inlined at build time so the editor works offline
```

### How the build works

Every file in `tools/modules.js` is transformed independently by esbuild (so a syntax
error names one file) and concatenated into a **single shared scope**. There are no
imports between modules — a `const` in `core/util.js` is directly visible in `app.jsx`.

Consequences you must keep in mind:

- **Order matters** for anything that runs at load time. Declarations do not care.
- **Top-level names are global.** The build fails loudly if two modules declare the same
  one, which is the guard rail that makes this arrangement safe.
- Adding a file means adding it to `tools/modules.js`.

---

## Architecture

**`project`** is the single state object and serialises whole to JSON.
`src/core/project.js` owns creation, traversal and migration.

The split matters and is easy to get wrong:

- **Project** = the shippable program. `display` (video mode, framebuffer, alpha test,
  debug HUD), `dirs`, `prefabs`, `scenes[]`, `startSceneId`. Decided once, because a PS2
  program calls `Screen.setMode` exactly once.
- **Scene** = one loadable level. `objects[]`, `uiElements[]`, `background`, `camera`
  defaults, `physics`, `transitions[]`.

If you are adding a setting, ask whether two levels in the same game could sensibly
disagree about it. If not, it belongs on the project. Before v3 all of it lived on the
scene, so New Scene copied a dozen render settings that then drifted apart.

**Objects** are containers. All behaviour lives in `obj.components`, a dict keyed by
component name. Children nest via `obj.children[]`.

**`src/core/components.js` is the centre of gravity.** One `COMPONENTS` entry defines a
component's defaults, its fields, its validation rules and its identity colour. That single
entry drives:

- the Add menu and the command palette
- the entire Inspector UI (`panels/inspector-components.jsx` renders any component generically)
- the Problems panel
- legacy project migration

**To add a component:** add a `COMPONENTS` entry, add an emitter in `src/codegen/`, and
wire the emitter into `codegen/index.js`. Nothing in the UI needs to change.

**Codegen** is a two-phase pipeline:

1. `codegen/resolve.js` turns a scene into an IR — resolves references, bakes world
   transforms from the hierarchy, dedups RenderData, and **allocates every variable name**.
2. The `emit*` functions write code from that IR into an `Emitter`.

Name allocation happens once, in resolve. Emitters never invent names. (The old generator
stashed names on live project objects as `obj._vn`, mutating React state during export.)

**Every panel is inside a `PanelBoundary`** (`ui/boundary.jsx`), and the whole app is inside
an `AppBoundary` that can hand the user their autosave as a file. A panel that throws must
cost that panel and nothing else — if you add a region to the layout, wrap it.

**An Inspector field marked `advanced: true` folds behind a per-component disclosure**, with
View ▸ Advanced Settings to pin them open. Two rules hold and are tested: a `required` field
is never advanced, and an advanced field with an error opens its own section. Nothing is ever
removed — the brief is fewer controls in front of a beginner, not fewer controls.

**Editing** goes through `edit(fn, tag)` in `app.jsx`. `tag` groups a gesture so one drag
is one undo step. Pass `null` for a discrete step.

**Commands.** Every action is one entry in the `commands` array in `app.jsx`. Menus, the
Ctrl+K palette and keyboard shortcuts all read from it. Do not add a keyboard handler or a
menu item anywhere else.

**Templates** live in `src/templates/` and are registered in `PROJECT_TEMPLATES`. Each is a
pure `() => project`. A template carries its controller in `project.scripts[]`, which
`codegen/resolve.js` falls back to when no file of that name is on disk — so a template
works before the user has any assets. A full in-editor script editor is roadmap item 7.

**Help content** is in `src/docs/<lang>.js`, one module per language with the same page
ids. Code samples live once in `src/docs/code.js` and are shared by all three, so a
corrected example is corrected everywhere. `t()` in `core/i18n.js` covers the Help and New
Project dialogs; the rest of the chrome is still English (roadmap item 20).

---

## Things that will bite you

**The viewport is not an emulator.** It approximates layout only. Lighting, fill rate and
clipping will differ from hardware. Never present it as a preview of the final image.

**PS2 alpha is 0–128, not 0–255.** 128 means fully opaque in `Color.new`.

**Nothing may be uploaded twice.** VRAM is 4 MB and an uploaded texture never comes back;
`athena_load_image` (`image_loaders.c:135`) allocates `width * height * 4` in main RAM with
no ceiling and no complaint. A scene of five meshes sharing one 512×512 texture used to
cost 5 MB and simply not boot. So: one `Image` per file+filter across the whole program, and
a second RenderData over an already-loaded mesh is emitted as `.clone()`, which shares the
vertex buffers and the texture pointers (`ath_render.c:1067`). `validateScene` also errors
above the 1024×1024 the GS can address. If you touch `codegen/resolve.js`'s dedup, the tests
under "Nothing is uploaded twice" in `tests/codegen_test.js` are what hold this.

**Mass is a stiffness dial, not kilograms.** `contact_callback` (`ath_ode.c:825`) hardcodes
`soft_cfm = 0.01`, so a contact is a spring and penetration grows with load. Measured on
PCSX2, a 0.5 sphere sinks about 2 mm per unit of mass: at 60 a character stands 12 cm inside
the floor and jitters, at 200 it never settles. Characters use 5.

**`Screen.setParam(PIXEL_ALPHA_BLEND_ENABLE, …)` does not enable alpha blending.** It writes
the GS **PABE** register (`graphics.c:479`; ps2sdk `GS_REG_PABE 0x49`, "alpha blending
control in units of pixels"), which blends *only where the source alpha's MSB is set* —
and since 128 is fully opaque, the only alpha it passes is the one that needed no blending.
With it on, every translucent surface in the whole program renders solid. It is off by
default now and migration forces it off; `validateScene` warns if it is turned back on.
Ordinary blending comes from ABE, already on via `gsGlobal->PrimAlphaEnable`
(`render.c:383`). Measured both ways on PCSX2 — see `docs/HARDWARE-NOTES.md`.

**The alpha test is a second, independent gate.** `display.alphaTest.ref` defaults to 50
with `ALPHA_GREATER`, so fragments at or below alpha 50 of 128 (≈0.39) are discarded before
they ever reach the blend. A shadow at alpha 0.25 disappears entirely even with PABE off.

**Shadow and light colours are 0.0–1.0 floats**, unlike `Color.new`, which is bytes.

**`Camera.target()` moves the camera.** It preserves the view vector by dragging the
position with it, so `Camera.position(p)` followed by `Camera.target(t)` does not leave the
camera at `p`. Always target first. It looks correct on any frame where the target did not
move, which is what makes it expensive to find.

**Shadow geometry lives in `src/core/shadowmath.js`, not in the emitter.** A projector's
texture axes come from its grid indices, its `.rotation` is a quaternion with `w` stuck at
1 (so it rotates *and* scales), and its `position` is rotated along with the grid. Getting
a directional shadow out of that takes a derivation, and it is written out in that file's
header with its C citations. `tests/shadowmath_test.js` checks it against a transcription
of the engine's own matrix code. The engine's `bin/shadows.js` is **not** a safe thing to
copy: it works only for a light with no X component.

**`f3` / `fl` / `il` / `jsStr` in `core/util.js` are mandatory** for anything reaching
generated source. They clamp NaN and Infinity to 0 and escape strings properly. A raw
template interpolation of user data is a syntax error waiting to happen on hardware.

**Object names are not unique.** `ident()` + `NameAllocator` make emitted identifiers
unique; `keyMaker()` in `codegen/ctx.js` does the same for object-literal keys. Both exist
because duplicates used to silently collapse.

**Iteration on PS2 is expensive** — burning an ISO or copying to a memory card. That is why
the Problems panel exists and why `validateScene` is aggressive. When you add a feature,
add its failure modes to validation too.

---

## Testing

`tests/codegen_test.js` is the important one. It asserts the *shape of the emitted code*
against the real engine signatures — argument order, call ordering, no declarations inside
the frame loop, no duplicate keys, valid float literals.

When you change codegen, add a test that would have caught the bug you are fixing.
`deno run -A tools/sample.js` prints a full generated program for a scene exercising
models, hierarchy, physics, triggers, shadows and HUD — read it, don't just trust the tests.

**`deno task ps2run` runs generated code on PCSX2 and asserts on the result.** It stages a
fixture, boots it, reads back a `probe.log` the program wrote through HostFS, and captures
a screenshot. `--sabotage` re-emits the old `Camera.position`-before-`Camera.target` bug so
you can watch the check go red; `--keep` leaves the staged folder behind.

**`deno task ps2shadow` measures the shadow projector on PCSX2** — ten light azimuths, caster
moves at six of them, and a caster rotation, judged on pixels rather than by eye. THREE
things in `src/core/shadowmath.js` are **measured, not derived**: the sign of `quatY`,
`SHADOW_TURN_TABLE` (the engine overshoots a turn by up to 18 degrees) and
`SHADOW_MAGNIFY_TABLE` (it magnifies by up to 2.9x where the sources say 1.4x). The C
predicts different values for all three and does not explain the difference. This is the
test that catches them being "simplified" back.

**Measure a decal through its POSITION, not its size.** Both ride the same `R . S`, so one
measurement serves for both — but the caster stands on the near end of its own shadow and
eats a share of it that changes with the azimuth, which makes the blob's extent useless as a
signal. How far the decal *travels* when the caster moves has the same occlusion at both
ends, so it cancels. The magnify table was fitted from blob extents first and gave a shape
no transform can produce.

**A case that moves the caster must also turn the light, and vice versa.** The turn-table
defect survived twelve green cases because every one of them held one of the two fixed: the
moved-caster cases ran at azimuth 0, where the decal's turn is degenerate, and the turned-light
cases left the caster at the origin, where rotating its position is a no-op. A shadow check
that varies one thing at a time cannot see this class of bug at all.

**Read `docs/HARDWARE-NOTES.md` before touching that harness.** Three findings in it will
otherwise cost you hours: `console.log` never reaches the PCSX2 log, a project folder path
over 135 characters makes AthenaEnv show a black screen with no diagnostic whatsoever, and
screenshots need `PrintWindow` because PCSX2's own F8 cannot be reached from a background
process.

## Style

Match the surrounding code. Comments explain *why*, especially where the code works around
engine behaviour — always cite the C file that justifies it, because the next person will
otherwise "simplify" the workaround away.
