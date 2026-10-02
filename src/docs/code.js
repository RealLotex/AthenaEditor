// ═══════════════════════════════════════════════════════════════════════
//  DOC CODE SAMPLES
//
//  Shared by every language: engine identifiers are not translated, and
//  keeping one copy means a corrected sample is corrected everywhere.
//
//  Every sample here matches what the generator actually emits today. The
//  previous editor's help pages taught `ode_onCollide(g1, g2)` and
//  `space.collide((g1, g2) => ...)`, neither of which is the engine's
//  signature — that is exactly the failure this single source guards against.
// ═══════════════════════════════════════════════════════════════════════

const DOC_CODE = {
  scriptSkeleton: `// scripts/Player.js
export function init(ctx) {
    // Runs once, before the first frame.
    ctx.player.hp = 3;
    ctx.player.score = 0;
}

export function update(ctx, pad) {
    // Runs every frame, before rendering.
    if (pad.justPressed(Pads.CROSS)) ctx.player.score += 1;
}`,

  ctxShape: `ctx = {
    pad,                 // the pad, refreshed every frame
    dt,                  // seconds per step, from the scene's physics settings
    frame,               // frames elapsed

    RenderObjects: { player, crate },      // position / rotation / scale / playAnim
    RenderDatas:   { player, crate },      // pipeline / shading / texture swaps
    textures:      { player },             // Image handles
    animCollections: { player },           // clip sets
    lights:        { sun },                // ids for Lights.set
    sounds:        { music },              // play / pause / rewind
    shadows:       { player_shadow },      // Shadows.Projector handles
    physics: {
        world, space,
        bodies: { player },                // dynamic ODE bodies
        geoms:  { player, ground },        // every collider
    },

    player: { /* your own state — one slot per scripted object */ },
}`,

  movePattern: `export function update(ctx, pad) {
    // Pattern A — the shortcut. Write x/y/z and the object follows.
    ctx.player.x = (ctx.player.x || 0) + 0.05;

    // Pattern B — full control. Touch the engine handle directly.
    ctx.RenderObjects.player.rotation = { x: 0, y: ctx.player.angle, z: 0 };
    ctx.RenderObjects.player.scale = { x: 2, y: 2, z: 2 };
}`,

  padInput: `export function update(ctx, pad) {
    // Sticks are -127..128, and ly grows DOWNWARDS.
    const dead = 25;
    const ix = (pad.lx > dead || pad.lx < -dead) ? pad.lx / 127.0 : 0.0;
    const iz = (pad.ly > dead || pad.ly < -dead) ? -pad.ly / 127.0 : 0.0;

    if (pad.pressed(Pads.CROSS))     { /* held */ }
    if (pad.justPressed(Pads.START)) { /* pressed this frame */ }
}`,

  collision: `export function update(ctx, pad) {
    // The generated contact callback fills these in.
    if (ctx.player.lastHit === "Spikes") {
        ctx.player.hp -= 1;
        ctx.player.lastHit = null;      // consume it, or it stays set
    }

    // Contact normal — the usual way to test "am I standing on something".
    const n = ctx.player.lastHitNormal;
    ctx.player.grounded = !!n && n[1] > 0.7;
    ctx.player.lastHitNormal = null;
}`,

  trigger: `export function update(ctx, pad) {
    // A Rigidbody in Trigger mode reports overlap without blocking.
    if (ctx.goal.entered)     ctx.player.won = true;      // this frame
    if (ctx.goal.exited)      ctx.player.inZone = false;
    if (ctx.goal.overlapping) { /* name of whatever is inside, or null */ }
}`,

  jump: `export function update(ctx, pad) {
    const body = ctx.physics.bodies.player;
    const n = ctx.player.lastHitNormal;
    const grounded = !!n && n[1] > 0.7;
    ctx.player.lastHitNormal = null;

    if (grounded && pad.justPressed(Pads.CROSS)) {
        const v = body.getLinearVel();
        body.setLinearVel(v[0], 6.0, v[2]);
    }
}`,

  animation: `export function init(ctx) {
    ctx.player.moving = false;
}

export function update(ctx, pad) {
    const moving = Math.abs(pad.lx) > 25 || Math.abs(pad.ly) > 25;
    if (moving !== ctx.player.moving) {
        ctx.player.moving = moving;
        ctx.RenderObjects.player.playAnim(
            ctx.animCollections.player[moving ? "Run" : "Idle"],
            true,
        );
    }
}`,

  hudUpdate: `export function update(ctx, pad) {
    // Every HUD element is a plain object you can mutate.
    ctx.ui.score_label.text = "Score: " + ctx.player.score;
    ctx.ui.health_bar.progress = ctx.player.hp / 3.0;
    ctx.ui.game_over.visible = ctx.player.hp <= 0;

    // Fonts are handles too.
    ctx.ui.fonts.score_label.color = Color.new(255, 40, 40, 128);
}`,

  lights: `export function update(ctx, pad) {
    // Swing the sun around. Direction points TOWARD the light.
    const a = ctx.frame * 0.01;
    Lights.set(ctx.lights.sun, Lights.DIRECTION, Math.sin(a), 1.0, Math.cos(a));
}`,

  shadowRuntime: `export function update(ctx, pad) {
    // Fade a shadow out as the character rises.
    const h = ctx.RenderObjects.player.position.y;
    const strength = Math.max(0.0, 0.65 - h * 0.1);
    ctx.shadows.player_shadow.setColor(0.0, 0.0, 0.0, strength);
}`,

  odeOrder: `// What the editor emits — the argument orders that actually work.
ode_world.stepWithContacts(ode_space, ode_contacts, 0.016, ode_onCollide);

const geom = ODE.GeomBox(ode_space, 1.0, 1.0, 1.0);
const mesh = ODE.GeomRenderObject(ode_space, level_object);

function ode_onCollide(c) {
    // ONE argument: { position, normal, depth, geom1, geom2 }
    const a = c.geom1, b = c.geom2;
}`,

  shadowOrder: `// Order matters — see docs/ATHENAENV-API.md.
const p = new Shadows.Projector(target);
p.setSize(2.0, 2.83);              // 2.83 = 2.0 / sin(45 deg): the foreshortening
p.setColor(0.0, 0.0, 0.0, 0.65);   // BEFORE the last rebuild
p.setGrid(12, 12);                 // rebuilds, and bakes the colour in
p.setLightDir(0.0, 0.707, 0.707);
p.enableRaycast(ode_space, 1, 12.0);

// AFTER the last rebuild, or new_render_object resets all three and the decal
// ends up transformed twice. Together these turn it onto the light's azimuth:
// .rotation is a quaternion with w stuck at 1, so it rotates AND scales, and
// .scale cancels exactly that. Derived in src/core/shadowmath.js.
p.scale    = { x: 0.988, y: 1.0, z: 0.988 };
p.rotation = { x: 0.0, y: -0.281, z: 0.0 };
p.position = { x: 0, y: 0.707, z: 0 };   // pre-rotated: the transform turns it too

// The silhouette camera sits on the light. Target first — it moves the camera.
Camera.target(c.x, c.y, c.z);
Camera.position(c.x + L.x * dist, c.y + L.y * dist, c.z + L.z * dist);`,

  topdownMove: `// From TopDownController.js, shipped by the Top Down template.
const vel = body.getLinearVel();
body.setLinearVel(ix * s.speed, vel[1], -iz * s.speed);

if (mag > 0.15) {
    const want = Math.atan2(ix, -iz);
    let delta = want - s.angle;
    while (delta >  Math.PI) delta -= Math.PI * 2.0;
    while (delta < -Math.PI) delta += Math.PI * 2.0;
    s.angle += delta * Math.min(1.0, s.turnRate * ctx.dt);
    view.rotation = { x: 0.0, y: s.angle, z: 0.0 };
}`,

  topdownCamera: `// Target first — Camera.target() drags the camera with it.
const p = view.position;
Camera.target(p.x, p.y, p.z);
Camera.position(p.x, p.y + s.camHeight, p.z + s.camDistance);`,
};
