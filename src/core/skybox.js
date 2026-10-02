// Panoramas use one 512×256 texture, shared by preview and console export.
const SKYBOX_PRESETS = [
  { id: "clear", name: "Clear", mood: "Blue sky with scattered clouds", top: [24, 86, 177], horizon: [183, 220, 243], ground: [92, 128, 148], clouds: .12, sun: .22 },
  { id: "clouds", name: "Cloudy", mood: "Cloud cover with soft daylight", top: [50, 112, 176], horizon: [210, 226, 237], ground: [119, 143, 160], clouds: .8, sun: .30 },
  { id: "golden", name: "Golden hour", mood: "Low sun and a warm horizon", top: [57, 98, 153], horizon: [255, 195, 100], ground: [123, 92, 70], clouds: .35, sun: .46 },
  { id: "sunset", name: "Sunset", mood: "Orange horizon and purple clouds", top: [52, 43, 112], horizon: [255, 119, 83], ground: [91, 47, 72], clouds: .5, sun: .50 },
  { id: "dusk", name: "Dusk", mood: "Blue and purple twilight", top: [20, 28, 76], horizon: [176, 124, 178], ground: [43, 46, 77], clouds: .2, stars: .12 },
  { id: "night", name: "Night", mood: "Dark sky with stars and a moon", top: [3, 8, 26], horizon: [35, 54, 86], ground: [9, 17, 31], stars: 1, moon: true },
  { id: "aurora", name: "Aurora", mood: "Northern lights over a dark horizon", top: [4, 12, 30], horizon: [27, 58, 69], ground: [8, 23, 35], stars: .7, aurora: true },
  { id: "storm", name: "Storm", mood: "Dense grey clouds", top: [22, 31, 47], horizon: [125, 137, 151], ground: [51, 60, 70], clouds: 1 },
  { id: "desert", name: "Desert", mood: "Pale sky and a sandy horizon", top: [83, 146, 188], horizon: [248, 220, 168], ground: [163, 121, 78], clouds: .08, sun: .34 },
  { id: "space", name: "Space", mood: "Stars and a purple nebula", top: [8, 5, 26], horizon: [25, 13, 56], ground: [8, 5, 26], stars: 1, nebula: true },
];

const mkSkybox = () => ({ enabled: false, preset: "", texture: "", rotation: 0, brightness: 1 });
const SKYBOX_TEXTURE_REVISION = 2;

function normalizedSkybox(value) {
  const sky = { ...mkSkybox(), ...value };
  sky.rotation = Number.isFinite(Number(sky.rotation)) ? ((Number(sky.rotation) % 360) + 360) % 360 : 0;
  sky.brightness = Number.isFinite(Number(sky.brightness)) ? clamp(Number(sky.brightness), 0, 1) : 1;
  sky.enabled = sky.enabled === true;
  return sky;
}

function skyboxPresetAsset(id) {
  if (!SKYBOX_PRESETS.some(p => p.id === id)) throw Error("This sky is unavailable. Choose another sky.");
  const dataUrl = SKYBOX_PRESET_IMAGES[id];
  return { name: `skybox_${id}.png`, cat: "textures", dataUrl, size: atob(dataUrl.split(",")[1]).length,
    image: { width: 512, height: 256, format: "png", bpp: 32 }, editKind: "skybox", skyboxPreset: id, skyboxRevision: SKYBOX_TEXTURE_REVISION, owned: true, libraryFolder: "Skyboxes" };
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
  return [];
}
