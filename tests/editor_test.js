import { assert, assertEquals } from "jsr:@std/assert@1";
import * as esbuild from "npm:esbuild@0.24.0";
import { MODULES } from "../tools/modules.js";
import { fileStorage } from "./_file_storage.js";

// Exercise App's real panel callbacks and command handlers without a browser.
// Effects/DOM rendering are covered by the browser smoke check, not this harness.
const source = (await Promise.all(MODULES.map(async (name) => {
  const text = await Deno.readTextFile(
    new URL(`../src/${name}`, import.meta.url),
  );
  return (await esbuild.transform(text, {
    loader: name.endsWith("jsx") ? "jsx" : "js",
  })).code;
}))).join("\n");

function editor(browser = {}, fileStorage, savedProject, startAtWelcome = false) {
  const slots = [];
  const effects = [];
  const downloads = [];
  let cursor = 0;
  const React = {
    Component: class {},
    Fragment: "fragment",
    createElement: (type, props, ...children) => ({
      type,
      props: { ...props, children },
    }),
    useState(value) {
      const i = cursor++;
      if (!(i in slots)) {
        slots[i] = typeof value === "function" ? value() : value;
      }
      return [slots[i], (next) => {
        slots[i] = typeof next === "function" ? next(slots[i]) : next;
      }];
    },
    useRef(value) {
      return this.useState({ current: value })[0];
    },
    useMemo: (fn) => fn(),
    useCallback: (fn) => fn,
    useEffect(effect) {
      effects.push(effect);
    },
    useLayoutEffect() {},
  };
  React.useRef = (value) => React.useState({ current: value })[0];
  const A = new Function(
    "React",
    "ReactDOM",
    "document",
    "window",
    "localStorage",
    "navigator",
    "setTimeout",
    "indexedDB",
    `${source}\nreturn { App, mkObject, mkProject, makeComponent, v3 };`,
  )(
    React,
    { createRoot: () => ({ render() {} }) },
    {
      getElementById() {},
      body: { appendChild() {} },
      createElement() {
        return {
          click() {
            downloads.push({ href: this.href, name: this.download });
          },
          remove() {},
        };
      },
    },
    browser,
    {
      getItem: (key) =>
        key === "athena.editor.project" && savedProject
          ? JSON.stringify({ project: savedProject, at: Date.now() })
          : null,
    },
    { languages: ["en"] },
    () => 0,
    fileStorage,
  );
  // Most callback tests resume an existing editor session. First-run tests
  // opt into the welcome screen explicitly.
  if (!savedProject && !startAtWelcome) savedProject = A.mkProject();
  let tree;
  const render = () => {
    cursor = 0;
    effects.length = 0;
    tree = A.App();
  };
  const find = (name, node = tree) => {
    if (!node || typeof node !== "object") return null;
    if (node.type?.name === name) return node.props;
    if (node.type?.name === "DockWorkspace") {
      for (const panel of Object.values(node.props.panels)) {
        const hit = find(name, panel);
        if (hit) return hit;
      }
    }
    for (const child of [node.props?.children || node].flat(Infinity)) {
      if (child === node) continue;
      const hit = find(name, child);
      if (hit) return hit;
    }
    return null;
  };
  const command = (id) => {
    const c = find("MenuBar").commands.find((c) => c.id === id);
    assert(c, `missing command ${id}`);
    assert(!c.enabled || c.enabled(), `disabled command ${id}`);
    const result = c.run();
    render();
    return result;
  };
  render();
  return {
    ...A,
    render,
    find,
    command,
    downloads,
    startFolderRestore() {
      return effects.find((effect) =>
        effect.toString().includes("fsLoadHandle")
      )();
    },
    startLaunches() {
      return effects.find((effect) =>
        effect.toString().includes("launchQueue")
      )();
    },
    get project() {
      return find("MenuBar").project;
    },
  };
}

Deno.test("system clipboard transfers objects and assets between editors as one undo step, without falling back to stale copies", async () => {
  let text = "";
  const clipboard = {
    writeText: (value) => {
      text = value;
      return Promise.resolve();
    },
    readText: () => Promise.resolve(text),
  };
  const source = editor({ navigator: { clipboard } });
  source.command("add.model");
  await source.find("ModelPicker").onImport(new File(["v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"], "copy.obj"));
  source.find("ModelPicker").onClose();
  source.render();
  await source.command("edit.copy");
  const target = editor({ navigator: { clipboard } });
  const before = JSON.stringify(target.project);
  await target.command("edit.paste");
  target.render();
  assertEquals(target.project.scenes[0].objects.length, 3);
  assert(target.project.assets.some((asset) => asset.cat === "models"));
  const object = target.project.scenes[0].objects.at(-1);
  assert(
    target.project.assets.some((asset) =>
      asset.name === object.components.model.file
    ),
  );
  await target.command("file.exportPreview");
  target.render();
  assert(
    target.find("ExportModal").result.assets.some((asset) =>
      asset.filename.endsWith(object.components.model.file)
    ),
  );
  target.command("edit.undo");
  assertEquals(JSON.stringify(target.project), before);
  await source.command("edit.copy");
  text = "unrelated system clipboard text";
  const old = JSON.stringify(source.project);
  await source.command("edit.paste");
  source.render();
  assertEquals(JSON.stringify(source.project), old);
  text = 'AthEditor objects\n{"objects":[{}]}';
  await source.command("edit.paste");
  source.render();
  assertEquals(JSON.stringify(source.project), old);
});

Deno.test("native panel paste ignores text fields and transfers scene objects through the shared history", () => {
  const e = editor();
  e.command("add.empty");
  let text;
  const clipboard = {
    writeText: (value) => {
      text = value;
      return Promise.resolve();
    },
  };
  e.find("DockWorkspace").onWindowFocus({ navigator: { clipboard } });
  e.command("edit.copy");
  let prevented = false;
  const event = {
    target: { nodeType: 1, tagName: "TEXTAREA" },
    clipboardData: { getData: () => text },
    preventDefault: () => {
      prevented = true;
    },
  };
  const before = JSON.stringify(e.project);
  e.find("DockWorkspace").onPaste(event);
  e.render();
  assertEquals(prevented, false);
  assertEquals(JSON.stringify(e.project), before);
  event.target.tagName = "DIV";
  e.find("DockWorkspace").onPaste(event);
  e.render();
  assert(prevented);
  assertEquals(e.project.scenes[0].objects.length, 4);
  e.command("edit.undo");
  assertEquals(JSON.stringify(e.project), before);
});

Deno.test("every HUD type copies, pastes and duplicates through commands with independent properties and one-step undo", async () => {
  const e = editor();
  for (const type of ["Text","Panel","Button","ProgressBar","Image"]) {
    e.command(`add.ui.${type}`);
    const original = e.project.scenes[0].uiElements.at(-1), count = e.project.scenes[0].uiElements.length;
    assertEquals(e.find("Inspector").selection.length,0);
    await e.command("edit.copy");
    e.command("edit.duplicate");
    const duplicate = e.project.scenes[0].uiElements.at(-1);
    assert(duplicate.id!==original.id); assert(duplicate.name!==original.name);
    assertEquals([duplicate.x,duplicate.y],[original.x+12,original.y+12]);
    assertEquals(e.find("HUDEditor").selectedId,duplicate.id);
    e.command("edit.undo"); assertEquals(e.project.scenes[0].uiElements.length,count);
    e.command("edit.paste");
    const pasted = e.project.scenes[0].uiElements.at(-1);
    assertEquals(pasted.type,type); assert(pasted.id!==original.id);
    assertEquals([pasted.x,pasted.y],[original.x,original.y]);
    e.find("HUDEditor").onUpdate(pasted.id,{textColor:{r:12,g:34,b:56,a:64}});
    e.render();
    assertEquals(e.project.scenes[0].uiElements.find(el=>el.id===original.id).textColor,original.textColor);
    e.command("edit.undo"); e.command("edit.undo");
    assertEquals(e.project.scenes[0].uiElements.length,count);
  }
});

Deno.test("Ctrl+C and Ctrl+V execute on a canvas without native clipboard events and preserve text editing", () => {
  const e=editor(); e.command("add.ui.Text");
  let copyPrevented=false;
  e.find("DockWorkspace").onKeyDown({key:"c",ctrlKey:true,target:{nodeType:1,tagName:"DIV"},preventDefault(){copyPrevented=true;}});
  assert(copyPrevented);
  const before=e.project.scenes[0].uiElements.length;
  let prevented=false;
  const event={key:"v",ctrlKey:true,target:{nodeType:1,tagName:"INPUT"},preventDefault(){prevented=true;}};
  e.find("DockWorkspace").onKeyDown(event); e.render();
  assertEquals(prevented,false); assertEquals(e.project.scenes[0].uiElements.length,before);
  event.target.tagName="DIV";
  e.find("DockWorkspace").onKeyDown(event); e.render();
  assert(prevented); assertEquals(e.project.scenes[0].uiElements.length,before+1);
  e.command("edit.undo"); assertEquals(e.project.scenes[0].uiElements.length,before);
});

Deno.test("trusted paste supersedes pending clipboard permission so the same object is not pasted twice", async () => {
  let text, finish;
  const clipboard = {
    writeText: (value) => {
      text = value;
      return Promise.resolve();
    },
    readText: () =>
      new Promise((resolve) => {
        finish = resolve;
      }),
  };
  const e = editor({ navigator: { clipboard } });
  e.command("add.empty");
  await e.command("edit.copy");
  const pending = e.command("edit.paste");
  assertEquals(await e.command("edit.paste"), false);
  e.find("DockWorkspace").onPaste({
    target: { nodeType: 1, tagName: "DIV" },
    clipboardData: { getData: () => text },
    preventDefault() {},
  });
  e.render();
  assertEquals(e.project.scenes[0].objects.length, 4);
  finish(text);
  assertEquals(await pending, false);
  e.render();
  assertEquals(e.project.scenes[0].objects.length, 4);
  e.command("edit.undo");
  assertEquals(e.project.scenes[0].objects.length, 3);
});

Deno.test("HUD paste uses its internal copy when clipboard permission is denied", async () => {
  const clipboard={writeText:()=>Promise.reject(new DOMException("Denied","NotAllowedError")),readText:()=>Promise.reject(new DOMException("Denied","NotAllowedError"))};
  const e=editor({navigator:{clipboard}});e.command("add.ui.Panel");await e.command("edit.copy");
  await e.command("edit.paste");e.render();assertEquals(e.project.scenes[0].uiElements.length,2);
  await e.command("edit.paste");e.render();assertEquals(e.project.scenes[0].uiElements.length,3);
  e.command("edit.undo");assertEquals(e.project.scenes[0].uiElements.length,2);
});

Deno.test("native Copy transfers the selected HUD without clipboard API and preserves copying text fields", () => {
  const e=editor();e.command("add.ui.Text");let text,prevented=false;
  const event={target:{nodeType:1,tagName:"INPUT"},clipboardData:{setData(type,value){assertEquals(type,"text/plain");text=value;}},preventDefault(){prevented=true;}};
  e.find("DockWorkspace").onCopy(event);assertEquals(prevented,false);assertEquals(text,undefined);
  event.target.tagName="DIV";e.find("DockWorkspace").onCopy(event);assert(prevented);assert(text.startsWith("AthEditor HUD\n"));
  e.find("DockWorkspace").onPaste({target:event.target,clipboardData:{getData:()=>text},preventDefault(){}});e.render();
  assertEquals(e.project.scenes[0].uiElements.length,2);
  e.command("edit.undo");assertEquals(e.project.scenes[0].uiElements.length,1);
});

Deno.test("a delayed HUD clipboard read does not paste into a newly selected scene", async () => {
  let text,finish;
  const clipboard={writeText:value=>{text=value;return Promise.resolve();},readText:()=>new Promise(resolve=>finish=resolve)};
  const e=editor({navigator:{clipboard}});e.command("add.ui.Button");await e.command("edit.copy");
  const pending=e.command("edit.paste");e.command("file.newscene");finish(text);
  assertEquals(await pending,false);e.render();
  assertEquals(e.project.scenes[0].uiElements.length,1);assertEquals(e.project.scenes[1].uiElements.length,0);
});

Deno.test("retrying a shared receipt acknowledges existing assets and respects undo instead of importing them twice", async () => {
  const e = editor(),
    receipt = { receiptId: "00000000-0000-4000-8000-000000000000" };
  const transfer = {
    files: [new File(["export function update() {}"], "Shared.js")],
  };
  const drop = () =>
    e.find("Navigator").onDropAssets(transfer, "Scripts/Shared", receipt);
  assertEquals(await drop(), true);
  e.render();
  assertEquals(e.project.assets.length, 1);
  assertEquals(e.project.assets[0].shareReceipt, receipt.receiptId);
  assertEquals(await drop(), true);
  e.render();
  assertEquals(e.project.assets.length, 1);
  e.command("edit.undo");
  assertEquals(e.project.assets.length, 0);
  assertEquals(await drop(), true);
  e.render();
  assertEquals(e.project.assets.length, 0);
});

Deno.test("layout presets and panel movement leave the project and undo history untouched", () => {
  const e = editor();
  const initial = JSON.stringify(e.project);
  for (const name of ["Default", "Unity", "Unreal 4", "Unreal 5", "Godot"]) {
    e.command(`view.layout.${name}`);
    assertEquals(e.find("DockWorkspace").layout.preset, name);
    assertEquals(JSON.stringify(e.project), initial);
    assertEquals(e.find("MenuBar").dirty, false);
  }
  e.command("add.empty");
  e.command("view.layout.Unity");
  const layout = e.find("DockWorkspace").layout;
  e.find("DockWorkspace").onChange({ ...layout, preset: "Custom" });
  e.render();
  e.command("edit.undo");
  assertEquals(JSON.stringify(e.project), initial);
  assertEquals(e.find("DockWorkspace").layout.preset, "Custom");
});

Deno.test("View can reopen closed panels and workspace shortcuts expand collapsed groups", () => {
  const e = editor();
  e.command("view.left");
  assert(e.find("DockWorkspace").layout.hidden.includes("outliner"));
  e.command("view.panel.outliner");
  assert(!e.find("DockWorkspace").layout.hidden.includes("outliner"));
  e.command("view.layout.Unreal 5");
  e.command("view.panel.prefabs");
  const groups = [];
  const visit = (node) => {
    if (node.type === "group") groups.push(node);
    else node.children.forEach(visit);
  };
  visit(e.find("DockWorkspace").layout.tree);
  assertEquals(groups.find((g) => g.id === "library").collapsed, false);
  assertEquals(groups.find((g) => g.id === "library").active, "prefabs");
});

Deno.test("app texture tools commit generated files and model assignments as one undo step", () => {
  const e = editor();
  e.command("add.empty");
  const id = e.project.scenes[0].objects.at(-1).id;
  e.find("Inspector").onAddComponent(id, "model");
  e.render();
  e.command("tools.textures");
  const model = {
    ...e.makeComponent("model"),
    file: "generated.obj",
    textureFile: "generated.png",
  };
  e.find("TextureToolsModal").onApply({
    sceneId: e.project.activeSceneId,
    outputs: [{
      name: "generated.obj",
      cat: "models",
      content: "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
    }, {
      name: "generated.png",
      cat: "textures",
      dataUrl: "data:image/png;base64,AQID",
    }],
    updates: [{ id, model }],
  });
  e.render();
  assertEquals(e.project.assets.length, 2);
  assertEquals(
    e.project.scenes[0].objects.at(-1).components.model.file,
    "generated.obj",
  );
  e.command("edit.undo");
  assertEquals(e.project.assets.length, 0);
  assertEquals(e.project.scenes[0].objects.at(-1).components.model.file, "");
  e.command("edit.redo");
  assertEquals(e.project.assets.length, 2);
  assertEquals(
    e.project.scenes[0].objects.at(-1).components.model.file,
    "generated.obj",
  );
});

Deno.test("Add model waits for a file, imports and places it as one undo step, and cancellation leaves the scene intact", async () => {
  const e = editor(), before = JSON.stringify(e.project);
  e.command("add.model");
  assertEquals(JSON.stringify(e.project), before);
  e.find("ModelPicker").onClose(); e.render();
  assertEquals(JSON.stringify(e.project), before);
  e.command("add.model");
  const picker = e.find("ModelPicker");
  await picker.onImport(new File(["v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"], "Placed.obj"));
  picker.onClose(); e.render();
  assertEquals(e.project.assets.length, 1);
  assertEquals(e.find("Inspector").activeObject.components.model.file, "Placed.obj");
  e.command("edit.undo");
  assertEquals(JSON.stringify(e.project), before);
  assertEquals(e.find("SceneTools").hasSelection, false);
  e.command("edit.redo");
  assertEquals(e.project.assets.length, 1);
  const object = e.project.scenes[0].objects.at(-1);
  assertEquals(object.components.model.file, "Placed.obj");
});

Deno.test("model import rejects unreadable files and cannot place a late file into a different scene", async () => {
  const e = editor(), before = JSON.stringify(e.project);
  e.command("add.model");
  try { await e.find("ModelPicker").onImport(new File(["not a model"], "invalid.obj")); assert(false); }
  catch (error) { assert(error.message.includes("could not be read")); }
  assertEquals(JSON.stringify(e.project), before);
  let finish;
  const pending = e.find("ModelPicker").onImport({ name: "late.obj", text: () => new Promise(resolve => { finish = resolve; }) });
  e.command("file.newscene");
  const after = JSON.stringify(e.project);
  finish("v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n");
  assertEquals(await pending, false);
  assertEquals(JSON.stringify(e.project), after);
});

Deno.test("placing a library model uses the drop position, selects it and preserves assets through undo", async () => {
  const e = editor();
  await e.find("Navigator").onDropAssets({ files: [new File(["v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"], "chair.obj")] }); e.render();
  const before = JSON.stringify(e.project), asset = e.find("Navigator").files[0];
  e.find("Viewport").onPlaceAsset(asset, { x: 3, y: 0, z: -2 }); e.render();
  const obj = e.find("Inspector").activeObject;
  assertEquals(obj.components.model.file, "chair.obj");
  assertEquals(obj.components.transform.position, { x: 3, y: 0, z: -2 });
  e.command("edit.undo");
  assertEquals(JSON.stringify(e.project), before);
  e.command("add.model");
  e.find("ModelPicker").onChoose(asset); e.render();
  assertEquals(e.find("Inspector").activeObject.components.model.file, "chair.obj");
});

Deno.test("standalone Run gives an actionable export route and downloaded saves have their own status", async () => {
  const e = editor();
  assertEquals(e.find("MenuBar").canRunLocally, false);
  await e.command("file.play"); e.render();
  assertEquals(e.find("PlaySettingsModal").localAvailable, false);
  e.find("PlaySettingsModal").onExport(); e.render();
  // Export finishes asynchronously because it checks for a linked folder.
  await Promise.resolve(); await Promise.resolve(); e.render();
  assert(e.find("ExportModal"));
  await e.command("file.save"); e.render();
  assertEquals(e.find("StatusBar").downloadedFileName, e.downloads[0].name);
  assertEquals(e.find("StatusBar").dirty, false);
  for (const download of e.downloads) URL.revokeObjectURL(download.href);
});

Deno.test("app script edits coalesce for undo and attachment is saved on the selected object", () => {
  const e = editor();
  e.command("add.model");
  let props = e.find("ScriptWorkspace");
  props.onSave("Player.js", "// original");
  e.render();
  props = e.find("ScriptWorkspace");
  props.onSave("Player.js", "// first", "script:Player.js");
  props.onSave("Player.js", "// final", "script:Player.js");
  props.onSeal();
  e.render();
  assertEquals(e.project.scripts[0].content, "// final");
  e.command("edit.undo");
  assertEquals(e.project.scripts[0].content, "// original");
  e.command("edit.redo");
  assertEquals(e.project.scripts[0].content, "// final");
  const id = e.project.scenes[0].objects.at(-1).id;
  e.find("ScriptWorkspace").onAttach(id, "Player.js");
  e.render();
  assertEquals(
    e.project.scenes[0].objects.at(-1).components.script.file,
    "Player.js",
  );
});

Deno.test("saving a snapshot preserves later edits as unsaved and a subsequent save clears them", async () => {
  const e = editor();
  e.command("add.empty");
  const before = structuredClone(e.project);
  const pending = e.command("file.save");
  e.command("add.empty");
  await pending;
  e.render();
  assertEquals(e.downloads.length, 1);
  try {
    const saved = await (await fetch(e.downloads[0].href)).json();
    assertEquals(saved.scenes, before.scenes);
    assert(
      e.find("MenuBar").dirty,
      "edits made during save must remain unsaved",
    );
    await e.command("file.save");
    e.render();
    assert(
      !e.find("MenuBar").dirty,
      "saving the current project must clear unsaved state",
    );
    const latest = await (await fetch(e.downloads[1].href)).json();
    assertEquals(latest.scenes, e.project.scenes);
  } finally {
    for (const d of e.downloads) URL.revokeObjectURL(d.href);
  }
});

function nativeProjectFile(name, text = "") {
  let committed = text;
  const file = {
    kind: "file",
    name,
    writes: 0,
    aborted: 0,
    queryPermission: async () => "granted",
    getFile: async () => new Blob([committed]),
    async createWritable() {
      let draft;
      return {
        async write(json) {
          if (file.failWrite) throw Error("Disk full");
          draft = json;
        },
        async close() {
          if (file.beforeClose) await file.beforeClose();
          committed = draft;
          file.writes++;
        },
        async abort() {
          file.aborted++;
        },
      };
    },
    get text() {
      return committed;
    },
  };
  return file;
}

function projectAssetFolder(project, name = "ProjectFolder") {
  const saved = nativeProjectFile("scene.athena.json", JSON.stringify(project));
  const models = new Map([[
    "cube.obj",
    "v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n",
  ]]);
  let projectReads = 0;
  const getFile = saved.getFile;
  saved.getFile = () => {
    projectReads++;
    return getFile();
  };
  const folder = {
    kind: "directory",
    name,
    models,
    saved,
    queries: [],
    requests: [],
    readPermission: "granted",
    writePermission: "prompt",
    requestResult: "granted",
    get projectReads() {
      return projectReads;
    },
    async queryPermission({ mode }) {
      folder.queries.push(mode);
      return mode === "read" ? folder.readPermission : folder.writePermission;
    },
    async requestPermission({ mode }) {
      folder.requests.push(mode);
      if (folder.requestResult === "granted") folder.readPermission = "granted";
      return folder.requestResult;
    },
    entries: async function* () {
      if (folder.beforeRead) await folder.beforeRead();
      yield [saved.name, saved];
      yield ["3dmodels", {
        kind: "directory",
        entries: async function* () {
          for (const [name, content] of models) {
            yield [name, {
              kind: "file",
              getFile: async () => new File([content], name),
            }];
          }
        },
      }];
    },
  };
  return folder;
}

const settleFolderRead = () => new Promise((resolve) => setTimeout(resolve, 0));

Deno.test("dropping assets uses the chosen folder, embeds them for save/export and is one undo step", async () => {
  const file = nativeProjectFile("imported.atheditor");
  const e = editor({ showSaveFilePicker: () => Promise.resolve(file) });
  const mesh = new File(["v 0 0 0\nv 1 0 0\nv 0 1 0\nf 1 2 3\n"], "crate.obj");
  const script = new File(["export function update() {}"], "Player.js");
  assertEquals(
    await e.find("Navigator").onDropAssets(
      { files: [mesh] },
      "Models/Prototypes",
    ),
    true,
  );
  e.render();
  assertEquals(e.project.assets.length, 1);
  assertEquals(e.project.assets[0].libraryFolder, "Prototypes");
  assertEquals(e.find("MenuBar").dirty, true);
  e.command("edit.undo");
  assertEquals(e.project.assets.length, 0);
  e.command("edit.redo");
  await e.find("Navigator").onDropAssets({ files: [script] });
  e.render();
  await e.command("file.save");
  assertEquals(JSON.parse(file.text).assets.length, 1);
  assertEquals(JSON.parse(file.text).scripts[0].name, "Player.js");
  await e.command("file.exportPreview");
  e.render();
  const result = e.find("ExportModal").result;
  assert(
    result.assets.some((asset) => asset.filename === "3dmodels/crate.obj"),
  );
  assert(
    result.scripts.some((asset) => asset.filename === "scripts/Player.js"),
  );
});

Deno.test("an OS launch of the already open file focuses the editor without replacing unsaved work", async () => {
  const file = nativeProjectFile("work.atheditor");
  let consume, focuses = 0;
  const e = editor({
    showSaveFilePicker: () => Promise.resolve(file),
    focus: () => {
      focuses++;
    },
    launchQueue: {
      setConsumer: (callback) => {
        consume = callback;
      },
    },
  }, fileStorage().indexedDB);
  e.startLaunches();
  await e.command("file.save");
  e.command("add.empty");
  const edited = JSON.stringify(e.project);
  await consume({ files: [file] });
  e.render();
  assertEquals(focuses, 1);
  assertEquals(JSON.stringify(e.project), edited);
  assertEquals(e.find("MenuBar").dirty, true);
  assertEquals(e.find("ConfirmModal"), null);
  e.command("edit.undo");
  assertEquals(e.project.scenes[0].objects.length, 2);
});

Deno.test("OS launches queue project replacement confirmations and cancellation preserves the current project", async () => {
  let consume;
  const e = editor({
    launchQueue: {
      setConsumer: (callback) => {
        consume = callback;
      },
    },
  }, fileStorage().indexedDB);
  e.startLaunches();
  const b = nativeProjectFile("b.atheditor", JSON.stringify(e.mkProject("B")));
  const c = nativeProjectFile("c.atheditor", JSON.stringify(e.mkProject("C")));
  e.command("add.empty");
  const edited = JSON.stringify(e.project);
  const first = consume({ files: [b] });
  const second = consume({ files: [c] });
  await settleFolderRead();
  e.render();
  e.find("ConfirmModal").onClose();
  await first;
  assertEquals(JSON.stringify(e.project), edited);
  await settleFolderRead();
  e.render();
  assert(e.find("ConfirmModal"));
  e.find("ConfirmModal").onConfirm();
  await second;
  e.render();
  assertEquals(e.project.name, "C");
  assertEquals(e.find("StatusBar").projectFileName, "c.atheditor");
  e.command("file.recent");
  assertEquals(
    e.find("RecentProjectsModal").projects.map((entry) => entry.name),
    ["C"],
  );
});

Deno.test("New and Recent system shortcuts open their dialogs without navigating or changing the project", async () => {
  let consume;
  const e = editor({
    launchQueue: {
      setConsumer: (callback) => {
        consume = callback;
      },
    },
  });
  e.startLaunches();
  e.command("add.empty");
  const edited = JSON.stringify(e.project);
  await consume({ targetURL: "http://127.0.0.1:8080/?action=new" });
  e.render();
  assert(e.find("NewProjectModal"));
  assertEquals(JSON.stringify(e.project), edited);
  await consume({ targetURL: "http://127.0.0.1:8080/?action=recent" });
  e.render();
  assert(e.find("RecentProjectsModal"));
  assertEquals(JSON.stringify(e.project), edited);
});

Deno.test("a recent project restores its matching asset folder without another picker", async () => {
  let folder;
  const e = editor(
    { showDirectoryPicker: () => Promise.resolve(folder) },
    fileStorage().indexedDB,
  );
  folder = projectAssetFolder(e.project);
  await e.command("file.link");
  e.render();
  e.command("file.recent");
  const entry = e.find("RecentProjectsModal").projects[0];
  assertEquals(entry.folder, folder);
  e.command("file.new");
  await e.find("NewProjectModal").onCreate(e.mkProject("Another"), {
    id: "blank",
    label: "Blank",
  });
  e.render();
  e.command("file.recent");
  const pending = e.find("RecentProjectsModal").onOpen(entry);
  await settleFolderRead();
  e.render();
  e.find("ConfirmModal").onConfirm();
  await pending;
  e.render();
  assertEquals(e.find("StatusBar").folderName, folder.name);
  assertEquals(e.find("StatusBar").files.length, 1);
  assertEquals(e.find("StatusBar").projectFileName, folder.saved.name);
  assertEquals(folder.requests, []);
});

Deno.test("native panel shortcuts respect foreign-document text fields and use that window's file dialog", async () => {
  const file = nativeProjectFile("popup.atheditor");
  let parentPick = 0, childPick = 0;
  const e = editor({
    showSaveFilePicker() {
      parentPick++;
      return Promise.resolve(file);
    },
  });
  e.command("add.empty");
  const objects = e.project.scenes[0].objects.length;
  const key = {
    key: "z",
    ctrlKey: true,
    target: { nodeType: 1, tagName: "TEXTAREA" },
    preventDefault() {
      throw Error("The editor must leave text undo to the field");
    },
  };
  e.find("DockWorkspace").onKeyDown(key);
  e.render();
  assertEquals(e.project.scenes[0].objects.length, objects);
  e.find("DockWorkspace").onKeyDown({
    ...key,
    target: { nodeType: 1, tagName: "DIV" },
    preventDefault() {},
  });
  e.render();
  assertEquals(e.project.scenes[0].objects.length, objects - 1);
  e.find("DockWorkspace").onWindowFocus({
    showSaveFilePicker() {
      childPick++;
      return Promise.resolve(file);
    },
  });
  await e.command("file.save");
  assertEquals([parentPick, childPick], [0, 1]);
  assertEquals(file.writes, 1);
});

Deno.test("startup restores the matching folder's assets with read access without prompting or replacing the autosave", async () => {
  const project = editor().project, folder = projectAssetFolder(project);
  project.name = "Newer browser autosave";
  const storage = fileStorage();
  storage.data.set("projectDir", { handle: folder, projectId: project.id });
  const e = editor(
    {
      showDirectoryPicker() {
        throw Error("Unexpected picker");
      },
    },
    storage.indexedDB,
    project,
  );
  const cleanup = e.startFolderRestore();
  await settleFolderRead();
  e.render();
  assertEquals(e.project.name, "Newer browser autosave");
  assertEquals(
    e.find("StatusBar").files[0].content,
    folder.models.get("cube.obj"),
  );
  assertEquals(e.find("StatusBar").folderName, folder.name);
  assertEquals(e.find("StatusBar").folderNeedsGrant, true);
  assertEquals(e.find("StatusBar").folderNeedsReadAccess, false);
  assertEquals(e.find("MenuBar").dirty, false);
  assertEquals(folder.projectReads, 0);
  assertEquals(folder.requests, []);
  assertEquals(folder.queries, ["readwrite", "read"]);
  cleanup();
});

Deno.test("expired folder access resumes from the status bar with only read permission and preserves edits and undo", async () => {
  const project = editor().project, folder = projectAssetFolder(project);
  folder.readPermission = "prompt";
  const storage = fileStorage();
  storage.data.set("projectDir", { handle: folder, projectId: project.id });
  let picks = 0;
  const e = editor(
    {
      showDirectoryPicker() {
        picks++;
      },
    },
    storage.indexedDB,
    project,
  );
  e.startFolderRestore();
  await settleFolderRead();
  e.render();
  assertEquals(e.find("StatusBar").files.length, 0);
  assertEquals(e.find("StatusBar").folderNeedsReadAccess, true);
  assertEquals(folder.requests, []);
  e.command("add.empty");
  const edited = JSON.stringify(e.project);
  folder.requestResult = "denied";
  assertEquals(await e.find("StatusBar").onResumeFolder(), false);
  e.render();
  assertEquals(e.find("StatusBar").folderNeedsReadAccess, true);
  assertEquals(JSON.stringify(e.project), edited);
  folder.requestResult = "granted";
  assertEquals(await e.find("StatusBar").onResumeFolder(), true);
  e.render();
  assertEquals(e.find("StatusBar").folderNeedsReadAccess, false);
  assertEquals(e.find("StatusBar").files.length, 1);
  assertEquals(e.find("StatusBar").folderNeedsGrant, true);
  assertEquals(folder.requests, ["read", "read"]);
  assertEquals(folder.projectReads, 0);
  assertEquals(picks, 0);
  assertEquals(JSON.stringify(e.project), edited);
  assertEquals(e.find("MenuBar").dirty, true);
  e.command("edit.undo");
  assertEquals(
    e.project.scenes[0].objects.length,
    project.scenes[0].objects.length,
  );
});

Deno.test("Reload Assets updates disk files and removals without reopening the scene or changing its save destination", async () => {
  let folder;
  const e = editor(
    { showDirectoryPicker: () => Promise.resolve(folder) },
    fileStorage().indexedDB,
  );
  folder = projectAssetFolder(e.project);
  folder.models.set("removed.obj", "v 0 0 0\n");
  await e.command("file.link");
  e.render();
  const originalId =
    e.find("StatusBar").files.find((asset) => asset.name === "cube.obj").id;
  e.command("add.empty");
  const edited = JSON.stringify(e.project);
  folder.models.set("cube.obj", "v 9 0 0\n");
  folder.models.delete("removed.obj");
  await e.command("file.relink");
  e.render();
  const assets = e.find("StatusBar").files;
  assertEquals(assets.length, 1);
  assertEquals(assets[0].id, originalId);
  assertEquals(assets[0].content, "v 9 0 0\n");
  assertEquals(folder.requests, []);
  assertEquals(
    folder.projectReads,
    1,
    "only opening the folder reads its project file",
  );
  assertEquals(JSON.stringify(e.project), edited);
  assertEquals(e.find("StatusBar").projectFileName, folder.saved.name);
  assertEquals(e.find("MenuBar").dirty, true);
  e.command("edit.undo");
  assertEquals(e.project.scenes[0].objects.length, 2);
});

Deno.test("a delayed startup folder read cannot attach old assets to a newly opened project", async () => {
  const project = editor().project, folder = projectAssetFolder(project);
  let release;
  folder.beforeRead = () =>
    new Promise((resolve) => {
      release = resolve;
    });
  const storage = fileStorage();
  storage.data.set("projectDir", { handle: folder, projectId: project.id });
  const e = editor({ showDirectoryPicker() {} }, storage.indexedDB, project);
  const cleanup = e.startFolderRestore();
  await settleFolderRead();
  assert(release);
  e.command("file.new");
  await e.find("NewProjectModal").onCreate(e.mkProject("Different project"), {
    id: "blank",
    label: "Blank",
  });
  e.render();
  release();
  await settleFolderRead();
  e.render();
  assertEquals(e.project.name, "Different project");
  assertEquals(e.find("StatusBar").folderName, null);
  assertEquals(e.find("StatusBar").files.length, 0);
  cleanup();
});

Deno.test("native Save picks once, updates the same file after renaming, and Save As changes the destination", async () => {
  const first = nativeProjectFile("chosen.athena.json"),
    second = nativeProjectFile("copy.athena.json");
  let picks = 0;
  const e = editor({
    showSaveFilePicker: () => Promise.resolve(++picks === 1 ? first : second),
  });
  e.command("add.empty");
  assertEquals(await e.command("file.save"), true);
  e.render();
  assertEquals(e.find("StatusBar").projectFileName, first.name);
  e.find("MenuBar").onRenameProject("Renamed project");
  e.render();
  await e.command("file.save");
  assertEquals(picks, 1);
  assertEquals(JSON.parse(first.text).name, "Renamed project");
  await e.command("file.saveas");
  e.render();
  assertEquals(e.find("StatusBar").projectFileName, second.name);
  e.command("add.empty");
  await e.command("file.save");
  assertEquals(picks, 2);
  assertEquals(first.writes, 2);
  assertEquals(second.writes, 2);
  assertEquals(e.downloads.length, 0);
});

Deno.test("cancelled and failed Save As keep the previous file and unsaved edits", async () => {
  const first = nativeProjectFile("original.json"),
    failing = nativeProjectFile("failed.json", "keep this");
  let pick = first;
  const e = editor({
    showSaveFilePicker: () => {
      if (!pick) throw new DOMException("Cancelled", "AbortError");
      return Promise.resolve(pick);
    },
  });
  await e.command("file.save");
  e.command("add.empty");
  pick = null;
  assertEquals(await e.command("file.saveas"), false);
  e.render();
  assert(e.find("MenuBar").dirty);
  assertEquals(e.find("StatusBar").projectFileName, first.name);
  pick = failing;
  failing.failWrite = true;
  assertEquals(await e.command("file.saveas"), false);
  e.render();
  assertEquals(failing.text, "keep this");
  assertEquals(failing.aborted, 1);
  assert(e.find("MenuBar").dirty);
  assertEquals(e.find("StatusBar").projectFileName, first.name);
  await e.command("file.save");
  assertEquals(first.writes, 2);
  assertEquals(e.downloads.length, 0);
});

Deno.test("edits during a native disk write remain unsaved until the next save", async () => {
  const file = nativeProjectFile("project.json");
  let release;
  file.beforeClose = () =>
    new Promise((r) => {
      release = r;
    });
  const e = editor({ showSaveFilePicker: () => Promise.resolve(file) });
  e.command("add.empty");
  const before = structuredClone(e.project);
  const pending = e.command("file.save");
  await new Promise((r) => setTimeout(r, 0));
  e.command("add.empty");
  release();
  await pending;
  e.render();
  assertEquals(JSON.parse(file.text).scenes, before.scenes);
  assert(e.find("MenuBar").dirty);
  file.beforeClose = null;
  await e.command("file.save");
  e.render();
  assertEquals(JSON.parse(file.text).scenes, e.project.scenes);
  assertEquals(e.find("MenuBar").dirty, false);
});

Deno.test("declining native write access preserves dirty state without downloading another copy", async () => {
  const file = nativeProjectFile("project.json");
  let grants = 0;
  file.queryPermission = async () => "prompt";
  file.requestPermission = async () => {
    grants++;
    return "denied";
  };
  const e = editor({ showSaveFilePicker: () => Promise.resolve(file) });
  e.command("add.empty");
  assertEquals(await e.command("file.save"), false);
  e.render();
  assertEquals(grants, 1);
  assertEquals(file.writes, 0);
  assertEquals(e.downloads.length, 0);
  assert(e.find("MenuBar").dirty);
});

Deno.test("opening a native project replaces the save destination and unlinks the previous project folder", async () => {
  const a = nativeProjectFile("a.athena.json"),
    b = nativeProjectFile("b.athena.json");
  const browser = {
    showDirectoryPicker: () =>
      Promise.resolve({
        kind: "directory",
        name: "FolderA",
        queryPermission: async () => "granted",
        entries: async function* () {
          yield [a.name, a];
        },
      }),
    showOpenFilePicker: () => Promise.resolve([b]),
    showSaveFilePicker() {
      throw Error("existing file should be reused");
    },
  };
  const e = editor(browser, {
    open() {
      throw Error("storage unavailable");
    },
  });
  // Replace the stand-in's contents with actual project JSON before opening.
  const write = async (file, project) => {
    const w = await file.createWritable();
    await w.write(JSON.stringify(project));
    await w.close();
  };
  await write(a, { ...e.project, name: "Project A" });
  await write(b, { ...e.mkProject(), name: "Project B" });
  await e.command("file.link");
  e.render();
  assertEquals(e.find("StatusBar").folderName, "FolderA");
  assertEquals(e.find("StatusBar").projectFileName, a.name);
  await e.command("file.openjson");
  e.render();
  assertEquals(e.project.name, "Project B");
  assertEquals(e.find("StatusBar").folderName, null);
  assertEquals(e.find("StatusBar").projectFileName, b.name);
  e.command("add.empty");
  await e.command("file.save");
  assertEquals(a.writes, 1);
  assertEquals(b.writes, 2);
});

Deno.test("invalid native projects and cancelled replacement preserve the current project, file and undo", async () => {
  const current = nativeProjectFile("current.json"),
    invalid = nativeProjectFile("invalid.json", "{}");
  let opening = invalid;
  const e = editor({
    showSaveFilePicker: () => Promise.resolve(current),
    showOpenFilePicker: () => Promise.resolve([opening]),
  });
  await e.command("file.save");
  const before = structuredClone(e.project);
  e.command("add.empty");
  assertEquals(await e.command("file.openjson"), false);
  e.render();
  assert(e.find("MenuBar").dirty);
  assertEquals(e.find("StatusBar").projectFileName, current.name);
  opening = nativeProjectFile(
    "other.json",
    JSON.stringify({ ...e.mkProject(), name: "Other" }),
  );
  const pending = e.command("file.openjson");
  await new Promise((r) => setTimeout(r, 0));
  e.render();
  const confirm = e.find("ConfirmModal");
  assert(confirm, "opening another project must ask before replacing edits");
  confirm.onClose();
  assertEquals(await pending, false);
  e.render();
  assertEquals(e.find("StatusBar").projectFileName, current.name);
  e.command("edit.undo");
  assertEquals(e.project.scenes, before.scenes);
});

Deno.test("declining a different folder's project keeps the original folder and file destinations", async () => {
  let picked;
  const e = editor({
    showDirectoryPicker: () => Promise.resolve(picked),
    showSaveFilePicker() {
      throw Error("must keep the original file");
    },
  }, {
    open() {
      throw Error("storage unavailable");
    },
  });
  const fileA = nativeProjectFile(
    "a.athena.json",
    JSON.stringify({ ...e.project, name: "A" }),
  );
  const fileB = nativeProjectFile(
    "b.athena.json",
    JSON.stringify({ ...e.mkProject(), name: "B" }),
  );
  const directory = (name, file) => ({
    kind: "directory",
    name,
    entries: async function* () {
      yield [file.name, file];
    },
  });
  picked = directory("FolderA", fileA);
  await e.command("file.link");
  e.render();
  e.command("add.empty");
  picked = directory("FolderB", fileB);
  const pending = e.command("file.link");
  await new Promise((r) => setTimeout(r, 0));
  e.render();
  e.find("ConfirmModal").onClose();
  await pending;
  e.render();
  assertEquals(e.project.name, "A");
  assertEquals(e.find("StatusBar").folderName, "FolderA");
  assertEquals(e.find("StatusBar").projectFileName, fileA.name);
  await e.command("file.save");
  assertEquals(fileA.writes, 1);
  assertEquals(fileB.writes, 0);
});

Deno.test("an in-flight save keeps later edits dirty and cannot bind its file to a new project", async () => {
  const a = nativeProjectFile("a.json"), b = nativeProjectFile("b.json");
  let release;
  a.beforeClose = () =>
    new Promise((r) => {
      release = r;
    });
  let picks = 0;
  const e = editor({
    showSaveFilePicker: () => Promise.resolve(++picks === 1 ? a : b),
  });
  e.command("add.empty");
  const pending = e.command("file.save");
  await new Promise((r) => setTimeout(r, 0));
  assert(release);
  assertEquals(
    await e.command("file.save"),
    false,
    "concurrent save should not open a second picker",
  );
  e.command("file.new");
  const creating = e.find("NewProjectModal").onCreate(e.mkProject("New project"), {
    id: "blank",
    label: "Blank",
  });
  e.render();
  e.find("ConfirmModal").onConfirm();
  await creating;
  release();
  await pending;
  e.render();
  assert(e.find("MenuBar").dirty);
  assertEquals(e.find("StatusBar").projectFileName, null);
  await e.command("file.save");
  assertEquals(picks, 2);
  assertEquals(b.writes, 1);
});

Deno.test("committing a transform takes one undo and one redo, without an empty step", () => {
  const e = editor(), id = e.project.scenes[0].objects[0].id;
  const original = structuredClone(
    e.project.scenes[0].objects[0].components.transform,
  );
  const moved = { ...original, position: e.v3(4, 5, 6) };
  e.find("Viewport").onTransform(id, moved, "edit");
  e.render();
  e.find("Viewport").onTransform(id, moved, "commit");
  e.render();
  e.command("edit.undo");
  assertEquals(e.project.scenes[0].objects[0].components.transform, original);
  e.command("edit.redo");
  assertEquals(e.project.scenes[0].objects[0].components.transform, moved);
});

Deno.test("duplicating a parent and selected child creates one subtree beside the original", () => {
  const e = editor();
  e.command("add.empty");
  const parent = e.project.scenes[0].objects.at(-1);
  e.command("add.empty");
  const child = e.project.scenes[0].objects.at(-1);
  e.find("Outliner").onReparent(child.id, parent.id, "inside");
  e.render();
  e.find("Outliner").onSelect(parent.id);
  e.render();
  e.find("Outliner").onSelect(child.id, { additive: true });
  e.render();
  e.command("edit.duplicate");
  const objects = e.project.scenes[0].objects;
  assertEquals(objects.length, 4); // two defaults, original parent, copied parent
  assertEquals(objects.at(-1).children.length, 1);
  assert(objects.at(-1).children[0].id !== child.id);
  const names = objects.flatMap((
    o,
  ) => [o.name, ...o.children.map((c) => c.name)]);
  assertEquals(new Set(names).size, names.length);
});

Deno.test("duplicating a nested object preserves its parent and world placement", () => {
  const e = editor();
  e.command("add.empty");
  const parent = e.project.scenes[0].objects.at(-1);
  e.command("add.empty");
  const child = e.project.scenes[0].objects.at(-1);
  e.find("Outliner").onReparent(child.id, parent.id, "inside");
  e.render();
  e.find("Outliner").onSelect(child.id);
  e.render();
  e.command("edit.duplicate");
  const children = e.project.scenes[0].objects.at(-1).children;
  assertEquals(children.length, 2);
  assertEquals(
    children[0].components.transform,
    children[1].components.transform,
  );
});

Deno.test("renaming a light updates a shadow's explicit reference and undo restores both", () => {
  const e = editor();
  const sun = e.project.scenes[0].objects[0];
  e.command("add.shadow");
  const shadow = e.project.scenes[0].objects.at(-1);
  e.find("Inspector").onUpdateComponent(
    shadow.id,
    "shadow",
    "lightSource",
    sun.name,
    "commit",
  );
  e.render();
  e.find("Outliner").onRename(sun.id, "KeyLight");
  e.render();
  assertEquals(
    e.project.scenes[0].objects.at(-1).components.shadow.lightSource,
    "KeyLight",
  );
  e.command("edit.undo");
  assertEquals(
    e.project.scenes[0].objects.at(-1).components.shadow.lightSource,
    sun.name,
  );
});

Deno.test("duplicate and paste keep shadow references within the copied selection", () => {
  for (const action of ["duplicate", "paste"]) {
    const e = editor();
    const sun = e.project.scenes[0].objects[0];
    e.command("add.model");
    const model = e.project.scenes[0].objects.at(-1);
    e.command("add.shadow");
    const shadow = e.project.scenes[0].objects.at(-1);
    e.find("Inspector").onUpdateComponent(
      shadow.id,
      "shadow",
      "caster",
      model.name,
      "commit",
    );
    e.render();
    e.find("Inspector").onUpdateComponent(
      shadow.id,
      "shadow",
      "lightSource",
      sun.name,
      "commit",
    );
    e.render();
    e.find("Outliner").onSelect(model.id);
    e.render();
    e.find("Outliner").onSelect(shadow.id, { additive: true });
    e.render();
    if (action === "paste") {
      e.command("edit.copy");
      e.command("edit.paste");
    } else e.command("edit.duplicate");
    const [copiedModel, copiedShadow] = e.project.scenes[0].objects.slice(-2);
    assertEquals(copiedShadow.components.shadow.caster, copiedModel.name);
    assert(copiedModel.name !== model.name);
    assertEquals(copiedShadow.components.shadow.lightSource, sun.name);
    assertEquals(
      e.project.scenes[0].objects.find((o) => o.id === shadow.id).components
        .shadow.caster,
      model.name,
    );
  }
});

Deno.test("copying a nested selection pastes one subtree at its world position", () => {
  const e = editor();
  e.command("add.empty");
  const parent = e.project.scenes[0].objects.at(-1);
  e.command("add.empty");
  const child = e.project.scenes[0].objects.at(-1);
  e.find("Outliner").onReparent(child.id, parent.id, "inside");
  e.render();
  e.find("Viewport").onTransform(parent.id, {
    ...parent.components.transform,
    position: e.v3(4, 2, 3),
  }, "commit");
  e.render();
  e.find("Outliner").onSelect(child.id);
  e.render();
  e.command("edit.copy");
  e.command("edit.paste");
  assertEquals(
    e.project.scenes[0].objects.at(-1).components.transform.position,
    e.v3(4, 2, 3),
  );
  e.command("edit.undo");
  assertEquals(e.project.scenes[0].objects.length, 3);
});

Deno.test("HUD gestures and deletion can be undone without an empty step", () => {
  const e = editor();
  e.command("add.ui.Text");
  const el = e.project.scenes[0].uiElements[0];
  e.find("HUDEditor").onUpdate(el.id, { x: 175, text: "Score" }, "edit");
  e.render();
  e.find("HUDEditor").onUpdate(el.id, { x: 175, text: "Score" }, "commit");
  e.render();
  e.command("edit.undo");
  assertEquals(e.project.scenes[0].uiElements[0], el);
  e.command("edit.redo");
  e.find("HUDEditor").onDelete(el.id);
  e.render();
  assertEquals(e.project.scenes[0].uiElements.length, 0);
  e.command("edit.undo");
  assertEquals(e.project.scenes[0].uiElements[0].text, "Score");
});

Deno.test("outliner deletion removes a subtree and can be undone", () => {
  const e = editor();
  e.command("add.empty");
  const parent = e.project.scenes[0].objects.at(-1);
  e.command("add.empty");
  const child = e.project.scenes[0].objects.at(-1);
  e.find("Outliner").onReparent(child.id, parent.id, "inside");
  e.render();
  e.find("Outliner").onDelete(parent.id);
  e.render();
  assert(!e.project.scenes[0].objects.some((o) => o.id === parent.id));
  e.command("edit.undo");
  assertEquals(
    e.project.scenes[0].objects.find((o) => o.id === parent.id).children[0].id,
    child.id,
  );
  e.command("add.ui.Text");
  const el = e.project.scenes[0].uiElements[0];
  e.find("Outliner").onDeleteUI(el.id);
  e.render();
  assertEquals(e.project.scenes[0].uiElements.length, 0);
  e.command("edit.undo");
  assertEquals(e.project.scenes[0].uiElements[0].id, el.id);
});

Deno.test("UV workspace updates its working copy in one undo step", () => {
  const e = editor(), obj = e.mkObject("Cube"), sc = e.project.scenes[0];
  const original =
    "v 0 0 0\nv 1 0 0\nv 0 1 0\nvt 0 0\nvt 1 0\nvt 0 1\nf 1/1 2/2 3/3\n";
  obj.components.model = { ...e.makeComponent("model"), file: "cube.obj" };
  sc.objects.push(obj);
  e.project.assets.push({
    name: "cube.obj",
    id: "mesh",
    cat: "models",
    content: original,
    owned: true,
  });
  e.render();
  e.find("MenuBar").commands.find((c) => c.id === "tools.uv").run();
  e.render();
  e.find("UVWorkspace").onApply(obj.id, original + "# first\n");
  e.render();
  const name = e.project.scenes[0].objects.at(-1).components.model.file;
  e.find("UVWorkspace").onApply(obj.id, original + "# second\n");
  e.render();
  assertEquals(e.project.assets.length, 2);
  e.command("edit.undo");
  assertEquals(
    e.project.assets.find((f) => f.name === name).content,
    original + "# first\n",
  );
  e.command("edit.undo");
  assertEquals(e.project.assets.length, 1);
  assertEquals(
    e.project.scenes[0].objects.at(-1).components.model.file,
    "cube.obj",
  );
  e.command("edit.redo");
  assertEquals(e.project.scenes[0].objects.at(-1).components.model.file, name);
});

Deno.test("terrain panel commits a whole brush stroke with its mesh in one undo step", () => {
  const seed=editor(),p=seed.project,object=seed.mkObject("Terrain");
  object._terrain={version:1,width:4,depth:4,cellSize:1,stepHeight:1,bevel:.18,
    levels:Array(16).fill(0),hills:Array(25).fill(0),surfaces:Array(16).fill(0),textures:["","","",""]};
  object.components.model={...seed.makeComponent("model"),file:"terrain.obj"};
  p.scenes[0].objects.push(object);
  p.assets=[{id:"terrain-asset",name:"terrain.obj",cat:"models",owned:true,editKind:"terrain",content:"v 0 0 0\nv 1 0 0\nv 0 0 1\nf 1 3 2\n"}];
  const e=editor({},undefined,p),before=JSON.stringify(e.project);
  e.command("add.terrain");
  const data=structuredClone(object._terrain);data.levels[5]=3;data.levels[6]=3;
  e.find("TerrainWorkspace").onApply(object.id,data);e.render();
  assertEquals(e.project.scenes[0].objects.at(-1)._terrain.levels,data.levels);
  assertEquals(e.project.assets.length,1);
  assert(e.project.assets[0].content.includes("vn "));
  const after=JSON.stringify(e.project);
  e.command("edit.undo");assertEquals(JSON.stringify(e.project),before);
  e.command("edit.redo");assertEquals(JSON.stringify(e.project),after);
});

Deno.test("deleting a scene repairs the start scene and inbound transitions; undo restores them", () => {
  const e = editor();
  const first = e.project.scenes[0].id;
  e.command("file.newscene");
  const second = e.project.activeSceneId;
  // Set up saved project metadata; the deletion itself uses the actual command.
  e.project.startSceneId = second;
  e.project.scenes[0].transitions = [{
    id: "test-transition",
    name: "next",
    targetSceneId: second,
  }];
  e.command("file.deletescene");
  e.find("ConfirmModal").onConfirm();
  e.render();
  assertEquals(e.project.startSceneId, first);
  assertEquals(e.project.scenes[0].transitions, []);
  e.command("edit.undo");
  assertEquals(e.project.startSceneId, second);
  assertEquals(e.project.scenes[0].transitions[0].targetSceneId, second);
});

Deno.test("first run starts at the welcome screen and creation enters the Focus workspace", async () => {
  const e = editor({}, undefined, undefined, true);
  assert(e.find("WelcomeScreen"));
  assertEquals(e.find("MenuBar"), null);
  e.find("WelcomeScreen").onCreate();
  e.render();
  await e.find("NewProjectModal").onCreate(e.mkProject("First game"), { id: "blank", label: "Empty" });
  e.render();
  assertEquals(e.find("WelcomeScreen"), null);
  assertEquals(e.project.name, "First game");
  assertEquals(e.find("DockWorkspace").layout.preset, "Focus");
});

Deno.test("new projects enter Focus from a customized layout without altering a cancelled replacement", async () => {
  const e = editor();
  e.command("view.layout.Unity");
  e.command("file.new");
  await e.find("NewProjectModal").onCreate(e.mkProject("Fresh game"), { id: "empty" });
  e.render();
  assertEquals(e.find("DockWorkspace").layout.preset, "Focus");
  e.command("add.empty");
  e.command("view.layout.Godot");
  e.command("file.new");
  const pending = e.find("NewProjectModal").onCreate(e.mkProject("Cancelled"), { id: "empty" });
  e.render();
  e.find("ConfirmModal").onClose();
  await pending;
  e.render();
  assertEquals(e.find("DockWorkspace").layout.preset, "Godot");
  assertEquals(e.project.name, "Fresh game");
});

Deno.test("object selection returns to properties and scoped add blocks scene shortcuts until dismissed", () => {
  const e = editor();
  e.command("add.empty");
  const id = e.find("Inspector").activeObject.id;
  e.find("Inspector").onEditScene();
  e.render();
  assertEquals(e.find("DockWorkspace").layout.tree.children[1].active, "sceneSettings");
  e.find("Outliner").onSelect(id, {});
  e.render();
  assertEquals(e.find("DockWorkspace").layout.tree.children[1].active, "inspector");
  assertEquals(e.find("SceneTools").hasSelection, true);
  e.find("SceneTools").onAdd();
  e.render();
  assertEquals(e.find("CommandPalette").scope, "objects");
  const before = JSON.stringify(e.project);
  const key = e.find("DockWorkspace").onKeyDown;
  key({ key: "Delete", target: { nodeType: 1, tagName: "BUTTON" }, preventDefault() {} });
  assertEquals(JSON.stringify(e.project), before);
  key({ key: "k", ctrlKey: true, target: {}, preventDefault() {} });
  e.render();
  assertEquals(e.find("CommandPalette").scope, null);
  e.find("CommandPalette").onClose();
  e.render();
  e.find("Outliner").onSelect(null);
  e.render();
  assertEquals(e.find("SceneTools").hasSelection, false);
});

Deno.test("cancelling replacement from New preserves unsaved objects and their undo history", async () => {
  const e = editor(), original = JSON.stringify(e.project);
  e.command("add.empty");
  const modified = JSON.stringify(e.project);
  e.command("file.new");
  const pending = e.find("NewProjectModal").onCreate(e.mkProject("Replacement"), { id: "blank", label: "Empty" });
  e.render();
  e.find("ConfirmModal").onClose();
  assertEquals(await pending, false);
  e.render();
  assertEquals(JSON.stringify(e.project), modified);
  e.command("edit.undo");
  assertEquals(JSON.stringify(e.project), original);
});

Deno.test("an export error in another level reveals that scene and its affected object", async () => {
  const seed = editor(), project = seed.project, first = project.activeSceneId;
  seed.command("file.newscene");
  const second = project.scenes.find(s => s.id !== first) || seed.project.scenes.find(s => s.id !== first);
  const object = seed.mkObject("Missing model");
  object.components.model = { ...seed.makeComponent("model"), file: "missing.obj" };
  second.objects.push(object);
  const saved = structuredClone(seed.project);
  saved.activeSceneId = first;
  const e = editor({}, undefined, saved);
  await e.command("file.exportPreview");
  e.render();
  const modal = e.find("ExportModal");
  const error = modal.result.diagnostics.find(d => d.sceneId === second.id && d.objectId === object.id);
  assert(error);
  modal.onReveal(error);
  e.render();
  assertEquals(e.project.activeSceneId, second.id);
  assertEquals(e.find("Inspector").activeObject.id, object.id);
});

Deno.test("scene exits get distinct defaults and their names can be edited with undo", () => {
  const e = editor(), first = e.project.activeSceneId;
  e.command("file.newscene");
  e.command("file.newscene");
  const targets = e.project.scenes.filter(s => s.id !== first);
  for (const target of targets) target.name = "Same level";
  e.find("MenuBar").onSwitchScene(first);
  e.render();
  for (const target of targets) { e.find("SceneSettings").onAddTransition(target.id); e.render(); }
  const transitions = e.project.scenes[0].transitions;
  assertEquals(new Set(transitions.map(t => t.name)).size, 2);
  const original = transitions[0].name;
  e.find("SceneSettings").onUpdate("transitions.0.name", "Exit A");
  e.render();
  assertEquals(e.project.scenes[0].transitions[0].name, "Exit A");
  e.command("edit.undo");
  assertEquals(e.project.scenes[0].transitions[0].name, original);
});
