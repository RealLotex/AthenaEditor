# Editor workflows and remaining gaps

Updated 2026-10-01. See [PRODUCTION-VERIFICATION.md](PRODUCTION-VERIFICATION.md) for the
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
| Build a prototype | Add | Cube, plane, sphere, cylinder, cone, torus and ramp. Neutral checker and grid textures plus the supplied Gradient_Pallete512.png palette are project assets. |
| Edit UVs | UV workspace | Select an OBJ model; project, pack or transform UVs. The first Apply creates a working copy; later edits update it with undo support. A shared copy forks only when needed to protect another object or prefab. The original stays available. |
| Organize assets | Assets panel | Category folders, imported subfolders, Prototypes and Generated/UV, Atlases, Lighting and Optimized. Breadcrumbs and global search. UV edits reveal their working folder. These are library folders; engine filenames and export directories remain compatible. |
| Delete objects | Outliner | Contextual trash button on selected/hovered rows, including HUD elements. Deletion supports Undo. |
| Arrange panels | Drag a panel tab / its ⋯ menu | Group as tabs, split any edge, undock, move and resize floating panels. Collapsed groups keep a tab strip. Closed panels reopen through View → Panels. |
| Choose a layout | View → Layout presets | Focus, Default, Unity, Unreal 4, Unreal 5 and Godot. Layout preferences are saved separately from the project and do not enter scene undo history. |
| Run the game | Run / F5 | The local Windows editor detects PCSX2 and the included console player, stages the current export in a temporary folder and starts the emulator. Stop closes only the launched process. File → More options → Run settings remembers custom paths. |
| Edit scripts | Scripts workspace | Create, edit and attach JavaScript behaviours. Edits are stored automatically in the project, take part in undo and survive workspace switches. Ctrl+S saves the project. Scripts execute in the exported game. |
| Reuse objects | Edit → Prefabs / Prefabs panel | Save the selected subtree, place linked instances, update by saving a linked source, revert or detach. Updates preserve instance placement and property overrides. Deleting a prefab keeps its instances as ordinary objects. |
| Optimize textures | Tools → Texture Tools | Downscale and quantize to 16 or 256 colours. Preview, then use the results. Outputs are indexed PNGs supported by AthenaEnv. Original textures remain available. |
| Change the sky | Scene toolbar → Skybox / View → Skybox | Ten original offline panoramas, one-click selection, orientation and brightness. Upload or drop a 2:1 PNG, JPG or WebP panorama; it is converted automatically to an opaque 512×256 PNG. Custom skies stay in the project library. Undo, save, console export and linked-folder writes include the sky. The console draws an unlit UV sphere around the camera before scene geometry. Built-in clouds use spherical noise to avoid pinching at the zenith. |
| Build a texture atlas | Tools → Texture Tools | Select textures, choose the atlas task and preview. Sources are fitted automatically; edge gutters limit filtering seams. Applying also creates remapped OBJ copies for the active scene. |
| Bake static lighting | Tools → Bake Lighting | Bake ambient/directional diffuse lighting and optional static shadows into separate textures with unique triangle UVs. Baked models use the unlit pipeline, preventing lighting from being applied twice. Dynamic bodies and animated meshes are excluded. |
| Restore a bake | Select baked object → Tools → Restore Original Lighting | Restore the original model/material assignment. Bake assets stay available. |
| Export | Export | One ZIP containing main.js, scripts, assets and athena.ini, preserving folder names. Code preview is secondary. Linked folders receive the same asset bytes. |
| Prepare a console folder | File → More options → Prepare Console Folder | Choose the console player once, then a folder. Export configuration no longer competes with project creation. |

Generated assets are embedded in the project and browser recovery copy. Saving a portable
project file also embeds loaded imported assets and scripts, so it can reopen on another
machine without the original folder. Save imported-folder resources to a file before moving
machines. The exported ZIP includes available payloads from all scenes.

## Modular workspace

The twelve modules are Scene, HUD, UV, Terrain, Scripts, Objects, Properties, Scene settings, Project, Assets, Prefabs and Problems. Drag a tab onto another group's header or centre to group it as tabs, or toward an edge to create a split. A highlighted preview shows the destination before release. Alt-drag leaves a panel floating; the panel's ⋯ menu provides the same actions without dragging. Floating panels move by their title bar, resize at the lower-right corner and return with the Dock button. Splitters support dragging, arrow keys and double-clicking to equalize the two areas.

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
- Save Selection updates a linked prefab source. Unlinked selections create separate prefabs, including when names match. Instance names and root transforms remain local. Nested prefab inheritance is not an authoring feature.

## Missing things worth prioritizing next

These are a backlog, not additional features added in this change.

| Priority | Gap | Why it matters |
| --- | --- | --- |
| 1 | Preview through the game camera inside the editor | Run now opens PCSX2 directly. A camera preview before launch would shorten composition checks. |
| 2 | Contextual object/component actions | Continue replacing technical labels and redundant entry points with task-specific choices. |
| 2 | Consistent accessible labels, keyboard navigation and translation | Several legacy panels still mix languages and use small, dense controls. Creation fields are labelled; modal focus now stays stable during background saves and skips hidden/disabled controls. |
| 2 | Input mapping with game-oriented names | Controller bindings currently live in scripts. |
| 2 | Align/distribute, pivot tools and richer snapping | Scene assembly still involves manual numeric adjustments. |
| 3 | Animation authoring and preview | Animator settings exist, but there is no visual timeline. |
| 3 | glTF UV/material editing and multi-material baking | The new tools intentionally start with OBJ and one assigned texture. |
| 3 | Script diagnostics and debugger integration | Editing is integrated; diagnosing runtime behaviour still requires external tools. |

## Verification

- The historical September suite passed 388 tests, covering existing editor behaviour plus layout invariants, malformed preference recovery, root pruning, tab reordering, floating geometry, project/undo isolation, UV round trips, working-copy reuse/isolation/undo, folder grouping/refresh, outliner deletion, native launch access/path checks, packing, atlas gutters/remapping, primitives, prefab merges, script precedence/persistence, PNG CRCs/palette/index decoding, binary export and ZIP directory layout.
- A dedicated PCSX2 fixture exports owned primitive meshes with baked unlit materials and both 16- and 256-colour PNGs. The game boots and completes its 180-frame probe. Evidence: `.verification/editor-tools-ps2.json` and `.verification/editor-tools-ps2.png`.
- Browser checks use an isolated localhost origin so testing does not replace the user's open project. Creation, primitive loading, UV application, script editing/attachment and reopening, linked prefab placement, optimization preview, atlas remapping, lighting baking and ZIP export were exercised.
- The Run button launched the real PCSX2 installation with the edited scene; the ELF booted and the renderer initialized. Stop terminated that owned process. Log: `.verification/play-ux-pcsx2.log`. Browser checks also covered trash/undo, collapsed panel recovery and two UV applications retaining one working mesh.
- Docking browser checks covered all five presets, tab grouping and edge splitting with the mouse, floating movement/resizing, close/reopen, pending UV and script retention, splitters, keyboard gizmo selection, a floating 3D viewport and a full page reload preserving floating coordinates and collapsed tabs. Browser evidence: `.verification/docking-browser.json`, `.verification/docking-default.png`, `.verification/docking-floating.png`. Automated test log: `.verification/docking-check.log`.
