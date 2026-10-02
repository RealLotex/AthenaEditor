# Terrain editor

Choose **Add → Terrain**, then **Create terrain**. The default is a 32 × 32 grid.
To reopen a terrain, select it and choose **Edit terrain** in the Inspector.
The Terrain panel can be docked, floated and moved like the other workspaces.

- **Cliffs:** choose a height and drag to paint terraces. Shift erases to ground level.
- **Hills:** drag to raise soft hills; Shift lowers them. Smooth and Flatten affect hills without erasing cliff levels.
- **Paint:** choose Grass, Dirt or Stone and drag over the ground.
- **Navigation:** Alt + drag orbits; the wheel zooms. Focus the canvas and use arrow keys and Enter for precise tile painting.

Settings contains brush strength, cliff softness, tile size, level height and the four texture slots. Custom textures are packed into a single 256 × 256 atlas. The built-in grass, dirt, stone and mossy rock textures are original assets; they are not the unreleased reference addon's textures.

The editing view uses an orthographic camera. Terraces have connected grass caps and sloping rocky sides, including isolated tiles and inside corners. A scene skybox works in this view too.

Each stroke is one undo step. Height, hill and paint data are saved with the project. Mesh and atlas resources live under **Generated/Terrain** and are updated in place. Duplicated terrains share resources until an edit requires a separate copy. Older generated geometry upgrades when the project opens, preserving authored terrain data and scene skybox settings.

The game export contains a normal OBJ mesh and PNG atlas. A new terrain includes a static mesh collider and enables scene physics. Editing baked terrain clears the old lighting bake so it can be baked again. Grids are limited to 64 × 64 tiles; larger grids and many separate terrains increase mesh and collision costs on PS2. Automated export checks do not establish emulator performance.
