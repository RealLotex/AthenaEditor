// Pure image operations. Indexed PNG output reaches the engine's T4/T8 loader.
function resizeTexturePixels(image, width, height, smooth = true) {
  const data = new Uint8ClampedArray(width * height * 4);
  const pixel = (x, y) =>
    (clamp(y, 0, image.height - 1) * image.width +
      clamp(x, 0, image.width - 1)) * 4;
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const sx = (x + .5) * image.width / width - .5,
        sy = (y + .5) * image.height / height - .5,
        at = (y * width + x) * 4;
      if (!smooth) {
        const source = pixel(Math.round(sx), Math.round(sy));
        data.set(image.data.subarray(source, source + 4), at);
        continue;
      }
      const x0 = Math.floor(sx),
        y0 = Math.floor(sy),
        fx = sx - x0,
        fy = sy - y0;
      const samples = [
        [x0, y0, (1 - fx) * (1 - fy)],
        [x0 + 1, y0, fx * (1 - fy)],
        [x0, y0 + 1, (1 - fx) * fy],
        [x0 + 1, y0 + 1, fx * fy],
      ];
      const rgb = [0, 0, 0];
      let alpha = 0;
      for (const [px, py, weight] of samples) {
        const source = pixel(px, py),
          coverage = image.data[source + 3] * weight;
        alpha += coverage;
        for (let k = 0; k < 3; k++) rgb[k] += image.data[source + k] * coverage;
      }
      for (let k = 0; k < 3; k++) data[at + k] = alpha ? rgb[k] / alpha : 0;
      data[at + 3] = alpha;
    }
  }
  return { width, height, data };
}

function quantizeTexture(image, colors = 256) {
  // Median cut over a weighted RGBA histogram. Keep transparent pixels separate.
  const histogram = new Map();
  for (let i = 0; i < image.data.length; i += 4) {
    const p = Array.from(image.data.slice(i, i + 4));
    if (!p[3]) p.fill(0);
    const key = p.join(","), entry = histogram.get(key);
    if (entry) entry.count++;
    else histogram.set(key, { p, count: 1 });
  }
  const all = [...histogram.values()],
    transparent = all.some((v) => v.p[3] === 0);
  const opaque = all.filter((v) => v.p[3] !== 0),
    boxes = opaque.length ? [opaque] : [];
  const limit = colors - (transparent ? 1 : 0);
  while (boxes.length < limit) {
    let chosen = -1, axis = 0, best = -1;
    boxes.forEach((box, i) => {
      if (box.length < 2) return;
      for (let c = 0; c < 4; c++) {
        // Scan, rather than spreading large pixel histograms onto the stack.
        let lo = 255, hi = 0;
        for (const v of box) {
          lo = Math.min(lo, v.p[c]);
          hi = Math.max(hi, v.p[c]);
        }
        const score = (hi - lo) *
          Math.sqrt(box.reduce((n, v) => n + v.count, 0));
        if (score > best) {
          chosen = i;
          axis = c;
          best = score;
        }
      }
    });
    if (chosen < 0) break;
    const box = boxes.splice(chosen, 1)[0].sort((a, b) =>
      a.p[axis] - b.p[axis]
    );
    const half = box.reduce((n, v) => n + v.count, 0) / 2;
    let sum = 0, split = 1;
    for (let i = 0; i < box.length - 1; i++) {
      sum += box[i].count;
      split = i + 1;
      if (sum >= half) break;
    }
    boxes.push(box.slice(0, split), box.slice(split));
  }
  const palette = transparent ? [[0, 0, 0, 0]] : [], lookup = new Map();
  if (transparent) lookup.set("0,0,0,0", 0);
  for (const box of boxes) {
    const total = box.reduce((n, v) => n + v.count, 0), index = palette.length;
    palette.push(
      [0, 1, 2, 3].map((c) =>
        Math.round(box.reduce((n, v) => n + v.p[c] * v.count, 0) / total)
      ),
    );
    box.forEach((v) => lookup.set(v.p.join(","), index));
  }
  const indices = new Uint8Array(image.width * image.height),
    data = new Uint8ClampedArray(image.data.length);
  for (let i = 0; i < indices.length; i++) {
    const p = Array.from(image.data.slice(i * 4, i * 4 + 4));
    if (!p[3]) p.fill(0);
    indices[i] = lookup.get(p.join(","));
    data.set(palette[indices[i]], i * 4);
  }
  return {
    width: image.width,
    height: image.height,
    data,
    indices,
    palette,
    bitDepth: colors <= 16 ? 4 : 8,
  };
}

function packTextureAtlas(images, maxSize = 512, padding = 2) {
  const rectangles = [],
    sorted = [...images].sort((a, b) =>
      b.height - a.height || b.width - a.width
    );
  let x = padding, y = padding, row = 0;
  for (const img of sorted) {
    if (
      img.width + padding * 2 > maxSize || img.height + padding * 2 > maxSize
    ) throw new Error(`${img.name} is too large for this atlas.`);
    if (x + img.width + padding > maxSize) {
      x = padding;
      y += row + padding * 2;
      row = 0;
    }
    if (y + img.height + padding > maxSize) {
      throw new Error(
        "Textures do not fit. Increase the atlas size or downscale the sources.",
      );
    }
    rectangles.push({
      name: img.name,
      x,
      y,
      width: img.width,
      height: img.height,
    });
    x += img.width + padding * 2;
    row = Math.max(row, img.height);
  }
  const data = new Uint8ClampedArray(maxSize * maxSize * 4);
  for (const rect of rectangles) {
    const img = images.find((i) => i.name === rect.name);
    for (let dy = -padding; dy < rect.height + padding; dy++) {
      for (let dx = -padding; dx < rect.width + padding; dx++) {
        const source = (clamp(dy, 0, img.height - 1) * img.width +
          clamp(dx, 0, img.width - 1)) * 4;
        data.set(
          img.data.subarray(source, source + 4),
          ((rect.y + dy) * maxSize + rect.x + dx) * 4,
        );
      }
    }
  }
  return { width: maxSize, height: maxSize, data, rectangles };
}

function pngCRC(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) {
    crc ^= byte;
    for (let k = 0; k < 8; k++) {
      crc = (crc >>> 1) ^ ((crc & 1) ? 0xedb88320 : 0);
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}

async function indexedTexturePNG(image) {
  const depth = image.bitDepth,
    stride = depth === 4 ? Math.ceil(image.width / 2) : image.width;
  const raw = new Uint8Array((stride + 1) * image.height);
  for (let y = 0; y < image.height; y++) {
    for (let x = 0; x < image.width; x++) {
      const at = y * (stride + 1) + 1 + (depth === 4 ? Math.floor(x / 2) : x),
        index = image.indices[y * image.width + x];
      if (depth === 4) raw[at] |= index << (x % 2 ? 0 : 4);
      else raw[at] = index;
    }
  }
  const compressed = new Uint8Array(
    await new Response(
      new Blob([raw]).stream().pipeThrough(new CompressionStream("deflate")),
    ).arrayBuffer(),
  );
  const chunks = [new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10])];
  const chunk = (name, data) => {
    const out = new Uint8Array(data.length + 12),
      view = new DataView(out.buffer);
    view.setUint32(0, data.length);
    out.set(new TextEncoder().encode(name), 4);
    out.set(data, 8);
    view.setUint32(data.length + 8, pngCRC(out.subarray(4, data.length + 8)));
    chunks.push(out);
  };
  const header = new Uint8Array(13), view = new DataView(header.buffer);
  view.setUint32(0, image.width);
  view.setUint32(4, image.height);
  header[8] = depth;
  header[9] = 3;
  chunk("IHDR", header);
  // Full tables protect AthenaEnv's T8 CLUT swizzle, which accesses i+8.
  const count = depth === 4 ? 16 : 256,
    palette = new Uint8Array(count * 3),
    alpha = new Uint8Array(count);
  for (let i = 0; i < count; i++) {
    const p = image.palette[i] || [0, 0, 0, 0];
    palette.set(p.slice(0, 3), i * 3);
    alpha[i] = p[3];
  }
  chunk("PLTE", palette);
  chunk("tRNS", alpha);
  chunk("IDAT", compressed);
  chunk("IEND", new Uint8Array());
  const length = chunks.reduce((n, c) => n + c.length, 0),
    out = new Uint8Array(length);
  let offset = 0;
  for (const c of chunks) {
    out.set(c, offset);
    offset += c.length;
  }
  return out;
}

async function readTexturePixels(asset) {
  if (!asset?.dataUrl) throw new Error("Load a PNG or JPEG texture first.");
  const image = new Image();
  await new Promise((resolve, reject) => {
    image.onload = resolve;
    image.onerror = () => reject(new Error(`Cannot decode ${asset.name}.`));
    image.src = asset.dataUrl;
  });
  const canvas = document.createElement("canvas");
  canvas.width = image.naturalWidth;
  canvas.height = image.naturalHeight;
  const ctx = canvas.getContext("2d");
  ctx.drawImage(image, 0, 0);
  return {
    width: canvas.width,
    height: canvas.height,
    data: ctx.getImageData(0, 0, canvas.width, canvas.height).data,
  };
}

function bytesDataURL(bytes, mime = "image/png") {
  let binary = "";
  for (let i = 0; i < bytes.length; i += 8192) {
    binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  }
  return `data:${mime};base64,${btoa(binary)}`;
}

async function textureOutputAsset(image, name, colors = 256) {
  if (colors !== 16 && colors !== 256) {
    throw new Error("Choose 16 or 256 colors.");
  }
  const quantized = quantizeTexture(image, colors),
    bytes = await indexedTexturePNG(quantized);
  return {
    id: uid(),
    name,
    cat: "textures",
    size: bytes.length,
    dataUrl: bytesDataURL(bytes),
    image: {
      width: image.width,
      height: image.height,
      format: "png",
      bpp: quantized.bitDepth,
    },
    owned: true,
    mtime: Date.now(),
  };
}
