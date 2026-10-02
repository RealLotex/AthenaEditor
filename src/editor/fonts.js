// AthenaEnv loads individual SFNT faces through FreeType. Keep exported files
// portable: no OS font names, web-font wrappers, collections or variable faces.
function inspectFontBytes(buffer) {
  const bytes = new Uint8Array(buffer), view = new DataView(buffer);
  const tagAt = (offset) => String.fromCharCode(...bytes.subarray(offset, offset + 4));
  if (bytes.length < 12) throw Error("This font file is incomplete.");
  const signature = tagAt(0);
  if (!["\u0000\u0001\u0000\u0000", "true", "OTTO"].includes(signature)) {
    throw Error("Choose an individual TrueType (.ttf) or OpenType (.otf) font.");
  }
  const count = view.getUint16(4);
  if (!count || 12 + count * 16 > bytes.length) throw Error("This font has an invalid table directory.");
  const tables = new Set();
  for (let i = 0; i < count; i++) {
    const pos = 12 + i * 16;
    const offset = view.getUint32(pos + 8), length = view.getUint32(pos + 12);
    if (offset > bytes.length || length > bytes.length - offset) throw Error("This font contains an incomplete table.");
    tables.add(tagAt(pos));
  }
  if (tables.has("fvar")) throw Error("Choose a static font face for the game export.");
  if (!["head", "hhea", "maxp", "hmtx", "cmap"].every((tag) => tables.has(tag)) ||
      !(signature === "OTTO" ? tables.has("CFF ") : tables.has("glyf") && tables.has("loca"))) {
    throw Error("This font does not contain supported static outlines.");
  }
  return signature === "OTTO" ? "otf" : "ttf";
}

async function readHUDfont(blob, name, sourceWindow = window) {
  const buffer = await blob.arrayBuffer();
  const extension = inspectFontBytes(buffer);
  // Validate actual browser decoding before attaching an unusable font to HUD.
  if (sourceWindow.FontFace) await new sourceWindow.FontFace("AthEditorFontCheck", buffer).load();
  const file = new File([buffer], `${ident(name, "HUD_Font")}.${extension}`, { type: extension === "ttf" ? "font/ttf" : "font/otf" });
  return { name: file.name, cat: "fonts", size: file.size, dataUrl: await fsReadAsDataUrl(file), libraryFolder: "Imported" };
}

function attachHUDfont(project, sceneId, elementId, asset, external = []) {
  const element = project.scenes.find((scene) => scene.id === sceneId)?.uiElements.find((el) => el.id === elementId);
  if (!element || !["Text", "Button"].includes(element.type)) return null;
  const files = editorAssets(project, external);
  const same = files.find((file) => file.cat === "fonts" && file.dataUrl === asset.dataUrl);
  const font = same || putProjectAsset(project, { ...asset, name: freeAssetName(files, asset.name.replace(/\.[^.]+$/, ""), asset.name.split(".").at(-1)) });
  element.fontFile = font.name;
  return font;
}

function hudFontFamily(name) {
  return `AthHUD_${[...name].map((char) => char.codePointAt(0).toString(16)).join("_")}`;
}

// A detached HUD panel has its own FontFaceSet. Rebuild only its preview fonts
// when the portal changes documents; project data and selection stay shared.
function useHUDfonts(ref, files, elements) {
  useEffect(() => {
    const root = ref.current;
    if (!root) return;
    let release = () => {};
    const load = () => {
      release();
      const doc = root.ownerDocument, view = doc.defaultView;
      let cancelled = false;
      const loaded = [];
      release = () => { cancelled = true; loaded.forEach((font) => doc.fonts.delete(font)); };
      if (!view.FontFace || !doc.fonts) return;
      const wanted = new Set(elements.map((el) => el.fontFile).filter((name) => name && name !== "default"));
      for (const asset of files.filter((file) => file.cat === "fonts" && file.dataUrl && wanted.has(file.name))) {
        const font = new view.FontFace(hudFontFamily(asset.name), `url("${asset.dataUrl}")`);
        font.load().then(() => {
          if (!cancelled) { doc.fonts.add(font); loaded.push(font); }
        }).catch(() => {}); // External unsupported fonts retain the default preview.
      }
    };
    load();
    const host = root.closest(".a-panel-surface");
    host?.addEventListener("atheditor-window-change", load);
    return () => { release(); host?.removeEventListener("atheditor-window-change", load); };
  }, [files, elements]);
}
