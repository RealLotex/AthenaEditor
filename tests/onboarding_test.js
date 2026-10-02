import { assert, assertEquals } from "jsr:@std/assert@1";
import * as esbuild from "npm:esbuild@0.24.0";
import { load, PURE_MODULES } from "./_load.js";

const A = await load([
  ...PURE_MODULES,
  "editor/palette.js",
  "templates/assets.js",
  "templates/firstperson.js",
  "templates/thirdperson.js",
  "templates/sidescroller.js",
  "templates/topdown.js",
  "templates/registry.js",
  "core/storage.js",
  "core/scaffold.js",
]);
const source = (await Promise.all([
  "ui/modal.jsx",
  "ui/popover.js",
  "panels/newproject.jsx",
].map(async (path) => {
  const text = await Deno.readTextFile(
    new URL(`../src/${path}`, import.meta.url),
  );
  return (await esbuild.transform(text, { loader: "jsx" })).code;
}))).join("\n");

function dialogs(component, props, dom = {}) {
  const slots = [];
  const effects = [];
  let cursor = 0;
  const React = {
    Fragment: "fragment",
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], (next) => {
        slots[index] = next;
      }];
    },
    useRef(value) {
      return React.useState({ current: value })[0];
    },
    useEffect(effect) {
      effects.push(effect);
    },
  };
  const components = new Function(
    "React",
    "useState",
    "useRef",
    "useEffect",
    "PROJECT_TEMPLATES",
    "createEditorProject",
    "Field",
    "window",
    "document",
    "HTMLElement",
    `${source}
    return { NewProjectModal, ConsoleFolderModal, ConfirmModal, Modal };`,
  )(
    React,
    React.useState,
    React.useRef,
    React.useEffect,
    A.PROJECT_TEMPLATES,
    A.createEditorProject,
    function Field() {},
    dom.window,
    dom.document,
    dom.HTMLElement,
  );
  let tree;
  const render = () => {
    cursor = 0;
    tree = components[component](props);
    return tree;
  };
  const nodes = (node) => {
    if (!node || typeof node !== "object") return [];
    return [
      node,
      ...[node.props?.children, node.props?.footer].flat(Infinity).flatMap(
        nodes,
      ),
    ];
  };
  render();
  return {
    render,
    effects,
    find: (predicate) => nodes(tree).find(predicate)?.props,
    get modal() {
      return tree.props;
    },
  };
}

Deno.test("first project creates a playable scene with its assets, and repeated activation creates only once", async () => {
  let finish;
  let closed = 0;
  const created = [];
  const ui = dialogs("NewProjectModal", {
    onCreate(project, template) {
      created.push({ project, template });
      return new Promise((resolve) => {
        finish = resolve;
      });
    },
    onClose() {
      closed++;
    },
  });
  const name = ui.find((node) => node.props.id === "new-project-name");
  name.onChange({ target: { value: "  First game  " } });
  ui.render();
  const primary = ui.find((node) =>
    node.type === "button" && node.props.className.includes("--primary")
  );
  const pending = ui.find((node) => node.props.id === "new-project-name")
    .onKeyDown({ key: "Enter", preventDefault() {} });
  await primary.onClick();
  assertEquals(created.length, 1);
  const { project, template } = created[0];
  assertEquals(project.name, "First game");
  assertEquals(template.id, "third-person");
  assert(
    A.allObjects(A.activeScene(project).objects).some((obj) =>
      obj.components.script
    ),
  );
  const assets = A.editorAssets(project);
  for (const path of template.needs) {
    assert(assets.some((asset) => asset.name === path.split("/").pop()));
  }
  assertEquals(ui.render().props.canDismiss, false);
  finish(true);
  await pending;
  assertEquals(closed, 1);
});

Deno.test("starting points remain available and a blank name or text composition cannot create a project", async () => {
  const created = [];
  const ui = dialogs("NewProjectModal", {
    onCreate: (project, template) => {
      created.push({ project, template });
      return false;
    },
    onClose() {},
  });
  assertEquals(ui.find((node) => node.type === "details").open, undefined);
  for (const template of A.PROJECT_TEMPLATES) {
    assert(
      ui.find((node) =>
        node.type === "input" && node.props.value === template.id
      ),
    );
  }
  const blank = ui.find((node) =>
    node.type === "input" && node.props.value === "empty"
  );
  blank.onChange();
  ui.render();
  let name = ui.find((node) => node.props.id === "new-project-name");
  name.onChange({ target: { value: "   " } });
  ui.render();
  name = ui.find((node) => node.props.id === "new-project-name");
  name.onKeyDown({ key: "Enter", preventDefault() {} });
  assertEquals(created.length, 0);
  name.onChange({ target: { value: "Blank game" } });
  ui.render();
  name = ui.find((node) => node.props.id === "new-project-name");
  name.onKeyDown({
    key: "Enter",
    nativeEvent: { isComposing: true },
    preventDefault() {},
  });
  assertEquals(created.length, 0);
  await ui.find((node) =>
    node.type === "button" && node.props.className.includes("--primary")
  ).onClick();
  assertEquals(created[0].template.id, "empty");
  assertEquals(created[0].project.name, "Blank game");
});

Deno.test("save and continue preserves the current project when saving is cancelled, then continues only after success", async () => {
  let resolveSave;
  let saves = 0, continued = 0, closed = 0;
  const ui = dialogs("ConfirmModal", {
    title: "Open another project?",
    message: "Save your changes before opening another project.",
    onSave: () => {
      saves++;
      return new Promise((resolve) => {
        resolveSave = resolve;
      });
    },
    onConfirm: () => {
      continued++;
    },
    onClose: () => {
      closed++;
    },
  });
  const primary = () =>
    ui.find((node) =>
      node.type === "button" && node.props.className.includes("--primary")
    );
  const pending = primary().onClick();
  await primary().onClick();
  ui.render();
  assertEquals(saves, 1);
  assertEquals(ui.modal.canDismiss, false);
  resolveSave(false);
  await pending;
  ui.render();
  assertEquals(continued, 0);
  assertEquals(closed, 0);
  assertEquals(ui.modal.canDismiss, true);
  const saved = primary().onClick();
  resolveSave(true);
  await saved;
  assertEquals(continued, 1);
  assertEquals(closed, 1);
});

Deno.test("console preparation asks only for the missing player, then prepares the chosen folder", async () => {
  let picked = 0, scaffolded = 0, closed = 0;
  const props = {
    project: A.mkProject(),
    runtime: null,
    onPickRuntime: () => {
      picked++;
    },
    onScaffold: () => {
      scaffolded++;
      return false;
    },
    onClose: () => {
      closed++;
    },
  };
  const ui = dialogs("ConsoleFolderModal", props);
  const primary = () =>
    ui.find((node) =>
      node.type === "button" && node.props.className.includes("--primary")
    );
  assertEquals(primary().disabled, false);
  await primary().onClick();
  assertEquals(picked, 1);
  assertEquals(scaffolded, 0);
  props.runtime = { name: "athena.elf" };
  ui.render();
  await primary().onClick();
  assertEquals(scaffolded, 1);
  assertEquals(closed, 0);
});

Deno.test("a failed save keeps the confirmation open and makes it possible to try again", async () => {
  let continued = 0, closed = 0;
  const props = {
    title: "Open another project?",
    message: "Save your changes before opening another project.",
    onSave: () => {
      throw new Error("The selected file could not be written.");
    },
    onConfirm: () => {
      continued++;
    },
    onClose: () => {
      closed++;
    },
  };
  const ui = dialogs("ConfirmModal", props);
  const primary = () =>
    ui.find((node) =>
      node.type === "button" && node.props.className.includes("--primary")
    );
  await primary().onClick();
  ui.render();
  assertEquals(continued, 0);
  assertEquals(closed, 0);
  assertEquals(ui.modal.canDismiss, true);
  assert(ui.find((node) => node.props.role === "alert"));
  props.onSave = () => true;
  ui.render();
  await primary().onClick();
  assertEquals(continued, 1);
  assertEquals(closed, 1);
});

Deno.test("dialog focus includes disclosures, skips hidden and disabled fields, and follows dismissal changes without resetting focus", () => {
  const document = { activeElement: null };
  class Element {
    constructor(id, options = {}) {
      this.id = id;
      this.options = options;
      this.tabIndex = 0;
      this.isConnected = true;
    }
    focus() {
      document.activeElement = this;
    }
    matches(selector) {
      return selector === ":disabled"
        ? !!this.options.disabledByFieldset
        : !!this.options.input;
    }
    closest(selector) {
      if (selector.includes("[inert]")) return null;
      return this.options.body && selector === ".a-modal__body" ? {} : null;
    }
    getClientRects() {
      return this.options.hidden ? [] : [{}];
    }
  }
  const opener = new Element("opener"),
    close = new Element("close"),
    field = new Element("name", { input: true, body: true }),
    hidden = new Element("hidden", { input: true, hidden: true }),
    disabled = new Element("disabled", {
      input: true,
      disabledByFieldset: true,
    }),
    disclosure = new Element("summary", { body: true });
  const all = [close, field, hidden, disabled, disclosure];
  const root = new Element("dialog");
  root.querySelectorAll = (selector) =>
    all.filter((el) => el !== disclosure || selector.includes("summary"));
  root.querySelector = (selector) => selector === "#name" ? field : null;
  root.contains = (element) => all.includes(element) || element === root;
  let key;
  const window = {
    addEventListener(_name, handler) {
      key = handler;
    },
    removeEventListener() {},
  };
  let closed = 0;
  const props = {
    title: "Create a project",
    onClose: () => {
      closed++;
    },
    initialFocus: "#name",
    canDismiss: true,
  };
  const ui = dialogs("Modal", props, {
    window,
    document,
    HTMLElement: Element,
  });
  ui.find((node) => node.props.role === "dialog").ref.current = root;
  opener.focus();
  const cleanup = ui.effects[0]();
  assertEquals(document.activeElement, field);
  const press = (keyName, shiftKey = false) =>
    key({ key: keyName, shiftKey, preventDefault() {}, stopPropagation() {} });
  close.focus();
  press("Tab", true);
  assertEquals(document.activeElement, disclosure);
  disclosure.focus();
  press("Tab");
  assertEquals(document.activeElement, close);
  field.focus();
  props.canDismiss = false;
  ui.render();
  press("Escape");
  assertEquals(closed, 0);
  assertEquals(document.activeElement, field);
  props.canDismiss = true;
  ui.render();
  press("Escape");
  assertEquals(closed, 1);
  cleanup();
  assertEquals(document.activeElement, opener);
});
