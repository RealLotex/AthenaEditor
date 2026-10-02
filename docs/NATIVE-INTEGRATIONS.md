# Native integrations — completion audit

Scope: all twelve integrations in the user's goal-objective.md. Product name:
AthEditor. AthenaEnv remains the runtime supplied by DanielSantos.

An implementation or mocked API test alone does not prove Windows integration.
Keep platform checks explicit; unsupported browsers retain useful fallbacks.

| Requirement | Current implementation | Evidence still required |
| --- | --- | --- |
| Installable application | Manifest, icons, shell worker, Windows launcher | Actual installed Edge window observed as “AthEditor - MyPS2Game — AthEditor”. Installed page reloaded with the owned local service stopped and independently confirmed unreachable, retained the project and opened Sun's Inspector. Evidence: `.verification/installed-offline.png`. Closing and launching again from Windows Start remains unverified |
| Native open/save | File pickers, exact save target, Save As | Human opened the prepared .atheditor through Windows and saved a separate copy. Automation then added Cube and four embedded assets, used ordinary Save to update that exact copy, checked the physical JSON and confirmed the source fixture was unchanged. Reload retained the file destination; Recent Projects reopened the copy with Cube/assets. Evidence: `.verification/native-file-roundtrip.json`. Cancelled native picker behavior still needs a real dialog check |
| Remember project access | Project-owned handles; read-only asset recovery | Real file access survived installed-page reload and reopened through Recent Projects without choosing the file again. Folder access, expired permissions and read-only asset recovery still need a real folder check |
| Explorer drag/drop | Files, modern and legacy recursive folders, destination-aware embedded import | Explorer interaction; core/app tests cover target folder, collisions, undo/save/export |
| Double-click projects | .atheditor manifest handler and launch consumer; legacy JSON remains readable | Actual Explorer double-click registered AthEditor. Human selected Remember and Open in Edge. Subsequent actual double-clicks needed no permission prompt, focused the same installed window, preserved unsaved edits for the current file and delivered another file to the editor's replacement guard. After closing the installed window, Explorer double-click launched a fresh installed editor with Cube, four assets and the exact saved-file destination. Evidence: `.verification/native-doubleclick-unsaved.png`, `.verification/native-doubleclick-replace-guard.png`, `.verification/native-doubleclick-cold-launch.png` |
| Real panel windows | Same portal hosts in native windows; return/close/preset recovery; shared shortcuts; own-window viewport animation; screen selector | Actual Windows Edge popup retained the Assets search and its edit on return. Installed Inspector window renamed Cube; the main Outliner reflected it, Ctrl+S in that child wrote the same physical project file, and Return to editor activated by Enter in the child closed it and restored the Inspector. Main-window Undo reverted the shared edit, then Save restored the copy. Evidence: `.verification/edge-panel-return.png`, `.verification/native-file-roundtrip.png`. Camera rendering and actual multi-monitor placement still require verification |
| System clipboard | Native PNG capture copy; image paste into Textures/Clipboard; custom object format and text fallback; referenced assets included, collisions remapped | Browser verified PNG copy/read/paste, Ctrl+V, and object transfer with mesh/textures between two instances. Found and fixed pending-menu-paste plus Ctrl+V duplication; app regression proves supersession. Repeat the final fix in Windows and verify detached panel interaction |
| Reuse open window / shortcuts | focus-existing launch handler; same-file focus; serialized replacement; recent projects and manifest shortcuts | Actual Explorer launches reused installed Edge window 2164286 and tab 1261071985. Reopening the current file retained the unsaved Launch Guard Cube name; opening the original fixture displayed the replacement guard, and Cancel retained the edited project and file destination. Undo still worked afterward. OS shortcuts remain unverified |
| Native title bar | Overlay manifest, geometry visibility tracking, safe CSS bounds, draggable header, live document title | Installed overlay and actual system controls; component tests cover visibility/title |
| Screen eyedropper | Existing float/HUD color controls; preserved opacity; native activation and cancellation | Real screen selection; component tests cover conversion and cancellation |
| Installed HUD fonts | On-demand installed-font query; TTF/OTF file fallback; static SFNT and browser-decoding validation; embedded owned font, preview FontFaceSet per panel document | Browser imported actual Windows Arial, confirmed preview FontFace loaded, and undid file/assignment together. Real PCSX2/AthenaEnv run loaded the byte-identical exported Arial file, measured it independently of the built-in font and completed 120 HUD render frames. Tests cover format refusal, chosen-face import, denial fallback and collision reuse. Installed-font permission/selection still requires verification |
| Share with Windows | Manifest image share target, worker-owned incoming queue, client claims and import acknowledgement; Textures/Shared assets; prepared PNG/ZIP files for native Share with download/cancel recovery | Browser checked nonblank PNG preview and Share action. Worker/core/app tests cover offline queueing, concurrent claims, stale owner recovery, successful acknowledgement, receipt retry/undo, unsupported formats and cancellation. Actual installed Windows receive/share and launch-handler interaction remain unverified |

The goal is not complete until every requirement has current implementation and
verification evidence. Current automated result: 445 passed, zero failed, recorded in
`.verification/native-integrations-check.log`; previous folder-access baseline
was 412 tests. Browser artifacts: `.verification/hud-font-import.png` and
`.verification/scene-share.png`.

The final browser build (v2026-09-30-21-25-GMT) also passed native PNG
capture → Ctrl+V → Textures/Clipboard → Undo with one asset and no console
warnings. Evidence: `.verification/clipboard-final.png`. This smoke check does
not replace the pending Windows race/detached-panel checks.

Run `deno run -A tools/ps2fonts.js` to reproduce the actual font export check.
Evidence: `.verification/hud-font-runtime.json`; exported/source SHA-256
matches, imported Arial measures 374 × 31 versus 379 × 31 for the built-in
face at 28 pixels. The probe owns and stops only its own emulator process.

Verification handoff (2026-09-30): Windows automation repeatedly rejected Edge
state capture because it could not establish the current browser URL. The Edge
extension connection allowed the panel check above, but it does not expose the
native installation, file, permission or sharing dialogs. Child-window screenshot
and mouse dispatch also timed out; do not infer that those actions succeeded.
The search change and return from the main window were observed directly.

The same Windows blocker recurred in more than three consecutive goal turns and
the goal was marked blocked. On the resumed run, an externally installed
AthEditor window appeared and was directly observed in the Windows inventory
and Edge extension. Native state capture was rejected again for URL confidence;
do not repeat that same rejected action without new external evidence.
The editor shell successfully loaded and remained interactive with its owned
service stopped, and the service was restarted immediately after the check.
Online reload then returned the new served build (v2026-09-30-21-57-GMT), and
Help correctly omitted the installation action in the installed window.
No permission was accepted by automation. Remaining platform evidence needs a
working native-control connection or human verification of the Windows dialogs,
Start launch, file association, screen placement, picker and share flows.

Prepared a disposable project `.verification/windows-check.atheditor` using
the editor's real project constructor for the native file-dialog handoff. It
contains Sun and Main Camera with no external assets. Open it with File →
Open Project File, save a separate copy with File → Save Project As, then
verify that subsequent Save updates that same copy and that Recent Projects
reopens it. Cancelled dialogs must leave the current project unchanged.

Completed handoff: the human opened `windows-check.atheditor` and saved
`windows-check-copy.atheditor`. The copy is now deliberately nonempty: automation
added Cube with an owned OBJ and three embedded textures, saved through the
remembered Windows file handle and reopened through Recent Projects after a
page reload. The original fixture still contains only the two initial objects.
Generated-game validation of the physical saved copy found no export errors.
Native Inspector check also passed shared project editing, Ctrl+S, return from
the child window and shared Undo. The name was restored to Cube afterward and
the copy saved again. The browser controller reported its child-tab handle was
gone after Enter activated Return; current tabs and the main DOM independently
confirmed successful window closure and panel recovery. No console warnings
or errors were captured during this verification.
Do not mark the remaining matrix entries complete merely because installation
succeeds; each still needs its listed platform check.

Explorer file-association check: native Windows automation successfully read
the Explorer window, navigated to .verification and double-clicked the actual
saved copy. Edge presented “¿Quieres abrir y editar windows-check-copy.atheditor
en esta aplicación web?” with AthEditor, 127.0.0.1:8080, Open/Do not open and
an optional remembered-choice checkbox. Automation did not accept that file
access permission. The dialog remains staged for the human to press Open;
no launch delivery or existing-window reuse is claimed yet.

Completed file-handler permission handoff: the human selected Remember and
Open. Two later Explorer launches bypassed the permission dialog and reused
the same installed editor window and browser tab. The first targeted the
currently open copy while Cube had an unsaved rename to Launch Guard Cube;
the name, dirty marker, four assets and camera framing remained intact.
The second targeted the original windows-check.atheditor fixture, which
triggered the editor's actual “Replace the project you are working on?”
dialog. Cancel retained the copy and its pending edit, demonstrating file
delivery and unsaved protection. Undo restored Cube, then Save wrote the
same copy again. No browser warnings/errors were captured. Screenshots:
`.verification/native-doubleclick-unsaved.png` and
`.verification/native-doubleclick-replace-guard.png`.

Cold file launch also passed with the local service running: closed the saved
installed window and confirmed no AthEditor window remained, then double-clicked
windows-check-copy.atheditor in Explorer. Edge opened new tab 1261072068 at
/?action=open; the visible editor had Sun, Main Camera, Cube, four assets and
Save targeting windows-check-copy.atheditor. Selected and framed Cube, left
the new installed window open, and captured
`.verification/native-doubleclick-cold-launch.png`. No console warnings/errors.
This proves cold file launch; Windows Start shortcuts and cold offline launch
are separate remaining checks.

Latest small UI correction: switching File → Edit now takes one click. Build
v2026-09-30-21-38-GMT passed the four browser-controls tests and actual browser
menu switching; evidence: `.verification/menu-switch-final.png`. The full
445-test run above precedes this one-line menu change.

Implementation sources: `src/editor/import.js`, `src/core/fsaccess.js`,
`src/app.jsx`, `src/panels/recent.jsx`, `src/panels/navigator.jsx`,
`src/ui/primitives.jsx`, `src/panels/menubar.jsx`, `app/app.webmanifest`.
Regression coverage: `tests/import_test.js`, `tests/project_files_test.js`,
`tests/editor_test.js`, `tests/browser_controls_test.js`, `tests/installation_test.js`.
Panel sources: `src/core/panelwindows.js`, `src/ui/workspace.jsx`,
`src/viewport/viewport.jsx`; regressions in `tests/panel_windows_test.js`.
Clipboard/font/share sources: `src/editor/clipboard.js`, `src/editor/fonts.js`,
`src/editor/share.js`, `src/panels/fonts.jsx`, `src/panels/share.jsx`,
`app/service-worker.js`. Regressions: `tests/clipboard_test.js`,
`tests/fonts_test.js`, `tests/share_test.js`, `tests/editor_test.js`,
`tests/installation_test.js`.

API references: [File Handling](https://developer.chrome.com/docs/capabilities/web-apis/file-handling),
[Launch Handler](https://developer.chrome.com/docs/web-platform/launch-handler),
[Window Controls Overlay](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/window-controls-overlay),
[EyeDropper](https://developer.chrome.com/docs/capabilities/web-apis/eyedropper),
[Local Font Access](https://developer.chrome.com/docs/capabilities/web-apis/local-fonts),
[custom clipboard formats](https://developer.chrome.com/blog/web-custom-formats-for-the-async-clipboard-api),
[Windows sharing](https://learn.microsoft.com/en-us/microsoft-edge/progressive-web-apps/how-to/share).
