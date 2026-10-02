// Original, deterministic panoramas. Rebuild offline with deno run -A tools/generate-skyboxes.js.
const root = new URL("../", import.meta.url);
const core = await Deno.readTextFile(new URL("src/core/skybox.js", root));
const tex = await Deno.readTextFile(new URL("src/editor/textures.js", root));
const { presets, crc, dataURL } = new Function(core + "\n" + tex + "\nreturn {presets: SKYBOX_PRESETS, crc: pngCRC, dataURL: bytesDataURL};")();
const clamp = (n, a, b) => Math.max(a, Math.min(b, n));
const hash = (x, y, seed = 0) => { let n = Math.imul(x + 1831, 374761393) ^ Math.imul(y + seed * 719, 668265263); n = Math.imul(n ^ (n >>> 13), 1274126177); return ((n ^ (n >>> 16)) >>> 0) / 4294967295; };
function noise(x, y, period, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), fx = x - ix, fy = y - iy;
  const sx = fx * fx * (3 - 2 * fx), sy = fy * fy * (3 - 2 * fy);
  const value = (a, b) => hash(((a % period) + period) % period, b, seed);
  return (value(ix, iy) * (1 - sx) + value(ix + 1, iy) * sx) * (1 - sy) + (value(ix, iy + 1) * (1 - sx) + value(ix + 1, iy + 1) * sx) * sy;
}
function fbm(u, v, seed) {
  let out = 0, weight = .55;
  for (let i = 0; i < 5; i++) { const freq = 8 * 2 ** i; out += noise(u * freq, v * freq * 2, freq, seed + i) * weight; weight *= .5; }
  return out;
}
// Sample atmospheric detail in 3D, on the unit sphere. Painting noise directly
// in longitude/latitude squeezes every horizontal feature into the zenith.
function sphereNoise(x, y, z, seed) {
  const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z);
  const smooth = f => f * f * (3 - 2 * f);
  const sx = smooth(x - ix), sy = smooth(y - iy), sz = smooth(z - iz);
  const mix = (a, b, t) => a + (b - a) * t;
  const value = (a, b, c) => hash(a + Math.imul(c, 67), b + Math.imul(c, 173), seed);
  const plane = c => mix(mix(value(ix, iy, c), value(ix + 1, iy, c), sx), mix(value(ix, iy + 1, c), value(ix + 1, iy + 1, c), sx), sy);
  return mix(plane(iz), plane(iz + 1), sz);
}
function sphereClouds(direction, seed) {
  let out = 0, weight = .55;
  for (let i = 0; i < 5; i++) {
    const frequency = 3 * 2 ** i;
    out += sphereNoise(direction[0] * frequency + 13, direction[1] * frequency + 29, direction[2] * frequency + 7, seed + i) * weight;
    weight *= .5;
  }
  return out;
}
function panorama(p, seed) {
  const width = 512, height = 256, raw = new Uint8Array((width * 4 + 1) * height);
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) {
    const u = (x === width - 1 ? 0 : x) / (width - 1), v = y / (height - 1), upper = v < .5;
    const longitudeAngle = u * Math.PI * 2, latitudeAngle = v * Math.PI;
    const direction = [Math.cos(longitudeAngle) * Math.sin(latitudeAngle), Math.cos(latitudeAngle), Math.sin(longitudeAngle) * Math.sin(latitudeAngle)];
    const t = upper ? Math.pow(v * 2, 1.55) : Math.pow((v - .5) * 2, .32);
    const a = upper ? p.top : p.horizon, b = upper ? p.horizon : p.ground;
    let color = a.map((n, i) => n * (1 - t) + b[i] * t);
    const mix = (target, amount) => { amount = clamp(amount, 0, 1); color = color.map((n, i) => n * (1 - amount) + target[i] * amount); };
    if (p.clouds && v < .54) {
      const cloud = sphereClouds(direction, seed), cover = clamp((cloud - (.72 - p.clouds * .31)) * 4, 0, 1);
      const edge = clamp((.54 - v) * 14, 0, 1);
      const warm = p.sun >= .46;
      const shadow = clamp((cloud - .55) * 1.8, 0, .45);
      mix((p.id === "storm" ? [95, 108, 130] : warm ? [252, 181, 151] : [248, 248, 244]).map(n => n * (1 - shadow)), cover * edge);
    }
    if (p.sun || p.moon) {
      const longitude = Math.min(Math.abs(u - .28), 1 - Math.abs(u - .28)) * Math.PI * 2;
      const latitude = (v - (p.sun || .23)) * Math.PI;
      const d = Math.hypot(longitude * Math.sin(v * Math.PI), latitude);
      mix(p.moon ? [185, 210, 245] : [255, 209, 142], Math.exp(-d * d / (p.moon ? .008 : .06)) * .4);
      mix(p.moon ? [231, 240, 250] : [255, 248, 223], clamp((.035 - d) * 500, 0, 1));
    }
    if (p.nebula) {
      const band = Math.exp(-((v - .4 - Math.sin(u * Math.PI * 4) * .14) ** 2) * 65);
      mix([119, 53, 157], fbm(u, v, 41) * band * .7);
      mix([57, 124, 174], fbm(u, v, 97) * band * .3);
    }
    if (p.aurora && v < .48) {
      const centre = .23 + .055 * Math.sin(u * Math.PI * 4) + .025 * Math.sin(u * Math.PI * 10);
      const polarFade = Math.sin(latitudeAngle) ** 2;
      const veil = Math.exp(-((v - centre) ** 2) * 150) * clamp((.44 - v) * 10, 0, 1) * polarFade;
      const strands = .45 + .55 * sphereNoise(direction[0] * 42, direction[1] * 4, direction[2] * 42, 21);
      mix([36, 217, 147], veil * strands * .75);
      mix([134, 65, 196], Math.exp(-((v - centre + .08) ** 2) * 300) * strands * .27 * polarFade);
    }
    if (p.stars && (p.nebula || v < .46)) {
      const star = hash(x === width - 1 ? 0 : x, y, 19);
      if (star > .994 && hash(x === width - 1 ? 0 : x, y, 28) < Math.sin(v * Math.PI)) mix([225, 235, 255], (.4 + (star - .994) / .006 * .6) * p.stars);
    }
    const at = y * (width * 4 + 1) + x * 4 + 1;
    raw[at] = color[0]; raw[at + 1] = color[1]; raw[at + 2] = color[2]; raw[at + 3] = 255;
  }
  return raw;
}
async function png(raw) {
  const compressed = new Uint8Array(await new Response(new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer());
  const chunks = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const chunk = (name, data) => { const bytes = new Uint8Array(data.length + 12), v = new DataView(bytes.buffer); v.setUint32(0, data.length); bytes.set(new TextEncoder().encode(name), 4); bytes.set(data, 8); v.setUint32(data.length + 8, crc(bytes.subarray(4, data.length + 8))); chunks.push(bytes); };
  const head = new Uint8Array(13), view = new DataView(head.buffer); view.setUint32(0, 512); view.setUint32(4, 256); head[8] = 8; head[9] = 6;
  chunk("IHDR", head); chunk("IDAT", compressed); chunk("IEND", new Uint8Array());
  const out = new Uint8Array(chunks.reduce((n, b) => n + b.length, 0)); let offset = 0;
  for (const bytes of chunks) { out.set(bytes, offset); offset += bytes.length; }
  return out;
}
const images = {};
for (const [i, preset] of presets.entries()) images[preset.id] = dataURL(await png(panorama(preset, i * 3 + 7)));
await Deno.writeTextFile(new URL("src/core/skybox-data.js", root), "// Generated by tools/generate-skyboxes.js. Original offline panorama textures.\nconst SKYBOX_PRESET_IMAGES = " + JSON.stringify(images, null, 2) + ";\n");
console.log(`Generated ${presets.length} skybox textures.`);
