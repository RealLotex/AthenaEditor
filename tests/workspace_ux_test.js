import { assert, assertEquals } from "jsr:@std/assert@1";
import * as esbuild from "npm:esbuild@0.24.0";

const source = (await Promise.all([
  "ui/modal.jsx",
  "ui/palette.jsx",
  "panels/scenetools.jsx",
].map(async (path) => {
  const text = await Deno.readTextFile(
    new URL(`../src/${path}`, import.meta.url),
  );
  return (await esbuild.transform(text, { loader: "jsx" })).code;
}))).join("\n");

function componentHarness(component, props, dom = {}) {
  const slots = [], effects = [];
  let cursor = 0, tree;
  const React = {
    Fragment: "fragment",
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) {
        slots[index] = typeof value === "function" ? value() : value;
      }
      return [slots[index], (next) => {
        slots[index] = typeof next === "function" ? next(slots[index]) : next;
      }];
    },
    useRef: (value) => React.useState({ current: value })[0],
    useMemo: (fn) => fn(),
    useEffect(effect, deps) {
      const index = cursor++;
      if (
        !(index in slots) || !deps ||
        deps.some((value, i) => value !== slots[index][i])
      ) effects.push(effect);
      slots[index] = deps;
    },
  };
  const components = new Function(
    "React",
    "useState",
    "useRef",
    "useEffect",
    "useMemo",
    "window",
    "document",
    "HTMLElement",
    `${source}
    return { CommandPalette, SceneTools, Modal };`,
  )(
    React,
    React.useState,
    React.useRef,
    React.useEffect,
    React.useMemo,
    dom.window,
    dom.document,
    dom.HTMLElement,
  );
  const render = () => {
    cursor = 0;
    tree = components[component](props);
    return tree;
  };
  const allNodes = (node) =>
    !node || typeof node !== "object" ? [] : [
      node,
      ...[node.props?.children, node.props?.footer].flat(Infinity).flatMap(
        allNodes,
      ),
    ];
  render();
  return {
    render,
    flushEffects: () => effects.splice(0).map((effect) => effect()),
    find: (predicate) => allNodes(tree).find(predicate)?.props,
    get tree() {
      return tree;
    },
    get results() {
      return allNodes(tree).filter((node) =>
        node.type === "button" &&
        node.props.className?.startsWith("a-palette__item")
      ).map((node) => node.props);
    },
  };
}

const COMMON_OBJECTS = [
  ["add.primitive.cube", "Cube"],
  ["add.primitive.plane", "Plane"],
  ["add.primitive.sphere", "Sphere"],
  ["add.terrain", "Terrain"],
  ["add.model", "Model"],
  ["add.light", "Light"],
  ["add.camera", "Camera"],
];
function commands(events = []) {
  return [
    ...COMMON_OBJECTS,
    ["add.primitive.cylinder", "Cylinder"],
    ["add.shadow", "Shadow"],
    ["add.rigidbody", "Rigid Body"],
    ["add.ui.Text", "HUD Text"],
    ["add.ui.Rectangle", "HUD Rectangle"],
    ["file.save", "Save project"],
  ].map(([id, title]) => ({
    id,
    title,
    group: id.startsWith("add.") ? "Add" : "File",
    run: () => events.push(id),
  })).concat([
    {
      id: "add.secret",
      title: "Hidden object",
      group: "Add",
      hidden: true,
      run() {},
    },
    {
      id: "add.disabled",
      title: "Disabled object",
      group: "Add",
      enabled: () => false,
      run() {},
    },
  ]);
}
const inputOf = (ui) =>
  ui.find((node) =>
    node.type === "input" && node.props.className === "a-palette__input"
  );
const press = (ui, key) => inputOf(ui).onKeyDown({ key, preventDefault() {} });
function search(ui, text) {
  inputOf(ui).onChange({ target: { value: text } });
  ui.render();
  ui.flushEffects();
  ui.render();
}

Deno.test("Add object starts with seven common choices and More objects reveals the other usable objects", () => {
  const ui = componentHarness("CommandPalette", {
    commands: commands(),
    scope: "objects",
    onClose() {},
  });
  assertEquals(ui.tree.type.name, "Modal");
  assertEquals(ui.tree.props.initialFocus, ".a-palette__input");
  assertEquals(
    ui.results.map((item) => item.key),
    COMMON_OBJECTS.map(([id]) => id),
  );
  const more = ui.find((node) =>
    node.type === "button" && node.props.className?.includes("a-palette__more")
  );
  assert(more);
  more.onClick();
  ui.render();
  assert(ui.results.some((item) => item.key === "add.shadow"));
  assert(ui.results.some((item) => item.key === "add.primitive.cylinder"));
  assert(
    ui.results.every((item) =>
      item.key.startsWith("add.") && !item.key.startsWith("add.ui.")
    ),
  );
  assert(
    !ui.results.some((item) =>
      ["add.secret", "add.disabled"].includes(item.key)
    ),
  );
  assertEquals(
    ui.find((node) =>
      node.type === "button" &&
      node.props.className?.includes("a-palette__more")
    ),
    undefined,
  );
});

Deno.test("search can run an advanced object without revealing the catalog, and arrow keys preserve the selected action", () => {
  const events = [];
  const ui = componentHarness("CommandPalette", {
    commands: commands(events),
    scope: "objects",
    onClose: () => events.push("close"),
  });
  ui.flushEffects();
  ui.render();
  press(ui, "ArrowDown");
  ui.render();
  press(ui, "Enter");
  assertEquals(events, ["close", "add.primitive.plane"]);
  events.length = 0;
  search(ui, "shadow");
  assertEquals(ui.results.map((item) => item.key), ["add.shadow"]);
  press(ui, "Enter");
  assertEquals(events, ["close", "add.shadow"]);
});

Deno.test("HUD add excludes scene objects and a general palette keeps file, object and HUD commands", () => {
  const ui = componentHarness("CommandPalette", {
    commands: commands(),
    scope: "hud",
    onClose() {},
  });
  assertEquals(ui.tree.props.title, "Add HUD element");
  assertEquals(ui.results.map((item) => item.key), [
    "add.ui.Text",
    "add.ui.Rectangle",
  ]);
  search(ui, "cube");
  assertEquals(ui.results, []);
  const events = [];
  const general = componentHarness("CommandPalette", {
    commands: commands(events),
    scope: null,
    onClose: () => events.push("close"),
  });
  assertEquals(general.tree.props.title, "Command palette");
  assert(general.results.some((item) => item.key === "file.save"));
  assert(general.results.some((item) => item.key === "add.ui.Text"));
  assert(general.results.some((item) => item.key === "add.shadow"));
  search(general, "save project");
  press(general, "Enter");
  assertEquals(events, ["close", "file.save"]);
});

Deno.test("scene transformation controls appear only for a selection and preserve their actions", () => {
  const events = [];
  const props = {
    prefs: {
      snap: true,
      snapSize: 1,
      gizmoSpace: "world",
      showOverlays: false,
      shaded: true,
    },
    gizmoMode: "rotate",
    hasSelection: false,
    onMode: (mode) => events.push(mode),
    onPref() {},
    onAdd: () => events.push("add"),
    onFrame: () => events.push("frame"),
    onSceneSettings() {},
  };
  const ui = componentHarness("SceneTools", props);
  assertEquals(
    ui.find((node) =>
      node.props.role === "group" &&
      node.props["aria-label"] === "Transform selected objects"
    ),
    undefined,
  );
  assertEquals(ui.find((node) => node.type === "select"), undefined);
  assertEquals(
    ui.find((node) => node.props["aria-label"] === "Snap step"),
    undefined,
  );
  ui.find((node) =>
    node.type === "button" && node.props.children.includes("+ Add object")
  ).onClick();
  ui.find((node) =>
    node.type === "button" && node.props.children.includes("Show whole scene")
  ).onClick();
  assertEquals(events, ["add", "frame"]);
  props.hasSelection = true;
  ui.render();
  assert(
    ui.find((node) =>
      node.props["aria-label"] === "Transform selected objects"
    ),
  );
  assertEquals(
    ui.find((node) => node.props.title === "Rotate (E)")["aria-pressed"],
    true,
  );
  ui.find((node) => node.props.title === "Scale (R)").onClick();
  assert(ui.find((node) => node.type === "select"));
  assert(ui.find((node) => node.props["aria-label"] === "Snap step"));
  assertEquals(events, ["add", "frame", "scale"]);
});

Deno.test("palette Modal leaves action keys to the input, traps Tab and restores the opener after closing", () => {
  const events = [], document = { activeElement: null };
  class Element {
    constructor(kind) {
      this.kind = kind;
      this.tabIndex = 0;
      this.isConnected = true;
    }
    focus() {
      document.activeElement = this;
    }
    matches(selector) {
      return selector !== ":disabled" && this.kind === "input";
    }
    closest(selector) {
      return selector === ".a-modal__body" && this.kind !== "close" ? {} : null;
    }
    getClientRects() {
      return [{}];
    }
  }
  const opener = new Element("opener"),
    body = new Element("body"),
    close = new Element("close"),
    input = new Element("input"),
    last = new Element("button");
  opener.focus();
  const palette = componentHarness("CommandPalette", {
    commands: commands(events),
    scope: "objects",
    onClose: () => events.push("close"),
  });
  // React autofocus is committed before parent passive effects. It must not
  // steal the opener before Modal records the element to restore.
  if (inputOf(palette).autoFocus) input.focus();
  let onKey;
  const window = {
    addEventListener(_name, callback) {
      onKey = callback;
    },
    removeEventListener() {},
  };
  const modal = componentHarness("Modal", palette.tree.props, {
    document,
    window,
    HTMLElement: Element,
  });
  const root = new Element("root");
  root.querySelectorAll = () => [close, input, last];
  root.querySelector = (selector) =>
    selector === ".a-palette__input" ? input : null;
  root.contains = (element) => [root, close, input, last].includes(element);
  modal.find((node) => node.props.role === "dialog").ref.current = root;
  const cleanup = modal.flushEffects()[0];
  assertEquals(document.activeElement, input);
  const dispatch = (key) => {
    let stopped = false;
    onKey({
      key,
      preventDefault() {},
      stopPropagation() {
        stopped = true;
      },
    });
    if (!stopped) press(palette, key);
  };
  dispatch("ArrowDown");
  palette.render();
  dispatch("Enter");
  assertEquals(events, ["close", "add.primitive.plane"]);
  last.focus();
  onKey({ key: "Tab", preventDefault() {}, stopPropagation() {} });
  assertEquals(document.activeElement, close);
  events.length = 0;
  dispatch("Escape");
  assertEquals(events, ["close"]);
  for (const element of [root, close, input, last]) element.isConnected = false;
  body.focus();
  cleanup();
  assertEquals(document.activeElement, opener);
});
