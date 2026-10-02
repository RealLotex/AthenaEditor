function prefabSnapshot(object) {
  const copy = deepClone(object);
  for (const node of allObjects([copy])) {
    delete node._prefabBase;
    delete node._prefabId;
    delete node._pid;
    node._prefabNode ||= node.id;
  }
  return copy;
}

function placePrefab(prefab, objects) {
  const source = prefabSnapshot(prefab),
    [copy] = cloneObjects([source], objects);
  copy._prefabId = prefab._pid;
  copy._prefabBase = deepClone(source);
  // The baseline uses the placed names, so uniqueness suffixes are not overrides.
  const names = new Map(allObjects([copy]).map((n) => [n._prefabNode, n.name]));
  for (const n of allObjects([copy._prefabBase])) {
    n.name = names.get(n._prefabNode) || n.name;
  }
  return copy;
}

function mergePrefabValue(base, current, next) {
  if (JSON.stringify(base) === JSON.stringify(current)) return deepClone(next);
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

function refreshPrefab(instance, prefab, objects, revert = false) {
  const source = prefabSnapshot(prefab), base = instance._prefabBase || source;
  const sync = (old, current, next, root = false) => {
    const result = revert ? deepClone(next) : mergePrefabValue(
      { ...old, children: [] },
      { ...current, children: [] },
      { ...next, children: [] },
    );
    result.id = current.id;
    result._prefabNode = next._prefabNode;
    result.name = current.name;
    if (root) {
      result.name = current.name;
      result.components.transform = deepClone(current.components.transform);
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
        result.children.push(cloneObjects([child], objects)[0]);
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
  project.prefabs = project.prefabs.filter((p) => p._pid !== source._pid);
  project.prefabs.push(source);
  if (existing) {
    for (const scene of project.scenes) {
      for (const instance of allObjects(scene.objects)) {
        if (instance._prefabId === source._pid) {
          const updated = refreshPrefab(instance, source, scene.objects);
          Object.assign(instance, updated);
        }
      }
    }
  }
  object._prefabId = source._pid;
  object._prefabBase = prefabSnapshot(source);
  for (const node of allObjects([object])) node._prefabNode ||= node.id;
  return source;
}
