# AthEditor

A visual scene and game editor for [AthenaEnv](https://github.com/DanielSant0s/AthenaEnv) on PlayStation 2.
Create a project, arrange objects, try the game, then export its scenes, scripts and assets.

[Open the editor](https://reallotex.github.io/AthenaEditor/) · [Design review](docs/UX-REVIEW.md) · [Verification](docs/PRODUCTION-VERIFICATION.md)

[September / October changelog](CHANGELOG.md) · [Five individual feature videos](docs/media/README.md)

Removing the lower sky hemisphere exposes Solid color, Gradient, Foggy gradient and
Mirror backdrops. Colors and fog height are adjustable. Vertex colors or reused sky
tiles cover downward views in Game and console exports without extra texture VRAM.

The five starting templates now use less CPU time per frame: measured reductions range
from 14.4% to 75.4% in PCSX2, with unchanged CT16S/Z16S VRAM. See the
[before/after measurements and their limits](docs/TEMPLATE-PERFORMANCE.md).
New projects include the optimized scripts; existing projects can import matching
[controller copies](examples/controllers/) and apply the documented collider changes.

![Focused scene workspace](docs/verification/workspace.jpg)

## Start editing

Open **AthenaEditor.html** in a desktop browser. The editor includes its dependencies and works offline.
Choose **Create project**, enter a name and press Enter. A third-person game starts with a
character, ground and playable controller. **Change starting point** offers first-person,
platform and top-down games, or a blank scene with a camera and light.

The header shows **Project | Scene**. Open the scene dropdown to switch scenes or
create one immediately. The **+** beside **Scene / Game** opens editor panels such as
Terrain and Timeline. World, Lighting, Events, Project, Assets, Prefabs and UV remain
independent panels. The Focus layout opens a compact set by default.
**View → Editor controls…** configures hotkeys, camera mouse bindings and the drag
threshold; preferences persist separately from the game project.

The scene occupies the center, Objects and Assets share the left side, and Properties appear on
the right. **Add object** offers common objects first; search or **More objects…** reveals
other types. **Add a model** lets you choose an existing file or import and place one in a
single step. Assets shows all files; drag a model into the scene to place it where you drop
it. Folder filters are optional. Select an object to see its transformation tools and properties.
**Save** and **Export Game** stay in the header; the local installation also provides **Play**.
Export is the primary project action on the hosted site and standalone file. Additional tools are available
through the menus and Ctrl+K. A new project starts in Focus; resumed projects retain their
layout preferences. **Scene options** opens sky and scene settings beside the scene.

**Save** writes a portable project file with imported assets and scripts. The browser also keeps
a recovery copy; that backup is distinct from saving a file. When Save falls back to a
download, the status says **Download requested**. Keep a file copy of your work.
Opening another project with changes offers **Save and continue**, **Discard changes** or
**Cancel**. A cancelled or failed save keeps your current work open.
Linking an existing project folder lets Save and Export write there, with conflict checks before
replacing edited files. File and folder pickers depend on the browser; Chrome and Edge support
the full folder workflow, and the editor falls back to file uploads and downloads elsewhere.

**Export** produces a ZIP containing main.js, every scene, scripts, assets and athena.ini.
The game starts at the project's start scene. Add athena.elf from the included reference folder
to run the exported folder on the console or an emulator. Referenced files must be available;
missing assets, ambiguous filenames and glTF models with external dependencies block export.
Use self-contained GLB models for glTF assets. Scene exits are available to scripts as
`ctx.goToScene("Exit name")` and take effect on the next frame.

Enable **Generate Collision / Overlap Events** in Rigidbody, then choose a **Script Preset**:
Play Cinematic, Play Sound Oneshot, Change Scene, Destroy Object or Play Animation. Select entry or exit,
optionally filter the activating object, and fill in the preset's options. **Edit Script**
opens its editable script; your existing controller stays attached. Triggers never block
movement. See [Physics events](docs/PHYSICS-EVENTS.md) for setup and custom callbacks.

**Timeline / Cinematics** creates sequences triggered by scene start, timers, scene exit,
custom events or collider entry/exit. Add channels for dialogue, portraits, text windows,
audio, camera, transforms, character animation, visibility and pooled particles. Drag
clips and resize their edges; write dialogue inside its clip. **Preview in Game** opens
an independent camera view with playback controls and scrubbing. Gameplay and physics
pause during native cinematic playback. See [Cinematics](docs/CINEMATICS.md) for usage,
the event API and console audio/font limits.

**+ → Events** chains actions with object selectors and conditions: player entry →
cinematic → move a door → enable enemies. It also supports scene start, timers and scene
exit. Timeline includes keyframes, interpolation curves, fades, camera transitions,
skeletal animation blending, clip duplication and reusable sequences. Prefab variants
inherit base changes while preserving overrides. Assets provides thumbnails, type search,
custom folders, reference diagnostics and reimport without losing assignments.
See [Visual events](docs/EVENT-FLOWS.md), [Timeline](docs/CINEMATICS.md) and
[Assets and prefab variants](docs/AUTHORING-1-5.md).

New shadows enable **Drape On Geometry** by default. Solid colliders receive the shadow;
the caster's colliders and triggers are excluded. Keep scene physics enabled and provide
colliders on floors and platforms. Disabling draping uses the fixed **Ground Y** plane.

**Create → Water** creates animated translucent water with a 3D procedural pattern and
seafloor caustics. Six quality sliders, Linear/Nearest filtering and a frame-cost estimate
let you reduce individual effects; Ultra low uses an opaque, motionless 32² texture.
Shared position/UV caches and baked static caustics also reduce work at maximum quality.
**Create → Particle effects** offers bubbles, splash and fountains; Events can
trigger an emitter with **Play particles**. Particle and model textures support flipbooks.
Terrain includes rounded hills and quantized texture transitions with visible VRAM cost;
its preview temporarily omits fog. **+ → Lighting** controls fog, shared fake
reflections and three independent vertex-color tints with contact shading at three bake
qualities. **Bake Lighting → Shared shadow blobs** generates
directional silhouettes shared by matching mesh instances, keeping receiver textures intact.
See [Coastal scenes](docs/COASTAL-SCENES.md) for setup, memory costs and native limits.

Sky presets again use the original stylized **single_image** panoramas at **1774×887**.
Their original files are restored unchanged; photographic/reconstructed replacements
are outside the shipped library. Resolution improvements are deferred. The texture
sliders still show source dimensions and memory pressure, and larger outputs warn
that they add no source detail. [Source details](assets/skyboxes/README.md).
Timeline clips open their grouped parameters in Properties. **View → UI animations**
enables short interaction feedback; it starts disabled.

## Run on Windows

Install [Deno](https://docs.deno.com/runtime/getting_started/installation/) 2.9 and PCSX2,
then double-click **Start AthEditor.vbs**, or run:

```sh
deno task app
```

The editor opens at a fixed local address. **Run** discovers the included console player and
PCSX2's standard installation. If necessary, Run settings lets you select their locations.
The bundled player is the official AthenaEnv `latest` release published August 1, 2026;
[its verified version and hashes](reference/AthenaEnvReleaseAndExamples/README.md) identify
the exact binary. Update the local checkout to receive it; a custom Run runtime takes precedence.
PCSX2 needs a working BIOS and HostFS enabled. Run stages the open scene in a fresh temporary
folder; Stop controls only the emulator process started by this editor.
The standalone file and the hosted site provide export; native Run requires the local service.
See [Desktop setup](docs/DESKTOP.md).

## Develop and verify

```sh
deno task check       # Build the standalone editor and run the automated suite
deno task serve       # Development server with rebuild/reload
deno task build       # Rebuild AthenaEditor.html from src/
```

Deno downloads build dependencies on the first run. No separate Node installation is required.
Do not edit the generated HTML. Source modules live in src/ and their build order is in
tools/modules.js. Read [CLAUDE.md](CLAUDE.md) and the [verified engine API](docs/ATHENAENV-API.md)
before changing generated engine calls.

The release review includes automated regression tests, browser interaction checks, four
controller fixtures in PCSX2 and repeated scene transitions. It does not certify real PS2
hardware or every possible combination of user scripts and assets.
GitHub Actions builds and tests on each change before deploying the generated editor to Pages.

The editor is GPL-3.0; bundled libraries and AthenaEnv retain their own licenses.
See [LICENSE](LICENSE), [vendor licenses](vendor/LICENSE-MIT.txt) and the
[console player notice](reference/AthenaEnvReleaseAndExamples/README.md).

The [October 10 editor audit](docs/EDITOR-AUDIT.md) documents the color-picker performance fix, dock carousel, live languages, graphics cleanup, fifteen authoring improvements and native startup regression.
