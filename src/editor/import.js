// Capture drag data synchronously: browsers protect it as soon as drop returns.
function captureDroppedFiles(transfer) {
  const items = [...(transfer.items || [])].filter((item) => item.kind === "file");
  const sources = items.map((item) => {
    let handle = null, entry = null;
    try { handle = Promise.resolve(item.getAsFileSystemHandle?.()).catch(() => null); } catch { /* Older browser. */ }
    try { entry = item.webkitGetAsEntry?.(); } catch { /* Plain file fallback. */ }
    return { handle, entry, file: item.getAsFile?.() };
  });
  const fallback = [...(transfer.files || [])];
  return (async () => {
    const files = [];
    async function walkHandle(handle, prefix = "", depth = 0) {
      if (depth > 16) throw Error("The dropped folder is nested too deeply.");
      if (handle.kind === "file") files.push({ file: await handle.getFile(), path: prefix + handle.name });
      else for await (const [name, child] of handle.entries()) {
        if (name.startsWith(".") || ["node_modules", "vendor"].includes(name)) continue;
        await walkHandle(child, prefix + handle.name + "/", depth + 1);
      }
    }
    async function walkEntry(entry, prefix = "", depth = 0) {
      if (depth > 16) throw Error("The dropped folder is nested too deeply.");
      if (entry.isFile) {
        const file = await new Promise((resolve, reject) => entry.file(resolve, reject));
        files.push({ file, path: prefix + entry.name });
      } else {
        const reader = entry.createReader();
        for (;;) {
          const children = await new Promise((resolve, reject) => reader.readEntries(resolve, reject));
          if (!children.length) break;
          for (const child of children) {
            if (child.name.startsWith(".") || ["node_modules", "vendor"].includes(child.name)) continue;
            await walkEntry(child, prefix + entry.name + "/", depth + 1);
          }
        }
      }
    }
    for (const source of sources) {
      let handle;
      try { handle = await source.handle; } catch { /* Fall back to older drag APIs. */ }
      if (handle) await walkHandle(handle);
      else if (source.entry) await walkEntry(source.entry);
      else if (source.file) files.push({ file: source.file, path: source.file.name });
    }
    if (!sources.length) for (const file of fallback) files.push({ file, path: file.webkitRelativePath || file.name });
    return files;
  })();
}

async function readImportedAssets(entries) {
  const assets = [], rejected = [];
  for (const { file, path = file.name } of entries) {
    const cat = categorize(file.name);
    if (cat === "other" || isProjectFilename(file.name)) { rejected.push(file.name); continue; }
    try {
      const asset = { name: file.name, cat, size: file.size, sourcePath: path };
      if (cat === "scripts" || /\.obj$/i.test(file.name)) {
        asset.content = await file.text();
        if (cat === "models") readMeshOBJ(asset.content);
      } else {
        asset.dataUrl = await fsReadAsDataUrl(file);
        if (cat === "models") asset.isGltf = true;
        if (cat === "textures") asset.image = imageSizeOfAsset(asset);
      }
      assets.push(asset);
    } catch { rejected.push(file.name); }
  }
  return { assets, rejected };
}

function importProjectAssets(project, assets, destination = "", external = []) {
  const imported = [], rejected = [];
  for (const asset of assets) {
    const category = ASSET_CATEGORY_LABELS[asset.cat];
    if (destination && destination.split("/")[0] !== category) { rejected.push(asset.name); continue; }
    const files = editorAssets(project, external);
    const extension = asset.name.split(".").pop();
    const base = asset.name.slice(0, -(extension.length + 1));
    const valid = /^[^\\/]+\.[a-z0-9]+$/i.test(asset.name) && !asset.name.includes("..");
    const name = valid && !files.some((file) => file.name.toLowerCase() === asset.name.toLowerCase())
      ? asset.name : freeAssetName(files, base, extension);
    const nested = asset.sourcePath?.split("/").slice(0, -1).join("/");
    const libraryFolder = destination ? destination.split("/").slice(1).join("/") : nested ? `Imported/${nested}` : "";
    imported.push(putProjectAsset(project, { ...asset, name, libraryFolder }));
  }
  return { imported, rejected };
}
