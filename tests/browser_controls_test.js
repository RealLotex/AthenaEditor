import { assert, assertEquals } from "jsr:@std/assert@1";
import * as esbuild from "npm:esbuild@0.24.0";

const source = (await Promise.all(
  ["ui/primitives.jsx", "ui/popover.js", "panels/menubar.jsx", "panels/fonts.jsx"].map(async (
    path,
  ) =>
    (await esbuild.transform(
      await Deno.readTextFile(new URL(`../src/${path}`, import.meta.url)),
      { loader: "jsx" },
    )).code
  ),
)).join("\n");

function controls(window = {}, navigator = {}) {
  const slots = [], effects = [], document = {};
  let cursor = 0;
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
      return [slots[index], (value) => {
        slots[index] = typeof value === "function"
          ? value(slots[index])
          : value;
      }];
    },
    useEffect: (effect) => effects.push(effect),
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useLayoutEffect() {},
  };
  React.useRef = (value) => React.useState({ current: value })[0];
  const api = new Function(
    "React",
    "window",
    "navigator",
    "document",
    "clamp",
    source +
      `\nreturn { Color01Input, Color255Input, EyeDropperButton, MenuBar, HUDfontImport };`,
  )(
    React,
    window,
    navigator,
    document,
    (v, lo, hi) => Math.max(lo, Math.min(hi, v)),
  );
  return {
    document,
    render(name, props) {
      cursor = 0;
      effects.length = 0;
      return api[name](props);
    },
    runEffects: () => effects.map((effect) => effect()),
  };
}
const children = (tree) =>
  tree?.props?.children.flat(Infinity).filter(Boolean) || [];

function findControl(tree, predicate) {
  if (predicate(tree)) return tree;
  for (const child of children(tree)) {
    const found = typeof child === "object" && findControl(child, predicate);
    if (found) return found;
  }
  return null;
}

Deno.test("installed font access runs only on click and imports the selected face; refusal keeps file import available", async () => {
  let calls = 0, received;
  const font = {
    fullName: "Sample Regular",
    postscriptName: "Sample-Regular",
    blob: () => Promise.resolve(new Blob(["font"])),
  };
  const ui = controls({
    queryLocalFonts() {
      calls++;
      return Promise.resolve([font]);
    },
  });
  const props = {
    elementId: "label",
    onImport: async (...args) => {
      received = args;
    },
  };
  let tree = ui.render("HUDfontImport", props);
  assertEquals(calls, 0);
  const query = findControl(
    tree,
    (node) =>
      node?.type === "button" &&
      children(node).includes("Choose installed font…"),
  );
  const pending = query.props.onClick();
  assertEquals(calls, 1);
  await pending;
  tree = ui.render("HUDfontImport", props);
  assertEquals(
    findControl(tree, (node) => node?.type === "select").props.value,
    font.postscriptName,
  );
  await findControl(
    tree,
    (node) => node?.type === "button" && children(node).includes("Use font"),
  ).props.onClick();
  await Promise.resolve();
  assertEquals(received[0], "label");
  assertEquals(await (await received[1]).text(), "font");
  assertEquals(received[2], "Sample-Regular");
  const denied = controls({
    queryLocalFonts: () =>
      Promise.reject(new DOMException("Denied", "NotAllowedError")),
  });
  tree = denied.render("HUDfontImport", props);
  await findControl(
    tree,
    (node) =>
      node?.type === "button" &&
      children(node).includes("Choose installed font…"),
  ).props.onClick();
  tree = denied.render("HUDfontImport", props);
  assert(
    findControl(
      tree,
      (node) => node?.type === "input" && node.props.type === "file",
    ),
  );
  assert(
    findControl(tree, (node) =>
      node?.props?.role === "status" &&
      children(node).join("").includes("file instead")),
  );
});

Deno.test("screen colors preserve alpha and commit correct float and HUD channel ranges", () => {
  for (
    const [name, range, alpha] of [["Color01Input", 1, 0.35], [
      "Color255Input",
      255,
      128,
    ]]
  ) {
    const c = controls();
    let changed, phase;
    const tree = c.render(name, {
      value: { r: 0, g: 0, b: 0, a: alpha },
      onChange: (value, kind) => {
        changed = value;
        phase = kind;
      },
    });
    children(tree).find((node) => node.type?.name === "EyeDropperButton").props
      .onPick("#ff8040");
    assertEquals(changed, {
      r: range,
      g: 128 * range / 255,
      b: 64 * range / 255,
      a: alpha,
    });
    assertEquals(phase, "commit");
  }
});

Deno.test("screen picker starts during its click and cancellation or unsupported browsers leave the color untouched", async () => {
  assertEquals(controls().render("EyeDropperButton", {}), null);
  let calls = 0, picked;
  const c = controls({
    EyeDropper: class {
      open() {
        calls++;
        return Promise.reject(new DOMException("Cancelled", "AbortError"));
      }
    },
  });
  const tree = c.render("EyeDropperButton", {
    onPick: (hex) => {
      picked = hex;
    },
  });
  const pending = children(tree)[0].props.onClick();
  assertEquals(calls, 1, "no deferred work before native screen picker opens");
  await pending;
  assertEquals(picked, undefined);
  const rendered = c.render("EyeDropperButton", { onPick() {} });
  assertEquals(
    children(rendered).length,
    1,
    "cancelling does not display an error",
  );
});

Deno.test("title bar tracks project and unsaved state and reacts to overlay visibility", () => {
  let changed, removed;
  const overlay = {
    visible: true,
    addEventListener: (event, handler) => {
      assertEquals(event, "geometrychange");
      changed = handler;
    },
    removeEventListener: (_, handler) => {
      removed = handler;
    },
  };
  const c = controls({}, { windowControlsOverlay: overlay });
  const props = {
    project: { name: "Test", scenes: [] },
    commands: [],
    dirty: true,
  };
  c.render("MenuBar", props);
  const cleanups = c.runEffects();
  const registered = changed;
  assertEquals(c.document.title, "Test * — AthEditor");
  assert(
    c.render("MenuBar", props).props.className.includes("a-menubar--native"),
  );
  overlay.visible = false;
  changed();
  assertEquals(
    c.render("MenuBar", { ...props, dirty: false }).props.className,
    "a-menubar",
  );
  c.runEffects();
  assertEquals(c.document.title, "Test — AthEditor");
  cleanups[1]();
  assertEquals(removed, registered);
});
