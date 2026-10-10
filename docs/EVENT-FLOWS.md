# Visual events

Open **+ → Events** beside Scene and Game. Choose **Scene** or an object in
**Source**, then add an event. Objects also expose rules in their visible
**Events** component. Rules support Undo/Redo and are saved with the project.

Choose **When**, add optional conditions under **If all conditions match**, and
add actions under **Then, in this order**. Object, cinematic and scene references
use selectors. Missing targets, incompatible assets and invalid values appear
in Events and Problems and prevent export.

For a player entering a volume:

1. Give the volume a Trigger Rigidbody and enable **Generate Collision / Overlap Events**.
2. Choose **Overlap — enter**, that collider and the player under **Only with**.
3. Add **Play cinematic**, select a sequence with **Manual / script** as its start
   event, and leave **Wait until cinematic finishes** checked.
4. Add **Move object / open door** with the door, its destination world position,
   duration and interpolation curve.
5. Add **Enable / disable behaviours**, selecting the enemy. Its Events component
   can start with **Behaviours enabled** unchecked.

**Once** makes a rule fire once per scene entry. Running rules ignore repeated
triggers. Every condition must match when the event arrives. Scene variables have
numeric initial values; conditions can compare them and actions can change them.
Variables restart when the scene is loaded again.

| Event | Selection |
| --- | --- |
| Scene starts | Fires after behaviour initialization |
| Timer finishes | Seconds since scene entry, including cinematics; fires once |
| Before scene ends | Starts after a scene change is queued |
| Collision / overlap enter or exit | Collider and optional other collider |
| Custom event | Event name |
| Cinematic finishes | Optional sequence filter |

Actions include cinematic playback, waits, movement, behaviour enablement,
visibility, destruction, sound, character animation, variables, custom events
and scene changes. Reorder them with the arrows; duplicate rules to reuse a setup.
Movement waits for its duration and keeps its final position. It moves descendants
and their colliders together. Infinite planes cannot move. Timeline transforms,
in contrast, restore their captured values when their clips finish.

A busy cinematic queues the next requested sequence. Waiting chains fail clearly
if their cinematic is interrupted. Scene changes wait for active cinematics and
chains, including **Before scene ends** rules, before unloading. Active rules
ignore themselves; excessive custom-event recursion fails with a clear error.

Behaviour enablement controls script updates and dynamic-body simulation; it is
independent of visibility and lifetime. Children inherit a disabled parent's
state. Existing colliders remain present. Scripts initialize once even if their
owner starts disabled. A shared script module updates once when any owner is
enabled; use separate modules for independently controlled behaviours, or check
the individual objects with `ctx.isGameplayEnabled(objectId)`.

Scripts can emit custom events through `ctx.events.emit(name, payload)`, access
numeric values through `ctx.variables`, and use `ctx.setGameplayEnabled(id, enabled)`.
Collision payloads contain `selfId` and `otherId`. The original editable Rigidbody
script presets remain available alongside visual rules.

Rules are indexed by event type once. Frames update only active waits/movements;
no graph traversal runs each frame. Native audio uses one streaming channel:
starting another sound replaces the current stream.

`tools/verify-event-flows.js` verifies overlap filtering, cinematic suspension,
door/collider movement, enemy activation and a delayed scene exit in PCSX2.
Browser Game previews cinematics; native rules and gameplay run through **Play**.
See [Cinematics](CINEMATICS.md) and [Physics events](PHYSICS-EVENTS.md).
