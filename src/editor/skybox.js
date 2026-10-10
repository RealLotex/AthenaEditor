async function prepareSkyboxTexture(asset) {
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error("Could not open this image. Try another PNG, JPG or WebP.")); image.src = asset.skyboxSource || asset.dataUrl; });
  if (Math.abs(image.naturalWidth / image.naturalHeight - 2) > .05) throw Error("Choose a 360° panorama with a 2:1 ratio, such as 2048 × 1024.");
  const canvas = document.createElement("canvas"); canvas.width = SKYBOX_WIDTH; canvas.height = SKYBOX_HEIGHT;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, SKYBOX_WIDTH, SKYBOX_HEIGHT);
  ctx.drawImage(image, 0, 0, SKYBOX_WIDTH, SKYBOX_HEIGHT);
  const dataUrl = canvas.toDataURL("image/png");
  return { name: `skybox_${ident(asset.name.replace(/\.[^.]+$/, ""), "panorama")}.png`, cat: "textures", dataUrl,
    size: atob(dataUrl.split(",")[1]).length, image: { width: SKYBOX_WIDTH, height: SKYBOX_HEIGHT, bpp: 32, format: "png" },
    editKind: "skybox", skyboxSource: asset.skyboxSource || asset.dataUrl, skyboxSourceSize: { width: image.naturalWidth, height: image.naturalHeight }, skyboxLabel: asset.skyboxLabel || asset.name.replace(/\.[^.]+$/, ""), libraryFolder: "Skyboxes", owned: true };
}

async function importSkyboxTexture(file) {
  if (!/\.(png|jpe?g|webp)$/i.test(file.name) || (file.type && !["image/png", "image/jpeg", "image/webp"].includes(file.type))) throw Error("Choose a PNG, JPG or WebP image.");
  if (file.size > 32 * 1024 * 1024) throw Error("This image exceeds 32 MB. Resize it and import it again.");
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error("Could not read this image.")); reader.readAsDataURL(file); });
  return prepareSkyboxTexture({ name: file.name, dataUrl });
}

// One palette across both sectors prevents color discontinuities at their seam.
// A small sampled histogram plus a RGB555 lookup bounds work independently of
// output resolution; it avoids sorting millions of full-precision pixels.
function quantizeSkybox(image, colors) {
  const sample = resizeTexturePixels(image, Math.min(128, image.width), Math.min(64, image.height));
  const palette = quantizeTexture(sample, colors).palette, lookup = new Int16Array(32768).fill(-1);
  const indices = new Uint8Array(image.width * image.height);
  for (let i = 0; i < indices.length; i++) {
    const at = i * 4, r = image.data[at] >> 3, g = image.data[at + 1] >> 3, b = image.data[at + 2] >> 3, key = r << 10 | g << 5 | b;
    if (lookup[key] < 0) {
      let best = Infinity, index = 0;
      for (let p = 0; p < palette.length; p++) {
        const color = palette[p], distance = 2 * (r * 255 / 31 - color[0]) ** 2 + 3 * (g * 255 / 31 - color[1]) ** 2 + (b * 255 / 31 - color[2]) ** 2;
        if (distance < best) { best = distance; index = p; }
      }
      lookup[key] = index;
    }
    indices[i] = lookup[key];
  }
  return { width: image.width, height: image.height, palette, indices, bitDepth: colors === 16 ? 4 : 8 };
}

async function prepareSkyboxLayout(asset, settings) {
  const sky = normalizedSkybox(settings), size = sky.textureSize, layout = skyboxTextureLayout(sky), { height, width, tileWidth, tileHeight, columns, rows } = layout;
  const builtIn = asset.editKind === "skybox" && asset.dataUrl === SKYBOX_PRESET_IMAGES[asset.skyboxPreset] && SKYBOX_PRESET_HIGH_IMAGES[asset.skyboxPreset];
  let pixels;
  if (builtIn) {
    const source = await decodeSkyboxSource(builtIn);
    const sourceHeight = sky.upperOnly ? Math.ceil(source.height / 2) : source.height;
    pixels = source.width === width && sourceHeight === height
      ? { width, height, data: source.data.subarray(0, width * height * 4) }
      : resizeTexturePixels({ ...source, height: sourceHeight }, width, height);
  } else {
    const image = new Image();
    await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error("Could not open the sky panorama.")); image.src = asset.editKind === "skybox" ? asset.skyboxSource || asset.dataUrl : asset.dataUrl; });
    if (Math.abs(image.naturalWidth / image.naturalHeight - 2) > .05) throw Error("Choose a 360° panorama with a 2:1 ratio.");
    const canvas = document.createElement("canvas"); canvas.width = size * 2; canvas.height = height;
    const ctx = canvas.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, canvas.width, height);
    ctx.drawImage(image, 0, 0, image.naturalWidth, image.naturalHeight / (sky.upperOnly ? 2 : 1), 0, 0, canvas.width, height);
    pixels = { width: canvas.width, height, data: ctx.getImageData(0, 0, canvas.width, height).data };
  }
  // Resizing must retain equal border texels, including imported panoramas.
  for (let y = 0; y < height; y++) for (let col = 0; col < columns; col++) for (let c = 0; c < 3; c++) {
    const a = (y * width + (col * tileWidth + width - 1) % width) * 4 + c, b = (y * width + col * tileWidth) * 4 + c;
    pixels.data[a] = pixels.data[b] = Math.round((pixels.data[a] + pixels.data[b]) / 2);
  }
  for (let row = 1; row < rows; row++) for (let x = 0; x < width; x++) for (let c = 0; c < 3; c++) {
    const a = ((row * tileHeight - 1) * width + x) * 4 + c, b = (row * tileHeight * width + x) * 4 + c;
    pixels.data[a] = pixels.data[b] = Math.round((pixels.data[a] + pixels.data[b]) / 2);
  }
  // Collapse only spherical poles. The horizon keeps the original panorama.
  for (const row of sky.upperOnly ? [0] : [0, height - 1]) for (let c = 0; c < 3; c++) {
    let sum = 0; for (let x = 0; x < size * 2; x++) sum += pixels.data[(row * size * 2 + x) * 4 + c];
    for (let x = 0; x < size * 2; x++) pixels.data[(row * size * 2 + x) * 4 + c] = Math.round(sum / (size * 2));
  }
  const indexed = sky.bitDepth !== 16 && quantizeSkybox(pixels, sky.bitDepth === 4 ? 16 : 256), preparedTiles = [];
  for (let part = 0; part < layout.count; part++) {
    const x = part % columns * tileWidth, top = Math.floor(part / columns) * tileHeight;
    let bytes;
    if (indexed) {
      const tile = { ...indexed, width: tileWidth, height: tileHeight, indices: new Uint8Array(tileWidth * tileHeight) };
      for (let y = 0; y < tileHeight; y++) tile.indices.set(indexed.indices.subarray((top + y) * width + x, (top + y) * width + x + tileWidth), y * tileWidth);
      bytes = await indexedTexturePNG(tile);
    } else {
      const tile = { width: tileWidth, height: tileHeight, data: new Uint8ClampedArray(tileWidth * tileHeight * 4) };
      for (let y = 0; y < tileHeight; y++) tile.data.set(pixels.data.subarray(((top + y) * width + x) * 4, ((top + y) * width + x + tileWidth) * 4), y * tileWidth * 4);
      bytes = skyboxTrueColorBMP(tile);
    }
    const format = indexed ? "png" : "bmp", name = `${asset.name.replace(/\.[^.]+$/, "")}_${size}_${sky.bitDepth}_${sky.upperOnly ? "upper" : "full"}_${part}.${format}`;
    preparedTiles.push({ name, cat: "textures", dataUrl: bytesDataURL(bytes, `image/${format}`), size: bytes.length, image: { width: tileWidth, height: tileHeight, bpp: sky.bitDepth, format }, editKind: "skyboxTile", skyboxSourceRevision: builtIn ? SKYBOX_TEXTURE_REVISION : null, owned: true, libraryFolder: "Skyboxes" });
  }
  return { ...asset, preparedTiles };
}

async function decodeSkyboxSource(source) {
  const { width, height } = source;
  if (!Number.isInteger(width) || !Number.isInteger(height) || width !== height * 2 || width > 8192 || source.encoding !== "rgb555-delta") throw Error("The original sky panorama is damaged.");
  const packed = Uint8Array.from(atob(source.rgb), c => c.charCodeAt(0));
  const rgb = new Uint8Array(await new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream("deflate"))).arrayBuffer());
  if (rgb.length !== width * height * 3) throw Error("The original sky panorama is damaged.");
  const data = new Uint8ClampedArray(width * height * 4);
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) data[i * 4 + c] = ((rgb[i * 3 + c] + (i % width ? data[(i - 1) * 4 + c] >> 3 : 0)) & 31) << 3;
    data[i * 4 + 3] = 255;
  }
  return { width, height, data };
}

function applySkybox(project, scene, settings, asset, external = []) {
  const previousTiles = new Set(scene.skybox?.tiles || []);
  if (asset?.preparedTiles) {
    const names = [];
    for (const tile of asset.preparedTiles) {
      const files = editorAssets(project, external), same = files.find(f => f.cat === "textures" && f.dataUrl === tile.dataUrl);
      if (same) {
        if(same.owned && same.editKind === "skyboxTile") same.skyboxSourceRevision = tile.skyboxSourceRevision;
        names.push(same.name);
      }
      else { const name = freeAssetName(files, tile.name.replace(/\.[^.]+$/, ""), tile.image.format); putProjectAsset(project, { ...tile, name }); names.push(name); }
    }
    settings = { ...settings, tiles: names };
    const { preparedTiles, ...panorama } = asset; asset = panorama;
  }
  if (asset) {
    const files = editorAssets(project, external);
    const same = files.find(f => f.cat === "textures" && f.dataUrl === asset.dataUrl);
    if (same) settings = { ...settings, texture: same.name };
    else {
      const previous = asset.skyboxPreset && files.find(f => f.owned && f.editKind === "skybox" && f.skyboxPreset === asset.skyboxPreset);
      const name = previous?.name || freeAssetName(files, asset.name.replace(/\.[^.]+$/, ""), "png");
      putProjectAsset(project, { ...asset, name });
      settings = { ...settings, texture: name };
    }
  }
  scene.skybox = normalizedSkybox(settings);
  // Converting settings replaces disposable tiles instead of retaining every
  // old multi-megabyte version. Shared, edited and script-referenced files stay.
  const referenced = new Set(projectAssetReferences(project).filter(ref => ref.cat === 'textures').map(ref => ref.name));
  project.assets = (project.assets || []).filter(file => !previousTiles.has(file.name) || !file.owned || file.editKind !== 'skyboxTile' || referenced.has(file.name) || project.scripts?.some(script => script.content?.includes(file.name)));
}
