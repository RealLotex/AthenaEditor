# Editor workflows and remaining gaps

Updated 2026-10-10. See [PRODUCTION-VERIFICATION.md](PRODUCTION-VERIFICATION.md) for the
current release checks and [UX-REVIEW.md](UX-REVIEW.md) for the new default experience.

The default path asks for the outcome, chooses the normal settings and gives each task one main action. Technical settings remain available inside disclosures or the console export workflow. New projects start with component guides hidden; primitives use a neutral checker texture.

## Available now

| Task | Where | Behaviour |
| --- | --- | --- |
| Install AthEditor | Start AthEditor.vbs → Help → Install AthEditor… | Chrome/Edge can install the editor with its own icon and window. The launcher starts the local service without a terminal at a fixed address. Offline shell and update behaviour are described in [DESKTOP.md](DESKTOP.md). |
| Start a project | File → New Project | Name, template, Create. Template meshes, controllers and prototype textures are included automatically. No runtime or folder decision. |
| Open existing work | File → Open Project File (Ctrl+O) / Open Existing Folder (Ctrl+Shift+O) | Native file/folder dialogs where supported. Opening a project file remembers its exact save destination and clears the previous project's folder association. Invalid files and cancelled replacement keep the current project and undo history. |
| Save a project | File → Save Project (Ctrl+S) / Save Project As (Ctrl+Shift+S) | The first Save asks for a file; later saves update that file even after renaming the project. Save As selects a new destination. The file handle is remembered for the corresponding browser autosave. Cancelling, denied write access or a failed write preserve unsaved state. Browsers without file pickers keep download/folder saving. |
| Resume project assets | Automatic on reopening / status bar → Load project assets… | The linked folder is restored only for its matching project. Existing read access loads external assets without a prompt; expired access can be renewed without picking the folder again. Reload Assets refreshes files without reopening the saved scene or clearing undo. |
| Build a prototype | Create | Cube, plane, sphere, cylinder, cone, torus and ramp. Neutral checker and grid textures plus the supplied Gradient_Pallete512.png palette are project assets. |
| Edit UVs | + → UV | Select an OBJ model; project, pack or transform UVs. The first Apply creates a working copy; later edits update it with undo support. A shared copy forks only when needed to protect another object or prefab. The original stays available. |
| Organize assets | Assets panel | Category folders, imported subfolders, Prototypes and Generated/UV, Atlases, Lighting and Optimized. Breadcrumbs and global search. UV edits reveal their working folder. These are library folders; engine filenames and export directories remain compatible. |
| Delete objects | Outliner | Contextual trash button on selected/hovered rows, including HUD elements. Deletion supports Undo. |
| Arrange panels | Drag a panel tab / its ⋯ menu | Group as tabs, split any edge, undock, move and resize floating panels. Collapsed groups keep a tab strip. Closed panels reopen through View → Panels. |
| Configure editor input | View → Editor controls… / + → Controls | Record or clear shortcuts, detect conflicts, restore defaults. Editor/Blender/Maya/Unity camera presets, custom orbit/pan/dolly mouse buttons and modifiers, sensitivity, wheel inversion and smoothing. Selection changes on pointer release within a configurable drag threshold; crossing it permanently cancels that gesture's selection change. Preferences are separate from project/undo and apply in detached windows and Terrain. |
| Choose a layout | View → Layout presets | Focus, Default, Unity, Unreal 4, Unreal 5 and Godot. Layout preferences are saved separately from the project and do not enter scene undo history. |
| Run the game | Play / F5 / Scene → Run game | The local Windows editor detects PCSX2 and the included console player, stages the current export in a temporary folder and starts the emulator. Stop closes only the launched process. Scene → Run settings remembers custom paths. |
| Edit scripts | Scripts workspace | Create, edit and attach JavaScript behaviours. Edits are stored automatically in the project, take part in undo and survive workspace switches. Ctrl+S saves the project. Scripts execute in the exported game. |
| Chain events | Scene → Events / + → Events | Choose a scene or object event, add conditions and actions with filtered references. Actions can wait for a cinematic, move a door and then enable enemies. Invalid references appear in Problems. See [EVENT-FLOWS.md](EVENT-FLOWS.md). |
| Author cinematics | + → Timeline | UI/dialogue/audio/camera/transform/animation/particle channels. Move and resize clips, edit dialogue in its clip, add keyframes/curves, fades, camera transitions and animation blends. Selecting a clip opens grouped settings in Properties. Duplicate clips and save/reuse sequences. See [CINEMATICS.md](CINEMATICS.md). |
| Preview the camera | Game / Timeline → Preview in Game | Isolated scene-camera and cinematic preview, including scrubbing. Native gameplay pauses for cinematic playback. Browser Game does not execute exported gameplay scripts or ODE. |
| Reuse objects | Edit → Prefabs / + → Prefabs | Save the selected subtree, place linked instances, update by saving a linked source, revert or detach. Updates preserve instance placement and property overrides. Deleting a prefab keeps its instances as ordinary objects. |
| Optimize textures | Scene → Texture Tools | Downscale and quantize to 16 or 256 colours. Preview, then use the results. Outputs are indexed PNGs supported by AthenaEnv. Original textures remain available. |
| Change the sky | + → World → Background | Ten original stylized single_image panoramas at 1774×887, with visible 4/8/16-bit and texture-size sliders, Remove lower hemisphere and Linear filtering toggles. Every conversion starts from the original; larger outputs warn that enlargement adds no detail. Resolution improvements are deferred. Old generated built-in tiles refresh automatically; edited/custom images are preserved, and unreferenced replaced tiles are retired. Import/drop a 2:1 PNG, JPG or WebP; its original remains available for resizing. Scene defaults to 100° with a visible angle selector; “Use wide Game camera · 100°” updates the active camera through Undo. Problems distinguishes texture streaming pressure from a texture that cannot fit beside locked buffers. Streaming does not silently lower resolution. |
| Build a texture atlas | Scene → Texture Tools | Select textures, choose the atlas task and preview. Sources are fitted automatically; edge gutters limit filtering seams. Applying also creates remapped OBJ copies for the active scene. |
| Add animated water | Create → Water | Embedded 3D procedural water and static seafloor caustics. Six independent quality sliders control texture size, transparency, pattern animation, panning, mesh waves and caustics, with Linear/Nearest filtering and estimated frame cost. Ultra low becomes opaque, motionless water with a 32² texture. Maximum uses a 512² texture and shared native position/UV caches; static caustic receivers are baked once and guarded against movement. See the measured savings in [PRODUCTION-VERIFICATION.md](PRODUCTION-VERIFICATION.md). |
| Add particle effects | Create → Particle effects | Bubbles, splash and fountain presets with fixed pools. Events → Play particles triggers a chosen emitter. Native rendering uses one draw per emitter and shared indexed sprite textures. Particle and ordinary model textures support row/column flipbooks. |
| Shape and blend landscape | + → Terrain | Hills use rounded brush falloff. The terrain preview omits fog while preserving scene settings. Paint grass/dirt/stone, enable Smooth texture transitions and choose 256/512/1024 pixels at 4 or 8 bits. The panel shows the generated atlas's actual palette and VRAM cost. One quantized atlas, updated after a stroke, avoids runtime splat maps. |
| Edit scene atmosphere | Scene → Lighting / + → Lighting | Distance fog, coastal/sunset/night fake reflections on selected surfaces, and Recesses/Midtones/Highlights vertex colors with separate strengths. Apply contact shading at Draft/Balanced/High quality to static OBJ models; Restore reverses the bake. Live Sun lighting stays enabled unless Bake Sun is selected. Existing authored colors are preserved; Neutral ambient removes an unwanted ambient tint. |
| Bake static lighting | Scene → Bake Lighting | Shared shadow blobs is the default: bake indexed directional silhouettes once and reuse them across matching instances without editing floor textures. Lightmap textures remains available for ambient/directional lighting and static shadows. Dynamic bodies and animated meshes are excluded. |
| Restore a bake | Select baked object → Scene → Restore Original Lighting | Restore the original model/material assignment. Bake assets stay available. |
| Enable UI feedback | View → UI animations | Disabled by default. Enables short action, hover, selection and panel-reveal animations; disabling it removes those transitions. |
| Export | Export | One ZIP containing main.js, scripts, assets and athena.ini, preserving folder names. Code preview is secondary. Linked folders receive the same asset bytes. |
| Prepare a console folder | File → More options → Prepare Console Folder | Choose the console player once, then a folder. Export configuration no longer competes with project creation. |

Generated assets are embedded in the project and browser recovery copy. Saving a portable
project file also embeds loaded imported assets and scripts, so it can reopen on another
machine without the original folder. Save imported-folder resources to a file before moving
machines. The exported ZIP includes available payloads from all scenes.

## Modular workspace

World, Lighting, Events, Project, Assets, UV and Prefabs are independent dockable panels, without inner panel tabs. The Focus layout keeps the initial workspace compact. The **+** beside Scene/Game opens them directly. Scene settings is named **World**; active-camera selection and gamepad orbit are in **Game**, with fallback camera controls in its Camera settings dialog. Existing panel IDs and layout groups stay compatible. Drag a tab onto another group's header or centre to group it as tabs, or toward an edge to create a split. A highlighted preview shows the destination before release. Alt-drag leaves a panel floating; the panel's ⋯ menu provides the same actions without dragging. Floating panels move by their title bar, resize at the lower-right corner and return with the Dock button. Splitters support dragging, arrow keys and double-clicking to equalize the two areas.

View → Panels reopens any closed module; View → View settings → Reset layout restores Default. Choosing a preset restores its arrangement without changing scene content, project settings, theme or language. Panel contents stay mounted while moving, preserving pending UV changes, scripts and the viewport camera. Hidden scene tabs stop drawing until shown again.

| Preset | Arrangement |
| --- | --- |
| Default | Matches the supplied image: full-height scene left, outliner above assets in the middle-right, inspector at the far right. |
| Unity | Outliner on the left of the scene, assets below, inspector right. |
| Unreal 4 | Scene above assets, outliner above inspector in a right column. |
| Unreal 5 | Same right column, with assets initially collapsed into a bottom drawer. |
| Godot | Outliner above assets on the left, scene centre, inspector right. |

These presets arrange AthEditor's existing modules; they do not reproduce another engine's functionality. Floating windows remain inside the editor browser window. Preferences belong to the current browser origin; a separate port or browser profile has its own arrangement. Old fixed-panel preferences migrate to Default, and invalid saved layouts are repaired so panels remain recoverable.

## Scope of the simple tools

- UV editing, atlas remapping and baking edit OBJ geometry. Imported glTF/GLB remains viewable and exportable; conversion or glTF authoring is not included.
- Atlas remapping requires UVs within 0–1. Tiled coordinates are rejected before committing changes. Changes apply to the current scene; other scenes keep their original material assignments.
- Baking provides direct static illumination, not global illumination, light probes or an indirect light solver. Moving a baked object or changing the scene lighting requires another bake. OBJ material libraries need an explicit texture assignment for baking.
- Scripts have a plain text editor with line numbers, indentation, project persistence and attachment. There is no debugger or autocomplete. Games run in PCSX2, not in the browser.
- PCSX2 launching requires the local server (`deno task serve`) on Windows and PCSX2 with its BIOS configured and HostFS enabled. The standalone HTML keeps editing/export features; browsers cannot start native executables directly. Launching does not save or overwrite the linked project folder.
- Save Selection updates a linked prefab source. Unlinked selections create separate prefabs, including when names match. Instance names and root transforms remain local. Prefab variants inherit base edits and preserve variant and instance overrides. Asset folders, safe deletion and reimport are described in [AUTHORING-1-5.md](AUTHORING-1-5.md).

## Missing things worth prioritizing next

These are a backlog, not additional features added in this change.

| Priority | Gap | Why it matters |
| --- | --- | --- |
| 2 | Contextual object/component actions | Continue replacing technical labels and redundant entry points with task-specific choices. |
| 2 | Remaining diagnostic prose and dense legacy controls | Fixed UI and option labels now translate live; authored data retains its language. Further wording work can focus on generated diagnostic messages and dense hardware settings. |
| 2 | Input mapping with game-oriented names | Controller bindings currently live in scripts. |
| 2 | Align/distribute, pivot tools and richer snapping | Scene assembly still involves manual numeric adjustments. |
| 3 | glTF UV/material editing and multi-material baking | The new tools intentionally start with OBJ and one assigned texture. |
| 3 | Script diagnostics and debugger integration | Editing is integrated; diagnosing runtime behaviour still requires external tools. |

## Verification

- The historical September suite passed 388 tests, covering existing editor behaviour plus layout invariants, malformed preference recovery, root pruning, tab reordering, floating geometry, project/undo isolation, UV round trips, working-copy reuse/isolation/undo, folder grouping/refresh, outliner deletion, native launch access/path checks, packing, atlas gutters/remapping, primitives, prefab merges, script precedence/persistence, PNG CRCs/palette/index decoding, binary export and ZIP directory layout.
- A dedicated PCSX2 fixture exports owned primitive meshes with baked unlit materials and both 16- and 256-colour PNGs. The game boots and completes its 180-frame probe. Evidence: `.verification/editor-tools-ps2.json` and `.verification/editor-tools-ps2.png`.
- Browser checks use an isolated localhost origin so testing does not replace the user's open project. Creation, primitive loading, UV application, script editing/attachment and reopening, linked prefab placement, optimization preview, atlas remapping, lighting baking and ZIP export were exercised.
- The Run button launched the real PCSX2 installation with the edited scene; the ELF booted and the renderer initialized. Stop terminated that owned process. Log: `.verification/play-ux-pcsx2.log`. Browser checks also covered trash/undo, collapsed panel recovery and two UV applications retaining one working mesh.
- Docking browser checks covered all five presets, tab grouping and edge splitting with the mouse, floating movement/resizing, close/reopen, pending UV and script retention, splitters, keyboard gizmo selection, a floating 3D viewport and a full page reload preserving floating coordinates and collapsed tabs. Browser evidence: `.verification/docking-browser.json`, `.verification/docking-default.png`, `.verification/docking-floating.png`. Automated test log: `.verification/docking-check.log`.

See [EDITOR-AUDIT.md](EDITOR-AUDIT.md) for the October 10 color, memory, docking, language and authoring improvements.
