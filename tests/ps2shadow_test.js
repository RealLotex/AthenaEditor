import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { load } from "./_load.js";
import {
  SHADOW_CASES,
  lightDirFor,
  groundShadowDir,
  screenDirFor,
  calibrate,
  judgeDirection,
  judgeFollow,
  judgeAzimuth,
  judgeSize,
  ALPHA_LEVELS,
  judgeAlphaSweep,
  judgeColourSweep,
} from "../tools/ps2shadow.js";

// ═══════════════════════════════════════════════════════════════════════
//  Conventions
//
//  A light's `direction` points TOWARD the light, "like a vector to the
//  sun" (core/components.js) - the emitter says the same and cites the
//  engine's own examples, where (0, 1, 1) is the sun up and behind
//  (codegen/lights.js:5). The shadow therefore falls on the side of the
//  caster AWAY from that vector.
//
//  The test camera is near top-down, mounted on +Z and tilted slightly, so
//  world +X is screen RIGHT and world +Z is screen DOWN.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("azimuth 0 puts the light on +X", () => {
  const L = lightDirFor(0);
  assertEquals(Math.round(L.x * 1000) / 1000, 1);
  assertEquals(Math.round(L.z * 1000) / 1000, 0);
  assert(L.y > 0, "the light must be above the horizon");
});

Deno.test("azimuth 90 puts the light on +Z", () => {
  const L = lightDirFor(90);
  assertEquals(Math.round(L.x * 1000) / 1000, 0);
  assertEquals(Math.round(L.z * 1000) / 1000, 1);
});

Deno.test("the shadow falls away from the light, not toward it", () => {
  // The whole point of the user's question. Light on +X, shadow toward -X.
  const d = groundShadowDir(lightDirFor(0));
  assertEquals(Math.round(d.x), -1);
  assertEquals(Math.round(d.z), 0);
});

Deno.test("the shadow direction turns with the light through all four quadrants", () => {
  const q = [0, 90, 180, 270].map((a) => groundShadowDir(lightDirFor(a)));
  assertEquals(q.map((d) => Math.round(d.x)), [-1, 0, 1, 0]);
  assertEquals(q.map((d) => Math.round(d.z)), [0, -1, 0, 1]);
});

Deno.test("the shadow direction ignores the light's elevation", () => {
  // Only the horizontal component decides which way it points; elevation
  // decides how far it stretches.
  const low = groundShadowDir({ x: 1, y: 0.1, z: 0 });
  const high = groundShadowDir({ x: 1, y: 4, z: 0 });
  assertEquals(Math.round(low.x), Math.round(high.x));
  assertEquals(Math.round(low.z), Math.round(high.z));
});

Deno.test("a light straight overhead has no shadow direction", () => {
  const d = groundShadowDir({ x: 0, y: 1, z: 0 });
  assertEquals(d, null);
});

// ── world direction to screen direction ────────────────────────────────

Deno.test("world +X is screen right", () => {
  const s = screenDirFor({ x: 1, z: 0 });
  assert(s.dx > 0.9, `expected right, got ${JSON.stringify(s)}`);
  assertEquals(Math.round(s.dy), 0);
});

Deno.test("world +Z is screen down", () => {
  const s = screenDirFor({ x: 0, z: 1 });
  assert(s.dy > 0.9, `expected down, got ${JSON.stringify(s)}`);
  assertEquals(Math.round(s.dx), 0);
});

// ═══════════════════════════════════════════════════════════════════════
//  Calibration
//
//  Rather than trusting a hand-derived projection, the scale is measured
//  from the run itself: the caster is moved a known number of world units
//  and the shadow is watched moving with it.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("moving the caster 4 units in X calibrates pixels per unit", () => {
  const cal = calibrate({
    base: { caster: { cx: 300, cy: 250 } },
    movedX: { caster: { cx: 380, cy: 250 } },
    movedZ: { caster: { cx: 300, cy: 328 } },
  }, 4);
  assertEquals(cal.pxPerUnitX, 20);
  assertEquals(cal.pxPerUnitZ, 19.5);
  assert(cal.ok, cal.message);
});

Deno.test("the scale comes from the caster, not the shadow", () => {
  // The caster is a known object at a known world position, so it still
  // establishes the mapping when the shadow is missing or misplaced - which
  // is exactly when a scale is most needed. A shadow-derived scale would
  // launder a broken decal into a plausible-looking number.
  const cal = calibrate({
    base: { caster: { cx: 300, cy: 250 }, shadow: { cx: 0, cy: 0 } },
    movedX: { caster: { cx: 380, cy: 250 }, shadow: { cx: 9999, cy: 0 } },
    movedZ: { caster: { cx: 300, cy: 330 }, shadow: { cx: 0, cy: 9999 } },
  }, 4);
  assertEquals(cal.pxPerUnitX, 20);
  assertEquals(cal.pxPerUnitZ, 20);
});

Deno.test("calibration fails when the tracked object does not follow", () => {
  const cal = calibrate({
    base: { shadow: { cx: 300, cy: 250 } },
    movedX: { shadow: { cx: 301, cy: 250 } },
    movedZ: { shadow: { cx: 300, cy: 251 } },
  }, 4, "shadow");
  assert(!cal.ok, "an object that barely moves must not calibrate");
  assertStringIncludes(cal.message.toLowerCase(), "follow");
});

Deno.test("calibration rejects an X move that lands mostly in Y", () => {
  const cal = calibrate({
    base: { shadow: { cx: 300, cy: 250 } },
    movedX: { shadow: { cx: 300, cy: 330 } },
    movedZ: { shadow: { cx: 300, cy: 328 } },
  }, 4, "shadow");
  assert(!cal.ok, "moving in world X must move it in screen X");
});

// ── follow ─────────────────────────────────────────────────────────────

Deno.test("a shadow that tracks the caster passes the follow check", () => {
  const cal = { pxPerUnitX: 20, pxPerUnitZ: 20, ok: true };
  const r = judgeFollow(
    { shadow: { cx: 300, cy: 250 } },
    { shadow: { cx: 380, cy: 250 } },
    { dx: 4, dz: 0 },
    cal,
  );
  assert(r.ok, r.message);
});

Deno.test("a shadow left behind when the caster moves fails", () => {
  const cal = { pxPerUnitX: 20, pxPerUnitZ: 20, ok: true };
  const r = judgeFollow(
    { shadow: { cx: 300, cy: 250 } },
    { shadow: { cx: 310, cy: 250 } },
    { dx: 4, dz: 0 },
    cal,
  );
  assert(!r.ok, "10px of movement where 80 was due must fail");
  assertStringIncludes(r.message, "80");
});

// ── direction ──────────────────────────────────────────────────────────

Deno.test("a shadow offset away from the light passes", () => {
  // Light on +X, so the shadow centroid must sit LEFT of the caster.
  const r = judgeDirection({ shadow: { cx: 260 }, casterScreen: { x: 320, y: 224 } }, 0);
  assert(r.ok, r.message);
});

Deno.test("a shadow offset toward the light fails", () => {
  // This is the failure the user suspected from the screenshot.
  const r = judgeDirection({ shadow: { cx: 380 }, casterScreen: { x: 320, y: 224 } }, 0);
  assert(!r.ok, "a shadow on the same side as the light must fail");
  assertStringIncludes(r.message.toLowerCase(), "toward the light");
});

Deno.test("a shadow centred on the caster fails as an outline", () => {
  // The 'halo' the user described: no offset in any direction.
  const r = judgeDirection({ shadow: { cx: 320, cy: 224 }, casterScreen: { x: 320, y: 224 } }, 0);
  assert(!r.ok, "a shadow with no offset is not a cast shadow");
  assertStringIncludes(r.message.toLowerCase(), "centred");
});

// ── azimuth ────────────────────────────────────────────────────────────

Deno.test("a decal whose long axis follows the light passes", () => {
  // Light on +X: the shadow stretches along X, so its principal axis is
  // horizontal on screen, ie 0 degrees.
  assert(judgeAzimuth({ shadow: { angleDeg: 0.5, major: 90, minor: 30 } }, 0).ok);
});

Deno.test("a decal that ignores the light azimuth fails", () => {
  // Light on +Z should give a vertical axis on screen; 0 degrees means the
  // decal stayed put while the light turned - the 2026-08-02 defect.
  const r = judgeAzimuth({ shadow: { angleDeg: 0.5, major: 90, minor: 30 } }, 90);
  assert(!r.ok, "an axis-aligned decal under a turned light must fail");
});

Deno.test("azimuth is judged modulo 180, because an axis has no sign", () => {
  assert(judgeAzimuth({ shadow: { angleDeg: 179.4, major: 90, minor: 30 } }, 0).ok);
  assert(judgeAzimuth({ shadow: { angleDeg: -0.4, major: 90, minor: 30 } }, 180).ok);
});

Deno.test("a nearly round blob is not judged on its axis", () => {
  // With major ~ minor the principal angle is noise, so reporting a
  // rotation failure would be dishonest.
  const r = judgeAzimuth({ shadow: { angleDeg: 62, major: 41, minor: 40 } }, 0);
  assertStringIncludes(r.message.toLowerCase(), "round");
  assert(r.skipped, "a round blob must be reported as inconclusive, not passed");
});

// ── size ───────────────────────────────────────────────────────────────

Deno.test("a shadow roughly the caster's width across the light passes", () => {
  // Caster 0.6 wide, elevation sin 0.51 so stretch ~1.96 along the light.
  const cal = { pxPerUnitX: 20, pxPerUnitZ: 20, ok: true };
  const r = judgeSize({ shadow: { major: 24, minor: 12 } }, { across: 0.6, along: 1.17 }, cal);
  assert(r.ok, r.message);
});

Deno.test("a shadow far wider than the caster is reported as oversized", () => {
  // The user's 'outline' report: a decal sized by the caster's 3D bounding
  // sphere is much wider than its actual silhouette.
  const cal = { pxPerUnitX: 20, pxPerUnitZ: 20, ok: true };
  const r = judgeSize({ shadow: { major: 60, minor: 44 } }, { across: 0.6, along: 1.17 }, cal);
  assert(!r.ok, "3.7x the expected width must not pass");
  assertStringIncludes(r.message.toLowerCase(), "wider");
});

Deno.test("axis-projected extents win over the moment-based ones", () => {
  // major/minor describe how the mass is spread, not how far the blob
  // reaches, so a blob of the right length but an unusual shape scores wrong.
  // Judging on them was why every size check read 0.5x while the shadow was
  // in fact the right size.
  const cal = { pxPerUnitX: 20, pxPerUnitZ: 20, ok: true };
  const m = { shadow: { major: 9999, minor: 9999, alongPx: 23.4, acrossPx: 12 } };
  assert(judgeSize(m, { across: 0.6, along: 1.17 }, cal).ok, "the projected extents must decide");
});

Deno.test("a shadow with no stretch under a low light is reported", () => {
  const cal = { pxPerUnitX: 20, pxPerUnitZ: 20, ok: true };
  const r = judgeSize({ shadow: { major: 12, minor: 12 } }, { across: 0.6, along: 1.17 }, cal);
  assert(!r.ok, "a round shadow under a 31-degree sun has lost its foreshortening");
});

// ── the matrix ─────────────────────────────────────────────────────────

Deno.test("the matrix covers four azimuths, both moves and a caster rotation", () => {
  const ids = SHADOW_CASES.map((c) => c.id);
  for (const want of ["base", "az90", "az180", "az270", "movedX", "movedZ", "rot90"]) {
    assert(ids.includes(want), `case ${want} missing from the matrix`);
  }
});

Deno.test("every case names what it would prove", () => {
  for (const c of SHADOW_CASES) {
    assert(c.proves && c.proves.length > 10, `case ${c.id} does not say what it proves`);
  }
});

// ═══════════════════════════════════════════════════════════════════════
//  Shadow opacity
//
//  The decal's colour is four 0..1 floats, alpha included
//  (shadows.c:161), and alpha is written into every vertex colour
//  (shadows.c:438) for the GS blend to use. Whether that actually
//  produces a semi-transparent shadow on hardware is a separate question
//  from whether the field exists, which is what the sweep answers.
// ═══════════════════════════════════════════════════════════════════════

Deno.test("the sweep covers transparent through opaque", () => {
  assert(ALPHA_LEVELS.length >= 4, "too few levels to see a trend");
  assert(ALPHA_LEVELS[0] <= 0.05, "the sweep must include a fully transparent end");
  assert(ALPHA_LEVELS[ALPHA_LEVELS.length - 1] >= 0.95, "and a fully opaque end");
  const sorted = [...ALPHA_LEVELS].sort((a, b) => a - b);
  assertEquals(ALPHA_LEVELS, sorted, "levels must be in ascending order");
});

Deno.test("a shadow that darkens with alpha passes", () => {
  const r = judgeAlphaSweep([
    { alpha: 0.0, shadowLuma: 40, groundLuma: 40 },
    { alpha: 0.25, shadowLuma: 30, groundLuma: 40 },
    { alpha: 0.5, shadowLuma: 20, groundLuma: 40 },
    { alpha: 0.75, shadowLuma: 10, groundLuma: 40 },
    { alpha: 1.0, shadowLuma: 1, groundLuma: 40 },
  ]);
  assert(r.ok, r.message);
});

Deno.test("an alpha that does nothing is reported", () => {
  // Every level identical: the field exists but the hardware ignores it, so
  // a shadow can only ever be fully black.
  const r = judgeAlphaSweep(
    [0, 0.25, 0.5, 0.75, 1].map((alpha) => ({ alpha, shadowLuma: 2, groundLuma: 40 })),
  );
  assert(!r.ok, "a flat response must not pass");
  assertStringIncludes(r.message.toLowerCase(), "no effect");
});

Deno.test("a response that goes the wrong way is reported", () => {
  const r = judgeAlphaSweep([
    { alpha: 0.0, shadowLuma: 2, groundLuma: 40 },
    { alpha: 0.5, shadowLuma: 20, groundLuma: 40 },
    { alpha: 1.0, shadowLuma: 38, groundLuma: 40 },
  ]);
  assert(!r.ok, "more alpha must not mean a lighter shadow");
  assertStringIncludes(r.message.toLowerCase(), "wrong way");
});

Deno.test("a sweep that is dark even at alpha 0 is reported", () => {
  // This is exactly what "the shadow looks full black" would look like if
  // alpha were being ignored at the transparent end.
  const r = judgeAlphaSweep([
    { alpha: 0.0, shadowLuma: 6, groundLuma: 40 },
    { alpha: 0.5, shadowLuma: 4, groundLuma: 40 },
    { alpha: 1.0, shadowLuma: 1, groundLuma: 40 },
  ]);
  assert(!r.ok, "alpha 0 must leave the ground essentially untouched");
  assertStringIncludes(r.message.toLowerCase(), "alpha 0");
});

Deno.test("a binary response is reported, not passed", () => {
  // What the hardware actually does under SHADOW_BLEND_DARKEN: invisible up
  // to a threshold, fully black past it. The range is the full 100 points and
  // it never goes backwards, so range and monotonicity alone call it a pass -
  // yet no level in between is semi-transparent, which is the whole question.
  const r = judgeAlphaSweep([
    { alpha: 0.0, shadowLuma: 40, groundLuma: 40 },
    { alpha: 0.25, shadowLuma: 40, groundLuma: 40 },
    { alpha: 0.5, shadowLuma: 0, groundLuma: 40 },
    { alpha: 0.75, shadowLuma: 0, groundLuma: 40 },
    { alpha: 1.0, shadowLuma: 0, groundLuma: 40 },
  ]);
  assert(!r.ok, "an all-or-nothing response is not semi-transparency");
  assertStringIncludes(r.message.toLowerCase(), "binary");
});

Deno.test("one genuinely intermediate level is enough to pass", () => {
  const r = judgeAlphaSweep([
    { alpha: 0.0, shadowLuma: 40, groundLuma: 40 },
    { alpha: 0.5, shadowLuma: 22, groundLuma: 40 },
    { alpha: 1.0, shadowLuma: 0, groundLuma: 40 },
  ]);
  assert(r.ok, r.message);
});

Deno.test("the sweep reports the darkening it measured, for reading", () => {
  const r = judgeAlphaSweep([
    { alpha: 0.0, shadowLuma: 40, groundLuma: 40 },
    { alpha: 0.5, shadowLuma: 20, groundLuma: 40 },
    { alpha: 1.0, shadowLuma: 2, groundLuma: 40 },
  ]);
  assertEquals(r.darkening.map((d) => Math.round(d * 100)), [0, 50, 95]);
});

// ── the colour route to a soft shadow ──────────────────────────────────
//
//  Alpha does not grade, but the decal's COLOUR does: under DARKEN with a
//  fully opaque source the decal paints the ground with its own colour, at
//  the PS2's 0..128 scale. So a dark grey gives a soft shadow, and past
//  the ground's own brightness the "shadow" turns into a bright patch.

Deno.test("a colour sweep that lightens the shadow passes", () => {
  const r = judgeColourSweep([
    { grey: 0.0, shadowLuma: 0, groundLuma: 40 },
    { grey: 0.2, shadowLuma: 24, groundLuma: 40 },
    { grey: 0.4, shadowLuma: 48, groundLuma: 40 },
  ]);
  assert(r.ok, r.message);
});

Deno.test("the colour sweep reports where the shadow stops being a shadow", () => {
  // Past the ground's own luma the decal paints lighter than what it sits
  // on, which reads as a glow rather than a shadow. Users need that number.
  const r = judgeColourSweep([
    { grey: 0.0, shadowLuma: 0, groundLuma: 40 },
    { grey: 0.2, shadowLuma: 24, groundLuma: 40 },
    { grey: 0.4, shadowLuma: 48, groundLuma: 40 },
  ]);
  assert(r.usableMax > 0.2 && r.usableMax < 0.4, `usable max was ${r.usableMax}`);
});

Deno.test("a colour that changes nothing is reported", () => {
  const r = judgeColourSweep([
    { grey: 0.0, shadowLuma: 0, groundLuma: 40 },
    { grey: 0.4, shadowLuma: 0, groundLuma: 40 },
    { grey: 0.8, shadowLuma: 0, groundLuma: 40 },
  ]);
  assert(!r.ok, "a colour with no effect must not pass");
  assertStringIncludes(r.message.toLowerCase(), "no effect");
});

// ═══════════════════════════════════════════════════════════════════════
//  Direct matrix placement: the decal centre follows the projected caster
//  without rotating its world translation. Corner orientation is checked
//  independently in shadowmath_test.js and viewport_test.js.
// ═══════════════════════════════════════════════════════════════════════

const A = await load();

const projFor = (azimuthDeg) => {
  const sh = A.makeComponent("shadow");
  return A.shadowProjection(sh, lightDirFor(azimuthDeg), null, null, 1);
};

Deno.test("a light on +X puts the decal's centre on -X, away from the light", () => {
  const p = projFor(0);
  const ground = A.shadowGroundPoint(p, { x: 0, y: 0.5, z: 0 }, 0);
  const matrix = A.shadowMatrixFor(p, ground, 0);
  const world = { x: matrix[12], z: matrix[14] };
  assert(world.x < -0.1, `decal centre landed at x=${world.x.toFixed(3)}, expected negative`);
  assert(Math.abs(world.z) < 0.01, `expected no Z offset, got ${world.z.toFixed(3)}`);
});

Deno.test("the decal centre lands on the ground point at every azimuth", () => {
  for (const az of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const p = projFor(az);
    const ground = A.shadowGroundPoint(p, { x: 0, y: 0.5, z: 0 }, 0);
    const matrix = A.shadowMatrixFor(p, ground, 0);
    const world = { x: matrix[12], z: matrix[14] };
    const dx = Math.abs(world.x - ground.x), dz = Math.abs(world.z - ground.z);
    assert(
      dx < 1e-6 && dz < 1e-6,
      `azimuth ${az}: decal centre (${world.x.toFixed(3)}, ${world.z.toFixed(3)}) ` +
      `is not the ground point (${ground.x.toFixed(3)}, ${ground.z.toFixed(3)})`,
    );
  }
});

Deno.test("the shadow lands opposite the light at every azimuth", () => {
  for (const az of [0, 45, 90, 135, 180, 225, 270, 315]) {
    const p = projFor(az);
    const ground = A.shadowGroundPoint(p, { x: 0, y: 0.5, z: 0 }, 0);
    const matrix = A.shadowMatrixFor(p, ground, 0);
    const world = { x: matrix[12], z: matrix[14] };
    const want = groundShadowDir(lightDirFor(az));
    const len = Math.hypot(world.x, world.z);
    const dot = (world.x * want.x + world.z * want.z) / len;
    assert(dot > 0.999, `azimuth ${az}: shadow points ${(Math.acos(dot) * 180 / Math.PI).toFixed(1)}deg off`);
  }
});
