import { assert, assertEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";
const A = await load(["ui/popover.js"]);

Deno.test("keyboard focus skips closed disclosures even when Chromium gives their children layout rectangles", () => {
  const summary = { parentElement: null }, hidden = { parentElement: null };
  const details = { tagName: "DETAILS", open: false, querySelector: () => summary, parentElement: null };
  for (const el of [summary, hidden]) Object.assign(el, { parentElement: details, tabIndex: 0, matches: () => false, closest: () => null, getClientRects: () => [{}] });
  const root = { querySelectorAll: () => [summary, hidden] };
  assertEquals(A.visibleEditorControls(root, "summary,button"), [summary]);
  details.open = true;
  assertEquals(A.visibleEditorControls(root, "summary,button"), [summary, hidden]);
  hidden.matches = () => true;
  assertEquals(A.visibleEditorControls(root, "summary,button"), [summary]);
});

Deno.test("temporary popovers close outside and with Escape, restore focus and do not close inline Advanced sections", () => {
  const handlers = new Map(), removed = [], events = [];
  const listener = { addEventListener: (name, fn) => handlers.set(name, fn), removeEventListener: name => removed.push(name) };
  const summary = { focus: () => events.push("focus") };
  const target = {};
  const menu = { open: true, contains: el => el === target, querySelector: () => summary, matches: () => true };
  const root = { ...listener, ownerDocument: listener, querySelectorAll: () => [menu] };
  const cleanup = A.bindDetailsPopovers(root, ".a-view-options");
  handlers.get("keydown")({ key: "Escape", target, preventDefault() {}, stopPropagation() {} });
  assertEquals(menu.open, false); assertEquals(events, ["focus"]);
  menu.open = true;
  handlers.get("pointerdown")({ target: {} });
  assertEquals(menu.open, false);
  menu.open = true;
  const advanced = { matches: () => false, open: true };
  handlers.get("toggle")({ target: advanced });
  assert(menu.open); assert(advanced.open);
  cleanup();
  assertEquals(removed.sort(), ["focusin", "keydown", "pointerdown", "toggle"]);
});
