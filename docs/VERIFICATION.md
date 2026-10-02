# Editor fixes — September 2026

Historical verification. The current release review and evidence are in
[PRODUCTION-VERIFICATION.md](PRODUCTION-VERIFICATION.md).

The standalone `AthenaEditor.html` is rebuilt from `src/`. The fixes below were completed before the later request for editor tools. See [EDITOR-WORKFLOWS.md](EDITOR-WORKFLOWS.md) for those additions; no dependencies were added.

## Corrections

- Shadows use one direct world matrix shared by the generator and viewport. The old
  angle and magnification calibration tables, quaternion compensation and UV flips
  were removed. Moving a caster no longer rotates its translation. Ground height,
  light offset and the final geometry rebuild order are preserved.
- Object transforms follow the engine's default VU0 backend: scale, rotate, translate.
  The viewport uses the same matrices. Rotation handles compose rotations around the
  displayed local/world axes. Decomposition reports actual shear.
- Shadow and collider helpers use world coordinates, avoiding a second parent transform
  or scale. Hidden ancestors suppress picking and selection helpers. Empty-object
  markers can be selected. Superseded mesh loads release their geometry.
- Committing a drag seals its undo gesture without adding an empty undo step. Duplicate
  preserves the parent, copies a selected subtree once, gives its descendants unique
  names, and updates shadow references within the copied set. Paste and prefab instances
  use the same copy routine. Copying a nested object preserves its world placement.
- Renaming a uniquely named caster/light updates its shadow references. Deleting a scene
  repairs the start scene and removes inbound transitions; undo restores the complete edit.
- Saving an earlier snapshot no longer marks edits made while saving as saved.
- The viewport respects front-face culling and disabled texture mapping. HUD export uses
  the configured font directory and clamps opacity to the PS2 range used by the preview.
  The HUD toolbar stays above the canvas in short panels.
- Raycast shadows without an exported collider report an error and avoid referring to
  an ODE space that was never created.

## Verification

`deno task check` builds the standalone editor and runs **344 tests, all passing**.
The suite covers generation, migration, assets, persistence, file operations, templates,
physics and shadow calculations. New regressions exercise actual editor command callbacks
and actual Three.js geometry; the editor callback harness does not simulate React effects.
The full output is in [`../.verification/check.log`](../.verification/check.log).

Browser checks covered selecting and editing objects, undo/redo, duplicate, creating and
editing HUD elements, undo/redo in HUD, recovery after reopening, and generated export
content. The final browser check had no console warnings/errors. A save action cleared
the unsaved indicator, but the embedded browser did not expose the download event; saved
JSON and edits made during saving are separately verified by the command regression test.

![HUD toolbar and edited panel](../.verification/editor-hud.png)

PCSX2 ran the exported runtime fixtures. All four controller templates passed gravity,
movement and camera checks: first person, third person, side scroller and top down.
Their probe logs and results are in `../.verification/<template>/`.

The moved-caster/diagonal-light case `az45movedX` and the opposite quadrant `az135` were
also inspected in PCSX2; both completed their 150-frame probes. Automated geometry tests
cover corners across light azimuths and elevations.

![Moved caster with diagonal light](../.verification/shadow-az45movedX.jpg)

These runtime checks used an emulator. Real PS2 hardware, the full historical screenshot
measurement matrix, and every combination of animation, sound, draping and scene transitions
have not been exercised on hardware. Existing automated coverage is not a hardware guarantee.
