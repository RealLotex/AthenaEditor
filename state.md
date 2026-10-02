# Project status

_Last updated: 2026-10-02._

## October 2 UX redesign

The follow-up review of bdb36e2 makes Assets show every file, moves folders behind an
optional filter and replaces empty-model creation with choose/import-and-place. Models
can be dragged directly onto the scene and undone in one step. Menus now close and restore
focus consistently; hidden disclosure controls no longer intercept keyboard navigation.
Small lists omit search, narrow rows keep their labels, and transforms disappear when an
undone object no longer exists. The web highlights Export and guides Run to the local
installation. Save-download feedback reports the request separately from a saved file.
The complete suite passed: 528 tests, zero failures. Final browser checks include model
import/error/retry, drag/undo, keyboard menus, service-free export, local Run/Stop and
760/1024 px layouts. Existing engine fixtures retain their dated evidence below.

Creation now defaults to a playable third-person game and one required name. Alternatives
are optional. New projects enter Focus; resumed layouts remain personal. Save, Export and
Run stay in the header, transformations follow selection, and Add opens common objects
before specialized types. Properties clear stale search, reveal errors and preserve untouched
axes in multi-object edits. Camera editing targets the actual camera. Export presents its
result before code, and project replacement can save before continuing. Dialog and panel
keyboard navigation, legibility and narrow-window layouts have been reviewed.

## October production and UX review

The current editor uses a first-run welcome screen and the Focus workspace. Save
includes portable resources; export includes every level and blocks missing or
ambiguous dependencies. Named exits are implemented with safe frame-boundary reloads.
New project replacement preserves unsaved work when cancelled. Existing specialized
editing capabilities remain accessible through the menus and command palette.

Current verification and limitations are in [PRODUCTION-VERIFICATION.md](docs/PRODUCTION-VERIFICATION.md).
The complete design-guide review is in [UX-REVIEW.md](docs/UX-REVIEW.md).
The sections below are historical notes, not the current release checklist.

## September editor corrections

Shadows now use a direct world matrix shared by export and preview; the historical angle
and magnification tables are retired. Transform order, rotation handles, world overlays,
undo commits, hierarchy copies, named shadow references, scene deletion, save state,
material preview and HUD export/layout were corrected. See
[verification](docs/VERIFICATION.md) for the current checks and their limits.

The sections below describe the earlier work and historical measurements.

**Start with `CLAUDE.md`.** This file is only the current status and the open work.

---

## Stability: one panel can no longer cost you the editor

Every panel is wrapped in a `PanelBoundary` (`src/ui/boundary.jsx`) — ten of them, covering
the menu bar, outliner, viewport, HUD editor, Problems, assets, the whole right dock, the
status bar, dialogs and toasts. A panel that throws shows the real error, a Copy Details
button and a Try Again, and everything else keeps working. `AppBoundary` sits outside all of
it: if the editor itself cannot render, it offers the autosave as a downloadable
`.athena.json` before anything overwrites it. Both verified in a browser by making a panel
throw on purpose.

That was the cheap half. The audit behind it found things that were quietly worse:

- **The Problems panel crashed on two of its own diagnostics.** `p.fix?.startsWith(...)`
  guards null but not an object, and both the PABE warning and the runaway-mass error carry
  `{path, value, label}`. The panel you go to when something is wrong was the thing that
  broke — and the object-shaped fix had never worked anyway, because `FIXES[{...}]` keys as
  `"[object Object]"`. Fixed, implemented, and moved into `core/validate.js` so it is
  reachable from tests at all.
- **Any JSON at all was accepted as a project.** A `package.json` loaded as a project called
  "my-app", replacing what was open, wiping undo, and overwriting the autosave four seconds
  later. `looksLikeProject()` now asks the one question that matters — does it have scenes or
  a version — and stays permissive past that.
- **Three paths replaced the project with no question asked**, two of them behind buttons
  labelled about *assets*. They all route through `adoptProject()` now, which confirms when
  there are unsaved changes.
- **Autosave was a pure debounce with one slot.** Every edit restarted the 4 s timer, so a
  sustained gizmo drag never saved at all; a crash cancelled the pending write; a failed
  write returned a boolean nobody read; and an unreadable save booted a blank editor over
  work still sitting in localStorage. Now: a 15 s hard ceiling, a second `.prev` slot that
  the loader falls back to, a one-time toast when the browser is full, and an offer to
  download the raw bytes when a save cannot be parsed.
- **The physics CFM field destroyed its own value.** `formatNum` rounded to four decimals, so
  the default of 1e-5 displayed as "0", and the input commits what it displays on blur —
  clicking in and out set CFM to zero, which is a different simulation. It keeps the exponent
  now.
- Unguarded `o.components` / `o.name` on the two hottest render paths, an unguarded rotation
  in `matFromTRS`, and `objectRef` filters that dereferenced `components` during render.

*Covered by:* `tests/robustness_test.js`, 26 tests.

## Easier to use, with nothing taken away

Inspector fields can now carry `advanced: true`. Eighteen do — pipeline, culling, shading,
clipping, specular, near/far, the shadow's bias, grid, raycast and light-pass controls — and
they fold behind an **Advanced (n)** button per component. View ▸ Advanced Settings pins them
open permanently for anyone who wants them inline.

Two rules make the fold safe rather than merely tidier, and both are tested: a **required**
field is never advanced, and an advanced field with an **error** opens its section on its own,
because hiding the reason something is broken is worse than showing a knob nobody wanted.

The audit also turned up a field that had no control at all: `shadow.rtBpp` was in the
defaults, emitted into `main.js` and counted twice in the VRAM budget, but unreachable from
the editor — so the one setting that halves a shadow's VRAM cost could not be changed. It has
a control now.

The Project and Scene panels are hand-written JSX rather than registry-driven, so they use an
`<Advanced>` wrapper that behaves identically. The Project tab opens on four things — name,
video mode, debug HUD, volume — with the framebuffer, VSync, frame counter and the five
folder names one click away.

**Both of the Sound component's switches were decorative.** The emitter never wrote `loop`,
and `volume` could never have worked: `Sound.Stream` has no per-stream volume binding at all
— the module's only volume is the global `Sound.setVolume` (`ath_sound.c:284`). `loop` is
emitted now, and volume moved to the project as a master level, emitted once before anything
plays. `Sound.SFX` is the object with per-instance volume, pan and pitch; the editor does not
use it yet. Written up in `docs/ATHENAENV-API.md`, and this closes the "sound volume and loop
are inert" loose end below.

## Three defects found by using the editor on a real project

### The same texture was uploaded once per model

A scene with five meshes sharing one 512×512 texture emitted five `new Image(...)` calls —
5 MB against the PS2's 4 MB of VRAM, so the program did not load at all. The dedup key for a
RenderData included the render settings, so two objects wanting different shading also
re-uploaded the mesh.

Both are fixed in `codegen/resolve.js` and `codegen/models.js`: one `Image` per file+filter
however many meshes use it, and a second RenderData over an already-loaded mesh is emitted
as `.clone()`, which shares the vertex buffers *and* the texture pointers and copies only
the materials (`athena_renderdata_clone`, `ath_render.c:1067`).

There is now a texture budget in the Problems panel too. `core/imagesize.js` reads
dimensions out of the file header (PNG/BMP/JPEG/TGA) and `validateScene` errors on anything
past the 1024 the GS can address, warns on non-powers-of-two, sums the total against 4 MB,
and calls out the same picture used at two filters — which really is two copies, because the
filter belongs to the uploaded image rather than to the mesh.

### Textures never showed on a .glb in the viewport

`buildModel` applied `model.textureFile` in the OBJ branch only; a GLTF was returned exactly
as the loader built it. Since every non-`.obj` mesh is loaded as GLTF, an assigned texture
was silently dropped by the editor while the export applied it correctly — the viewport
contradicting the program it previews. `applyModelMaterial` now runs on both paths and also
honours `face_culling`, which the GLTF branch had hard-coded to double-sided.

The editor's own placeholder meshes could not show a texture either: `ObjBuilder` emitted no
`vt` at all, so every vertex sampled one texel. They carry box-projected UVs now.

### A changed asset did not reach the viewport

Two layers, either of which reproduces "sometimes I have to switch to the HUD tab and back":
`mergeAssets` only re-took a file's payload when its **size** changed, and a mesh re-exported
from Blender very often has the identical byte count; and the viewport cached the built mesh
against the asset's `id`, which `mergeAssets` holds constant on purpose. Both now go through
`assetChanged` / `assetRevision` in `core/storage.js`, keyed on `lastModified`.

A third, separate race sat under the same symptom: `node.modelKey` was committed *before*
the async load resolved, so any state change landing mid-load dropped the result and left
the key set — the object stayed invisible until something unmounted the viewport. The key is
committed on arrival now.

*Covered by:* `tests/texture_test.js` (17), `tests/assets_test.js` (15), and six dedup tests
in `tests/codegen_test.js`.

---

## Alpha blending was off for every project

`Screen.setParam(PIXEL_ALPHA_BLEND_ENABLE, …)` does not enable alpha blending. It writes the
GS **PABE** register, which blends *only where the source alpha's MSB is set* — and 128 is
fully opaque on PS2, so the only alpha it passed was the one that needed no blending.
Codegen emitted it as `true` for every project, so **nothing anywhere could be
translucent**: not shadows, not the HUD, not blended materials.

Measured on PCSX2: with it on, alpha is all-or-nothing; with it off, darkening tracks alpha
1:1 (10/25/50/75/100% at alpha 0.10/0.25/0.50/0.75/1.00). It is off by default now,
migration forces it off, and `validateScene` warns with a one-click fix if it is turned back
on. `tests/pabe_test.js` pins it; the write-up is in `docs/HARDWARE-NOTES.md`.

Watch for the **second gate**: `display.alphaTest.ref` defaults to 50 with `ALPHA_GREATER`,
so anything at or below alpha 50 of 128 is discarded before it reaches the blend.

## All five templates, and all four with a controller confirmed on PCSX2

`deno task ps2run --template all` boots each one, fakes stick input and reads back what the
engine did. Every check passes for First Person, Third Person, Side Scroller and Top Down:
the body settles on the ground, the camera holds the relation its controller promises, the
left stick moves the character +X, and forward moves it −Z (the side scroller correctly
refuses to move in Z at all).

The resting heights are the mass finding, confirmed independently: a 0.4 sphere settles at
0.3939, a 0.5 sphere at 0.4869, a 1.0-tall box at 0.4963 — 6 mm, 13 mm and 4 mm of
penetration at mass 5, matching the measured 2 mm per unit of mass for a sphere and about a
third of that for a box, which has more contact points to share the load.

## The shadow did not follow the caster, and twelve green cases could not see it

Reported as "it moves, but not in the same direction as my character". Reproduced, measured
and fixed; the full write-up with the tables is in `docs/HARDWARE-NOTES.md`.

The decal's `position` rides through the same rotation as its grid, so the generator
pre-rotates it. That cancels only if the engine turns the decal by the angle it was asked
for — and it does not. Measured off the frame at ten azimuths, it **overshoots by up to 18°**,
exactly zero at 0 and ±90 and worst in the middle. Every case in the matrix sat at one of
those two ends, or kept the caster at the origin where a turn of the position cannot show,
and the `azimuth` check's tolerance was 20°, which passed a decal turned 19° off the light.

`SHADOW_TURN_TABLE` in `core/shadowmath.js` inverts the measured relation, so the generator
asks for the turn that lands on `phi`. Orientation error across the ten azimuths went from
**mean 9.5° / worst 19.2°** to **mean 1.4° / worst 3.1°**, and every follow case now tracks
the caster. The tolerance is 8° now.

Three harness defects turned up on the way, all of which had been quietly shrinking what the
matrix could see — a fixed pixel crop that broke whenever PCSX2 remembered a different window
size, the FPS overlay being classified as both shadow and caster, and `judgeFollow` comparing
against a perspective-invalid calibration. All three are in the notes.

Re-run from scratch with both tables in place, and with the `azimuth` gate tightened from 20°
to 8°: **82 checks, 0 failing, 0 inconclusive**.

The magnification was wrong in the same way and for the same reason: the old
`1 + |sin phi|` inflation had been fitted at 0, 45 and 90, two of which are ends where the
decal does not turn, and it left the decal 15% small in between. `SHADOW_MAGNIFY_TABLE`
replaces it, measured through how far the decal **travels** rather than how big it looks —
the caster stands on the near end of its own shadow and eats a share of it that changes with
the azimuth, so the blob's extent is not a usable signal, while the travel has identical
occlusion at both ends of the move and cancels it.

## Running it on the emulator

`deno task ps2run` stages a fixture, boots it in PCSX2, and asserts on what the engine
actually did. Full procedure and findings: **`docs/HARDWARE-NOTES.md`**.

The 2026-08-04 pass re-ran the four defects below, which had been fixed but never executed:

- **`Camera.target()` — fixed, confirmed on the engine.** `Camera.save()` reads the camera
  back at exactly the position and target the scene emitted. Verified to be capable of
  failing: `--sabotage` re-emits the calls in the old order and the run goes red with the
  camera displaced by precisely the target delta.
- **`Font("default")` — fixed, confirmed.** A fixture with no `fonts/` folder boots.
- **Both shadow defects — were still broken, now fixed and verified.** The single-angle
  check had passed by coincidence. `deno task ps2shadow` measures the decal in pixels
  across eight light azimuths plus caster moves and a caster rotation, and found the shadow
  falling on the *same* side as the light whenever the light had an X component, and the
  decal inflated by up to 2.2x. Two sign/magnitude corrections in `src/core/shadowmath.js`,
  both **measured rather than derived** — the C sources predict different values and do not
  explain the difference — take the matrix from 18 failing to **0 failing**.

Two things about the toolchain cost hours and are written up in the notes: `console.log`
never reaches the PCSX2 log (HostFS file writes are the working channel), and **a project
folder path over 135 characters makes AthenaEnv show a black screen with no diagnostic at
all**.

## First hardware run — what it found

The first PCSX2 run of generated output happened on 2026-08-02, which closed the gap
flagged below. The program booted, the scene rendered and physics ran. Four things were
wrong, all now fixed and covered by tests:

- **Shadows came out rotated.** The silhouette was rendered from a light-aligned camera,
  but the decal was left axis-aligned, so the shadow turned with the light's azimuth while
  the decal did not. The decal is now turned onto the light's azimuth and foreshortened by
  `1/sin(elevation)`, which is what a directional light actually does. That needed three
  undocumented facts about `Shadows.Projector` — see `src/core/shadowmath.js`, which
  derives all of them from the C with citations, and `tests/shadowmath_test.js`, which
  checks the result against a transcription of the engine's own matrix code rather than
  against the generator's output.
- **Shadows came out the wrong size,** because the decal extent and the light camera's
  distance were independent fields that had to satisfy
  `extent = 2 * dist * tan(fov/2)`. The distance is derived now, and Fit To Caster sizes
  the whole light pass from the caster's bounding sphere.
- **`Camera.target()` moves the camera.** It preserves the view vector by dragging the
  position along, so `position()` then `target()` does not leave the camera where it was
  put. Everything the editor emits now targets first.
- **`new Font("consola.TTF")` killed a fresh project on its first line.** The overlay font
  is `Font("default")` — the one inside the ELF — unless the folder really has a font.

---

## Where things stand

The editor was rewritten from a single 8,749-line HTML file into a `src/` module tree built
by `deno task build`. `AthenaEditor.html` is now generated and self-contained (React and
Three.js are vendored in, so it works offline from `file://`).

**Working and verified:**

- Build + test pipeline — `deno task check`, 293 unit tests
- All five project templates — roadmap item 2, done
- `deno task serve` — the editor on 127.0.0.1 with live reload on any `src/` change
- Export writes into a linked folder, skipping files that already match — item 16, partial
- New Project scaffolds a runnable folder on disk — item 2, and a slice of item 16
- Project/Scene split (schema v3) — roadmap item 1, with v2 migration
- Help in English, Spanish and Portuguese — roadmap item 20, partial
- New Project dialog with all five templates — roadmap item 2, done
- ODE physics and collisions, corrected against the C sources
- `Shadows.Projector`, including the offscreen silhouette pass — seen running in PCSX2
- Data-driven Inspector, Problems panel, command palette, autosave
- HUD editor at PS2 resolution, export with per-file preview

The old file is kept as `AthenaEditor.legacy.html` for reference. It can be deleted once
you are satisfied with the rewrite.

---

## What was actually broken

These were all live defects in the previous version, not hypotheticals.

### Physics never ran at all

`world.stepWithContacts(dt, space, group)` — the engine signature is
`(space, group, dt, callback?)`. ODE read a float where it expected a space pointer, got
null, and the broad phase never executed. Nothing collided, ever.

`ODE.GeomRenderObject(renderObject, space)` was likewise reversed.

The collision callback was generated as `function ode_onCollide(g1, g2)`, but
`space.collide()` passes **one contact object**. `g2` was `undefined`, so `g2._noEvents`
threw a TypeError on the first contact.

### Shadows did nothing, and enabling one broke rendering

`_shadowPass()` was generated but never called. `projector.render()` was never emitted at
all. And because the generator suppressed `Screen.clear(gray)` whenever a shadow pass
existed, adding a shadow left the framebuffer uncleared.

The component also had no Add-Component entry, no Inspector section and no `addComp`
branch — it could only be created by hand-editing JSON.

Further, `setColor()` was emitted *after* `setGrid()`. Vertex colours are baked during
geometry rebuild, so the colour never took effect. `enableRaycast(space, len, true)` had
its last two arguments swapped, making every ray 1 unit long.

### HUD elements were allocated every frame

Element definitions and `drawUI()` were emitted **inside** `while (true)`, so every
`new Font(...)` was reallocated 60 times a second, and `drawUI()` was called above its own
`const` declarations.

### Nested objects were silently dropped

`scene.objects.filter(...)` only looked at top-level objects. Anything parented to another
object never reached the export. Hierarchy is now baked into world transforms.

### Smaller ones

- `obj._vn = ...` mutated live React state during export and leaked into saved JSON
- Two objects with the same name produced duplicate `const` declarations — a syntax error
- `f3(40.5) + ".0"` produced the literal `40.5.0`
- `saveProject` was referenced in a `useEffect` dependency array above its own `const`,
  surviving only because in-browser Babel downlevelled `const` to `var`
- Undo pushed a full snapshot per keystroke and per drag frame
- A browser refresh discarded the entire project

---

## Engine constraints that are now surfaced, not worked around

Documented in `docs/ATHENAENV-API.md`, warned about in the Problems panel:

- **Contact friction is fixed** at mu 0.5 / bounce 0.1 by the engine. No binding exists.
- **Dynamic bodies cannot start rotated.** `setRotation` writes 9 of the 12 floats a
  `dMatrix3` needs, leaving the last row as stack garbage.
- **`getRotation()` returns 9 of 12 floats.** Row 2 is rebuilt as `row0 × row1` — see
  `eulerFromOdeRotation` in `src/core/math.js`, unit-tested against a synthetic dMatrix3.
- **Trimesh colliders ignore object scale.**
- **True triggers are impossible inside the stepped space** — the solver always builds
  contact joints. Trigger geoms are created space-less and polled instead.
- **Only 4 lights.**

---

## Open work

**See `docs/ROADMAP.md`** — twenty sequenced work items. Items 1 and 2 are done; items 6, 16
and 20 are partly done (hardware verification; direct disk access; translated Help). The
rest is not started.

Three small features landed to support the Top Down template, each worth knowing about:

- `project.scripts[]` — scripts carried inside the project, used when no file of that name
  is on disk. This is a slice of item 7; there is still no editor for them.
- `rigidbody.freezeRotation` — keeps a body upright and hands the visual rotation to the
  script. Required for any character.
- `scene.defaultCameraRig` — turn the built-in orbit camera off when a script drives the
  camera, or the two fight every frame.

What is and is not confirmed on hardware:

> Generated output **boots and runs in PCSX2** — models, hierarchy, physics, the offscreen
> shadow pass and the Top Down controller. The four defects it exposed are listed at the
> top of this file, and the camera and font fixes are now confirmed on the engine by
> `deno task ps2run`. Everything else is still verified only against the C sources: **no
> run on real hardware**, no test of scene transitions, animation, triggers, sound or the
> HUD, and no measurement of shadow geometry beyond one light angle. Roadmap item 6 is
> still open and is still the highest-value item on the list.

Loose ends not big enough for the roadmap:

- ~~**Sound volume and loop are inert.**~~ Closed: `loop` is emitted, volume moved to the
  project because the engine's only volume is global. See above.
- **Animator plays one clip at startup.** Runtime switching works from scripts via
  `ctx.animCollections`; there is no UI for it.
- **`setUVRect` is hardcoded** to the flip `bin/shadows.js` uses for render-target shadows.
  Blob shadows may want it exposed.

---

## Ground rules

- `AthenaEditor.html` is generated. Edit `src/`, run `deno task build`.
- New file? Add it to `tools/modules.js`.
- Changing codegen? Add a test that would have caught the bug, and read
  `deno run -A tools/sample.js` output rather than trusting assertions alone.
- Verify engine signatures in `reference/AthenaEnv/src/`, never from the README.
