import { assert, assertEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";
const A = await load(["core/util.js", "core/layout.js"]);

function complete(layout) {
  const panels = [
    ...A.dockGroups(layout.tree).flatMap((g) => g.tabs),
    ...layout.floating.map((f) => f.panel),
    ...layout.hidden,
  ];
  assertEquals(panels.sort(), Object.keys(A.DOCK_PANELS).sort());
  for (const group of A.dockGroups(layout.tree)) {
    assert(group.tabs.includes(group.active));
  }
  const ids = [];
  const visit = (node) => {
    if (!node) return;
    ids.push(node.id);
    if (node.type === "split") node.children.forEach(visit);
  };
  visit(layout.tree);
  assertEquals(new Set(ids).size, ids.length);
}

Deno.test("all presets cover every panel and Default preserves the traditional layout", () => {
  assertEquals(A.LAYOUT_PRESETS, [
    "Focus",
    "Default",
    "Unity",
    "Unreal 4",
    "Unreal 5",
    "Godot",
  ]);
  for (const name of A.LAYOUT_PRESETS) complete(A.layoutPreset(name));
  const tree = A.layoutPreset().tree;
  assertEquals(tree.children[1].id, "inspect");
  assertEquals(tree.children[0].children[0].id, "work");
  assertEquals(tree.children[0].children[1].children.map((g) => g.id), [
    "outline",
    "library",
  ]);
  assert(A.dockLocation(A.layoutPreset("Unreal 5"), "assets").group.collapsed);
});

Deno.test("opening hidden scene settings keeps the Scene visible and uses the properties group", () => {
  let layout = A.activateDockPanel(A.layoutPreset("Focus"), "sceneSettings");
  assertEquals(A.dockLocation(layout, "sceneSettings").group.id, "inspect");
  assertEquals(A.dockLocation(layout, "viewport").group.active, "viewport");
  layout = A.activateDockPanel(layout, "problems");
  assertEquals(A.dockLocation(layout, "problems").group.id, "outline");
  complete(layout);
});

Deno.test("panels move between tab groups, edge splits and floating windows without loss", () => {
  const original = A.layoutPreset();
  let l = A.moveDockPanel(original, "uv", "inspect", "center");
  assertEquals(A.dockLocation(l, "uv").group.active, "uv");
  complete(l);
  l = A.moveDockPanel(l, "uv", "outline", "left");
  assertEquals(A.dockLocation(l, "uv").group.tabs, ["uv"]);
  complete(l);
  l = A.moveDockPanel(l, "uv", null, "center", {
    x: 150,
    y: 100,
    width: 600,
    height: 400,
  });
  assertEquals(A.dockLocation(l, "uv").floating.width, 600);
  complete(l);
  l = A.moveDockPanel(l, "uv", "work");
  complete(l);
  assertEquals(A.dockLocation(l, "uv").group.id, "work");
  assertEquals(original, A.layoutPreset());
});

Deno.test("a solitary undocked panel returns beside its former neighbor at the saved ratio", () => {
  const original = A.layoutPreset();
  let l = A.moveDockPanel(original, "outliner");
  assertEquals(A.dockLocation(l, "outliner").floating.home, "library");
  assertEquals(A.dockLocation(l, "outliner").floating.homeEdge, "top");
  l = A.normalizeDockLayout(JSON.parse(JSON.stringify(l)));
  l = A.redockPanel(l, "outliner");
  complete(l);
  const files = l.tree.children[0].children[1];
  assertEquals(files.axis, "column");
  assertEquals(files.ratio, .73);
  assertEquals(files.children[0].tabs, ["outliner"]);
  assertEquals(files.children[1].id, "library");
});

Deno.test("tab reordering accounts for removal of the dragged tab", () => {
  const l = A.moveDockPanel(A.layoutPreset(), "viewport", "work", "center", {
    index: 2,
  });
  assertEquals(A.dockLocation(l, "viewport").group.tabs, [
    "hud",
    "viewport",
    "uv",
    "scripts",
  ]);
  complete(l);
});

Deno.test("closing every panel leaves a recoverable empty layout", () => {
  let l = A.layoutPreset();
  for (const panel of Object.keys(A.DOCK_PANELS)) {
    l = A.closeDockPanel(l, panel);
  }
  assertEquals(l.tree, null);
  complete(l);
  l = A.closeDockPanel(l, "viewport");
  complete(l);
  l = A.activateDockPanel(l, "viewport");
  complete(l);
  assertEquals(l.tree.active, "viewport");
});

Deno.test("collapsed groups expand when opened and floating panels return to their home", () => {
  let l = A.layoutPreset("Unreal 5");
  l = A.activateDockPanel(l, "prefabs");
  assertEquals(A.dockLocation(l, "prefabs").group.collapsed, false);
  l = A.moveDockPanel(l, "prefabs");
  const home = A.dockLocation(l, "prefabs").floating.home;
  l = A.moveDockPanel(l, "prefabs", home);
  assertEquals(A.dockLocation(l, "prefabs").group.id, "library");
  complete(l);
});

Deno.test("layout persistence repairs malformed, duplicate and obsolete preferences", () => {
  assertEquals(A.normalizeDockLayout(null), A.layoutPreset());
  const bad = {
    version: 1,
    tree: {
      type: "split",
      id: "split-50",
      ratio: Infinity,
      children: [{
        type: "group",
        id: "dock-8",
        tabs: ["viewport", "viewport", "unknown"],
        active: "bad",
      }, { type: "group", id: "other", tabs: ["assets"] }],
    },
    floating: [{ panel: "viewport" }, { panel: "uv", x: Infinity, width: NaN }],
    hidden: ["uv", "scripts", "scripts"],
    nextId: 1,
  };
  const l = A.normalizeDockLayout(bad);
  complete(l);
  assertEquals(l.tree.ratio, .5);
  assertEquals(l.nextId, 51);
  assertEquals(l.floating[0].width, 420);
  assertEquals(A.normalizeDockLayout(JSON.parse(JSON.stringify(l))), l);
  complete(A.moveDockPanel(l, "hud", "other", "bottom"));
});

Deno.test("floating geometry stays reachable after viewport resize", () => {
  const small = A.fitFloatingPanel({
    x: 5000,
    y: -50,
    width: 1000,
    height: 900,
  }, { width: 300, height: 200 });
  assertEquals([small.x, small.y, small.width, small.height], [0, 0, 300, 200]);
  const tiny = A.fitFloatingPanel({}, { width: 150, height: 100 });
  assertEquals([tiny.x, tiny.y, tiny.width, tiny.height], [0, 0, 150, 100]);
});

Deno.test("docking at the root works even when removal prunes the old root", () => {
  let l = A.layoutPreset();
  for (
    const panel of Object.keys(A.DOCK_PANELS).filter((p) =>
      !["viewport", "outliner"].includes(p)
    )
  ) l = A.closeDockPanel(l, panel);
  l = A.moveDockPanel(l, "outliner", l.tree.id, "bottom");
  assertEquals(l.tree.axis, "column");
  assertEquals(l.tree.children[1].tabs, ["outliner"]);
  complete(l);
});
