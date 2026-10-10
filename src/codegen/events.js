// Physics event lifecycle — shared pair tracking and deferred callback dispatch.
// Detection and solving stay in physics.js; scripts attach callbacks to ctx slots.

/** Pair lifetime is independent of contact count and shared by solids/triggers. */
function emitPhysicsEvents(e, ir) {
  const targets = ir.physics.bodies.filter(b => b.events);
  if (!targets.length) return;
  e.w(`const _odeEventStates = new Map();`);
  for (const b of targets) {
    e.w(`_odeEventStates.set(${b.geomVN}._id, { geom: ${b.geomVN}, collisions: new Map(), overlaps: new Map() });`);
  }
  e.w(`let _odeEventFrame = 0;`);
  e.w(...ODE_EVENTS_RUNTIME.split("\n"));
  e.nl();
}

const ODE_EVENTS_RUNTIME = `function _odeTouch(a, d, contact, overlap, flip) {
    if (a._destroyed || d._destroyed) return;
    const state = _odeEventStates.get(a._id);
    if (!state) return;
    const pairs = overlap ? state.overlaps : state.collisions;
    let pair = pairs.get(d._id);
    if (!pair) {
        pair = { seen: 0, active: false, legacy: !!d._dynamic, event: {
            selfId: a._id, otherId: d._id, otherName: d._name,
            otherGeom: d, normal: contact ? [0, 0, 0] : null, position: null
        } };
        pairs.set(d._id, pair);
    }
    pair.seen = _odeEventFrame;
    if (contact) {
        const normal = pair.event.normal, source = contact.normal, sign = flip ? -1 : 1;
        normal[0] = source[0] * sign; normal[1] = source[1] * sign; normal[2] = source[2] * sign;
        pair.event.position = contact.position;
    }
}
function _odeFinishPairs(state, pairs, enter, exit) {
    if (state.geom._destroyed) { pairs.clear(); return; }
    const slot = ctx[state.geom._ctxKey];
    for (const [id, pair] of pairs) {
        if (state.geom._destroyed) { pairs.clear(); return; }
        if (pair.seen === _odeEventFrame) {
            if (!pair.active) {
                pair.active = true;
                if (slot && typeof slot[enter] === "function") slot[enter](pair.event);
                if (ctx.events) ctx.events.emit(enter, pair.event);
            }
        } else {
            pairs.delete(id);
            if (pair.event.otherGeom && pair.event.otherGeom._destroyed) pair.event.otherGeom = null;
            if (pair.active && slot && typeof slot[exit] === "function") slot[exit](pair.event);
            if (pair.active && ctx.events) ctx.events.emit(exit, pair.event);
        }
    }
}
function _odeFinishEvents() {
    for (const state of _odeEventStates.values()) {
        const slot = ctx[state.geom._ctxKey];
        // Keep the original trigger flags: aggregate dynamic occupants only.
        if (slot && state.geom._trigger) {
            const was = state.overlapping || null;
            state.overlapping = null;
            for (const pair of state.overlaps.values()) {
                if (pair.legacy && pair.seen === _odeEventFrame) { state.overlapping = pair.event.otherName; break; }
            }
            slot.overlapping = state.overlapping;
            slot.entered = state.overlapping !== null && was === null;
            slot.exited = state.overlapping === null && was !== null;
        }
        _odeFinishPairs(state, state.collisions, "onCollisionEnter", "onCollisionExit");
        _odeFinishPairs(state, state.overlaps, "onTriggerEnter", "onTriggerExit");
    }
}`;
