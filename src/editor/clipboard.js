const EDITOR_CLIPBOARD_TYPE = "web application/x.atheditor.objects+json";
const EDITOR_CLIPBOARD_PREFIX = "AthEditor objects\n";
const HUD_CLIPBOARD_TYPE = "web application/x.atheditor.hud+json";
const HUD_CLIPBOARD_PREFIX = "AthEditor HUD\n";

const clipboardItemCount = payload => payload?.objects?.length || payload?.elements?.length || 0;
const isEditorClipboardText = text => text?.startsWith(EDITOR_CLIPBOARD_PREFIX) || text?.startsWith(HUD_CLIPBOARD_PREFIX);

function hudAssetReferences(elements, visit) {
  for (const element of elements) {
    if (element.image) visit(element, "image", "textures");
    if (element.fontFile && element.fontFile !== "default") visit(element, "fontFile", "fonts");
    if (element.script?.file) visit(element.script, "file", "scripts");
  }
}

function makeHUDClipboard(project, scene, selectedIds, files) {
  const elements = deepClone(scene.uiElements.filter(el => selectedIds.includes(el.id)));
  const references = new Set();
  hudAssetReferences(elements, (holder, key, cat) => references.add(`${cat}/${holder[key]}`));
  const assets = files.filter(file => references.has(`${file.cat}/${file.name}`) && (file.content !== undefined || file.dataUrl)).map(deepClone);
  return { kind: "atheditor.hud", version: 1, projectId: project.id, elements, assets };
}

function cloneHUDElements(elements, existing, offset = 0) {
  const copies = [];
  for (const element of elements) {
    const copy = deepClone(element);
    copy.id = uid(); copy.name = uniqueName(copy.name, [...existing, ...copies]);
    copy.x += offset; copy.y += offset;
    if (copy.script?.ctxKey) {
      const used = new Set([...existing, ...copies].map(el => el.script?.ctxKey));
      const base = copy.script.ctxKey;
      for (let n = 2; used.has(copy.script.ctxKey); n++) copy.script.ctxKey = `${base}_${n}`;
    }
    copies.push(copy);
  }
  return copies;
}

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
  if (!isEditorClipboardText(text)) return null;
  if (text.length > 64 * 1024 * 1024) throw Error("The copied objects are too large to paste.");
  const hud = text.startsWith(HUD_CLIPBOARD_PREFIX);
  const payload = JSON.parse(text.slice((hud ? HUD_CLIPBOARD_PREFIX : EDITOR_CLIPBOARD_PREFIX).length), (key, value) => {
    if (["__proto__", "prototype", "constructor"].includes(key)) throw Error("Invalid object clipboard data.");
    return value;
  });
  if (payload?.kind !== (hud ? "atheditor.hud" : "atheditor.objects") || payload.version !== 1 ||
      !Array.isArray(hud ? payload.elements : payload.objects) || !clipboardItemCount(payload) || !Array.isArray(payload.assets)) throw Error("Unsupported editor clipboard data.");
  let count = 0;
  const check = (objects, depth) => {
    if (depth > 32) throw Error("The copied hierarchy is nested too deeply.");
    for (const object of objects) {
      if (++count > 10000 || !object || typeof object.name !== "string" || typeof object.id !== "string" || !object.components || Array.isArray(object.components) || typeof object.components !== "object" || !Array.isArray(object.children)) throw Error("Invalid copied object.");
      for (const component of Object.values(object.components)) if (!component || typeof component !== "object" || Array.isArray(component)) throw Error("Invalid copied component.");
      check(object.children, depth + 1);
    }
  };
  if (hud) {
    if (payload.elements.length > 10000) throw Error("Too many copied HUD elements.");
    for (const el of payload.elements) {
      if (!el || typeof el.name !== "string" || typeof el.id !== "string" ||
          !["Text", "Panel", "Button", "ProgressBar", "Image"].includes(el.type) ||
          ![el.x, el.y, el.width, el.height].every(Number.isFinite) || el.width < 0 || el.height < 0 ||
          el.script && (typeof el.script !== "object" || Array.isArray(el.script))) throw Error("Invalid copied HUD element.");
    }
  } else check(payload.objects, 0);
  for (const asset of payload.assets) {
    if (!asset || !Object.hasOwn(ASSET_CATEGORY_LABELS, asset.cat) || !/^[^\\/]+\.[a-z0-9]+$/i.test(asset.name) || asset.name.includes("..") ||
        !(typeof asset.content === "string" || typeof asset.dataUrl === "string" && /^data:[^,]*;base64,/.test(asset.dataUrl))) throw Error("Invalid copied asset.");
  }
  return payload;
}

function importClipboardAssets(project, payload, external) {
  const names = new Map();
  for (const asset of payload.assets) {
    const files = editorAssets(project, external);
    const same = files.find((file) => file.cat === asset.cat && file.name === asset.name && file.content === asset.content && file.dataUrl === asset.dataUrl);
    const name = same?.name || freeAssetName(files, asset.name.replace(/\.[^.]+$/, ""), asset.name.split(".").at(-1));
    if (!same) putProjectAsset(project, { ...asset, id: uid(), name, libraryFolder: asset.libraryFolder || "Clipboard" });
    names.set(`${asset.cat}/${asset.name}`, name);
  }
  return names;
}

function pasteHUDClipboard(project, scene, payload, external = []) {
  const elements = deepClone(payload.elements), names = importClipboardAssets(project, payload, external);
  hudAssetReferences(elements, (holder, key, cat) => {
    if (names.has(`${cat}/${holder[key]}`)) holder[key] = names.get(`${cat}/${holder[key]}`);
  });
  const copies = cloneHUDElements(elements, scene.uiElements);
  scene.uiElements.push(...copies);
  return copies.map(el => el.id);
}

function pasteObjectClipboard(project, scene, payload, external = []) {
  const objects = deepClone(payload.objects), names = importClipboardAssets(project, payload, external);
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
  const hud = payload.kind === "atheditor.hud", type = hud ? HUD_CLIPBOARD_TYPE : EDITOR_CLIPBOARD_TYPE;
  const text = (hud ? HUD_CLIPBOARD_PREFIX : EDITOR_CLIPBOARD_PREFIX) + JSON.stringify(payload);
  const Item = sourceWindow.ClipboardItem;
  if (clipboard?.write && Item) {
    const data = { "text/plain": new Blob([text], { type: "text/plain" }) };
    if (Item.supports?.(type)) data[type] = new Blob([JSON.stringify(payload)], { type: type.slice(4) });
    return clipboard.write([new Item(data)]);
  }
  return clipboard?.writeText ? clipboard.writeText(text) : null;
}

async function readEditorClipboard(sourceWindow = window) {
  const clipboard = sourceWindow.navigator?.clipboard;
  if (clipboard?.read) {
    const items = await clipboard.read();
    for (const item of items) {
      for (const [type, prefix] of [[EDITOR_CLIPBOARD_TYPE, EDITOR_CLIPBOARD_PREFIX], [HUD_CLIPBOARD_TYPE, HUD_CLIPBOARD_PREFIX]]) {
        if (item.types.includes(type)) return { payload: parseObjectClipboard(prefix + await (await item.getType(type)).text()) };
      }
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
