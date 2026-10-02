// ═══════════════════════════════════════════════════════════════════════
//  IMAGE SIZE — pixel dimensions straight out of the file header
//
//  The editor has to know how big a texture is before it can say anything
//  useful about it, and the numbers matter more here than anywhere else:
//  athena_load_image (src/image_loaders.c:135) does
//  `memalign(athena_surface_size(width, height, PSM))` with no ceiling and no
//  check, so an oversized picture is a silent multi-megabyte allocation out of
//  the PS2's 32 MB, and then an upload into 4 MB of VRAM. A 2048x2048 texture
//  is 16 MB on its own. The program does not complain; it just fails to boot.
//
//  Parsed from the header bytes rather than measured by decoding, because this
//  has to run in a test with no DOM, and because decoding a 2048x2048 PNG to
//  learn that it is too big is a waste of a second.
// ═══════════════════════════════════════════════════════════════════════

/** The GS addresses textures through 4-bit log2 fields, so 2^10 is the ceiling. */
const GS_MAX_TEXTURE = 1024;

const be32 = (b, i) => (b[i] << 24 | b[i + 1] << 16 | b[i + 2] << 8 | b[i + 3]) >>> 0;
const le32 = (b, i) => (b[i] | b[i + 1] << 8 | b[i + 2] << 16 | b[i + 3] << 24) >>> 0;
const le16 = (b, i) => b[i] | b[i + 1] << 8;
const be16 = (b, i) => b[i] << 8 | b[i + 1];

/**
 * Dimensions of an image, or null if the format is not one we can read.
 *
 * @param bytes  Uint8Array of the file's leading bytes — 64 KB is plenty, and
 *               for everything except JPEG the first 32 are enough.
 * @param name   file name, used only for TGA, which has no magic number.
 */
function imageSize(bytes, name = "") {
  const b = bytes;
  if (!b || b.length < 16) return null;

  // PNG — 8-byte signature, then IHDR with width and height as big-endian u32.
  if (b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) {
    return { width: be32(b, 16), height: be32(b, 20), format: "png" };
  }

  // BMP — DIB header at byte 14; both the 40-byte and 12-byte variants start
  // with their own size, which is how the two are told apart.
  if (b[0] === 0x42 && b[1] === 0x4d) {
    const dib = le32(b, 14);
    if (dib === 12) return { width: le16(b, 18), height: le16(b, 20), format: "bmp" };
    // Height is signed: a negative one means the rows are stored top-down.
    const h = le32(b, 22) | 0;
    return { width: le32(b, 18), height: Math.abs(h), format: "bmp" };
  }

  // JPEG — walk the segments to the first start-of-frame.
  if (b[0] === 0xff && b[1] === 0xd8) {
    let i = 2;
    while (i + 9 < b.length) {
      if (b[i] !== 0xff) { i++; continue; }              // resync on padding
      const marker = b[i + 1];
      if (marker === 0xd8 || marker === 0x01 || (marker >= 0xd0 && marker <= 0xd7)) { i += 2; continue; }
      const len = be16(b, i + 2);
      // SOFn, excluding the four that are not frame headers (DHT, JPG, DAC, DNL).
      const isSOF = (marker >= 0xc0 && marker <= 0xcf) &&
        marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc;
      if (isSOF) return { width: be16(b, i + 7), height: be16(b, i + 5), format: "jpeg" };
      if (len < 2) return null;
      i += 2 + len;
    }
    return null;
  }

  // TGA has no magic number, so it is trusted only when the name says so and
  // the header's own fields are self-consistent.
  if (/\.tga$/i.test(name) && b.length >= 18) {
    const type = b[2];
    if (type === 1 || type === 2 || type === 3 || type === 9 || type === 10 || type === 11) {
      return { width: le16(b, 12), height: le16(b, 14), format: "tga" };
    }
  }

  return null;
}

/** The leading bytes of a `data:` URL, without decoding the whole payload. */
function bytesFromDataUrl(dataUrl, limit = 4096) {
  const comma = String(dataUrl || "").indexOf(",");
  if (comma < 0) return null;
  const head = dataUrl.slice(comma + 1, comma + 1 + Math.ceil(limit / 3) * 4);
  try {
    // atob is in every browser and in Deno; the tests exercise this path.
    const bin = atob(head.replace(/-/g, "+").replace(/_/g, "/"));
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  } catch (_e) {
    return null;
  }
}

/** Dimensions of an asset entry however its bytes happen to be carried. */
function imageSizeOfAsset(entry) {
  if (!entry) return null;
  if (entry.dataUrl) return imageSize(bytesFromDataUrl(entry.dataUrl), entry.name);
  if (entry.bytes) return imageSize(entry.bytes, entry.name);
  return null;
}

const isPowerOfTwo = (n) => Number.isInteger(n) && n > 0 && (n & (n - 1)) === 0;

/**
 * What one texture costs, in bytes, once the engine has it.
 *
 * athena_load_image allocates the decoded surface in main RAM and the upload
 * then takes the same space again in VRAM. 32 bits per pixel is what
 * image_loaders.c:134 picks for anything with colour.
 */
const textureBytes = (w, h, bpp = 32) => Math.max(0, w) * Math.max(0, h) * (bpp / 8);
