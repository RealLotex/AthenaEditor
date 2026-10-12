// Destroy requests mark objects immediately; native cleanup waits until all
// callbacks finish. Shared model assets remain owned by the scene.
function emitObjectLifetime(e, ir) {
  if (!ir.canDestroy) return;
  const parents=new Map();
  const visit=(list,parent=null)=>{for(const o of list){parents.set(o.id,parent);visit(o.children||[],o);}};visit(ir.scene.objects||[]);
  const enabled=o=>!!o&&o.components.events?.gameplayEnabled!==false&&(!parents.get(o.id)||enabled(parents.get(o.id)));
  e.w(`const _runtimeObjects = new Map([`);
  e.block(b => {
    for (const obj of ir.objects) {
      const body = ir.physics.bodies.find(x => x.obj.id === obj.id);
      const model = ir.models.find(x => x.obj.id === obj.id);
      const visuals = [model?.vn, ...ir.shadows.filter(s => s.obj.id === obj.id || s.caster?.obj.id === obj.id).map(s => s.vn)].filter(Boolean);
      const sounds = ir.sounds.filter(s => !s.eventOnly && s.obj.id === obj.id).map(s => s.vn);
      const children = (obj.children || []).filter(o => ir.objects.includes(o)).map(o => `"${jsStr(o.id)}"`);
      b.w(`["${jsStr(obj.id)}", { alive: true, ownEnabled:${obj.components.events?.gameplayEnabled!==false},enabled:${enabled(obj)},parentId:${JSON.stringify(parents.get(obj.id)?.id||'')},movable:${body?.rb.shape!=='plane'},geom: ${body?.geomVN || "null"}, body: ${body?.bodyVN || "null"},`);
      b.w(`  visuals: [${visuals.join(", ")}], sounds: [${sounds.join(", ")}], children: [${children.join(", ")}] }],`);
    }
  });
  e.w(`]);`);
  e.w(`const _pendingDestroy = new Set();`);
    e.w(...OBJECT_LIFETIME_RUNTIME.split("\n"));
  if(ir.eventFlows?.enabled)e.w(...OBJECT_GAMEPLAY_RUNTIME.split('\n'));
}

const OBJECT_GAMEPLAY_RUNTIME = `function _isObjectEnabled(id) {
    const object = _runtimeObjects.get(id);
    return !!object && object.alive && object.enabled;
}
function setObjectGameplayEnabled(id, enabled) {
    const object = _runtimeObjects.get(id);
    if (!object || !object.alive) return false;
    object.ownEnabled = !!enabled;
    const update = key => {
        const o = _runtimeObjects.get(key);
        if (!o || !o.alive) return;
        o.enabled = o.ownEnabled && (!o.parentId || _isObjectEnabled(o.parentId));
        if (o.body) { if (o.enabled) o.body.enable(); else o.body.disable(); }
        for (const child of o.children) update(child);
    };
    update(id); return true;
}`;

const OBJECT_LIFETIME_RUNTIME = `function _isObjectAlive(id) {
    const object = _runtimeObjects.get(id);
    return !!object && object.alive;
}
function destroyObject(id) {
    const object = _runtimeObjects.get(id);
    if (!object || !object.alive) return false;
    object.alive = false;
    if (object.geom) object.geom._destroyed = true;
    if (object.body) object.body._destroyed = true;
    for (const visual of object.visuals) visual._destroyed = true;
    _pendingDestroy.add(object);
    for (const child of object.children) destroyObject(child);
    return true;
}
function _flushDestroyedObjects() {
    for (const object of _pendingDestroy) {
        for (const sound of object.sounds) sound.pause();
        if (object.geom && !object.geom._freed) { object.geom.free(); object.geom._freed = true; }
        if (object.body && !object.body._freed) { object.body.free(); object.body._freed = true; }
    }
    _pendingDestroy.clear();
}`;
