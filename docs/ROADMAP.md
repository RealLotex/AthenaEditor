# Roadmap

Historical planning document. See [EDITOR-WORKFLOWS.md](EDITOR-WORKFLOWS.md) for the current feature checklist and remaining gaps. Several items below are implemented, including scripts, linked prefabs and basic asset tools. Each item was written so it could be
picked up alone, in roughly the order given.

Part 1 designs the Project/Scene split and the template system, because several later items
depend on it. Part 2 lists the twenty work items. Part 3 suggests a sequence.

Sizes are rough: **S** ≈ a focused session, **M** ≈ a day, **L** ≈ multi-session.

---

# Part 1 — The Project / Scene model

> **Implemented.** Landed as project version 3; see `migrateProject()` in
> `src/core/project.js` and `tests/migration_test.js`. The rest of this part is kept as
> the design record. Two things were deliberately deferred:
>
> - `project.input` is not in the schema yet. `project.assets` and `project.scripts` are now implemented.
>   They arrive with items 8 and 7. `fillDefaults()` adds new keys on load, so neither
>   needs a version bump.
> - The export-layout decision below is still open — item 3 has not started, and
>   `scene.transitions` currently emits commented placeholders.

## The problem this solved

`project` and `scene` are not cleanly separated. A scene currently owns settings that
belong to the whole program:

```js
scene = {
  id, name, objects[], uiElements[], linkedScenes[],
  modelsDir, texturesDir,              // ← project-wide
  psm, psmCustomColor, psmCustomDepth, // ← project-wide: one Screen.setMode per program
  alphaTestEnable, alphaTestMethod,    // ← project-wide default
  alphaTestRef, alphaTestFail, pixelAlphaBlend,
  showDebugInfo,                       // ← project-wide
  background, physics,                 // ← genuinely per-scene
}
```

This has three consequences:

1. **New Scene silently copies a dozen render settings**, and they drift apart. Two scenes
   in one project can specify incompatible framebuffer formats, which is meaningless — the
   PS2 program calls `Screen.setMode` once.
2. **There is no such thing as "creating a project"** in the UI. The editor boots into a
   hard-coded default and File has no New Project. Templates have nowhere to attach.
3. **Only the active scene exports.** `linkedScenes` emits commented `std.reload()` calls
   as placeholders, so multi-level games are not actually expressible.

## The target model

**A Project is the shippable program.** It owns everything that is decided once: video
mode, framebuffer, asset directories, the input map, prefabs, and the list of scenes.

**A Scene is one loadable level.** It owns what legitimately changes between levels:
its objects, its HUD, its clear colour, its physics world, and where it can transition to.

```js
project = {
  id, name, version: 3,
  template: "third-person",        // provenance; drives Help hints only

  display: {                       // emitted once per program
    mode: "NTSC" | "PAL" | "DTV_480p",
    psm: "CT16S_Z16S" | "CT32_Z24" | "CT32_Z32" | "custom",
    psmCustomColor, psmCustomDepth,
    vsync: true, frameCounter: true,
    alphaTest: { enabled, method, ref, onFail, pixelBlend },
    debugHUD: false,
  },

  dirs: { models, textures, sounds, fonts, scripts },

  input: {                         // see item 8
    actions: [ { name: "Jump", buttons: ["CROSS"] }, ... ],
    axes:    [ { name: "Move", stick: "left", deadzone: 25 }, ... ],
  },

  assets: [ { name, cat, size, hash } ],   // manifest; payloads stay out of the JSON
  scripts: [ { name, content } ],          // embedded scripts — see item 7
  prefabs: [ ... ],

  scenes: [ scene, ... ],
  startSceneId,
  activeSceneId,                   // editor-only: which one is open
}

scene = {
  id, name,
  objects: [], uiElements: [],
  background: { r, g, b, a },
  camera: { fov, near, far },       // scene default; a Camera object overrides it
  physics: { enabled, gravity, cfm, erp, iterations, stepSize },
  transitions: [ { name: "toBossRoom", targetSceneId } ],
}
```

`startSceneId` is what `main.js` boots. `activeSceneId` is editor UI state and should
arguably move to prefs — decide during implementation.

## Migration

`migrateProject()` already runs on every load and is idempotent; extend it with a v2 → v3
step in `src/core/project.js`:

- Lift `psm*`, `alphaTest*`, `pixelAlphaBlend`, `showDebugInfo`, `modelsDir`,
  `texturesDir` from the **first** scene into `project.display` / `project.dirs`.
- If later scenes disagree, keep the first scene's values and emit an `info` diagnostic per
  divergence so the user learns what changed rather than discovering it silently.
- Convert `linkedScenes: [id]` into `transitions: [{ name, targetSceneId }]`, naming each
  after the target scene.
- Set `startSceneId = scenes[0].id`, `version = 3`.

Write the migration test first: build a v2 fixture with two divergent scenes, assert the
lift and the diagnostics.

## Export layout

Multi-scene means each scene must be a program `std.reload()` can enter.

```
main.js              boots startScene — for a single-scene project this is the whole game
scene_<name>.js      one complete program per scene
scripts/*.js         behaviour scripts, shared
```

**Open decision — resolve with a hardware test before building item 3.**

`std.reload(path)` restarts the VM with a new entry script, so every scene file needs
display init. Two options:

- **A. Duplicate the boot block** (~30 lines) into each scene file. Zero path risk. Costs
  a little size and makes the output repetitive.
- **B. A shared `runtime.js`** imported by each scene. Cleaner, but `os.chdir()` is used
  throughout the generated code for asset loading, and ES module specifiers resolving
  against a moving cwd is exactly the kind of thing that works in one place and not
  another.

**Recommendation: A.** The duplication is generated, so it costs nothing to maintain, and
the split exists precisely so those values are guaranteed identical across scenes. Revisit
if a hardware test shows B is reliable.

Transitions emit a helper per scene:

```js
function goToScene(name) {
    if (name === "BossRoom") std.reload("scene_bossroom.js");
}
```

exposed as `ctx.goToScene`.

## Templates

Five presets, selected in a **New Project** dialog. A template is a pure function
`() => project`, living in `src/templates/`, plus one controller script embedded as a
project script (item 7 makes that possible).

All five share: a Main Camera, a Sun light, and — except Empty — a ground plane with a
static `plane` rigidbody, physics on at `-9.81`, and an input map.

| Template | Scene contents | Controller | Camera behaviour |
|---|---|---|---|
| **Empty** | Camera, Sun | none | static, orbit via the default rig |
| **First Person** | Player (dynamic sphere r 0.4, mass 70), Ground | `FirstPersonController.js` | `Camera.position` at player + eye height; `Camera.target` from yaw/pitch |
| **Third Person** | Player model + dynamic sphere, Ground | `ThirdPersonController.js` | orbit rig behind the player, right stick controls yaw/pitch |
| **Side Scroller** | Player (dynamic sphere, radius 0.5), Ground, 3 platforms (static boxes) | `SideScrollerController.js` | on +Z, follows player X, Y clamped |
| **Top Down** | Player (dynamic sphere), Ground, 4 walls | `TopDownController.js` | fixed height above player, looks straight down |

### Controller pattern

All controllers follow one shape, using the `ctx` the generator already emits:

```js
export function init(ctx) {
    ctx.player.yaw = 0; ctx.player.pitch = 0.2;
    ctx.player.grounded = false;
}

export function update(ctx, pad) {
    // Grounded test uses the contact normal the collision callback already stores.
    const n = ctx.player.lastHitNormal;
    ctx.player.grounded = !!n && n[1] > 0.7;
    ctx.player.lastHitNormal = null;          // consume it each frame

    const body = ctx.physics.bodies.player;
    // ... read the input map, apply forces / set velocity ...
    if (ctx.player.grounded && ctx.input.pressed("Jump")) {
        const v = body.getLinearVel();
        body.setLinearVel(v[0], 6.0, v[2]);
    }
    // ... position the camera ...
}
```

Two things worth noting because they are already true in the generated output:

- `ctx.<key>.lastHitNormal` is set by `ode_onCollide`, so a grounded check needs no
  extra ray. It must be cleared each frame or it goes stale.
- `ctx.physics.bodies.<name>` and `ctx.physics.geoms.<name>` are already exposed.

**These controllers are unverified.** They must be run on hardware or in PCSX2 before the
templates ship — see item 6. In particular, whether `setLinearVel` gives acceptable
character control on top of the engine's fixed contact friction (mu 0.5) is unknown.

### Definition of done for the template system

- File ▸ New Project opens a dialog with the five options, each with a one-line
  description and a preview thumbnail.
- Choosing one replaces the project (with an "unsaved changes" guard).
- Every template exports with **zero errors** in the Problems panel and produces a
  program that boots.
- A test asserts each template generates code that passes the smoke-run of item 4.

---

# Part 2 — Twenty work items

## Foundation

### 1. Project/Scene schema split — **L** — ✅ **DONE**
Part 1's model and migration, as project version 3.
*Landed in:* `core/project.js` (schema + `migrateProject` v2→v3), `core/validate.js`
(project-level checks), `codegen/index.js` + `resolve.js` + `sounds.js` (display and dirs
read from the project), `panels/inspector-scene.jsx` (split into `ProjectSettings` and
`SceneSettings`), `app.jsx` (third dock tab, `updateProject`, migration toasts).
*Covered by:* `tests/migration_test.js`, 17 tests.

Beyond the plan: asset folders became five configurable entries rather than two,
`display.mode` was added (emitted only when set, so the default touches nothing), and
scene camera defaults now back the generator's old hardcoded `60 / 1 / 4000`.

### 2. New Project dialog + five templates — **M** — ✅ **DONE**
All five ship: Empty, First Person, Third Person, Side Scroller and Top Down, with the
dialog (Ctrl+N) and the registry in `src/templates/registry.js`.
*Covered by:* `tests/template_test.js`, 34 tests; `tests/scaffold_test.js`, 16 tests.

The three that landed last are camera maths on the Top Down foundation, as predicted, but
each needed one thing that was not in the plan:

- **First Person** gives the player *no* Model. A mesh you are inside is clipped by the near
  plane every frame for nothing, so the collider is something you look out of. codegen no
  longer reports a model-less dynamic body when a script drives it, or the template would
  ship with a permanent diagnostic. Its near plane opens to 0.4 — the editor default of 1.0
  hides anything within a metre of the eye, so you walk into a crate and see through it.
- **Third Person** keeps two angles apart: the camera's, which movement resolves against,
  and the model's, which chases travel. Sharing one makes the character moonwalk.
- **Side Scroller** pins depth in the controller — Z velocity zeroed every frame and any
  drift from a corner contact snapped back — because this ODE binding has no 2D joint. Its
  camera sits on **+Z**: that is the side from which world +X reads as screen right, the
  same mapping `ps2shadow` measures against. On −Z every control mirrors.

**Mass is a stiffness dial, not kilograms.** Measured on PCSX2: the engine hardcodes
`soft_cfm = 0.01` in `contact_callback` (`ath_ode.c:825`) with no binding, so a contact is a
spring and penetration grows with load. A 0.5 sphere sinks 2 mm per unit of mass — at 60 the
character stands 12 cm inside the floor and jitters, at 200 it never settles. Every template
uses 5 now (Top Down was changed from 60), `validateScene` warns above 20 and errors above
100, and the numbers are in `docs/HARDWARE-NOTES.md`.

**`deno task ps2run --template <id>` runs a template on PCSX2 and asserts on it.** It fakes
stick input — `Pads` exposes `lx`/`ly` as setters (`ath_pads.c:643`), and a probe object
placed first in the scene writes the stick after `pad.update()` and before the controller
reads it — so it checks that the character actually moves the right way, not merely that the
program booted. Top Down is confirmed: stick right moves it +X, stick up moves it −Z, the
camera follows and the body rests on the ground.

**New Project now writes the folder.** Choosing "Create in Folder…" picks a destination and
lays out the asset directories, `athena.ini`, `athena.elf`, the template's placeholder
meshes and its scripts, then links the folder and exports `main.js` into it — so a new
project is something that runs, not a scene that still needs assembling.
*Landed in:* `core/scaffold.js` (what a folder contains), `templates/assets.js` (procedural
OBJ placeholders), `core/fsaccess.js` (`fsScaffoldProject`, runtime cache),
`panels/newproject.jsx`, `app.jsx` (`scaffoldProject`).

Two constraints worth knowing before extending it:

- **The editor cannot produce `athena.elf`.** It is ~5 MB of binary from a release, and
  inlining it would triple the size of `AthenaEditor.html`, which has to stay a file you
  double-click. Instead the user points at one once and it is kept in IndexedDB, then
  copied into every project created afterwards.
- **Nothing is ever overwritten.** `fsScaffoldProject` skips paths that already exist and
  reports them, and `main.js` goes through the normal export path rather than being a
  second thing that can clobber generated code.

Landing Top Down needed three things that were not in the original plan:

- **A minimal slice of item 7.** `project.scripts[]` now carries scripts inside the
  project, and `resolve.js` falls back to it when no file of that name is on disk. No
  editor UI — that is still item 7.
- **`rigidbody.freezeRotation`.** Without it the physics sync overwrites the visual
  rotation every frame and a character rolls like a marble. The sync now skips `.rotation`
  for a frozen body and zeroes its angular velocity after each step.
- **`scene.defaultCameraRig`.** The built-in orbit rig and a camera-driving script would
  otherwise both write the camera every frame.

The remaining three templates should need no new engine plumbing — First Person and Third
Person are camera maths on the same foundation; Side Scroller needs constrained movement,
not new components.

### 3. Multi-scene export + transitions — **M**
Depends on 1. Emit one program per scene, plus `ctx.goToScene(name)`. Replace the commented
`std.reload()` placeholders.
*Done when:* a two-scene project round-trips and switching scenes works on hardware.

### 4. Headless smoke-run of generated code — **M**
The highest-value stability item. Build a mock AthenaEnv (`tests/mock-engine.js`) that
stubs `Screen`, `Render`, `Camera`, `Lights`, `Color`, `Image`, `Font`, `Draw`, `Sound`,
`Pads`, `ODE`, `Shadows`, `os`, `std` — recording calls, returning plausible values, and
throwing on unknown members. Run the generated `main.js` for N frames with the loop
condition stubbed.

This catches ReferenceErrors, TDZ, typos in engine member names, and wrong call order
without touching hardware. It is the difference between "the tests say the string looks
right" and "the program actually runs".
*Done when:* every template and every test fixture survives 3 simulated frames, and the
mock asserts known invariants (`Screen.clear` once per frame, `flip` last, no allocation
inside the loop).

Two of the four defects the first PCSX2 run turned up are valid call sequences, so a mock
that only records calls would have passed them: a rotated shadow and a wrongly sized one.
Mocking `Camera.target`'s position-dragging behaviour and `Font("name")` failing on an
absent file would have caught the other two.

`tests/shadowmath_test.js` is the pattern for the rest: rather than asserting on emitted
strings, it transcribes `vu0_matrix_apply`, `shadow_create_transform_matrix` and
`LookAtCameraMatrix` and checks that the numbers the generator produces land the decal
where the light camera's image actually projects. That is what a mock engine should be —
enough arithmetic to be wrong in the same ways the hardware is, not just a call recorder.

### 5. Golden-file snapshot tests — **S**
Depends on 4. Check `tests/golden/*.js` into the repo and diff generated output against
them, with `deno task test --update` to re-bless. Makes unintended codegen changes visible
in review instead of silent.

### 6. Hardware verification pass — **M** — 🟡 **PARTIAL**
The one thing no amount of unit testing replaces. Build a checklist project exercising
models, hierarchy, animation, all five rigidbody shapes, triggers, both shadow modes, HUD
and scene transitions. Run it in PCSX2 and on real hardware; record results in
`docs/HARDWARE-NOTES.md` with screenshots.

A Top Down project has booted in PCSX2 — models, physics, the controller and the offscreen
shadow pass all run. See the top of `state.md` for the four defects it found.

`docs/HARDWARE-NOTES.md` now exists, and `deno task ps2run` runs a fixture on PCSX2 and
asserts on what it did (roadmap item 4 arrived by a different road: a probe script writing
`probe.log` through HostFS, rather than a mock engine). The 2026-08-04 pass confirmed the
`Camera.target()` and `Font("default")` fixes on the engine, and the camera check was
watched failing via `--sabotage` before it was believed.

`deno task ps2shadow` then measured the shadow projector across eight light azimuths, both
caster moves and a caster rotation, and found it genuinely broken: the shadow fell on the
same side as the light whenever the light had an X component, and the decal was inflated by
up to 2.2x. The August fixes used measured correction tables in `docs/HARDWARE-NOTES.md`.
The September implementation replaces those tables with a direct world matrix shared
with the viewport; see [verification](VERIFICATION.md) for current results.

The 2026-08-07 pass added `--template`, which boots a project template with **faked stick
input** and asserts the character moves the right way. All four templates with a controller
pass: gravity settles the body, the camera holds its promised relation, right is +X and
forward is −Z. It also measured the contact-softness law behind the mass finding, and
extended the shadow matrix with a moved caster under a turned light — the combination that
found the turn-table defect (see `state.md`).

Still unverified: **real hardware**, animation, triggers, sound, the HUD, blob shadows,
draping, scene transitions, and two of the five rigidbody shapes (mesh and ray — box, sphere
and plane now all run under the templates). Also still unsettled by measurement: which way
`Lights.DIRECTION` points, since the caster used for that check is too flatly shaded to read
a lit side off.

## Authoring

### 7. Embedded scripts + in-editor editor — **L**
Today a script must exist as a file on disk before it can be attached, which makes
templates impossible and the first-run experience poor. Move scripts into
`project.scripts[]`, editable in the editor, with disk files taking precedence when a
folder is loaded.
Editor: a textarea with line numbers, bracket matching and a `ctx` reference sidebar
generated from the current scene. A full CodeMirror-class editor is out of scope — the
vendoring cost is not worth it yet.
*Done when:* a script can be written, attached and exported without ever touching disk.

### 8. Input map — **M**
Named actions and axes at project level, so scripts read `ctx.input.pressed("Jump")`
rather than `pad.pressed(Pads.CROSS)`. Emit a small input module into the generated code.
Makes templates portable and rebinding trivial.

### 9. Prefab instances stay linked — **M**
Currently instancing copies and the link is lost. Store `prefabId` plus a set of
per-instance overridden field paths on the instance; changes to the prefab propagate to
non-overridden fields. Show overridden fields in bold in the Inspector, with Revert.
*Note:* the old editor matched instances **by name**, which broke on rename. Do not
repeat that — match by id.

### 10. Camera preview mode — **M**
A viewport toggle that renders from the exported camera with its real FOV, a 4:3 frame, and
the CRT safe area marked. The single biggest gap between "looks right in the editor" and
"looks right on a TV".
*Done when:* toggling it shows exactly the framing the PS2 will produce, modulo lighting.

### 11. Transform tooling — **M**
Plane handles (XY/XZ/YZ) on the move gizmo; align and distribute across a multi-selection;
snap-to-surface (drop onto geometry below); arithmetic in numeric fields (`3*8`, `1/3`);
median vs individual pivot for multi-select rotation.

### 12. Scene organisation — **M**
Group/folder objects that emit nothing but organise the tree; per-object lock (blocks
viewport picking and gizmo edits); layers with visibility toggles; saved selection sets.
Scenes past ~50 objects are currently unmanageable.

### 13. Batch operations — **S**
Multi-rename with a numbering pattern; find & replace over object names; copy a component
between objects; paste values into a matching component; reset component to defaults.

### 14. Asset browser upgrades — **M**
Rendered mesh thumbnails (reuse the viewport renderer offscreen); a texture inspector
showing dimensions, whether they are powers of two, and the estimated VRAM cost at each
PSM; a repair flow that relinks a renamed asset across every component referencing it.

## Stability & production

### 15. Error boundaries + crash recovery — **S** — ✅ **DONE**
`src/ui/boundary.jsx`: ten `PanelBoundary` wrappers so one panel throwing costs you that
panel and nothing else, and an `AppBoundary` that offers the autosave as a downloadable
`.athena.json` when the editor itself cannot render. Both carry the real error and a Copy
Details button.

Going after it turned up worse than a blank screen, all now fixed and covered by
`tests/robustness_test.js` (26 tests): the Problems panel crashed on two of its own
diagnostics, any JSON at all was accepted as a project, three paths replaced the project
with no confirmation, autosave was a single-slot debounce that never fired during a drag,
and the physics CFM field silently zeroed itself when clicked into and out of. See
`state.md`.

*Original text follows.*

### 15b. Error boundaries + crash recovery — the plan as written — **S**
One thrown render error currently blanks the editor. Wrap each panel in an error boundary
that shows the error with a Copy Details button and keeps the rest usable, and add a
recovery screen offering "restore last autosave" / "download project JSON" so a crash can
never cost work.
*This is the cheapest large stability win on the list.*

### 16. Direct disk access — **M** — 🟡 **PARTIAL**
`src/core/fsaccess.js` holds a directory handle in IndexedDB. With a folder linked, Export
writes `main.js` and the behaviour scripts in place and Ctrl+S writes the `.athena.json`
beside them; assets are read back from the same handle. The download path remains the
fallback for Firefox and Safari, which have not shipped the API.
*Covered by:* `tests/fsaccess_test.js`, 10 tests against a mock of the API.

Verified working from `file://` — the API is available there, it just needs a user gesture.

Three things deliberately guard the user's files:
- A file whose contents already match what would be written is skipped silently. This is
  the normal case for behaviour scripts, which the generator reads back off disk in the
  first place; prompting on every export trained people to click through the one prompt
  that matters.
- A `main.js` that exists, is non-empty, and lacks the generator's marker comment prompts
  before being replaced. An empty one — what a fresh AthenaEnv folder ships with — does not.
  A behaviour script that exists and *differs* prompts too, named as an outside edit.
- Declining aborts the whole export rather than writing a partial set.

Not done: **watching** for changed assets. The handle makes polling possible, but there is
no change notification in the API, so it needs a deliberate poll loop and a diff.

### 17. Performance & budget panel — **M**
Per-scene accounting of triangles, draw calls, unique RenderDatas, texture VRAM, locked
render-target VRAM, and lights, each against a configurable budget with a bar. The PS2's
limits are hard and invisible until the program stutters; the editor knows enough at export
time to predict most of them.

### 18. Export presets + deterministic output — **S**
Debug and Release presets (debug HUD, comment verbosity, `std.reload` hotkey on/off).
Guarantee byte-identical output for identical input — currently the only nondeterminism is
map iteration order, which is already insertion-ordered, so this is mostly a test plus a
frozen timestamp.

### 19. Accessibility & keyboard navigation — **M**
The accessibility tree currently reports several unnamed buttons. Add `aria-label` to icon
buttons and menu items, roving tabindex in the outliner and asset grid, visible focus rings
throughout, `aria-live` on toasts and the problem count, and full keyboard reachability for
every panel.

### 20. Restore i18n — **M** — 🟡 **PARTIAL**
The Help pages and the New Project dialog are translated to English, Spanish and
Portuguese, with `t()` in `src/core/i18n.js`, a language picker in Help, and the initial
language guessed from the browser. Page content is in `src/docs/<lang>.js`; code samples
are shared from `src/docs/code.js` so an example cannot drift between languages.

Still English only: the menus, panel headers, Inspector field labels and component help
text. Those come from `COMPONENTS` and the command registry, so translating them means
routing both through `t()` — worth doing once the UI stops moving.

Note the old help pages were not recovered verbatim: they documented
`ode_onCollide(g1, g2)` and `space.collide((g1, g2) => ...)`, neither of which is the
engine's signature. Content was rewritten against what the generator emits today.

---

# Part 3 — Suggested sequence

**Phase 1 — trust the output.**
6 (hardware pass) → 4 (smoke-run) → 5 (golden files) → 15 (error boundaries).
Nothing else is worth building on an unverified generator, and item 15 is cheap insurance
while the rest lands.

**Phase 2 — the model.**
1 (schema split) → 7 (embedded scripts) → 8 (input map) → 2 (templates) → 3 (multi-scene).
This is the user-visible arc: a New Project dialog that produces something that runs.

**Phase 3 — authoring comfort.**
10 (camera preview) → 12 (organisation) → 11 (transform tools) → 9 (prefab links) →
13 (batch ops) → 14 (asset browser).

**Phase 4 — polish.**
17 (budgets) → 16 (disk access) → 18 (export presets) → 19 (accessibility) → 20 (i18n).

## Deliberately not planned

- **An in-editor PS2 emulator.** The viewport is a layout approximation and should stay
  honest about that. Emulation belongs to PCSX2.
- **A visual scripting graph.** The `ctx` API is small and behaviour scripts are short;
  a node graph would be more surface area than it saves.
- **Collaborative editing.** No server, and the file-based workflow suits the target.
- **Per-body friction UI.** The engine hardcodes contact surface parameters and exposes no
  binding — see `docs/ATHENAENV-API.md`. Adding controls would be a lie.
