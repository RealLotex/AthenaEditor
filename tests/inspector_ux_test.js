import { assert, assertEquals } from "jsr:@std/assert@1";
import * as esbuild from "npm:esbuild@0.24.0";

// Render the real panel functions into element trees. These checks exercise
// selection changes and panel actions; browser checks cover layout and focus.
const modules = [
  "core/util.js", "core/math.js", "core/skybox.js", "core/theme.js",
  "core/components.js", "core/project.js", "ui/primitives.jsx", "ui/dock.jsx",
  "ui/modal.jsx", "ui/palette.jsx", "panels/inspector.jsx", "panels/inspector-components.jsx",
  "panels/skybox.jsx", "panels/inspector-scene.jsx",
];
const source = (await Promise.all(modules.map(async (name) => {
  const source = await Deno.readTextFile(new URL(`../src/${name}`, import.meta.url));
  return (await esbuild.transform(source, { loader: name.endsWith("jsx") ? "jsx" : "js" })).code;
}))).join("\n");

function panelHarness() {
  const slots = [];
  let cursor = 0, changed = false, pending = [];
  const React = {
    Fragment: "fragment",
    createElement(type, props, ...children) { return { type, props: { ...props, children } }; },
    useState(initial) {
      const index = cursor++;
      if (!(index in slots)) slots[index] = typeof initial === "function" ? initial() : initial;
      return [slots[index], next => {
        const value = typeof next === "function" ? next(slots[index]) : next;
        if (!Object.is(slots[index], value)) { changed = true; slots[index] = value; }
      }];
    },
    useEffect(effect, deps) {
      const index = cursor++;
      if (!slots[index] || !deps || deps.some((value, i) => !Object.is(value, slots[index][i]))) pending.push(effect);
      slots[index] = deps;
    },
    useMemo: fn => fn(), useCallback: fn => fn, useLayoutEffect() {},
  };
  React.useRef = value => React.useState({ current: value })[0];
  const api = new Function("React", `${source}\nreturn { Inspector, MultiInspector, ComponentFields, FieldControl, Vec3Input, SceneSettings, ProjectSettings, AddComponentMenu, mkObject, mkProject, mkScene, makeComponent };`)(React);
  return {
    ...api,
    render(component, props, effects = true) {
      let tree;
      do {
        cursor = 0; pending = []; changed = false;
        tree = component(props);
        if (effects) for (const effect of pending) effect();
      } while (effects && changed);
      return tree;
    },
  };
}

function elements(tree, predicate) {
  if (!tree || typeof tree !== "object") return [];
  if (Array.isArray(tree)) return tree.flatMap(child => elements(child, predicate));
  return [
    ...(predicate(tree) ? [tree] : []),
    ...elements(tree.props?.children, predicate),
  ];
}
const named = (tree, name) => elements(tree, node => node.type?.name === name);
const section = (tree, title) => named(tree, "Section").find(node => node.props.title === title);
const controls = tree => named(tree, "FieldControl").map(node => node.props.field.key);
const text = tree => (tree?.props?.children || []).flat(Infinity).join("");

Deno.test("Inspector clears property search between objects and cannot apply a hidden filter", () => {
  const e = panelHarness(), object = e.mkObject("Detailed");
  for (const key of ["model", "camera", "script", "sound"]) object.components[key] = e.makeComponent(key);
  const props = { scene: { objects: [object] }, selection: [object], activeObject: object, files: [], problems: [] };
  let tree = e.render(e.Inspector, props);
  elements(tree, node => node.type === "input")[0].props.onChange({ target: { value: "zzzzzz" } });
  tree = e.render(e.Inspector, props);
  assertEquals(named(tree, "Section").length, 0);
  const simpler = e.mkObject("Simple");
  // Even before the selection effect runs, an invisible query cannot hide fields.
  tree = e.render(e.Inspector, { ...props, activeObject: simpler, selection: [simpler] }, false);
  assertEquals(named(tree, "Section").length, 1);
  e.render(e.Inspector, { ...props, activeObject: simpler, selection: [simpler] });
  tree = e.render(e.Inspector, props);
  assertEquals(elements(tree, node => node.type === "input")[0].props.value, "");
  assertEquals(named(tree, "Section").length, 5);
});

Deno.test("Inspector reveals a collapsed component when it receives an error", () => {
  const e = panelHarness(), object = e.mkObject("Model");
  object.components.model = e.makeComponent("model");
  const props = { scene: { objects: [object] }, selection: [object], activeObject: object, files: [], problems: [] };
  let tree = e.render(e.Inspector, props);
  section(tree, "Model").props.onToggle();
  tree = e.render(e.Inspector, props);
  assertEquals(section(tree, "Model").props.open, false);
  tree = e.render(e.Inspector, { ...props, problems: [{ objectId: object.id, component: "model", level: "error", message: "Invalid pipeline", field: "pipeline" }] });
  assertEquals(section(tree, "Model").props.open, true);
  assertEquals(named(tree, "ComponentFields").find(node => node.props.compKey === "model").props.issues[0].field, "pipeline");
  const fields = panelHarness();
  const fieldProps = { compKey: "model", comp: object.components.model, obj: object, scene: props.scene, files: [], issues: [], onChange() {} };
  assert(controls(fields.render(fields.ComponentFields, fieldProps)).includes("file"));
  assert(!controls(fields.render(fields.ComponentFields, fieldProps)).includes("pipeline"));
  assert(controls(fields.render(fields.ComponentFields, { ...fieldProps, issues: [{ level: "error", field: "pipeline", msg: "Invalid pipeline" }] })).includes("pipeline"));
});

Deno.test("searching for an advanced property reveals its component and controls", () => {
  const e = panelHarness(), object = e.mkObject("Detailed");
  for (const key of ["model", "camera", "script", "sound"]) object.components[key] = e.makeComponent(key);
  const props = { scene: { objects: [object] }, selection: [object], activeObject: object, files: [], problems: [] };
  const tree = e.render(e.Inspector, props);
  elements(tree, node => node.type === "input")[0].props.onChange({ target: { value: "Pipeline" } });
  const result = e.render(e.Inspector, props);
  assertEquals(section(result, "Model").props.open, true);
  assertEquals(named(result, "ComponentFields").find(node => node.props.compKey === "model").props.alwaysAdvanced, true);
});

Deno.test("Scene camera editing targets the actual camera and keeps fallback controls secondary", () => {
  const e = panelHarness(), project = e.mkProject(), scene = project.scenes[0];
  const camera = scene.objects.find(o => o.components.camera);
  let selected;
  const props = { scene, project, files: [], onSelectObject: id => { selected = id; }, onUpdate() {} };
  let tree = e.render(e.SceneSettings, props);
  section(tree, "Camera").props.onToggle();
  tree = e.render(e.SceneSettings, props);
  elements(tree, node => node.type === "button" && text(node) === "Edit camera")[0].props.onClick();
  assertEquals(selected, camera.id);
  const cameraSection = section(tree, "Camera");
  assert(named(cameraSection, "Advanced").some(node => node.props.label === "Fallback camera"));
  assert(!named(cameraSection, "Field").some(node => node.props.label === "Field of view" &&
    !named(cameraSection, "Advanced").some(advanced => named(advanced, "Field").includes(node))));
});

Deno.test("multi-selection has one add action, real collapse, and marks differing field values", () => {
  const e = panelHarness(), first = e.mkObject("First"), second = e.mkObject("Second");
  second.components.transform.position.x = 10;
  const props = { selection: [first, second], scene: { objects: [first, second] }, files: [] };
  let tree = e.render(e.MultiInspector, props);
  assertEquals(elements(tree, node => node.type === "button" && text(node).includes("Add component")).length, 1);
  assert(named(tree, "ComponentFields")[0].props.mixedFields.includes("position"));
  section(tree, "Transform").props.onToggle();
  tree = e.render(e.MultiInspector, props);
  assertEquals(section(tree, "Transform").props.open, false);
});

Deno.test("project start scene is one contextual choice and single-scene projects omit it", () => {
  const e = panelHarness(), project = e.mkProject();
  const props = { project, onUpdate() {}, onSetStartScene() {} };
  assert(!named(e.render(e.ProjectSettings, props), "Field").some(node => node.props.label === "Start scene"));
  project.scenes.push(e.mkScene("Second"));
  const tree = e.render(e.ProjectSettings, props);
  const field = named(tree, "Field").find(node => node.props.label === "Start scene");
  assertEquals(named(field, "Select")[0].props.options.length, 2);
  assert(!elements(tree, node => node.type === "button" && text(node) === "Set start").length);
});

Deno.test("editing one axis in a multi-selection preserves each object's other axes", () => {
  const e = panelHarness(), first = e.mkObject("First"), second = e.mkObject("Second");
  first.components.transform.position = { x: 1, y: 2, z: 3 };
  second.components.transform.position = { x: 4, y: 5, z: 6 };
  const changes = [];
  const tree = e.render(e.MultiInspector, {
    selection: [first, second], scene: { objects: [first, second] }, files: [],
    onUpdateComponent: (id, component, field, value) => changes.push({ id, component, field, value }),
  });
  named(tree, "ComponentFields")[0].props.onChange("position", { x: 10, y: 2, z: 3 }, "commit");
  assertEquals(changes[0].value, { x: 10, y: 2, z: 3 });
  assertEquals(changes[1].value, { x: 10, y: 5, z: 6 });
  assertEquals(changes[1].id, second.id);
});

Deno.test("typing the first object's existing axis value still sets that axis on every selected object", () => {
  const e = panelHarness(), first = e.mkObject("First"), second = e.mkObject("Second");
  first.components.transform.position = { x: 1, y: 2, z: 3 };
  second.components.transform.position = { x: 4, y: 5, z: 6 };
  const changes = [];
  const multi = e.render(e.MultiInspector, {
    selection: [first, second], scene: { objects: [first, second] }, files: [],
    onUpdateComponent: (id, component, field, value) => changes.push({ id, component, field, value }),
  });
  const fields = e.render(e.ComponentFields, named(multi, "ComponentFields")[0].props);
  const control = e.render(e.FieldControl, named(fields, "FieldControl")[0].props);
  const vector = e.render(e.Vec3Input, named(control, "Vec3Input")[0].props);
  named(vector, "NumInput").find(node => node.props.axis === "x").props.onChange(1, "commit");
  assertEquals(changes[0].value, { x: 1, y: 2, z: 3 });
  assertEquals(changes[1].value, { x: 1, y: 5, z: 6 });
});
