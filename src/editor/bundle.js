// A small uncompressed ZIP keeps the export's folders intact without a dependency.
function exportBundle(result) {
  const files = [
      { filename: "main.js", content: result.main },
      ...(result.sceneFiles || []),
      ...result.scripts,
      ...(result.assets || []),
      { filename: "athena.ini", content: ATHENA_INI },
    ],
    parts = [],
    central = [];
  let offset = 0;
  for (const file of files) {
    const name = new TextEncoder().encode(file.filename),
      data = file.dataUrl
        ? assetDataBytes(file.dataUrl)
        : new TextEncoder().encode(file.content),
      crc = pngCRC(data);
    const header = new Uint8Array(30 + name.length),
      v = new DataView(header.buffer);
    v.setUint32(0, 0x04034b50, true);
    v.setUint16(4, 20, true);
    v.setUint16(6, 0x800, true);
    v.setUint32(14, crc, true);
    v.setUint32(18, data.length, true);
    v.setUint32(22, data.length, true);
    v.setUint16(26, name.length, true);
    header.set(name, 30);
    const dir = new Uint8Array(46 + name.length), d = new DataView(dir.buffer);
    d.setUint32(0, 0x02014b50, true);
    d.setUint16(4, 20, true);
    d.setUint16(6, 20, true);
    d.setUint16(8, 0x800, true);
    d.setUint32(16, crc, true);
    d.setUint32(20, data.length, true);
    d.setUint32(24, data.length, true);
    d.setUint16(28, name.length, true);
    d.setUint32(42, offset, true);
    dir.set(name, 46);
    parts.push(header, data);
    central.push(dir);
    offset += header.length + data.length;
  }
  const end = new Uint8Array(22),
    e = new DataView(end.buffer),
    length = central.reduce((sum, d) => sum + d.length, 0);
  e.setUint32(0, 0x06054b50, true);
  e.setUint16(8, files.length, true);
  e.setUint16(10, files.length, true);
  e.setUint32(12, length, true);
  e.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end], { type: "application/zip" });
}

function downloadBundle(result, name) {
  const url = URL.createObjectURL(exportBundle(result)),
    a = document.createElement("a");
  a.href = url;
  a.download = `${ident(name, "game")}.zip`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}
