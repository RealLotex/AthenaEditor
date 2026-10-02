// Layout preferences are independent of the game project and its undo history.
const DOCK_PANELS = {
  viewport: "Scene",
  hud: "HUD",
  uv: "UV",
  terrain: "Terrain",
  scripts: "Scripts",
  outliner: "Objects",
  inspector: "Properties",
  sceneSettings: "Scene settings",
  projectSettings: "Project",
  assets: "Assets",
  prefabs: "Prefabs",
  problems: "Problems",
};
const LAYOUT_PRESETS = ["Focus", "Default", "Unity", "Unreal 4", "Unreal 5", "Godot"];

function layoutPreset(name = "Default") {
  const group = (id, tabs, collapsed = false) => ({
    type: "group",
    id,
    tabs,
    active: tabs[0],
    collapsed,
  });
  const split = (id, axis, ratio, a, b) => ({
    type: "split",
    id,
    axis,
    ratio,
    children: [a, b],
  });
  const view = group("work", ["viewport", "hud", "uv", "scripts"]);
  const outline = group("outline", ["outliner"]);
  const inspect = group("inspect", [
    "inspector",
    "sceneSettings",
    "projectSettings",
  ]);
  const assets = group(
    "library",
    ["assets", "prefabs", "problems"],
    name === "Unreal 5",
  );
  let tree;
  if (name === "Focus") {
    return { version: 1, preset: "Focus", nextId: 1, floating: [],
      tree: split("frame", "row", .79,
        split("main", "row", .22, group("outline", ["outliner", "assets"]), group("work", ["viewport"])),
        group("inspect", ["inspector"])),
      hidden: Object.keys(DOCK_PANELS).filter(id => !["outliner", "assets", "viewport", "inspector"].includes(id)) };
  } else if (name === "Unity") {
    tree = split(
      "frame",
      "row",
      .80,
      split(
        "main",
        "column",
        .73,
        split("scene", "row", .22, outline, view),
        assets,
      ),
      inspect,
    );
  } else if (name === "Unreal 4" || name === "Unreal 5") {
    tree = split(
      "frame",
      "row",
      .76,
      split("main", "column", .74, view, assets),
      split("details", "column", .36, outline, inspect),
    );
  } else if (name === "Godot") {
    tree = split(
      "frame",
      "row",
      .80,
      split(
        "main",
        "row",
        .23,
        split("files", "column", .57, outline, assets),
        view,
      ),
      inspect,
    );
  } else {tree = split(
      "frame",
      "row",
      .81,
      split(
        "main",
        "row",
        .73,
        view,
        split("files", "column", .73, outline, assets),
      ),
      inspect,
    );}
  return {
    version: 1,
    preset: LAYOUT_PRESETS.includes(name) ? name : "Default",
    tree,
    floating: [],
    hidden: ["terrain"],
    nextId: 1,
  };
}

function dockGroups(node) {
  if (!node) return [];
  return node.type === "group" ? [node] : node.children.flatMap(dockGroups);
}

function normalizeDockLayout(value) {
  if (!value || value.version !== 1) return layoutPreset();
  const used = new Set(), nodeIds = new Set();
  const take = (id) =>
    typeof id === "string" && !!DOCK_PANELS[id] && !used.has(id) &&
    (used.add(id), true);
  const read = (node, depth = 0) => {
    if (
      !node || depth > 24 || typeof node.id !== "string" || nodeIds.has(node.id)
    ) return null;
    nodeIds.add(node.id);
    if (node.type === "group" && Array.isArray(node.tabs)) {
      const tabs = node.tabs.filter(take);
      return tabs.length
        ? {
          type: "group",
          id: node.id,
          tabs,
          active: tabs.includes(node.active) ? node.active : tabs[0],
          collapsed: !!node.collapsed,
        }
        : null;
    }
    if (node.type !== "split" || !Array.isArray(node.children)) return null;
    const children = node.children.slice(0, 2).map((n) => read(n, depth + 1))
      .filter(Boolean);
    if (children.length < 2) return children[0] || null;
    return {
      type: "split",
      id: node.id,
      axis: node.axis === "column" ? "column" : "row",
      ratio: clamp(num(node.ratio, .5), .12, .88),
      children,
    };
  };
  const tree = read(value.tree);
  const floating = (Array.isArray(value.floating) ? value.floating : []).filter(
    (f) => f && take(f.panel),
  ).map((f) => ({
    panel: f.panel,
    home: typeof f.home === "string" ? f.home : "work",
    homeEdge: ["left", "right", "top", "bottom"].includes(f.homeEdge)
      ? f.homeEdge
      : "center",
    homeRatio: clamp(num(f.homeRatio, .5), .12, .88),
    x: clamp(num(f.x, 80), 0, 8192),
    y: clamp(num(f.y, 60), 0, 8192),
    width: clamp(num(f.width, 420), 240, 4096),
    height: clamp(num(f.height, 340), 160, 4096),
  }));
  const hidden = (Array.isArray(value.hidden) ? value.hidden : []).filter(take);
  hidden.push(...Object.keys(DOCK_PANELS).filter((id) => !used.has(id)));
  const lastId = Math.max(
    0,
    ...[...nodeIds].map((id) =>
      Number(id.match(/^(?:dock|split)-(\d+)$/)?.[1]) || 0
    ),
  );
  return {
    version: 1,
    preset: LAYOUT_PRESETS.includes(value.preset) ? value.preset : "Custom",
    tree,
    floating,
    hidden,
    nextId: Math.max(lastId + 1, 1, Math.floor(num(value.nextId, 1))),
  };
}

function dockLocation(layout, panel) {
  const group = dockGroups(layout.tree).find((g) => g.tabs.includes(panel));
  return group
    ? { group }
    : layout.floating.find((f) => f.panel === panel)
    ? { floating: layout.floating.find((f) => f.panel === panel) }
    : { hidden: true };
}

function removeDockPanel(layout, panel) {
  const remove = (node) => {
    if (!node) return null;
    if (node.type === "group") {
      node.tabs = node.tabs.filter((id) => id !== panel);
      if (!node.tabs.includes(node.active)) node.active = node.tabs[0];
      return node.tabs.length ? node : null;
    }
    node.children = node.children.map(remove).filter(Boolean);
    return node.children.length === 2 ? node : node.children[0] || null;
  };
  layout.tree = remove(layout.tree);
  layout.floating = layout.floating.filter((f) => f.panel !== panel);
  layout.hidden = layout.hidden.filter((id) => id !== panel);
}

// Remember the adjacent branch before an empty group is pruned on undocking.
function dockPanelHome(layout, panel) {
  const { group, floating } = dockLocation(layout, panel);
  if (floating) {
    return {
      home: floating.home,
      homeEdge: floating.homeEdge || "center",
      homeRatio: num(floating.homeRatio, .5),
    };
  }
  let home = { home: group?.id || "work", homeEdge: "center", homeRatio: .5 };
  if (group?.tabs.length === 1) {
    const visit = (node) => {
      if (!node || node.type !== "split") return;
      const at = node.children.findIndex((child) => child.id === group.id);
      if (at >= 0) {
        home = {
          home: node.children[1 - at].id,
          homeEdge: node.axis === "row"
            ? (at === 0 ? "left" : "right")
            : (at === 0 ? "top" : "bottom"),
          homeRatio: node.ratio,
        };
      } else node.children.forEach(visit);
    };
    visit(layout.tree);
  }
  return home;
}

function redockPanel(layout, panel) {
  const floating = dockLocation(layout, panel).floating;
  return floating
    ? moveDockPanel(
      layout,
      panel,
      floating.home,
      floating.homeEdge || "center",
      { ratio: floating.homeRatio },
    )
    : layout;
}

function activateDockPanel(layout, panel) {
  if (!DOCK_PANELS[panel]) return layout;
  const next = deepClone(layout), location = dockLocation(next, panel);
  if (location.group) {
    location.group.active = panel;
    location.group.collapsed = false;
  } else if (location.floating) {
    next.floating = next.floating.filter((f) => f.panel !== panel);
    next.floating.push(location.floating);
  } else {
    next.hidden = next.hidden.filter((id) => id !== panel);
    const groups = dockGroups(next.tree);
    const context = ["sceneSettings", "projectSettings", "inspector"].includes(panel)
      ? groups.find(g => g.tabs.includes("inspector"))
      : ["outliner", "assets", "prefabs", "problems"].includes(panel)
      ? groups.find(g => g.tabs.includes("assets") || g.tabs.includes("outliner"))
      : null;
    const home = context || groups.find((g) => g.id === "work") || groups[0];
    if (home) {
      home.tabs.push(panel);
      home.active = panel;
      home.collapsed = false;
    } else {next.tree = {
        type: "group",
        id: `dock-${next.nextId++}`,
        tabs: [panel],
        active: panel,
        collapsed: false,
      };}
  }
  return next;
}

function moveDockPanel(
  layout,
  panel,
  target = null,
  edge = "center",
  rect = {},
) {
  if (!DOCK_PANELS[panel]) return layout;
  const next = deepClone(layout), source = dockLocation(next, panel);
  const home = dockPanelHome(layout, panel);
  if (source.group?.id === target && source.group.tabs.length === 1) {
    return activateDockPanel(next, panel);
  }
  if (
    source.group?.id === target && Number.isFinite(rect.index) &&
    source.group.tabs.indexOf(panel) < rect.index
  ) rect = { ...rect, index: rect.index - 1 };
  removeDockPanel(next, panel);
  if (target === layout.tree?.id && next.tree) target = next.tree.id;
  next.preset = "Custom";
  if (!target) {
    next.floating.push({
      panel,
      ...home,
      x: num(rect.x, 80),
      y: num(rect.y, 60),
      width: num(rect.width, 420),
      height: num(rect.height, 340),
    });
    return next;
  }
  let found = false;
  const place = (node) => {
    if (!node) return node;
    if (node.id === target) {
      found = true;
      if (edge === "center" && node.type === "group") {
        node.tabs.splice(
          clamp(num(rect.index, node.tabs.length), 0, node.tabs.length),
          0,
          panel,
        );
        node.active = panel;
        node.collapsed = false;
        return node;
      }
      const added = {
        type: "group",
        id: `dock-${next.nextId++}`,
        tabs: [panel],
        active: panel,
        collapsed: false,
      };
      const before = edge === "left" || edge === "top";
      return {
        type: "split",
        id: `split-${next.nextId++}`,
        axis: edge === "top" || edge === "bottom" ? "column" : "row",
        ratio: clamp(num(rect.ratio, before ? 0.3 : 0.7), .12, .88),
        children: before ? [added, node] : [node, added],
      };
    }
    if (node.type === "split") node.children = node.children.map(place);
    return node;
  };
  next.tree = place(next.tree);
  if (!found) {
    const group = dockGroups(next.tree)[0];
    if (group) {
      group.tabs.push(panel);
      group.active = panel;
      group.collapsed = false;
    } else {next.tree = {
        type: "group",
        id: `dock-${next.nextId++}`,
        tabs: [panel],
        active: panel,
        collapsed: false,
      };}
  }
  return next;
}

function closeDockPanel(layout, panel) {
  if (!DOCK_PANELS[panel]) return layout;
  const next = deepClone(layout);
  removeDockPanel(next, panel);
  next.hidden.push(panel);
  next.preset = "Custom";
  return next;
}

function toggleDockPanel(layout, panel) {
  const location = dockLocation(layout, panel);
  return location.hidden || location.group?.collapsed
    ? activateDockPanel(layout, panel)
    : closeDockPanel(layout, panel);
}

function updateDockNode(layout, id, patch) {
  const next = deepClone(layout);
  const update = (node) => {
    if (!node) return;
    if (node.id === id) Object.assign(node, patch);
    if (node.type === "split") node.children.forEach(update);
  };
  update(next.tree);
  next.preset = "Custom";
  return next;
}

function fitFloatingPanel(rect, bounds) {
  const width = clamp(
      num(rect.width, 420),
      Math.min(240, bounds.width),
      bounds.width,
    ),
    height = clamp(
      num(rect.height, 340),
      Math.min(160, bounds.height),
      bounds.height,
    );
  return {
    ...rect,
    width,
    height,
    x: clamp(num(rect.x, 80), 0, Math.max(0, bounds.width - width)),
    y: clamp(num(rect.y, 60), 0, Math.max(0, bounds.height - height)),
  };
}
