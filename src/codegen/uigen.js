// ═══════════════════════════════════════════════════════════════════════
//  UI — HUD elements and drawUI()
//
//  Everything here is emitted BEFORE the frame loop. The previous generator
//  wrote the element definitions and drawUI() inside `while (true)`, so every
//  Text and Button allocated a fresh Font every frame, and drawUI() was
//  called above its own const declarations.
// ═══════════════════════════════════════════════════════════════════════

const colorNew = (c, d) => {
  const o = c || d;
  return `Color.new(${il(o.r)}, ${il(o.g)}, ${il(o.b)}, ${il(clamp(o.a ?? 128, 0, 128))})`;
};

function emitUI(e, ir) {
  if (!ir.ui.length) return;

  const images = ir.ui.filter((u) => u.imageVN);
  if (images.length) {
    e.section("HUD images");
    for (const u of images) {
      const el = u.el;
      e.w(`let ${u.imageVN} = null;`);
      e.w(`os.chdir("${jsStr(ir.dirs.textures)}");`);
      e.w(`{`);
      e.block((b) => {
        b.w(`const _f = std.open("${jsStr(el.image)}", "r");`);
        b.w(`if (_f) { _f.close(); ${u.imageVN} = new Image("${jsStr(el.image)}"); }`);
      });
      e.w(`}`);
      e.w(`os.chdir("..");`);
      e.w(`if (${u.imageVN}) {`);
      e.block((b) => {
        b.w(`${u.imageVN}.width  = ${il(el.width)};`);
        b.w(`${u.imageVN}.height = ${il(el.height)};`);
        b.w(`${u.imageVN}.filter = ${el.imageFilter || "LINEAR"};`);
      });
      e.w(`}`);
      e.nl();
    }
  }

  e.section("HUD elements — mutate these at runtime to animate the interface");
  for (const u of ir.ui) {
    const el = u.el;
    const needsFont = el.type === "Text" || el.type === "Button";
    e.w(`const ${u.vn} = {`);
    e.block((b) => {
      b.w(`type: "${jsStr(el.type)}",`);
      b.w(`x: ${il(el.x)}, y: ${il(el.y)}, w: ${il(el.width)}, h: ${il(el.height)},`);
      b.w(`visible: ${el.visible !== false},`);
      if (needsFont) {
        b.w(`text: "${jsStr(el.text || "")}",`);
        b.w(`font: new Font(${el.fontFile && el.fontFile !== "default" ? `"${jsStr(ir.dirs.fonts)}/${jsStr(el.fontFile)}"` : `"default"`}),`);
        b.w(`fontSize: ${il(el.fontSize || 14)},`);
        b.w(`color: ${colorNew(el.textColor, { r: 200, g: 200, b: 200, a: 128 })},`);
      }
      if (el.type === "Panel" || el.type === "Button") {
        b.w(`bgColor: ${colorNew(el.bgColor, { r: 50, g: 50, b: 80, a: 128 })},`);
      }
      if (el.type === "ProgressBar") {
        b.w(`progress: ${fl(clamp(el.progress ?? 0.6, 0, 1))},`);
        b.w(`barColor: ${colorNew(el.barColor, { r: 0, g: 200, b: 100, a: 128 })},`);
        b.w(`bgColor: ${colorNew(el.barBgColor, { r: 30, g: 30, b: 30, a: 128 })},`);
      }
      if (u.imageVN) b.w(`image: ${u.imageVN},`);
    });
    e.w(`};`);
    if (needsFont) e.w(`${u.vn}.font.scale = ${fl(((el.fontSize || 14) / 14) * 0.6)};`);
    e.nl();
  }

  e.comment("Called once per frame, after the depth test is turned off.");
  e.w(`function drawUI() {`);
  e.block((b) => {
    for (const u of ir.ui) {
      const el = u.el;
      b.w(`if (${u.vn}.visible) {`);
      b.block((x) => {
        switch (el.type) {
          case "Panel":
            x.w(`Draw.rect(${u.vn}.x, ${u.vn}.y, ${u.vn}.w, ${u.vn}.h, ${u.vn}.bgColor);`);
            break;
          case "Text":
            x.w(`${u.vn}.font.color = ${u.vn}.color;`);
            x.w(`${u.vn}.font.print(${u.vn}.x, ${u.vn}.y, ${u.vn}.text);`);
            break;
          case "Button":
            x.w(`Draw.rect(${u.vn}.x, ${u.vn}.y, ${u.vn}.w, ${u.vn}.h, ${u.vn}.bgColor);`);
            x.w(`${u.vn}.font.color = ${u.vn}.color;`);
            x.w(`${u.vn}.font.print(${u.vn}.x + 6, ${u.vn}.y + Math.floor(${u.vn}.h / 2) - 6, ${u.vn}.text);`);
            break;
          case "ProgressBar":
            x.w(`Draw.rect(${u.vn}.x, ${u.vn}.y, ${u.vn}.w, ${u.vn}.h, ${u.vn}.bgColor);`);
            x.w(`Draw.rect(${u.vn}.x, ${u.vn}.y, Math.floor(${u.vn}.w * ${u.vn}.progress), ${u.vn}.h, ${u.vn}.barColor);`);
            break;
          case "Image":
            x.w(`if (${u.vn}.image) ${u.vn}.image.draw(${u.vn}.x, ${u.vn}.y);`);
            break;
        }
      });
      b.w(`}`);
    }
  });
  e.w(`}`);
  e.nl();
}
