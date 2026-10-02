import { assert, assertEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const { SIDESCROLLER_CONTROLLER } = await load(["templates/sidescroller.js"]);
const Pads = Object.fromEntries(["LEFT", "RIGHT", "UP", "DOWN", "CROSS", "SQUARE", "R1"].map((key, i) => [key, 1 << i]));

function runtime(dt = 0.016) {
  let velocity = [0, 0, 0], position = [0, 0.5, 0];
  const camera = {};
  const ctx = { dt, player: {}, RenderObjects: { player: {} }, physics: { bodies: { player: {
    getLinearVel: () => velocity,
    setLinearVel: (...value) => { velocity = value; },
    getPosition: () => position,
    setPosition: (...value) => { position = value; },
  } } } };
  const controller = new Function("Pads", "Camera", SIDESCROLLER_CONTROLLER.replace(/^export /gm, "") +
    "\nreturn { init, update };")(Pads, {
      target: (...value) => { camera.target = value; },
      position: (...value) => { camera.position = value; },
    });
  controller.init(ctx);
  return {
    s: ctx.player, ctx, camera,
    velocity: () => velocity,
    position: () => position,
    setVelocity: (...value) => { velocity = value; },
    setPosition: (...value) => { position = value; },
    tick: ({ lx = 0, ly = 0, held = [], pressed = [], ground = false, normal = [0, 1, 0] } = {}) => {
      ctx.player.lastHitNormal = ground ? normal : null;
      controller.update(ctx, {
        lx, ly,
        pressed: (button) => held.some((key) => Pads[key] === button),
        justPressed: (button) => pressed.some((key) => Pads[key] === button),
      });
    },
    solve: () => {
      velocity[1] -= 9.81 * ctx.dt;
      position = position.map((value, i) => value + velocity[i] * ctx.dt);
    },
  };
}

Deno.test("side-scroller accelerates gradually, coasts and skids before reversing", () => {
  const r = runtime();
  r.tick({ ground: true, lx: 127 });
  assert(r.velocity()[0] > 0 && r.velocity()[0] < 1);
  for (let i = 0; i < 25; i++) r.tick({ ground: true, lx: 127 });
  assertEquals(r.velocity()[0], 5);
  r.tick({ ground: true });
  assert(r.velocity()[0] > 4 && r.velocity()[0] < 5);
  r.tick({ ground: true, lx: -127 });
  assert(r.velocity()[0] > 0);
  assertEquals(r.s.motion, "skid");
  assertEquals(r.s.facing, 1);
  for (let i = 0; i < 30; i++) r.tick({ ground: true, lx: -127 });
  assert(r.velocity()[0] < -4);
  assertEquals(r.s.facing, -1);
});

Deno.test("side-scroller sprint builds three speed stages and releases smoothly", () => {
  const r = runtime();
  for (let i = 0; i < 38; i++) r.tick({ ground: true, lx: 127, held: ["R1"] });
  assert(r.velocity()[0] > 8 && r.velocity()[0] <= 9);
  for (let i = 0; i < 42; i++) r.tick({ ground: true, lx: 127, held: ["R1"] });
  assertEquals(r.velocity()[0], 12);
  for (let i = 0; i < 60; i++) r.tick({ ground: true, lx: 127, held: ["R1"] });
  assertEquals(r.velocity()[0], 16);
  assertEquals(r.s.motion, "mach");
  r.tick({ ground: true, lx: 127 });
  assert(r.velocity()[0] > 15);
});

Deno.test("side-scroller acceleration uses elapsed time and clamps stick extremes", () => {
  const slow = runtime(1 / 30), fast = runtime(1 / 120);
  for (let i = 0; i < 12; i++) slow.tick({ ground: true, lx: 500, held: ["R1"] });
  for (let i = 0; i < 48; i++) fast.tick({ ground: true, lx: 127, held: ["R1"] });
  assert(Math.abs(slow.velocity()[0] - fast.velocity()[0]) < 0.001);
  assert(slow.velocity()[0] < 9);
});

Deno.test("side-scroller preserves airborne momentum and limits air steering", () => {
  const r = runtime();
  r.setVelocity(16, 2, 0);
  r.tick();
  assertEquals(r.velocity()[0], 16);
  r.tick({ lx: 127 });
  assertEquals(r.velocity()[0], 16);
  r.tick({ lx: -127 });
  assert(r.velocity()[0] > 15 && r.velocity()[0] < 16);
});

Deno.test("side-scroller rolls with less drag and gains downhill momentum in either geom order", () => {
  const walk = runtime(), roll = runtime();
  walk.setVelocity(10, 0, 0);
  roll.setVelocity(10, 0, 0);
  walk.tick({ ground: true });
  roll.tick({ ground: true, held: ["DOWN"] });
  assert(roll.velocity()[0] > walk.velocity()[0]);
  assertEquals(roll.s.motion, "roll");
  for (const normal of [[0.4, 0.9165, 0], [-0.4, -0.9165, 0]]) {
    const slope = runtime();
    slope.setVelocity(10, 0, 0);
    slope.tick({ ground: true, held: ["DOWN"], normal });
    assert(slope.velocity()[0] > 10);
  }
});

Deno.test("side-scroller charges without jumping, launches on release and can jump out of a roll", () => {
  const r = runtime();
  r.tick({ ground: true, held: ["DOWN", "CROSS"], pressed: ["CROSS"] });
  assertEquals(r.s.motion, "charge");
  assertEquals(r.s.events.jump, false);
  for (let i = 0; i < 80; i++) r.tick({ ground: true, held: ["DOWN"] });
  assertEquals(r.s.charge, 8);
  r.tick({ ground: true });
  assertEquals(r.velocity()[0], 17);
  assertEquals(r.s.events.launch, true);
  assertEquals(r.s.motion, "roll");
  r.tick({ ground: true, held: ["CROSS"], pressed: ["CROSS"] });
  assertEquals(r.s.events.jump, true);
  assert(r.velocity()[0] > 16);
});

function jumpApex(hold) {
  const r = runtime();
  let peak = 0.5;
  r.tick({ ground: true, held: ["CROSS"], pressed: ["CROSS"] });
  for (let i = 0; i < 100; i++) {
    r.solve();
    peak = Math.max(peak, r.position()[1]);
    r.tick({ held: hold ? ["CROSS"] : [] });
  }
  return peak - 0.5;
}

Deno.test("side-scroller jump height follows button hold and rises without stale support retriggers", () => {
  const short = jumpApex(false), full = jumpApex(true);
  assert(full > 2 && full < 2.3);
  assert(short < 0.6 && short < full / 2);
  const r = runtime();
  r.tick({ ground: true, held: ["CROSS"], pressed: ["CROSS"] });
  r.solve();
  r.tick({ ground: true, held: ["CROSS"], pressed: ["CROSS"] });
  assertEquals(r.s.events.jump, false);
  assertEquals(r.s.grounded, false);
  assert(r.velocity()[1] < 6.5);
});

Deno.test("side-scroller coyote time expires and buffered jumps fire on landing", () => {
  const coyote = runtime();
  coyote.tick({ ground: true });
  for (let i = 0; i < 3; i++) coyote.tick();
  coyote.tick({ held: ["CROSS"], pressed: ["CROSS"] });
  assertEquals(coyote.s.events.jump, true);
  const expired = runtime();
  expired.tick({ ground: true });
  for (let i = 0; i < 8; i++) expired.tick();
  expired.tick({ held: ["CROSS"], pressed: ["CROSS"] });
  assertEquals(expired.s.events.jump, false);
  const buffer = runtime();
  buffer.setVelocity(0, -2, 0);
  buffer.tick({ held: ["CROSS"], pressed: ["CROSS"] });
  assertEquals(buffer.s.events.jump, false);
  buffer.tick({ ground: true, held: ["CROSS"] });
  assertEquals(buffer.s.events.land, true);
  assertEquals(buffer.s.events.jump, true);
});

Deno.test("side-scroller keeps soft floor contacts stable and rejects ceiling contacts", () => {
  const r = runtime();
  r.tick({ ground: true });
  r.setVelocity(0, 0.001, 0);
  r.tick();
  assertEquals(r.s.grounded, true);
  assertEquals(r.velocity()[1], 0);
  const ceiling = runtime();
  ceiling.ctx.player.lastHitPosition = [0, 1, 0];
  ceiling.tick({ ground: true, normal: [0, -1, 0], held: ["CROSS"], pressed: ["CROSS"] });
  assertEquals(ceiling.s.grounded, false);
  assertEquals(ceiling.s.events.jump, false);
});

Deno.test("side-scroller shoulder dash has a cooldown and one use per airborne interval", () => {
  const r = runtime();
  r.tick({ lx: -127, pressed: ["SQUARE"] });
  assertEquals(r.s.motion, "dash");
  assertEquals(r.velocity()[0], -12);
  assertEquals(r.s.events.dash, true);
  r.tick({ pressed: ["SQUARE"] });
  assertEquals(r.s.events.dash, false);
  for (let i = 0; i < 30; i++) r.tick();
  r.tick({ pressed: ["SQUARE"] });
  assertEquals(r.s.events.dash, false);
  r.setVelocity(-12, 0, 0);
  r.tick({ ground: true });
  r.tick({ pressed: ["SQUARE"] });
  assertEquals(r.s.events.dash, true);
});

Deno.test("side-scroller ground pound descends, lands and recovers before another jump", () => {
  const r = runtime();
  r.setVelocity(5, 3, 0);
  r.tick({ held: ["DOWN"] });
  assertEquals(r.s.motion, "slam");
  assertEquals(r.velocity()[1], -18);
  r.tick({ ground: true, held: ["CROSS"], pressed: ["CROSS"] });
  assertEquals(r.s.events.slamLand, true);
  assertEquals(r.s.motion, "land");
  assertEquals(r.s.events.jump, false);
  r.setVelocity(0, 5.5, 0);
  r.tick({ ground: true, held: ["CROSS"] });
  assertEquals(r.velocity()[1], 0);
  for (let i = 0; i < 6; i++) r.tick({ ground: true, held: ["CROSS"] });
  assertEquals(r.s.events.jump, true);
});

Deno.test("side-scroller publishes animation events, anticipates travel and pins depth", () => {
  const r = runtime();
  r.setPosition(0, 0.5, 1);
  r.setVelocity(10, 0, 2);
  r.tick({ ground: true });
  assertEquals(r.position()[2], 0);
  assertEquals(r.velocity()[2], 0);
  assert(r.camera.target[0] > 0);
  assertEquals(r.camera.position[0], r.camera.target[0]);
  assertEquals(r.camera.position[2], 11);
  assertEquals(r.s.events.land, true);
  r.tick({ ground: true });
  assertEquals(r.s.events.land, false);
});
