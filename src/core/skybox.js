// Full-sphere panoramas, shared by preview and console export.
const SKYBOX_WIDTH = 1024;
const SKYBOX_HEIGHT = 512;
const SKYBOX_PRESETS = [
  { id: "clear", name: "Tropical blue", mood: "Cobalt sky, sunlit ivory cumulus and deep blue cloud shadows" },
  { id: "clouds", name: "Cloud islands", mood: "Sculpted cloud towers with brilliant edges and open azure sky" },
  { id: "golden", name: "Golden hour", mood: "Honey-lit clouds against a deep teal sky" },
  { id: "sunset", name: "Coral sunset", mood: "Glowing tangerine horizon, coral clouds and violet sky" },
  { id: "dusk", name: "Blue hour", mood: "Ultramarine twilight, lavender clouds and a rose horizon" },
  { id: "night", name: "Moonlit night", mood: "Milky Way, silver cloud edges and a luminous moon" },
  { id: "aurora", name: "Aurora", mood: "Vivid green and violet curtains over a dark cloud sea" },
  { id: "storm", name: "Storm light", mood: "Indigo thunderclouds, golden light shafts and cobalt openings" },
  { id: "desert", name: "Desert sky", mood: "Sapphire sky, ivory clouds and warm golden haze" },
  { id: "space", name: "Cosmic nebula", mood: "Electric cyan and violet nebulae, magenta filaments and dense tiny stars" },
];

const SKYBOX_TEXTURE_SIZES = [128, 256, 512, 1024, 2048];
const SKYBOX_BIT_DEPTHS = [4, 8, 16];
const SKYBOX_BACKDROPS = ["solid", "gradient", "foggy", "mirror"];
const mkSkybox = () => ({ enabled: false, preset: "", texture: "", rotation: 0, brightness: 1, textureSize: 512, bitDepth: 8, upperOnly: false, textureFilter: "LINEAR", tiles: [], backdropMode: "foggy", backdropColor: {r:35,g:65,b:100}, horizonColor: {r:143,g:184,b:217}, fogHeight: 20 });
const SKYBOX_TEXTURE_REVISION = 8;

function normalizedSkybox(value) {
  const sky = { ...mkSkybox(), ...value };
  sky.rotation = Number.isFinite(Number(sky.rotation)) ? ((Number(sky.rotation) % 360) + 360) % 360 : 0;
  sky.brightness = Number.isFinite(Number(sky.brightness)) ? clamp(Number(sky.brightness), 0, 1) : 1;
  sky.enabled = sky.enabled === true;
  sky.textureSize = SKYBOX_TEXTURE_SIZES.includes(Number(sky.textureSize)) ? Number(sky.textureSize) : 512;
  sky.bitDepth = SKYBOX_BIT_DEPTHS.includes(Number(sky.bitDepth)) ? Number(sky.bitDepth) : 8;
  sky.upperOnly = sky.upperOnly === true;
  sky.textureFilter = sky.textureFilter === "NEAREST" ? "NEAREST" : "LINEAR";
  sky.backdropMode = SKYBOX_BACKDROPS.includes(sky.backdropMode) ? sky.backdropMode : "foggy";
  for(const key of ["backdropColor","horizonColor"]) sky[key] = Object.fromEntries(["r","g","b"].map(c=>[c,clamp(Math.round(num(sky[key]?.[c],mkSkybox()[key][c])),0,255)]));
  sky.fogHeight = clamp(num(sky.fogHeight,20),0,60);
  sky.tiles = Array.isArray(sky.tiles) ? sky.tiles.filter(n => typeof n === "string").slice(0, 8) : [];
  delete sky.quality; delete sky.highTextures;
  return sky;
}

// Size describes a half-panorama, while each GS image stays within 1024².
// The 2048 preset uses four columns, plus two rows for a full sphere.
function skyboxTextureLayout(settings) {
  const sky = normalizedSkybox(settings), width = sky.textureSize * 2, height = sky.textureSize / (sky.upperOnly ? 2 : 1);
  const tileWidth = Math.min(sky.textureSize, GS_MAX_TEXTURE), tileHeight = Math.min(height, GS_MAX_TEXTURE);
  return { width, height, tileWidth, tileHeight, columns: width / tileWidth, rows: height / tileHeight, count: width / tileWidth * height / tileHeight };
}

// RGB555 + opaque alpha bit is read as CT16 by image_loaders.c's BMP path.
function skyboxTrueColorBMP(image) {
  const { width, height, data } = image, stride = Math.ceil(width * 2 / 4) * 4;
  const bytes = new Uint8Array(54 + stride * height), v = new DataView(bytes.buffer);
  bytes[0] = 66; bytes[1] = 77; v.setUint32(2, bytes.length, true); v.setUint32(10, 54, true);
  v.setUint32(14, 40, true); v.setInt32(18, width, true); v.setInt32(22, height, true);
  v.setUint16(26, 1, true); v.setUint16(28, 16, true); v.setUint32(34, stride * height, true);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const at = (y * width + x) * 4;
    v.setUint16(54 + (height - 1 - y) * stride + x * 2, 0x8000 | (data[at] >> 3) << 10 | (data[at + 1] >> 3) << 5 | data[at + 2] >> 3, true);
  }
  return bytes;
}

function skyboxTiledMeshOBJ(materialFile, upperOnly = false, segments = 32, rings = 16, textureSize = 1024, backdropMode = "foggy") {
  const lines = [`mtllib ${materialFile}`, "o Skybox"];
  const layout = skyboxTextureLayout({ textureSize, upperOnly });
  segments = Math.ceil(segments * 2 / layout.columns); rings = Math.ceil(rings / layout.rows);
  let offset = 0;
  for (let part = 0; part < layout.count; part++) {
    const col = part % layout.columns, row = Math.floor(part / layout.columns);
    for (let y = 0; y <= rings; y++) for (let x = 0; x <= segments; x++) {
      const u = x / segments, v = y / rings, phi = (col + u) * Math.PI * 2 / layout.columns, theta = (row + v) * Math.PI / (layout.rows * (upperOnly ? 2 : 1));
      lines.push(`v ${(-Math.cos(phi) * Math.sin(theta)).toFixed(7)} ${Math.cos(theta).toFixed(7)} ${(Math.sin(phi) * Math.sin(theta)).toFixed(7)}`);
      lines.push(`vt ${u.toFixed(7)} ${(1 - v).toFixed(7)}`);
    }
    lines.push(`usemtl Sky${part}`);
    for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
      const a = offset + y * (segments + 1) + x + 1, b = a + 1, c = a + segments + 1, d = c + 1;
      if (row > 0 || y > 0) lines.push(`f ${b}/${b} ${a}/${a} ${d}/${d}`);
      if (upperOnly || row < layout.rows - 1 || y < rings - 1) lines.push(`f ${a}/${a} ${c}/${c} ${d}/${d}`);
    }
    const count=(segments + 1) * (rings + 1);
    if(upperOnly && backdropMode === "mirror"){
      for(let y=0;y<=rings;y++)for(let x=0;x<=segments;x++){
        const u=x/segments,v=y/rings,phi=(col+u)*Math.PI*2/layout.columns,theta=(1+v)*Math.PI/2;
        lines.push(`v ${(-Math.cos(phi)*Math.sin(theta)).toFixed(7)} ${Math.cos(theta).toFixed(7)} ${(Math.sin(phi)*Math.sin(theta)).toFixed(7)}`,`vt ${u.toFixed(7)} ${v.toFixed(7)}`);
      }
      for(let y=0;y<rings;y++)for(let x=0;x<segments;x++){
        const a=offset+count+y*(segments+1)+x+1,b=a+1,c=a+segments+1,d=c+1;
        lines.push(`f ${b}/${b} ${a}/${a} ${d}/${d}`);
        if(y<rings-1)lines.push(`f ${a}/${a} ${c}/${c} ${d}/${d}`);
      }
    }
    offset += count*(upperOnly && backdropMode === "mirror" ? 2 : 1);
  }
  return lines.join("\n") + "\n";
}

// An untextured backdrop shares its vertex colors between browser and console.
// Fog is a short translucent band above the horizon; the lower half is opaque.
function skyboxBackdropGeometry(settings, segments = 32) {
  const sky=normalizedSkybox(settings), positions=[], colors=[], horizon=Math.PI/2;
  const rise=sky.backdropMode === "foggy" ? sky.fogHeight*Math.PI/180 : 0;
  const angles=[...(rise>0?[horizon-rise,horizon-rise/2]:[]),horizon,Math.PI*.75,Math.PI];
  const vertex=(theta,phi)=>{
    positions.push(-Math.cos(phi)*Math.sin(theta),Math.cos(theta),Math.sin(phi)*Math.sin(theta));
    const t=clamp((theta-horizon)/horizon,0,1),alpha=theta>=horizon?1:clamp((theta-horizon+rise)/rise,0,1);
    for(const c of ["r","g","b"]) colors.push((sky.backdropMode==="solid"?sky.backdropColor[c]:sky.horizonColor[c]*(1-t)+sky.backdropColor[c]*t)/255);
    colors.push(alpha);
  };
  for(let y=0;y<angles.length-1;y++)for(let x=0;x<segments;x++){
    const a=x*Math.PI*2/segments,b=(x+1)*Math.PI*2/segments,top=angles[y],bottom=angles[y+1];
    vertex(top,b);vertex(top,a);vertex(bottom,b);
    if(y<angles.length-2){vertex(top,a);vertex(bottom,a);vertex(bottom,b);}
  }
  return {positions,colors};
}

function skyboxBackdropOBJ(settings) {
  const {positions}=skyboxBackdropGeometry(settings),lines=["o SkyBackdrop"];
  for(let i=0;i<positions.length;i+=3)lines.push(`v ${positions.slice(i,i+3).map(v=>v.toFixed(7)).join(" ")}`);
  for(let i=1;i<=positions.length/3;i+=3)lines.push(`f ${i} ${i+1} ${i+2}`);
  return lines.join("\n")+"\n";
}

function skyboxPresetAsset(id) {
  if (!SKYBOX_PRESETS.some(p => p.id === id)) throw Error("This sky is unavailable. Choose another sky.");
  const dataUrl = SKYBOX_PRESET_IMAGES[id];
  return { name: `skybox_${id}.png`, cat: "textures", dataUrl, size: atob(dataUrl.split(",")[1]).length,
    image: { width: SKYBOX_WIDTH, height: SKYBOX_HEIGHT, format: "png", bpp: 8 }, skyboxSourceSize: skyboxSourceSize({ skyboxPreset: id }), editKind: "skybox", skyboxPreset: id, skyboxRevision: SKYBOX_TEXTURE_REVISION, owned: true, libraryFolder: "Skyboxes" };
}

function skyboxSourceSize(asset) {
  if (!asset) return null;
  const builtin = asset.skyboxPreset && SKYBOX_PRESET_HIGH_IMAGES[asset.skyboxPreset];
  if (builtin?.width && (!asset.dataUrl || asset.editKind === "skybox" && asset.dataUrl === SKYBOX_PRESET_IMAGES[asset.skyboxPreset])) return { width: builtin.width, height: builtin.height };
  return asset.editKind === "skybox" && asset.skyboxSource ? imageSizeOfAsset({ dataUrl: asset.skyboxSource }) || asset.skyboxSourceSize : imageSizeOfAsset(asset);
}

function skyboxNeedsSourceRefresh(scene, files) {
  const sky = normalizedSkybox(scene.skybox), asset = files.find(f => f.cat === "textures" && f.name === sky.texture);
  return !!(sky.enabled && asset?.owned && asset.editKind === "skybox" && asset.dataUrl === SKYBOX_PRESET_IMAGES[asset.skyboxPreset] && sky.tiles.length > 0 &&
    sky.tiles.every(name => { const tile = files.find(f => f.name === name && f.cat === "textures"); return tile?.owned && tile.editKind === "skyboxTile"; }) &&
    sky.tiles.some(name => files.find(f => f.name === name && f.cat === "textures").skyboxSourceRevision !== SKYBOX_TEXTURE_REVISION));
}

// The same parametrisation as THREE.SphereGeometry, including UV seam vertices.
function skyboxMeshOBJ(segments = 32, rings = 16) {
  const lines = ["# AthEditor camera-centred sky", "o Skybox"];
  for (let y = 0; y <= rings; y++) for (let x = 0; x <= segments; x++) {
    const u = x / segments, v = y / rings, phi = u * Math.PI * 2, theta = v * Math.PI;
    lines.push(`v ${(-Math.cos(phi) * Math.sin(theta)).toFixed(7)} ${Math.cos(theta).toFixed(7)} ${(Math.sin(phi) * Math.sin(theta)).toFixed(7)}`);
    lines.push(`vt ${u.toFixed(7)} ${(1 - v).toFixed(7)}`);
  }
  for (let y = 0; y < rings; y++) for (let x = 0; x < segments; x++) {
    const a = y * (segments + 1) + x + 1, b = a + 1, c = a + segments + 1, d = c + 1;
    if (y > 0) lines.push(`f ${b}/${b} ${a}/${a} ${d}/${d}`);
    if (y < rings - 1) lines.push(`f ${a}/${a} ${c}/${c} ${d}/${d}`);
  }
  return lines.join("\n") + "\n";
}

function skyboxAssetProblems(scene, files) {
  const sky = normalizedSkybox(scene.skybox);
  if (!sky.enabled) return [];
  const asset = files.find(f => f.cat === "textures" && f.name === sky.texture);
  if (!asset?.dataUrl) return [{ level: "error", message: "The sky image is missing. Choose a sky or import a panorama." }];
  const size = imageSizeOfAsset(asset);
  if (size && (size.width > GS_MAX_TEXTURE || size.height > GS_MAX_TEXTURE)) return [{ level: "error", message: "The sky image is too large for PS2. Import it through Sky to resize it automatically." }];
  if (sky.tiles.length || sky.upperOnly || sky.textureSize !== 512 || sky.bitDepth !== 8) {
    const layout = skyboxTextureLayout(sky);
    if (sky.tiles.length !== layout.count) return [{ level: "error", message: "Sky textures are missing. Select the sky again to prepare its texture settings." }];
    for (const name of sky.tiles) {
      const tile = files.find(f => f.cat === "textures" && f.name === name && f.dataUrl), size = imageSizeOfAsset(tile);
      if (!size || size.width !== layout.tileWidth || size.height !== layout.tileHeight || textureFormatOfAsset(tile) !== (sky.bitDepth === 16 ? "CT16" : `T${sky.bitDepth}`))
        return [{ level: "error", message: `Sky texture "${name}" is missing or does not match its size / color settings. Select the sky again.` }];
    }
  }
  const original = skyboxSourceSize(asset), layout = skyboxTextureLayout(sky), warnings = [];
  if (original && (original.width < layout.width || original.height < sky.textureSize)) warnings.push({ level: "warn", component: "skybox", message: `Sky original is ${original.width}×${original.height}; ${layout.width}×${layout.height} enlarges it without adding detail. Choose a higher-resolution original or reduce texture size.` });
  if (skyboxNeedsSourceRefresh(scene, files)) warnings.push({ level: "warn", component: "skybox", message: "Sky textures use an older source conversion. Refresh from original in World → Sky." });
  return warnings;
}
