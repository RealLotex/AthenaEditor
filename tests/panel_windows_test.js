import { assert, assertEquals, assertThrows } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const A = await load([
  "core/util.js",
  "core/layout.js",
  "core/panelwindows.js",
]);
class Element {
  constructor(tag) {
    this.tag = tag;
    this.children = [];
    this.attributes = {};
  }
  setAttribute(name, value) {
    this.attributes[name] = value;
  }
  getAttribute(name) {
    return this.attributes[name];
  }
  appendChild(child) {
    child.parent = this;
    this.children.push(child);
    return child;
  }
  append(...children) {
    children.forEach((child) => this.appendChild(child));
  }
  replaceChildren() {
    this.children = [];
  }
  replaceWith(next) {
    this.parent.children[this.parent.children.indexOf(this)] = next;
    next.parent = this.parent;
  }
  cloneNode() {
    const copy = new Element(this.tag);
    copy.textContent = this.textContent;
    return copy;
  }
}
function surface() {
  const document = {
    documentElement: new Element("html"),
    head: new Element("head"),
    body: new Element("body"),
    createElement: (tag) => new Element(tag),
    querySelectorAll: () => [],
  };
  const handlers = new Map(), docHandlers = new Map(), positions = [];
  document.addEventListener = (event, handler) =>
    docHandlers.set(event, handler);
  document.removeEventListener = (event) => docHandlers.delete(event);
  const window = {
    document,
    closed: false,
    focused: false,
    screen: { isExtended: true },
    addEventListener: (event, handler) => handlers.set(event, handler),
    removeEventListener: (event) => handlers.delete(event),
    close() {
      this.closed = true;
    },
    focus() {
      this.focused = true;
    },
    moveTo: (...coordinates) => positions.push(coordinates),
    resizeTo: (...size) => positions.push(size),
  };
  return { window, document, handlers, docHandlers, positions };
}

Deno.test("native panel windows retain editor styles and forward focus, keys and closing to the single editor", () => {
  const child = surface(), source = surface();
  const style = new Element("style");
  style.textContent = "editor styles";
  source.document.querySelectorAll = () => [style];
  source.document.documentElement.setAttribute("data-theme", "light");
  let closed = 0, keys = 0, focused = 0;
  source.window.open = (url, name, options) => {
    assertEquals(url, "about:blank");
    assertEquals(name, "atheditor-panel-assets");
    assert(options.includes("popup"));
    return child.window;
  };
  const frame = A.openPanelWindow(
    source.window,
    source.document,
    "assets",
    "Game — Assets — AthEditor",
    {
      onClose: () => {
        closed++;
      },
      onKey: () => {
        keys++;
      },
      onFocus: () => {
        focused++;
      },
    },
  );
  assertEquals(child.document.title, "Game — Assets — AthEditor");
  assertEquals(
    child.document.documentElement.getAttribute("data-theme"),
    "light",
  );
  assertEquals(child.document.head.children[0].textContent, style.textContent);
  assertEquals(frame.slot, child.document.body.children[1]);
  child.handlers.get("keydown")();
  child.docHandlers.get("pointerdown")();
  child.handlers.get("pagehide")();
  assertEquals([closed, keys, focused], [1, 1, 1]);
  frame.dispose();
  assertEquals(child.window.closed, true);
  assertEquals(child.handlers.size, 0);
  assertEquals(child.docHandlers.size, 0);
});

Deno.test("blocked native panel windows report a recoverable error without changing layout", () => {
  const source = surface();
  source.window.open = () => null;
  assertThrows(
    () =>
      A.openPanelWindow(
        source.window,
        source.document,
        "inspector",
        "Inspector",
        {},
      ),
    Error,
    "Allow pop-up windows",
  );
});

Deno.test("choosing a monitor uses its actual work area and denied permission keeps the movable window", async () => {
  const child = surface(), source = surface();
  source.window.open = () => child.window;
  const screens = [
    {
      label: "Main",
      availLeft: 0,
      availTop: 0,
      availWidth: 1920,
      availHeight: 1080,
    },
    {
      label: "Left",
      availLeft: -1280,
      availTop: 40,
      availWidth: 1280,
      availHeight: 600,
    },
  ];
  child.window.getScreenDetails = async () => ({
    screens,
    currentScreen: screens[0],
  });
  const frame = A.openPanelWindow(
    source.window,
    source.document,
    "viewport",
    "Scene",
    { onClose() {}, onKey() {}, onFocus() {} },
  );
  const header = child.document.body.children[0];
  await header.children[2].onclick();
  const select = header.children[2];
  assertEquals(select.tag, "select");
  assertEquals(select.children.map((option) => option.textContent), [
    "Main",
    "Left",
  ]);
  select.value = "1";
  select.onchange();
  assertEquals(child.positions, [[-1280, 40], [800, 600]]);
  frame.dispose();
  const denied = surface();
  source.window.open = () => denied.window;
  denied.window.getScreenDetails = () =>
    Promise.reject(new DOMException("Declined", "NotAllowedError"));
  const fallback = A.openPanelWindow(
    source.window,
    source.document,
    "assets",
    "Assets",
    {
      onClose() {},
      onKey() {},
      onFocus() {},
      onError() {
        throw Error("A declined permission must keep the panel usable");
      },
    },
  );
  await denied.document.body.children[0].children[2].onclick();
  assertEquals(denied.document.body.children[0].children[2].tag, "button");
  assertEquals(denied.window.closed, false);
  fallback.dispose();
});
