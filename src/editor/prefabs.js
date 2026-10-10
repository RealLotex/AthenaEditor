function prefabSnapshot(object) {
  const copy = deepClone(object);
  for (const node of allObjects([copy])) {
    delete node._prefabBase;
    delete node._prefabId;
    delete node._pid;
    delete node._variantParentId;
    delete node._variantBase;
    node._prefabNode ||= node.id;
  }
  return copy;
}

function placePrefab(prefab, objects) {
  const source = prefabSnapshot(prefab),
    [copy] = cloneObjects([source], objects);
  copy._prefabId = prefab._pid;
  copy._prefabBase = prefabBaseline(source, copy);
  return copy;
}

// Store the baseline in the instance's ID/name space. Remapped references are
// inherited values, not local overrides; sibling instances stay independent.
function prefabBaseline(source, instance) {
  const copy = deepClone(source), current = new Map(allObjects([instance]).map(o=>[o._prefabNode,o]));
  const ids = new Map(), names = new Map();
  for(const node of allObjects([copy])) {
    const placed=current.get(node._prefabNode);
    if(placed){ids.set(node.id,placed.id);names.set(node.name,placed.name);node.id=placed.id;node.name=placed.name;}
  }
  remapObjectReferences([copy],ids);
  walk([copy],o=>{for(const key of ['caster','lightSource'])if(names.has(o.components.shadow?.[key]))o.components.shadow[key]=names.get(o.components.shadow[key]);});
  return copy;
}

function mergePrefabValue(base, current, next) {
  if (JSON.stringify(base) === JSON.stringify(current)) return deepClone(next);
  if (Array.isArray(base) && Array.isArray(current) && Array.isArray(next) && [...base,...current,...next].every(v=>v&&typeof v==='object'&&v.id)) {
    const result=[];
    for(const item of next) {
      const old=base.find(v=>v.id===item.id), local=current.find(v=>v.id===item.id);
      if(local)result.push(mergePrefabValue(old,local,item));
      else if(!old)result.push(deepClone(item));
    }
    for(const local of current)if(!next.some(v=>v.id===local.id)) {
      const old=base.find(v=>v.id===local.id);
      if(!old||JSON.stringify(old)!==JSON.stringify(local))result.push(deepClone(local));
    }
    return result;
  }
  if (
    base && current && next && typeof base === "object" &&
    !Array.isArray(base) && !Array.isArray(current) && !Array.isArray(next)
  ) {
    const out = {};
    for (
      const key of new Set([...Object.keys(current), ...Object.keys(next)])
    ) {
      const value = mergePrefabValue(base[key], current[key], next[key]);
      if (value !== undefined) out[key] = value;
    }
    return out;
  }
  return deepClone(current);
}

function refreshPrefab(instance, prefab, objects, revert = false, preservePlacement = true) {
  const canonical = prefabSnapshot(prefab), currentNodes = new Map(allObjects([instance]).map(o=>[o._prefabNode,o]));
  const placed = deepClone(canonical), taken = allObjects(objects).map(o=>({name:o.name}));
  walk([placed],o=>{
    const current=currentNodes.get(o._prefabNode);
    o.id=current?.id||uid();o.name=current?.name||uniqueName(o.name,taken);taken.push({name:o.name});
  });
  const source = prefabBaseline(canonical,placed), base = instance._prefabBase || source;
  const clean = value => {const c={...value,children:[]};delete c._prefabId;delete c._prefabBase;return c;};
  const sync = (old, current, next, root = false) => {
    const result = revert ? deepClone(next) : mergePrefabValue(
      clean(old), clean(current), clean(next),
    );
    result.id = current.id;
    result._prefabNode = next._prefabNode;
    result.name = current.name;
    if (root) {
      result.name = current.name;
      if(preservePlacement)result.components.transform = deepClone(current.components.transform);
    }
    result.children = [];
    for (const child of next.children || []) {
      const before = (old.children || []).find((n) =>
          n._prefabNode === child._prefabNode
        ),
        existing = (current.children || []).find((n) =>
          n._prefabNode === child._prefabNode
        );
      if (existing) {
        result.children.push(sync(before || child, existing, child));
      } else if (!before || revert) {
        result.children.push(deepClone(child));
      }
    }
    if (!revert) {
      for (const child of current.children || []) {
        if (
          !(next.children || []).some((n) =>
            n._prefabNode === child._prefabNode
          )
        ) {
          const before = (old.children || []).find((n) =>
            n._prefabNode === child._prefabNode
          );
          const same = before &&
            JSON.stringify({ ...before, id: child.id }) ===
              JSON.stringify(child);
          if (!same) result.children.push(deepClone(child));
        }
      }
    }
    return result;
  };
  const updated = sync(base, instance, source, true),
    nodes = allObjects([updated]);
  const names = new Map(
    allObjects([source]).map((n) => [
      n.name,
      nodes.find((c) => c._prefabNode === n._prefabNode)?.name,
    ]),
  );
  for (const node of nodes) {
    for (const key of ["caster", "lightSource"]) {
      if (names.get(node.components.shadow?.[key])) {
        node.components.shadow[key] = names.get(node.components.shadow[key]);
      }
    }
  }
  const placedNames = new Map(nodes.map((n) => [n._prefabNode, n.name]));
  for (const node of allObjects([source])) {
    node.name = placedNames.get(node._prefabNode) || node.name;
  }
  updated._prefabId = prefab._pid;
  updated._prefabBase = source;
  return updated;
}

function savePrefab(project, object) {
  const source = prefabSnapshot(object),
    existing = project.prefabs.find((p) => p._pid === object._prefabId);
  source._pid = existing ? existing._pid : uid();
  if(existing)source.name=existing.name;
  if(existing?._variantParentId){source._variantParentId=existing._variantParentId;source._variantBase=deepClone(existing._variantBase);}
  project.prefabs = project.prefabs.filter((p) => p._pid !== source._pid);
  project.prefabs.push(source);
  if (existing) propagatePrefabChanges(project,source._pid);
  object._prefabId = source._pid;
  for (const node of allObjects([object])) node._prefabNode ||= node.id;
  object._prefabBase = prefabBaseline(prefabSnapshot(source),object);
  return source;
}

function createPrefabVariant(project, object, name) {
  const parent=project.prefabs.find(p=>p._pid===object._prefabId);
  if(!parent)throw Error('Place a prefab or select a linked instance before creating a variant.');
  const source=prefabSnapshot(object);
  source._pid=uid();source.name=uniqueName(name?.trim()||`${parent.name} Variant`,project.prefabs);
  source.components.transform=deepClone(parent.components.transform);
  source._variantParentId=parent._pid;
  source._variantBase=prefabBaseline(prefabSnapshot(parent),source);
  project.prefabs.push(source);
  object._prefabId=source._pid;
  for(const node of allObjects([object]))node._prefabNode ||= node.id;
  object._prefabBase=prefabBaseline(prefabSnapshot(source),object);
  return source;
}

function prefabInheritanceProblems(project) {
  const problems=[],ids=new Set();
  for(const prefab of project.prefabs || []) {
    if(!prefab._pid||ids.has(prefab._pid))problems.push(`Prefab "${prefab.name}" needs a unique ID.`);
    ids.add(prefab._pid);
    let current=prefab;const ancestors=new Set();
    while(current?._variantParentId) {
      if(ancestors.has(current._pid)){problems.push(`Prefab "${prefab.name}" has circular variant inheritance.`);break;}
      ancestors.add(current._pid);
      const parent=project.prefabs.find(p=>p._pid===current._variantParentId);
      if(!parent){problems.push(`Variant "${prefab.name}" references a missing base prefab.`);break;}
      current=parent;
    }
  }
  return problems;
}

function propagatePrefabChanges(project, id) {
  const problems=prefabInheritanceProblems(project);if(problems.length)throw Error(problems[0]);
  const changed=new Set([id]),queue=[id];
  for(let i=0;i<queue.length;i++) {
    const parent=project.prefabs.find(p=>p._pid===queue[i]);
    for(const variant of project.prefabs.filter(p=>p._variantParentId===parent._pid)) {
      const working={...prefabSnapshot(variant),_prefabBase:variant._variantBase};
      const next=refreshPrefab(working,parent,project.prefabs,false,false);
      const snapshot=prefabSnapshot(next);
      Object.assign(variant,snapshot);
      variant._variantBase=prefabBaseline(prefabSnapshot(parent),variant);
      changed.add(variant._pid);queue.push(variant._pid);
    }
  }
  for(const scene of project.scenes)for(const instance of allObjects(scene.objects)) {
    if(changed.has(instance._prefabId))Object.assign(instance,refreshPrefab(instance,project.prefabs.find(p=>p._pid===instance._prefabId),scene.objects));
  }
}

function deletePrefab(project,id) {
  for(const variant of project.prefabs || [])if(variant._variantParentId===id){delete variant._variantParentId;delete variant._variantBase;}
  project.prefabs=(project.prefabs || []).filter(p=>p._pid!==id);
  for(const scene of project.scenes)walk(scene.objects,o=>{if(o._prefabId===id){delete o._prefabId;delete o._prefabBase;}});
}
