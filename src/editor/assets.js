const PROTOTYPE_KINDS = [
  "cube",
  "plane",
  "sphere",
  "cylinder",
  "cone",
  "torus",
  "ramp",
];

function putProjectAsset(project, asset) {
  if (!/^[^\\/]+\.[a-z0-9]+$/i.test(asset.name) || asset.name.includes("..")) {
    throw new Error("Use a filename without folders.");
  }
  project.assets ||= [];
  const old = project.assets.find((f) =>
    f.name.toLowerCase() === asset.name.toLowerCase()
  );
  if (
    asset.cat === "models" && asset.content &&
    asset.name.toLowerCase().endsWith(".obj")
  ) {
    const mesh = readMeshOBJ(asset.content);
    const lo = [Infinity, Infinity, Infinity],
      hi = [-Infinity, -Infinity, -Infinity];
    for (const pos of mesh.positions) {
      for (let k = 0; k < 3; k++) {
        lo[k] = Math.min(lo[k], pos[k]);
        hi[k] = Math.max(hi[k], pos[k]);
      }
    }
    asset = {
      ...asset,
      bounds: {
        size: { x: hi[0] - lo[0], y: hi[1] - lo[1], z: hi[2] - lo[2] },
        center: {
          x: (lo[0] + hi[0]) / 2,
          y: (lo[1] + hi[1]) / 2,
          z: (lo[2] + hi[2]) / 2,
        },
      },
    };
  }
  const next = {
    ...asset,
    id: old?.id || asset.id || uid(),
    owned: true,
    folder: project.dirs?.[asset.cat] || asset.cat,
    mtime: Date.now(),
  };
  project.assets = project.assets.filter((f) =>
    f.name.toLowerCase() !== next.name.toLowerCase()
  );
  project.assets.push(next);
  return next;
}

const ASSET_CATEGORY_LABELS = {
  models: "Models",
  textures: "Textures",
  scripts: "Scripts",
  sounds: "Sounds",
  fonts: "Fonts",
  other: "Other",
};

// Library folders organise the editor without changing the engine's filenames.
function assetLibraryFolder(asset) {
  const category = ASSET_CATEGORY_LABELS[asset.cat] || "Other";
  if (asset.libraryFolder) return `${category}/${asset.libraryFolder}`;
  if (asset.editKind) {
    return `${category}/Generated/${
      {
        uv: "UV",
        atlas: "Atlases",
        bake: "Lighting",
        optimize: "Optimized",
      }[asset.editKind] || "Other"
    }`;
  }
  if (asset.owned) {
    const kind = /_uv(?:_\d+)?\.obj$/i.test(asset.name)
      ? "UV"
      : /_atlas(?:_\d+)?\.(obj|png)$/i.test(asset.name)
      ? "Atlases"
      : /_(baked|lighting)(?:_\d+)?\.(obj|png)$/i.test(asset.name)
      ? "Lighting"
      : /_optimized(?:_\d+)?\.png$/i.test(asset.name)
      ? "Optimized"
      : null;
    if (kind) return `${category}/Generated/${kind}`;
  }
  if (/^(prototype_|gradient_pallete512)/i.test(asset.name)) {
    return `${category}/Prototypes`;
  }
  const path = asset.sourcePath?.split("/").slice(0, -1).join("/");
  return path ? `${category}/Imported/${path}` : category;
}

function assetFolderTree(files) {
  const counts = new Map();
  for (const asset of files) {
    const parts = assetLibraryFolder(asset).split("/");
    for (let i = 1; i <= parts.length; i++) {
      const path = parts.slice(0, i).join("/");
      counts.set(path, (counts.get(path) || 0) + 1);
    }
  }
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map((
    [path, count],
  ) => ({
    path,
    count,
    depth: path.split("/").length - 1,
    label: path.split("/").at(-1),
  }));
}

function applyEditorUV(project, id, content, external = []) {
  const obj = findObj(activeScene(project).objects, id);
  if (!obj?.components.model) return;
  const files = editorAssets(project, external),
    source = files.find((f) => f.name === obj.components.model.file);
  if (!source) throw Error("The source mesh is missing.");
  let uses = 0;
  for (const scene of project.scenes) {
    walk(scene.objects, (o) => {
      if (o.components.model?.file === source.name) uses++;
    });
  }
  for (const prefab of project.prefabs || []) {
    walk([prefab], (o) => {
      if (o.components.model?.file === source.name) uses++;
    });
  }
  const legacyUV = source.owned && !source.editKind &&
    /_uv(?:_\d+)?\.obj$/i.test(source.name);
  const reuse = source.owned && (source.editKind === "uv" || legacyUV) &&
    uses === 1;
  const name = reuse ? source.name : freeAssetName(
    files,
    `${(source.sourceName || source.name).replace(/\.[^.]+$/, "")}_uv`,
    "obj",
  );
  putProjectAsset(project, {
    ...textMeshAsset(name, content),
    editKind: "uv",
    sourceName: source.sourceName || source.name,
  });
  obj.components.model.file = name;
  return name;
}

function freeAssetName(files, base, extension) {
  const taken = new Set(files.map((f) => f.name.toLowerCase()));
  let name = `${ident(base, "asset")}.${extension}`, i = 2;
  while (taken.has(name.toLowerCase())) {
    name = `${ident(base, "asset")}_${i++}.${extension}`;
  }
  return name;
}

function textMeshAsset(name, content) {
  return {
    id: uid(),
    name,
    cat: "models",
    size: content.length,
    content,
    owned: true,
  };
}

function paletteEditorAsset() {
  return {
    id: uid(),
    name: "Gradient_Pallete512.png",
    cat: "textures",
    dataUrl: EDITOR_PALETTE_DATA,
    size: 88392,
    image: { width: 512, height: 512, format: "png", bpp: 32 },
    owned: true,
  };
}

function addPrototype(project, scene, kind, files = []) {
  const content = prototypeOBJ(kind),
    existing = editorAssets(project, files).find((f) =>
      f.name === `prototype_${kind}.obj` && f.content === content
    );
  const name = existing?.name ||
    freeAssetName(editorAssets(project, files), `prototype_${kind}`, "obj");
  if (!existing) putProjectAsset(project, textMeshAsset(name, content));
  let palette = editorAssets(project, files).find((f) =>
    f.name.toLowerCase() === "gradient_pallete512.png"
  );
  if (!palette) palette = putProjectAsset(project, paletteEditorAsset());
  for (const asset of prototypeTextureAssets()) {
    if (
      !editorAssets(project, files).some((f) =>
        f.name.toLowerCase() === asset.name.toLowerCase()
      )
    ) {
      putProjectAsset(project, asset);
    }
  }
  const obj = mkObject(
    uniqueName(kind[0].toUpperCase() + kind.slice(1), scene.objects),
  );
  obj.components.model = {
    ...makeComponent("model"),
    file: name,
    textureFile:
      editorAssets(project, files).find((f) =>
        f.name.toLowerCase() === "prototype_checker.png"
      )?.name || "",
    textureFilter: "NEAREST",
  };
  scene.objects.push(obj);
  return obj;
}

function saveEditorScript(project, name, content) {
  if (!/^[a-zA-Z_$][\w$.-]*\.js$/.test(name) || name.includes("..")) {
    throw new Error("Use a script filename such as Player.js.");
  }
  project.scripts = (project.scripts || []).filter((s) => s.name !== name);
  project.scripts.push({ name, content, edited: true });
}

function prototypeTextureAssets() {
  return [{ name: "Prototype_Checker.png", dataUrl: EDITOR_CHECKER_DATA }, {
    name: "Prototype_Grid.png",
    dataUrl: EDITOR_GRID_DATA,
  }].map((f) => ({
    ...f,
    id: uid(),
    cat: "textures",
    size: atob(f.dataUrl.split(",")[1]).length,
    image: { width: 32, height: 32, format: "png", bpp: 8 },
    owned: true,
  }));
}
