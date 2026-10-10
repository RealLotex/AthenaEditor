# Timeline and cinematic events

Particles clips can select an emitter created through Add → Particle effects. The clip
restarts its existing fixed pool, controls its playback interval and samples the same
motion while scrubbing. Clip exit restores the emitter's previous time/playback. Configure
the effect in Properties; overlapping clips for the same emitter are rejected. Ordinary
model targets retain pooled mesh instances and their clip-specific count/speed/size.

Use **+** beside the Scene and Game tabs to open **Timeline**, **Terrain** or other
editor panels. Timeline is also available from **View → Timeline / Cinematics**.
Create a sequence, name it, and choose **Start event**. Add a channel, press its
**+** to append a clip, or double-click an empty part of its lane. Drag the clip
title to change its start time; drag either edge to change its duration. Timing
snaps to 0.1 seconds. The clip settings also accept exact values. Edits support
Undo/Redo, and sequences are saved inside their scene.

Dialogue is written directly in the channel's clip. Speaker and font size are
available below the timeline. Portrait and Text window channels provide the
cinematic's temporary UI; these elements disappear at their clip boundaries.
Their coordinates use a 640 × 448 canvas. Separate channels allow simultaneous
dialogue, portraits and windows.

| Channel | Clip controls |
| --- | --- |
| Dialogue | Text, speaker, font size, rectangle, fade in/out |
| Portrait | Imported texture, rectangle, fade in/out |
| Text window | Color, opacity, rectangle, fade in/out |
| SFX / Voice | Imported sound, looping |
| Screen fade | Color, opacity, keyframes and curve |
| Camera shot | Position/look-target keys or endpoints, curve, incoming transition |
| Transform | Model, position/rotation/scale keys or endpoints and curve |
| Character animation | Skinned model, animation, looping, weight and blend in/out |
| Mesh visibility | Model, visibility during the clip |
| Particles | Source model, 1–64 pooled mesh particles, speed, size |

Transform, camera and fade clips offer Linear, Ease in/out, Ease in, Ease out,
Hold/step and custom Bezier curves. **Enable keyframes** creates endpoint keys;
add intermediate keys and edit their times and values below the timeline. A key's
curve controls the segment leading to the next key. Diamonds show key positions.
Resizing scales key times and fade/blend durations. **Transition in** blends a
camera from the previous contiguous shot's endpoint, or the scene camera after a gap.

Positions and rotations use the
exported world transform; rotation values are radians. Controlled properties are
restored when their clips end or playback stops. Native character animation returns
to the model's configured default animation, or stops if none is configured.

Animation clips may overlap, shown in separate rows of the same channel so each
remains selectable. **Weight** and **Blend in/out** control their contribution;
combined weights above one are normalized. Any remaining contribution comes from
the captured pose. Rotation blending follows the shortest quaternion arc.
Mixing requires self-contained GLB/glTF with one skin, matching joint names/order,
TRS bones and non-sparse float animation accessors. Linear, step and cubic spline
source keys are supported. Incompatible data is reported before preview/export.
Pose buffers are allocated when clips enter and reused during playback.

**Duplicate clip** creates an independent copy after the channel's last clip.
**Save reusable sequence** stores a project-wide preset. **Sequence library…**
lets another scene choose compatible objects before adding its own copy. Copies
start as Manual / script and receive new IDs and distinct names.

## Starting and finishing a sequence

Sequences can start when the scene starts, when a scene timer finishes, before a
scene ends, on collision/overlap entry or exit, or through a custom event. Collider
selection enables its events and scene physics. **Only with** filters the other
collider by object ID. A Rigidbody can also use the visible **Play Cinematic** preset
and select its sequence alongside the existing event script presets.

Only one sequence controls the scene at a time. A different event can replace the
current sequence; an identical event does not restart the same running sequence.
Overlapping automatic event bindings are rejected. Simultaneous clips cannot write
the same camera or model property. Animation blending is the overlap exception;
other channels reject overlaps. Visual [event chains](EVENT-FLOWS.md) can wait for
a manual sequence and then perform other actions.

Playback suspends controller and AI update functions, the default camera controls,
position shortcuts and physics. Input is still polled. The scene event clock and
event callbacks continue running. On completion, gameplay resumes. Scene changes
wait for the **Before scene ends** sequence to finish before releasing the scene.
Queue transitions through `ctx.goToScene(...)` to use this lifecycle.

Scripts receive the scene event bus even when the scene contains no sequences:

```js
export function init(ctx) {
    ctx.events.on("sceneStart", () => {
        ctx.events.startTimer("doorReady", 3);
    });
    ctx.events.on("cinematicFinished", event => {
        // event.sequenceId identifies the completed sequence.
    });
}
// A sequence with Custom event "doorReady" starts when that timer finishes.
// Other script callbacks can use ctx.events.emit("doorReady", payload).
```

`ctx.events.on(name, callback)` returns the registered callback;
`ctx.events.off(name, callback)` removes it. `startTimer(name, seconds)` replaces
a timer of the same name; `cancelTimer(name)` cancels it. Timers fire once and
count scene time, including time spent in a cinematic. Collision events expose
the same `selfId` and `otherId` payload as the physics callbacks.

Manual playback uses `ctx.cinematics.play(sequenceId)`. `stop()`, `pause(true/false)`
and `seek(seconds)` are also available. Seeking pauses playback and stays silent;
it does not dispatch completion. IDs remain stable when a sequence is renamed.

## Game preview

Game has **Scene camera** and **Timeline** views. Scene camera uses the active
exported camera, including its parent transform, horizontal field of view, scene
lights and sky. Select **Active camera** in Game or Scene settings to choose another
camera. The same choice is exported; scripts attached to other cameras are inactive
so their controllers cannot overwrite the view. Older scenes use their first
exported camera until a camera is selected explicitly.

**Preview in Game** opens a separate Game viewport with the scene camera, cinematic
UI and audio. Play/Pause, Stop, Restart and the position slider let you inspect the
sequence. Preview uses an isolated scene copy and never alters saved transforms or
project history. Channels with missing assets or invalid settings explain the
problem before playback.
Preview validates the selected sequence. An unfinished sequence elsewhere in the
scene does not prevent viewing the camera or previewing a valid sequence.
Preview stops when its viewport is hidden or the scene is edited; hidden previews
do not allocate or rebuild render resources while editing the timeline.

Game previews the cinematic in the browser; native game scripts and ODE physics run
through the header's **Play** button in PCSX2. Browser lighting, fonts and rendering can differ from
the console. Native SFX and Voice use AthenaEnv's single streaming player, so these
clips must be sequential. The font renderer supports one-/two-byte UTF-8 text,
including Spanish accents and ñ; common typographic punctuation is converted to
ASCII on export. Other unsupported glyphs block export rather than hanging the
player. Imported animations must use a compatible skeleton and self-contained assets.

## Runtime cost and verification

The exporter sorts clip boundaries once. Playback visits due boundaries and active
clips, rather than scanning every sequence per frame. Portraits, sounds and animation
collections share loaded resources. Dialogue wrapping is prepared during export.
Particle transforms are allocated once and reuse the source mesh's native draw handle
without additional uploads or native objects; the draw pass restores that handle.

`deno task check` covers playback, seek/pause/cancellation, events and timers, validation,
the emitted runtime, resource sharing and editor undo/redo. Run
`deno run -A tools/verify-cinematics.js` to check scene-start/custom/timer/exit sequences,
camera/transform restoration, particles, dialogue, gameplay suspension and the
destination scene in PCSX2 using the bundled ELF. Results are recorded locally in
`.verification/cinematics.json`. This is emulator verification, not a real-hardware claim.
`deno run -A tools/verify-cinematic-media.js` additionally verifies real voice audio,
skinned character animation and its default restoration, a nested active camera,
and the collision Sound Oneshot / Play Animation presets. Its record is
`.verification/cinematic-media.json`.
