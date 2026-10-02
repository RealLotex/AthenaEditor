import { assert, assertEquals } from "jsr:@std/assert@1";
import * as esbuild from "npm:esbuild@0.24.0";
import { load } from "./_load.js";

const A = await load();
const source = (await esbuild.transform(await Deno.readTextFile(new URL("../src/panels/navigator.jsx", import.meta.url)), { loader: "jsx" })).code;

function library(props) {
  const slots = [], effects = [];
  let cursor = 0, tree;
  const React = {
    Fragment: "fragment",
    createElement: (type, props, ...children) => ({ type, props: { ...props, children } }),
    useState(value) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = value;
      return [slots[index], next => { slots[index] = typeof next === "function" ? next(slots[index]) : next; }];
    },
    useRef: value => React.useState({ current: value })[0],
    useMemo: fn => fn(),
    useEffect(effect, deps) {
      const index = cursor++;
      if (!(index in slots) || deps.some((v, i) => v !== slots[index][i])) effects.push(effect);
      slots[index] = deps;
    },
  };
  const Navigator = new Function("React", "useState", "useRef", "useMemo", "useEffect", "assetFolderTree", "assetLibraryFolder", "ASSET_CATEGORY_LABELS", "fmtBytes", "MODEL_DRAG_TYPE", "Empty", "Modal", "TrashIcon",
    source + "\nreturn Navigator;")(
      React, React.useState, React.useRef, React.useMemo, React.useEffect,
      A.assetFolderTree, A.assetLibraryFolder, A.ASSET_CATEGORY_LABELS, A.fmtBytes, A.MODEL_DRAG_TYPE,
      function Empty() {}, function Modal() {}, function TrashIcon() {},
    );
  const all = node => !node || typeof node !== "object" ? [] : Array.isArray(node) ? node.flatMap(all) : [node, ...all(node.props.children)];
  const render = () => {
    cursor = 0; tree = Navigator(props);
    effects.splice(0).forEach(effect => effect());
    cursor = 0; tree = Navigator(props);
  };
  render();
  return { render, find: predicate => all(tree).find(predicate)?.props,
    get assets() { return all(tree).filter(node => node.type === "button" && node.props.className?.startsWith("a-asset")).map(node => node.props); } };
}

const files = [
  { id: "a", name: "hero.obj", cat: "models", libraryFolder: "Characters", size: 20 },
  { id: "b", name: "chair.obj", cat: "models", size: 20 },
  { id: "c", name: "grass.png", cat: "textures", size: 20 },
];

Deno.test("the library starts with every asset, folder filters include descendants and selection does not move the user into folders", () => {
  const props = { compact: true, tab: "assets", files, prefabs: [], onSelectAsset() {} };
  const ui = library(props);
  assertEquals(ui.assets.map(asset => asset["aria-label"]), ["chair.obj", "grass.png", "hero.obj"]);
  const folder = () => ui.find(node => node.type === "select");
  folder().onChange({ target: { value: "Models" } }); ui.render();
  assertEquals(ui.assets.map(asset => asset["aria-label"]), ["chair.obj", "hero.obj"]);
  props.selectedAssetId = "a"; ui.render();
  assertEquals(folder().value, "Models", "Selecting a model must not narrow to Characters");
  props.selectedAssetId = "c"; ui.render();
  assertEquals(folder().value, "");
  assertEquals(ui.assets.length, 3);
});

Deno.test("asset search spans folders and revealing a referenced asset clears the previous filter", () => {
  const props = { compact: true, tab: "assets", files: [...files, ...Array.from({ length: 6 }, (_, i) => ({ id: `s${i}`, name: `logic${i}.js`, cat: "scripts", size: 10 }))], prefabs: [] };
  const ui = library(props);
  ui.find(node => node.type === "select").onChange({ target: { value: "Models" } }); ui.render();
  ui.find(node => node.props["aria-label"] === "Search assets").onChange({ target: { value: "grass" } }); ui.render();
  assertEquals(ui.assets.map(asset => asset["aria-label"]), ["grass.png"]);
  props.revealAssetName = "hero.obj"; ui.render();
  assertEquals(ui.find(node => node.type === "select").value, "");
  assertEquals(ui.find(node => node.props["aria-label"] === "Search assets").value, "");
  assert(ui.assets.some(asset => asset["aria-label"] === "hero.obj"));
});

Deno.test("only readable models can be dragged and keyboard activation uses the asset", () => {
  const used = [], props = { compact: true, tab: "assets", files, prefabs: [], onSelectAsset() {}, onOpenAsset: file => used.push(file.name) };
  const ui = library(props), hero = ui.assets.find(asset => asset["aria-label"] === "hero.obj");
  const payload = {};
  hero.onDragStart({ dataTransfer: { setData: (type, value) => payload[type] = value } });
  assertEquals(payload[A.MODEL_DRAG_TYPE], "a");
  hero.onKeyDown({ key: "Enter", preventDefault() {}, stopPropagation() {} });
  assertEquals(used, ["hero.obj"]);
  assertEquals(ui.assets.find(asset => asset["aria-label"] === "grass.png").draggable, false);
  props.files = [{ ...files[0], error: "Unreadable" }]; ui.render();
  assertEquals(ui.assets[0].draggable, false);
});
