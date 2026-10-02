// ═══════════════════════════════════════════════════════════════════════
//  ctx — the single object every behaviour script receives
//
//  Scripts get init(ctx) once and update(ctx, pad) every frame. ctx carries
//  live engine handles plus a per-object slot for game state, so a script can
//  reach anything in the scene without main.js being edited by hand.
// ═══════════════════════════════════════════════════════════════════════

/**
 * Keys inside a ctx sub-object are derived from object names, and names are
 * not unique. Two objects called "Crate" would emit the same key twice and
 * JS would keep only the last one, so each map gets its own allocator.
 */
function keyMaker() {
  const used = new Set();
  return (name, fallback) => {
    const base = ident(name, fallback);
    if (!used.has(base)) { used.add(base); return base; }
    let i = 2;
    while (used.has(`${base}_${i}`)) i++;
    used.add(`${base}_${i}`);
    return `${base}_${i}`;
  };
}

function emitCtx(e, ir) {
  if (!ir.scripts.files.length) return;

  const inCtx = (o) => o.ctxEnabled !== false;
  const models = ir.models.filter((m) => inCtx(m.obj));
  const lights = ir.lights.filter((l) => inCtx(l.obj));
  const sounds = ir.sounds.filter((s) => inCtx(s.obj));

  e.section("ctx — shared state and scene handles for behaviour scripts");
  e.w(`const ctx = {`);
  e.block((b) => {
    b.w(`pad: null,        // refreshed every frame before update()`);
    b.w(`dt: ${fl(ir.physics.settings?.stepSize ?? 0.016)},`);
    b.w(`frame: 0,`);
    b.w(`goToScene,`);
    b.nl();

    b.comment("RenderObjects — position / rotation / scale / playAnim()");
    b.w(`RenderObjects: {`);
    b.block((x) => { for (const m of models) x.w(`${m.vn}: ${m.vn},`); });
    b.w(`},`);
    b.nl();

    b.comment("RenderDatas — swap pipeline, shading or textures at runtime");
    b.w(`RenderDatas: {`);
    b.block((x) => { for (const m of models) x.w(`${m.vn}: ${m.rd.dataVN},`); });
    b.w(`},`);
    b.nl();

    const withTex = models.filter((m) => m.rd.texVN);
    if (withTex.length) {
      b.comment("textures — Image handles (filter, colour tint)");
      b.w(`textures: {`);
      b.block((x) => { for (const m of withTex) x.w(`${m.vn}: ${m.rd.texVN},`); });
      b.w(`},`);
      b.nl();
    }

    const withAnim = models.filter((m) => m.anim);
    if (withAnim.length) {
      b.comment(`animCollections — ctx.RenderObjects.x.playAnim(ctx.animCollections.x["Walk"], true)`);
      b.w(`animCollections: {`);
      b.block((x) => { for (const m of withAnim) x.w(`${m.vn}: ${m.anim.vn},`); });
      b.w(`},`);
      b.nl();
    }

    if (lights.length) {
      b.comment("lights — Lights.set(ctx.lights.sun, Lights.DIRECTION, x, y, z)");
      b.w(`lights: {`);
      const k = keyMaker();
      b.block((x) => { for (const l of lights) x.w(`${k(l.obj.name, "light")}: ${l.vn},`); });
      b.w(`},`);
      b.nl();
    }

    if (sounds.length) {
      b.comment("sounds — play() / pause() / rewind()");
      b.w(`sounds: {`);
      const k = keyMaker();
      b.block((x) => { for (const s of sounds) x.w(`${k(s.obj.name, "snd")}: ${s.vn},`); });
      b.w(`},`);
      b.nl();
    }

    if (ir.shadows.length) {
      b.comment("shadows — setColor(), setSize(), position");
      b.w(`shadows: {`);
      b.block((x) => { for (const s of ir.shadows) x.w(`${s.vn}: ${s.vn},`); });
      b.w(`},`);
      b.nl();
    }

    if (ir.physics.enabled) {
      b.comment("physics — the ODE world, its space and the dynamic bodies");
      b.w(`physics: {`);
      b.block((x) => {
        x.w(`world: ode_world,`);
        x.w(`space: ode_space,`);
        const kb = keyMaker(), kg = keyMaker();
        x.w(`bodies: {`);
        x.block((y) => {
          for (const bd of ir.physics.bodies.filter((z) => z.isDynamic)) {
            y.w(`${kb(bd.obj.name, "body")}: ${bd.bodyVN},`);
          }
        });
        x.w(`},`);
        x.w(`geoms: {`);
        x.block((y) => {
          for (const bd of ir.physics.bodies) y.w(`${kg(bd.obj.name, "geom")}: ${bd.geomVN},`);
        });
        x.w(`},`);
      });
      b.w(`},`);
      b.nl();
    }

    b.comment("One slot per scripted object — your own state lives here.");
    const slots = new Set();
    for (const bind of ir.scripts.bindings) {
      if (slots.has(bind.ctxKey)) continue;
      slots.add(bind.ctxKey);
      b.w(`${bind.ctxKey}: {},`);
    }
  });
  e.w(`};`);
  e.nl();
}

/** ctx.ui is attached after the HUD elements exist. */
function emitCtxUI(e, ir) {
  if (!ir.scripts.files.length || !ir.ui.length) return;

  e.comment("ctx.ui — HUD handles, plus their fonts and images");
  e.w(`ctx.ui = {`);
  e.block((b) => {
    for (const u of ir.ui) b.w(`${u.vn}: ${u.vn},`);
    const fonts = ir.ui.filter((u) => u.el.type === "Text" || u.el.type === "Button");
    if (fonts.length) {
      b.w(`fonts: {`);
      b.block((x) => { for (const u of fonts) x.w(`${u.vn}: ${u.vn}.font,`); });
      b.w(`},`);
    }
    const imgs = ir.ui.filter((u) => u.imageVN);
    if (imgs.length) {
      b.w(`images: {`);
      b.block((x) => { for (const u of imgs) x.w(`${u.vn}: ${u.imageVN},`); });
      b.w(`},`);
    }
  });
  e.w(`};`);
  e.nl();
}
