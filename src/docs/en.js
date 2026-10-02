// Help pages — English. Structure is mirrored by es.js and pt.js.
// Block kinds: {h} heading, {p} paragraph, {ul} bullets, {code} key into
// DOC_CODE, {note} callout, {kv} label/value rows.

const DOCS_EN = {
  interface: {
    title: "Interface",
    blocks: [
      { p: "Four docks around a viewport. Every panel can be resized by dragging its edge, and the layout is remembered." },
      { kv: [
        ["Outliner", "The scene tree. Search, rename by double-click, drag to reparent. A red or amber mark means that object has problems."],
        ["Viewport", "3D layout. Left drag orbits, right drag pans, wheel zooms."],
        ["Inspector", "Components on the selected object. Also holds the Scene and Project tabs."],
        ["Project panel", "Assets and prefabs, plus the Problems list."],
      ] },
      { h: "Keyboard" },
      { kv: [
        ["Ctrl K", "Command palette — every action in the editor is in here"],
        ["Ctrl Z / Ctrl Shift Z", "Undo / redo. One drag is one step."],
        ["Ctrl S / Ctrl E", "Save project / Export"],
        ["Ctrl Shift S", "Save project as — choose another file"],
        ["Ctrl O / Ctrl Shift O", "Open project file / Open project folder"],
        ["Ctrl D, Ctrl C, Ctrl V", "Duplicate, copy, paste"],
        ["W / E / R", "Move, rotate, scale"],
        ["X", "World or local space"],
        ["G", "Grid snapping"],
        ["F / A", "Frame selection / frame everything"],
        ["H", "Hide or show"],
        ["1 / 2", "Viewport / HUD editor"],
        ["Delete", "Delete selection"],
      ] },
      { note: "If you cannot find something, press Ctrl K and type. The palette, the menus and the shortcuts all read from one list, so nothing is reachable only one way." },
    ],
  },

  workflow: {
    title: "Getting started",
    blocks: [
      { h: "Create a project" },
      { p: "File → New Project. Choose a name and template, then Create project. Meshes and scripts are included automatically." },
      { h: "Build the scene" },
      { p: "Use Add for primitives and scene objects. Select an object to edit its properties. Advanced controls stay folded until needed." },
      { h: "Edit assets" },
      { p: "UV edits OBJ texture coordinates. Scripts stores code changes in the project automatically. Tools contains texture optimization, atlas creation and static lighting baking." },
      { h: "Save and export" },
      { p: "Ctrl S saves the project, including generated assets and edited scripts. Export downloads one ZIP containing the game folder. The Problems panel identifies issues before export." },
      { h: "Use existing assets or a console folder" },
      { p: "Open Existing Folder is separate from creating a project. Prepare Console Folder is inside File → More options; choose the console player once and the normal folder layout is prepared automatically." },
    ],
  },

  projectScene: {
    title: "Project and Scene",
    blocks: [
      { p: "These are two different things, and the split decides where a setting belongs." },
      { kv: [
        ["Project", "The shippable program. Video mode, framebuffer format, alpha test, asset folders, prefabs, and the list of scenes."],
        ["Scene", "One loadable level. Its objects, its HUD, its clear colour, its camera defaults, its physics world, and where it can lead."],
      ] },
      { p: "The test: could two levels of the same game sensibly disagree about it? Gravity, yes — that is per scene. Framebuffer format, no — a PS2 program calls Screen.setMode exactly once, so it lives on the project." },
      { h: "Start scene" },
      { p: "The Project tab marks which scene the exported program boots. That is separate from which scene you have open in the editor." },
      { note: "Export currently writes the scene you are editing. Writing every scene, with working transitions between them, is planned — see docs/ROADMAP.md." },
      { h: "Upgraded projects" },
      { p: "Projects saved before this split carried render settings on every scene. Loading one lifts them onto the project and tells you about any scene that disagreed, naming the value that won." },
    ],
  },

  components: {
    title: "Components",
    blocks: [
      { p: "An object does nothing on its own. Add components to give it behaviour." },
      { kv: [
        ["Transform", "Position, rotation, scale. Always present. Rotation is Euler degrees here, radians in the export."],
        ["Model", "A mesh plus its render settings. Objects sharing a mesh and settings share one RenderData automatically."],
        ["Animator", "A GLTF animation set. Needs a Model. Scripts can switch clips at runtime."],
        ["Light", "A directional light. The direction points toward the light, like a vector to the sun. Four maximum."],
        ["Camera", "FOV and look-at target. The first one found is exported."],
        ["Sound", "A streamed audio track."],
        ["Script", "A behaviour module with init(ctx) and update(ctx, pad)."],
        ["Rigidbody", "An ODE collider, and optionally a simulated body."],
        ["Shadow", "A projected shadow decal."],
      ] },
      { h: "Rigidbody modes" },
      { kv: [
        ["Static", "Never moves. Other bodies collide with it. No simulated body is created."],
        ["Dynamic", "Falls, tumbles, is pushed by contacts. Physics drives its transform."],
        ["Trigger", "Reports overlap to your script but never blocks anything."],
      ] },
      { note: "Freeze Rotation on a dynamic body keeps it upright and hands the visual rotation to your script. That is what you want for a character and wrong for a barrel." },
    ],
  },

  scripting: {
    title: "Scripts",
    blocks: [
      { p: "Create or edit behaviours in the Scripts workspace, then use Attach to connect a script to the selected object. Code changes are stored in the project. A behaviour module exports init(ctx) and update(ctx, pad)." },
      { code: "scriptSkeleton" },
      { h: "ctx" },
      { p: "Every script receives the same ctx object. It carries live engine handles plus one free state slot per scripted object, named after the object (or the ctx Key you set)." },
      { code: "ctxShape" },
      { p: "Open Export to see exactly what ctx looks like for the scene you are working on — it is generated from the scene, so it is never out of date." },
      { h: "Moving things" },
      { code: "movePattern" },
      { h: "Input" },
      { code: "padInput" },
      { note: "pad.ly is positive when the stick is pushed down. Negate it if you want forward to be positive." },
      { h: "Animation" },
      { code: "animation" },
      { h: "Lights and shadows at runtime" },
      { code: "lights" },
      { code: "shadowRuntime" },
    ],
  },

  physics: {
    title: "Physics and collisions",
    blocks: [
      { p: "Turn on Physics in the Scene tab, then give objects a Rigidbody. Nothing is exported until the scene's physics is enabled." },
      { h: "Reacting to contacts" },
      { p: "Set Report Hits on a Rigidbody and give it a ctx Key. The generated contact callback then fills in what it touched." },
      { code: "collision" },
      { h: "Triggers" },
      { code: "trigger" },
      { h: "Jumping" },
      { code: "jump" },
      { h: "What the generated code looks like" },
      { code: "odeOrder" },
      { h: "Limits worth knowing" },
      { ul: [
        "Friction and bounce are fixed by the engine at mu 0.5 and bounce 0.1. There is no binding to change them per body, so the editor does not pretend to offer one.",
        "Dynamic bodies start axis-aligned. The engine's setRotation writes 9 of the 12 floats a rotation matrix needs, so the editor never emits an initial rotation for one.",
        "Mesh colliders ignore object scale — the trimesh is built from the raw mesh. Use a box or sphere on anything scaled.",
        "A trigger cannot live in the stepped space, because the solver always builds contact joints there. The editor creates trigger colliders outside it and polls them instead.",
      ] },
    ],
  },

  shadows: {
    title: "Shadows",
    blocks: [
      { p: "A Shadow component projects a decal onto the ground across a tesselated grid. Two sources:" },
      { kv: [
        ["Blob texture", "A static image. Nearly free. Good for most things."],
        ["Live silhouette", "The caster is rendered from the light into an offscreen buffer each frame and projected onto the ground. Costs one extra pass and locks VRAM."],
      ] },
      { h: "What the light direction does" },
      { p: "It aims the silhouette camera, turns the decal onto the light's azimuth, and decides how far the shadow falls from its caster. A shadow does not sit under a character unless the sun is directly overhead — it slides down the light onto the ground, exactly as far as the character's height over the tangent of the light's elevation." },
      { p: "It also stretches the shadow. A directional shadow lengthens as one over the sine of the elevation, which is why shadows run away at sunset. Max Stretch caps that by raising the light for the shadow only; setting it to 1 pins the light overhead and gives a plain blob under the caster." },
      { note: "Getting this out of the engine takes some work: a projector's texture axes come from its grid indices, its rotation property writes a quaternion whose w is stuck at 1 so it rotates and scales at once, and its position is rotated along with the grid. The derivation is in src/core/shadowmath.js." },
      { h: "Size" },
      { p: "The decal maps the whole texture onto its extent, so the extent has to match what the light camera saw or the shadow is the wrong size — that is one setting, not two, and the generator derives the camera distance from the extent. Only the width across the light is yours to set; the length along it is the projection's own foreshortening. Fit To Caster takes the width from the caster's bounding sphere and works out the rest, which is usually all you want." },
      { h: "Draping over geometry" },
      { p: "Turn on Drape On Geometry and each grid node is dropped onto real collision geometry with a raycast, so the shadow bends over terrain. It needs scene physics enabled — there is no collision space to cast into otherwise." },
      { h: "VRAM" },
      { p: "The PS2 has 4 MB of video memory and a locked render target never returns it. 128x128 at 32bpp is 64 KB; 256x256 is 256 KB. The Problems panel warns past 1 MB." },
      { h: "Call order" },
      { p: "The generator handles this, but the output makes more sense once you know why it is ordered the way it is." },
      { code: "shadowOrder" },
      { note: "setColor must run before the last call that rebuilds geometry, because vertex colours are baked during the rebuild. Assigning position must come after it, or the transform is applied twice." },
    ],
  },

  hud: {
    title: "HUD",
    blocks: [
      { p: "The HUD tab lays out 2D elements at PS2 resolution — 640x448. Pixel positions here are the pixel positions the engine draws at. Drag to move, drag the corner to resize." },
      { p: "The dashed rectangle is the safe area. CRTs overscan, so anything outside it may be cut off on real hardware." },
      { h: "Element types" },
      { kv: [
        ["Text", "A string in a font"],
        ["Panel", "A filled rectangle"],
        ["Button", "A panel with a label — hit testing is up to your script"],
        ["ProgressBar", "A fill and a track, for health and loading"],
        ["Image", "A texture"],
      ] },
      { h: "Driving it from a script" },
      { code: "hudUpdate" },
      { note: "Alpha on the PS2 runs 0 to 128, where 128 is fully opaque. The colour pickers already work in that range." },
    ],
  },

  templates: {
    title: "Templates",
    blocks: [
      { p: "File ▸ New Project offers a starting point instead of an empty scene." },
      { h: "Top Down" },
      { p: "A character that moves on the ground plane and turns to face where it is going, with a camera looking down from behind. It ships its controller inside the project, so there is no file to copy." },
      { p: "It refers to player.obj and ground.obj by convention. If they are not in your asset folder the Problems panel says so — assign your own meshes in the Inspector." },
      { code: "topdownMove" },
      { code: "topdownCamera" },
      { h: "Why it is set up that way" },
      { ul: [
        "The player's Rigidbody has Freeze Rotation on. Without it the physics sync overwrites the visual rotation every frame and the character rolls like a marble.",
        "The scene's Orbit Rig is off. The built-in left-stick camera and the controller would otherwise both write the camera every frame.",
        "Forward is -Z, and pad.ly is negated, because the stick reports positive when pushed down.",
      ] },
      { h: "First Person" },
      { p: "Left stick walks, right stick looks, ✕ jumps. The player is a dynamic sphere with no Model at all: in first person a mesh would only be clipped by the near plane, so the collider is something you look out of rather than at. The near plane opens to 0.4 so you can walk up to a crate and still see it." },
      { h: "Third Person" },
      { p: "The right stick orbits the camera and the left stick moves relative to where it looks, so \"up\" always means away from the camera. Two angles are kept apart deliberately: the camera's, which movement is resolved against, and the model's, which only chases the direction of travel. Sharing one would make the character moonwalk whenever the camera swung." },
      { h: "Side Scroller" },
      { p: "Momentum movement: the left stick or D-pad accelerates, coasts and brakes before reversing. Hold R1 for a sprint that builds speed in stages. ✕ jumps; hold for extra height. ↓ while moving rolls; ↓ + ✕ at rest charges a launch that fires when ↓ is released. □ performs a shoulder dash, also once in the air; press ↓ in the air for a ground pound. Buffered jumps and coyote time forgive small timing errors. The camera looks ahead along travel. ctx.player exposes motion, speedTier and events for the project's own model and animation clips." },
      { p: "Runs along X and jumps between three platforms, with the camera fixed out on +Z. It is +Z and not -Z because that is the side from which world +X reads as screen right — mounting the camera on the other side mirrors every control. Depth is pinned by the controller: the Z velocity is zeroed every frame and any drift a corner contact squeezed out is snapped back, because this binding has no 2D joint." },
      { h: "Mass is not kilograms" },
      { p: "Every character in these templates has a mass of 5, not a person's 70. The engine fixes contact softness and exposes no way to stiffen it, so penetration grows with the load: measured on PCSX2, a 0.5 sphere sinks about 2 mm per unit of mass. At 60 the character stands 12 cm inside the floor and jitters; at 200 it never settles at all. The Problems panel warns above 20." },
    ],
  },

  engineNotes: {
    title: "Engine notes",
    blocks: [
      { p: "Behaviour verified against the AthenaEnv C sources. The generator already accounts for all of it — this is here so the exported code makes sense when you read it, and so you do not undo a workaround by mistake." },
      { kv: [
        ["Rotation is Euler radians", "Applied Z, then Y, then X. Only skinned bones and shadow projectors use quaternions."],
        ["Alpha is 0 to 128", "Not 0 to 255. 128 means fully opaque."],
        ["Light and shadow colours are floats", "0.0 to 1.0, unlike Color.new which takes bytes."],
        ["Four lights", "Extra Light components are created but never applied."],
        ["Contact surface parameters are fixed", "mu 0.5, bounce 0.1. No binding exists."],
        ["getRotation returns 9 of 12 floats", "A dMatrix3 has a padding lane. The missing row is rebuilt from a cross product."],
        ["Trimesh colliders ignore scale", "Built from the mesh's own vertex buffer."],
        ["Locked render targets never come back", "VRAM is 4 MB total."],
      ] },
      { note: "The viewport approximates layout only. It does not emulate the GS or the VU pipeline, so lighting, fill rate and clipping will differ from hardware. Never treat it as a preview of the final image." },
    ],
  },
};
