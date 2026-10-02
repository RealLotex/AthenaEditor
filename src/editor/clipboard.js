const EDITOR_CLIPBOARD_TYPE = "web application/x.atheditor.objects+json";
const EDITOR_CLIPBOARD_PREFIX = "AthEditor objects\n";

function objectAssetReferences(objects, visit) {
  walk(objects, (object) => {
    for (const [key, component] of Object.entries(object.components)) {
      for (const field of COMPONENTS[key]?.fields || []) {
        if (field.type === "asset" && component[field.key]) visit(component, field.key, field.cat);
      }
    }
  });
}

function makeObjectClipboard(project, scene, selectedIds, files) {
  const worlds = worldTransforms(scene.objects);
  const objects = selectionRoots(scene.objects, selectedIds).map((object) => {
    const copy = deepClone(object);
    copy.components.transform = { ...copy.components.transform, ...worlds.get(object.id) };
    return copy;
  });
  const references = new Set();
  objectAssetReferences(objects, (component, key, cat) => references.add(`${cat}/${component[key]}`));
  const assets = files.filter((file) => references.has(`${file.cat}/${file.name}`) && (file.content !== undefined || file.dataUrl)).map((file) => deepClone(file));
  return { kind: "atheditor.objects", version: 1, projectId: project.id, objects, assets };
}

function parseObjectClipboard(text) {
  if (!text?.startsWith(EDITOR_CLIPBOARD_PREFIX)) return null;
  if (text.length > 64 * 1024 * 1024) throw Error("The copied objects are too large to paste.");
  const payload = JSON.parse(text.slice(EDITOR_CLIPBOARD_PREFIX.length), (key, value) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw Error("Invalid object clipboard data.");
    return value;
  });
  if (payload?.kind !== "atheditor.objects" || payload.version !== 1 || !Array.isArray(payload.objects) || !payload.objects.length || !Array.isArray(payload.assets)) throw Error("Unsupported object clipboard data.");
  let count = 0;
  const check = (objects, depth) => {
    if (depth > 32) throw Error("The copied hierarchy is nested too deeply.");
    for (const object of objects) {
      if (++count > 10000 || !object || typeof object.name !== "string" || typeof object.id !== "string" || !object.components || Array.isArray(object.components) || typeof object.components !== "object" || !Array.isArray(object.children)) throw Error("Invalid copied object.");
      for (const component of Object.values(object.components)) if (!component || typeof component !== "object" || Array.isArray(component)) throw Error("Invalid copied component.");
      check(object.children, depth + 1);
    }
  };
  check(payload.objects, 0);
  for (const asset of payload.assets) {
    if (!asset || !Object.hasOwn(ASSET_CATEGORY_LABELS, asset.cat) || !/^[^\\/]+\.[a-z0-9]+$/i.test(asset.name) || asset.name.includes("..") ||
        !(typeof asset.content === "string" || typeof asset.dataUrl === "string" && /^data:[^,]*;base64,/.test(asset.dataUrl))) throw Error("Invalid copied asset.");
  }
  return payload;
}

function pasteObjectClipboard(project, scene, payload, external = []) {
  const objects = deepClone(payload.objects), names = new Map();
  for (const asset of payload.assets) {
    const files = editorAssets(project, external);
    const same = files.find((file) => file.cat === asset.cat && file.name === asset.name && file.content === asset.content && file.dataUrl === asset.dataUrl);
    const name = same?.name || freeAssetName(files, asset.name.replace(/\.[^.]+$/, ""), asset.name.split(".").at(-1));
    if (!same) putProjectAsset(project, { ...asset, id: uid(), name, libraryFolder: asset.libraryFolder || "Clipboard" });
    names.set(`${asset.cat}/${asset.name}`, name);
  }
  objectAssetReferences(objects, (component, key, cat) => {
    const name = names.get(`${cat}/${component[key]}`);
    if (name) component[key] = name;
  });
  if (payload.projectId !== project.id) walk(objects, (object) => {
    for (const key of ["_pid", "_prefabId", "_prefabBase", "_prefabNode"]) delete object[key];
  });
  const copies = cloneObjects(objects, scene.objects);
  scene.objects.push(...copies);
  return copies.map((object) => object.id);
}

function writeObjectClipboard(payload, sourceWindow = window) {
  const clipboard = sourceWindow.navigator?.clipboard;
  const text = EDITOR_CLIPBOARD_PREFIX + JSON.stringify(payload);
  const Item = sourceWindow.ClipboardItem;
  if (clipboard?.write && Item) {
    const data = { "text/plain": new Blob([text], { type: "text/plain" }) };
    if (Item.supports?.(EDITOR_CLIPBOARD_TYPE)) data[EDITOR_CLIPBOARD_TYPE] = new Blob([JSON.stringify(payload)], { type: "application/x.atheditor.objects+json" });
    return clipboard.write([new Item(data)]);
  }
  return clipboard?.writeText ? clipboard.writeText(text) : null;
}

async function readEditorClipboard(sourceWindow = window) {
  const clipboard = sourceWindow.navigator?.clipboard;
  if (clipboard?.read) {
    const items = await clipboard.read();
    for (const item of items) {
      if (item.types.includes(EDITOR_CLIPBOARD_TYPE)) return { payload: parseObjectClipboard(EDITOR_CLIPBOARD_PREFIX + await (await item.getType(EDITOR_CLIPBOARD_TYPE)).text()) };
      if (item.types.includes("text/plain")) {
        const payload = parseObjectClipboard(await (await item.getType("text/plain")).text());
        if (payload) return { payload };
      }
    }
    const files = [];
    for (const item of items) {
      const type = item.types.find((type) => ["image/png", "image/jpeg", "image/webp", "image/gif"].includes(type));
      if (type) files.push(new File([await item.getType(type)], `Clipboard.${type.split("/")[1]}`, { type }));
    }
    return { files };
  }
  if (clipboard?.readText) return { payload: parseObjectClipboard(await clipboard.readText()) };
  return null;
}

function writeCaptureClipboard(blob, sourceWindow = window) {
  if (!sourceWindow.navigator?.clipboard?.write || !sourceWindow.ClipboardItem) return null;
  return sourceWindow.navigator.clipboard.write([new sourceWindow.ClipboardItem({ "image/png": blob })]);
}
