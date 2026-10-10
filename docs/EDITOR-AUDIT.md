# Editor audit — October 10, 2026

Color dragging now applies the latest preview at most every 50 ms and flushes the exact final color on completion. One gesture creates one undo step. The native picker keeps its own input state, so React updates do not reopen or reset it. Alpha values and screen sampling remain available.

Project edits share unchanged immutable branches, including embedded assets and history snapshots. Appearance/HUD changes update the Game mirror in place rather than rebuilding meshes and restarting playback. The build-state projection owns its draft and cannot change project or undo data.

## Measured color-edit preparation

The supplied `my_game.atheditor` was read without changing it. After five warmups, 40 trials on the same machine compared the old clone plus two full JSON comparisons with draft cloning and branch reuse:

| Preparation | Median | 95th percentile |
| --- | ---: | ---: |
| Previous | 29.77 ms | 33.66 ms |
| Updated | 5.22 ms | 6.31 ms |

Median preparation saves **24.55 ms (82.5%) per edit**. This measures project-edit preparation, not total rendering time, GPU work or an FPS guarantee. Evidence: `.verification/color-edit-profile.json`.

## Docking, languages and graphical resources

Overflowing tab groups have previous/next controls with disabled states at their limits. Selecting a hidden tab reveals it, while unrelated renders preserve manual carousel scrolling. Language selection is immediately to the right of Export Game; project settings stay available through the panel menu. Fixed editor text and enums translate at render time between English, Spanish and Portuguese, preserving authored names, filenames, scripts and dialogue.

Inactive Scene/Game tabs release their renderers and GPU resources. Reopening Scene restores its camera. Render buffers are capped at two million pixels and 1.5 device-pixel ratio; shared geometries, materials and texture slots are released once. Lost graphics contexts show a Restore view action without discarding the project. These changes reduce retained GPU memory and recover context loss; they cannot recover a browser process terminated by the operating system or guarantee that every blank-view cause is memory-related.

## Fifteen additional usability improvements

1. Numeric fields accept a decimal comma and retain the previous value for empty, partial or invalid drafts.
2. Enter commits once; Escape cancels numeric/text edits without accidentally committing through blur.
3. Duplicate panel commands are hidden; existing saved shortcuts migrate to their canonical command, with explicit overrides taking precedence.
4. Object/component search also recognizes translated component names and can be cleared without leaving a hidden filter.
5. The object tree supports Up/Down/Home/End navigation and Shift selection.
6. Revealing an object expands its collapsed ancestors and scrolls it into view.
7. Framing uses visible geometry, so hidden distant meshes cannot make the scene appear tiny.
8. Common Transform, Light, Camera and Rigidbody components have an undoable reset action.
9. Timeline clips support duplicate, delete, nudge and Escape, with keyboard focus kept on the selected clip.
10. Timeline snapping offers free movement or 0.01/0.1/1-second steps; Alt bypasses drag snapping.
11. Fit sequence adjusts the zoom, selected clips are revealed, and long sequences keep a bounded number of ruler ticks.
12. New clips use the selected actor's world pose/current camera and preselect the sound when there is exactly one suitable asset.
13. Assets can be filtered to references in the active scene; search/count and reveal remain coherent with the filter.
14. Problems supports text search and keyboard reveal of the affected object in its owning scene.
15. Event-variable renaming updates every condition/action, including hidden objects and disabled rules. Invalid/colliding names fail before mutation; used variables cannot be deleted accidentally.

Additional cache correction: replacing an asset with different bytes of the same length now invalidates its preview, while bounds annotations do not.

## Native startup crash

The supplied project hit a bundled native JavaScript compiler defect: its 108-value baked RGB array literal became 106 entries. The count guard correctly rejected it. Export now parses baked color data from JSON before filling the native RGBA buffer, preserving its size and alpha lanes.

The original project reached frame **1200** in PCSX2 after the fix, using **2,051,072 bytes VRAM**. A separate 36-corner regression verified every native color lane at frame 120. Evidence: `.verification/current-crash-fixed.log`, `.verification/current-crash-color-regression.log`; reusable probe: `tools/verify-vertex-colors.js`. These are emulator checks, not physical PS2 validation. Re-export the game with the rebuilt editor to include the runtime fix.

## Verification

`deno task check`: **689 passed, 0 failed**, including actual App undo/redo, invalid input cancellation, color-gesture coalescing, immutable branches, Game appearance reuse, cache invalidation and resource cleanup. Browser checks covered the color's final value and one-step undo, release of the hidden Scene canvas, Timeline duplicate/delete, carousel limits, and live language switching. No console errors/warnings were recorded in the final browser check. Browser checks used an isolated test origin and did not overwrite the supplied project.

The final `AthenaEditor.html` build is also copied to `index.html`.
