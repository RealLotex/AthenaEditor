# Physics events

Add a Rigidbody and enable **Generate Collision / Overlap Events** under **Events**.
The checkbox and presets are visible without Advanced. Enabling events also enables
scene Physics. Select **Trigger** mode for a volume that overlaps without blocking.

Choose **Script Preset**, then **On Enter** or **On Exit** and optionally **Only With**:

| Preset | Configuration | Behavior |
| --- | --- | --- |
| Play Cinematic | Sequence | Starts a scene timeline and pauses gameplay during playback. |
| Play Sound Oneshot | Audio | Plays once, with looping disabled. Another activation restarts the same stream. |
| Change Scene | Scene | Opens the selected project scene on the next frame. No named transition is needed. |
| Destroy Object | This object / Other object | Removes the collider and body, stops its script updates and sounds, hides its model and shadows, and includes its children. |
| Play Animation | Animation File, clip name, Loop Animation | Plays the clip on this object's Model. |

Both collision and overlap callbacks can activate a preset; the When setting chooses
entry or exit for both. Only With stores a stable object ID. Initial overlaps count
as entry. Picking a preset attaches a separate editable Event Script to the collider,
preserving its controller. **Edit Script** opens it in the Scripts workspace.
Sequences and non-physics scene events are documented in [Cinematics](CINEMATICS.md).
Preset modules and matching audio/animation resources are shared. Editing a shared
preset script affects every object using that file. Picking another preset or
Custom Script / No Preset detaches the old preset without deleting the file.
Disabling event generation also disables its preset behavior.

Destroy requests mark the object immediately and free native physics handles after
event dispatch. The other participant receives exit on the following step, with null
otherGeom for a destroyed collider. Shared render assets stay alive until scene reload;
the preset does not reclaim individual VRAM allocations. Scene reload explicitly frees
ODE geoms and bodies before their space and world to avoid double destruction by native
finalizers. These native cleanup calls follow the
[AthenaEnv ODE binding](https://github.com/DanielSant0s/AthenaEnv/blob/main/src/js_api/ath_ode.c).

For custom callbacks choose Custom Script / No Preset. The advanced **ctx Key** identifies the state slot receiving callbacks.
If blank, it uses the object's Script ctx Key, then the object name. Event slots
exist even without an attached script, so another scene script can configure them.
Reserved ctx keys and multiple event colliders sharing a key block export.

```js
export function init(ctx) {
    ctx.player.onCollisionEnter = function(event) {
        if (event.otherName === "Spikes") ctx.player.hp -= 1;
    };
    ctx.player.onCollisionExit = function(event) {
        // This pair has stopped touching.
    };
    ctx.goal.onTriggerEnter = function(event) {
        if (event.otherName === "Player") ctx.player.won = true;
    };
    ctx.goal.onTriggerExit = function(event) {
        if (event.otherName === "Player") ctx.player.inZone = false;
    };
}
```

Callbacks receive `selfId`, `otherId`, `otherName`, `otherGeom`, `normal` and
`position`. IDs are project object IDs and distinguish objects with equal names.
Collision normals are oriented for the receiving side (the native geom1 normal,
negated for geom2). Overlap events have null normal and position. Exit uses the
last sampled contact data. Event payloads are reused during contact; copy data
if you need to retain a snapshot.

Each observed pair emits one entry, remains quiet while touching, then emits one
exit. Reentering emits another entry. Every occupant is tracked independently.
Callbacks run after physics and overlap detection, before rendering. `update(ctx)`
runs before physics, so it reads results from the preceding step. Initial overlaps
produce entry on the first step. Scene reload starts new state; it does not synthesize
exit callbacks for the scene being unloaded. Detection is discrete per physics step;
an object that crosses a volume entirely between samples can be missed.

Solid collisions involve the normal ODE contact pipeline. Trigger pairs can include
dynamic bodies, static colliders moved by scripts and other triggers. An event is
sent to each side with reporting enabled, even if the other side has reporting off.
The receiving slot is `this` inside a regular callback function. Set a callback to
null to stop handling that event. Changing a handler during an ongoing contact
does not generate another entry.

`lastHit`, `lastHitNormal` and `lastHitPosition` retain their previous contact behavior
and remain available to existing controllers. The legacy trigger `overlapping`,
`entered` and `exited` fields still summarize dynamic occupants: entry means empty
to occupied; exit means occupied to empty; `overlapping` contains one occupant name.
Use callbacks to handle individual occupants or static/trigger overlaps.

## Work per frame

- The native broad phase and solver run once. JS geom callbacks supply collision
  identity directly, without extra collision queries.
- The release ELF reports numeric geom IDs. Its first numeric callback performs
  one guarded recovery poll before solving. Additional contact points do not poll
  again; frames without numeric contacts do not poll.
- Trigger pairs are generated once and queried once per step. Pairs without any
  event subscriber are omitted. A conservative sphere/plane filter rejects distant
  pairs and reads each participating centre once per poll. Unknown mesh/ray extents
  use the full query. A single pair avoids extra centre reads.
- Pair records and callback payloads are allocated on entry and reused until exit.
  State scales with active observed contacts; exits remove their records. A scene
  without event reporting emits no event lifecycle or trigger polling.

## Verification

`deno task check` covers contact deduplication, equal names, simultaneous occupants,
exit/reentry, symmetric normals, JS and numeric geom callbacks, bounds filtering,
live static movement and ctx key validation.

`deno run -A tools/verify-physics-events.js` exercises the generated code in PCSX2
with the bundled release ELF, including nested numeric-contact recovery, collision
entry/exit and trigger entry/exit/reentry. Its result is saved locally under
`.verification/physics-events.json`. This check does not certify real PS2 hardware.

`deno run -A tools/verify-event-presets.js` verifies Destroy Object and Change Scene
with the release ELF in PCSX2, including freed colliders in cached bounds and native
scene cleanup. Unit tests cover sound/animation callbacks and the visible preset UI.
