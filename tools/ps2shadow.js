// Measures what the shadow projector actually draws, on PCSX2.
//
//   deno task ps2shadow            run the whole matrix and report
//   deno task ps2shadow --only az90
//   deno task ps2shadow --keep     leave staged folders and masks behind
//
// The four questions this answers, all of which had only ever been eyeballed:
//
//   1. does the decal turn with the light's azimuth?
//   2. does it stay put on the caster when the caster moves or rotates?
//   3. is it the right SIZE, or does it read as an outline around the caster?
//   4. does it fall on the side away from the light?
//
// ── why the scene looks the way it does ───────────────────────────────────
//
// Everything here exists to make the shadow measurable from pixels:
//
//   * Near top-down camera, fixed for every case, so world +X is screen right
//     and world +Z is screen down and the mapping never changes between runs.
//   * A 60x60 ground, because anything the ground does not cover shows
//     Screen.clear's dark grey, which would count as shadow.
//   * Ambient raised and the decal made almost opaque, so a luma threshold
//     separates shadow from ground cleanly with nothing in between.
//   * Pixels-per-world-unit is CALIBRATED from the run itself, by moving the
//     caster a known distance and watching the shadow move, rather than
//     derived from a projection matrix that might be wrong in the same way
//     the thing under test is wrong.

import { load, PURE_MODULES } from "../tests/_load.js";
import { checkBootPath, probeScript, stage, launch, parseProbe } from "./ps2run.js";

const ROOT = decodeURIComponent(new URL("..", import.meta.url).pathname).replace(/^\//, "");
const HERE = new URL(".", import.meta.url);

// ═══════════════════════════════════════════════════════════════════════
//  Conventions
// ═══════════════════════════════════════════════════════════════════════

// The light's elevation for every case. sin(elevation) decides the stretch,
// and 0.6 against a unit horizontal gives about 31 degrees - low enough that a
// missing 1/sin foreshortening is obvious, high enough to stay off the
// maxStretch clamp (default 4, ie elevation >= 14.5 degrees).
const LIGHT_Y = 0.6;

// How far the follow cases move the caster. Four units pushed the decal past
// the right edge of the frame, and a clipped blob has a biased centroid.
const MOVE_UNITS = 2;

/**
 * A light direction for an azimuth in degrees, measured from +X toward +Z.
 * Deliberately NOT normalised: `direction` is a direction, and the emitter
 * writes whatever it is given straight into Lights.set.
 */
export function lightDirFor(azimuthDeg) {
  const a = (azimuthDeg * Math.PI) / 180;
  return { x: Math.cos(a), y: LIGHT_Y, z: Math.sin(a) };
}

/**
 * The unit direction along the ground that a shadow should extend.
 *
 * `direction` points TOWARD the light - "like a vector to the sun"
 * (core/components.js), and the emitter says the same, citing the engine's own
 * examples where (0, 1, 1) is the sun up and behind (codegen/lights.js:5). The
 * shadow therefore lies along the horizontal part of MINUS that vector.
 *
 * Returns null for a light straight overhead, which has no direction.
 */
export function groundShadowDir(lightDir) {
  const h = Math.hypot(lightDir.x, lightDir.z);
  if (h < 1e-4) return null;
  return { x: -lightDir.x / h, z: -lightDir.z / h };
}

/**
 * World ground direction to screen direction, for the fixed near-top-down
 * camera: +X right, +Z down. The slight tilt foreshortens Z by about 1.4%,
 * which is far inside every tolerance here, so it is ignored.
 */
export function screenDirFor(dir) {
  const n = Math.hypot(dir.x, dir.z) || 1;
  return { dx: dir.x / n, dy: dir.z / n };
}

/** Screen-space axis angle, in the same convention ps2measure.ps1 reports. */
function axisAngleOf(screenDir) {
  // ps2measure negates the covariance's xy term so its angle is measured with
  // y pointing up; match that here, then fold onto [0, 180) since an axis has
  // no sign.
  let a = (Math.atan2(-screenDir.dy, screenDir.dx) * 180) / Math.PI;
  a = ((a % 180) + 180) % 180;
  return a;
}

function angleGap(a, b) {
  let d = Math.abs((((a - b) % 180) + 180) % 180);
  return d > 90 ? 180 - d : d;
}

// ═══════════════════════════════════════════════════════════════════════
//  Calibration
// ═══════════════════════════════════════════════════════════════════════

const MIN_TRACK_PX = 20;   // below this the shadow is not tracking at all
const AXIS_RATIO = 3;      // a world-X move must land mostly in screen X

/**
 * Pixels per world unit, measured from the run rather than derived from a
 * projection matrix that could be wrong in the same way the thing under test
 * is wrong.
 *
 * `key` picks what is tracked. The caster is the honest choice for scale: it
 * is a known object at a known world position, so it establishes the mapping
 * even when the shadow is missing or misplaced - which is exactly the case
 * where a scale is most needed.
 */
export function calibrate({ base, movedX, movedZ }, delta, key = "caster") {
  const dxX = movedX[key].cx - base[key].cx;
  const dyX = movedX[key].cy - base[key].cy;
  const dxZ = movedZ[key].cx - base[key].cx;
  const dyZ = movedZ[key].cy - base[key].cy;

  if (Math.abs(dxX) < MIN_TRACK_PX || Math.abs(dyZ) < MIN_TRACK_PX) {
    return {
      ok: false,
      pxPerUnitX: 0, pxPerUnitZ: 0,
      message:
        `the ${key} does not follow: moving it ${delta} units moved it ` +
        `${dxX.toFixed(1)}px in screen X and ${dyZ.toFixed(1)}px in screen Y`,
    };
  }
  if (Math.abs(dxX) < AXIS_RATIO * Math.abs(dyX) || Math.abs(dyZ) < AXIS_RATIO * Math.abs(dxZ)) {
    return {
      ok: false,
      pxPerUnitX: 0, pxPerUnitZ: 0,
      message:
        `the screen axes are not what the camera implies: a world +X move went ` +
        `(${dxX.toFixed(1)}, ${dyX.toFixed(1)})px and a world +Z move went ` +
        `(${dxZ.toFixed(1)}, ${dyZ.toFixed(1)})px`,
    };
  }
  return {
    ok: true,
    pxPerUnitX: dxX / delta,
    pxPerUnitZ: dyZ / delta,
    message: `${(dxX / delta).toFixed(2)} px/unit in X, ${(dyZ / delta).toFixed(2)} px/unit in Z`,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  The judgements
// ═══════════════════════════════════════════════════════════════════════

export function judgeFollow(base, moved, { dx = 0, dz = 0 }, cal) {
  // What "follows" means is that the decal moved with the CASTER, so that is
  // what it is measured against. The world-unit calibration is taken at one
  // spot on the screen and the camera is perspective, so the same two world
  // units cover a different number of pixels elsewhere in the frame — good
  // enough at azimuth 0, where the calibration was taken, and off by tens of
  // pixels at an intermediate azimuth where the decal sits somewhere else.
  // The caster carries the same perspective error and cancels it.
  const haveCaster = base.caster?.n > 0 && moved.caster?.n > 0;
  const ex = haveCaster ? moved.caster.cx - base.caster.cx : dx * cal.pxPerUnitX;
  const ey = haveCaster ? moved.caster.cy - base.caster.cy : dz * cal.pxPerUnitZ;
  const ax = moved.shadow.cx - base.shadow.cx;
  const ay = moved.shadow.cy - base.shadow.cy;
  const want = Math.hypot(ex, ey);
  const got = Math.hypot(ax, ay);
  const err = Math.hypot(ax - ex, ay - ey);
  // The decal is on the ground and the caster's centroid is half a unit above
  // it, so a perspective camera moves the two by slightly different amounts.
  const tol = Math.max(10, 0.2 * want);
  if (err > tol) {
    return {
      ok: false,
      message:
        `the decal moved ${got.toFixed(0)}px where the caster moved ${want.toFixed(0)}px ` +
        `(expected (${ex.toFixed(0)}, ${ey.toFixed(0)}), got (${ax.toFixed(0)}, ${ay.toFixed(0)}))`,
    };
  }
  return { ok: true, message: `tracked the caster: decal ${got.toFixed(0)}px, caster ${want.toFixed(0)}px` };
}

const MIN_OFFSET_PX = 6;

export function judgeDirection(m, azimuthDeg) {
  const dir = groundShadowDir(lightDirFor(azimuthDeg));
  if (!dir) return { ok: true, skipped: true, message: "light is overhead, no direction to check" };
  const want = screenDirFor(dir);

  const cx = m.shadow.cx;
  const cy = m.shadow.cy ?? m.casterScreen.y;
  const ox = cx - m.casterScreen.x;
  const oy = cy - m.casterScreen.y;
  const len = Math.hypot(ox, oy);

  if (len < MIN_OFFSET_PX) {
    return {
      ok: false,
      message:
        `the shadow is centred on the caster (offset ${len.toFixed(1)}px) - that is an outline ` +
        `around it, not a shadow cast away from the light`,
    };
  }
  const dot = (ox * want.dx + oy * want.dy) / len;
  if (dot < -0.5) {
    return {
      ok: false,
      message:
        `the shadow points toward the light, not away from it: offset ` +
        `(${ox.toFixed(0)}, ${oy.toFixed(0)})px against an expected direction of ` +
        `(${want.dx.toFixed(2)}, ${want.dy.toFixed(2)})`,
    };
  }
  if (dot < 0.5) {
    return {
      ok: false,
      message:
        `the shadow is offset across the light rather than away from it: offset ` +
        `(${ox.toFixed(0)}, ${oy.toFixed(0)})px, expected along ` +
        `(${want.dx.toFixed(2)}, ${want.dy.toFixed(2)})`,
    };
  }
  return { ok: true, message: `offset ${len.toFixed(0)}px away from the light` };
}

const ROUND_RATIO = 1.15;

export function judgeAzimuth(m, azimuthDeg) {
  const { major, minor, angleDeg } = m.shadow;
  if (!major || !minor || major / minor < ROUND_RATIO) {
    return {
      ok: false, skipped: true,
      message:
        `the blob is too round to have a meaningful axis (major ${major}, minor ${minor}) - ` +
        `inconclusive rather than passing`,
    };
  }
  const dir = groundShadowDir(lightDirFor(azimuthDeg));
  const want = axisAngleOf(screenDirFor(dir));
  const gap = angleGap(angleDeg, want);
  // 20 degrees was loose enough to pass a decal turned 19 degrees off the
  // light, which is what hid the turn-table error for as long as it did: the
  // check went green on exactly the cases that were most wrong. The corrected
  // matrix measures within 3.1 degrees at every azimuth, so 8 leaves room for
  // the noise in fitting an axis to a fat ellipse and nothing else.
  if (gap > 8) {
    return {
      ok: false,
      message: `the decal's long axis is at ${angleDeg.toFixed(1)}deg, expected ${want.toFixed(1)}deg ` +
        `for a light at azimuth ${azimuthDeg}deg (off by ${gap.toFixed(1)}deg)`,
    };
  }
  return { ok: true, message: `axis ${angleDeg.toFixed(1)}deg vs ${want.toFixed(1)}deg expected` };
}

/**
 * The blob's expected world extents.
 *
 * Not the caster's own size, and not `width * stretch`: the silhouette camera
 * frames a square `extent` wide at the caster, so the caster occupies
 * casterW/extent of the render target across and casterH/extent along, and the
 * decal maps that target onto sizeX by sizeZ. The foreshortening is already
 * inside sizeZ, so multiplying by the stretch again double-counts it.
 */
// ═══════════════════════════════════════════════════════════════════════
//  Opacity
// ═══════════════════════════════════════════════════════════════════════

/** Alphas the sweep runs, transparent through opaque. */
export const ALPHA_LEVELS = [0.0, 0.25, 0.5, 0.75, 1.0];

// Below this the alpha field exists but the picture does not change with it.
const MIN_ALPHA_RANGE = 0.25;
// At alpha 0 the decal must leave the ground essentially untouched.
const MAX_CLEAR_DARKENING = 0.1;

/**
 * Does the decal's alpha actually produce a semi-transparent shadow?
 *
 * `darkening` is 1 - shadowLuma / groundLuma: 0 is invisible, 1 is black.
 * Judged on the trend rather than on absolute values, because the blend the
 * GS applies is not necessarily linear in alpha.
 */
export function judgeAlphaSweep(samples) {
  const darkening = samples.map((s) => 1 - s.shadowLuma / s.groundLuma);
  const fmt = samples
    .map((s, i) => `a=${s.alpha.toFixed(2)} -> ${(darkening[i] * 100).toFixed(0)}%`)
    .join(", ");

  const range = Math.max(...darkening) - Math.min(...darkening);
  // Ordered so the most specific diagnosis wins: a picture that does not move
  // at all is a different fault from one that moves but starts out black.
  if (range < 0.05) {
    return {
      ok: false, darkening,
      message:
        `alpha has no effect: the picture is identical at every level (${fmt}) - ` +
        `the shadow cannot be made semi-transparent`,
    };
  }
  for (let i = 1; i < darkening.length; i++) {
    if (darkening[i] < darkening[i - 1] - 0.05) {
      return {
        ok: false, darkening,
        message: `alpha runs the wrong way: more alpha gave a lighter shadow (${fmt})`,
      };
    }
  }
  if (darkening[0] > MAX_CLEAR_DARKENING) {
    return {
      ok: false, darkening,
      message:
        `alpha 0 still darkens the ground by ${(darkening[0] * 100).toFixed(0)}% (${fmt}) - ` +
        `a fully transparent decal should be invisible`,
    };
  }
  if (range < MIN_ALPHA_RANGE) {
    return {
      ok: false, darkening,
      message:
        `alpha barely works: darkening spans only ${(range * 100).toFixed(0)} points ` +
        `across the whole range (${fmt})`,
    };
  }
  // Range and monotonicity together still admit an all-or-nothing response:
  // invisible up to a threshold, then fully black. Semi-transparency means at
  // least one level lands genuinely between the two extremes.
  const graded = darkening.some((d) => d > MAX_CLEAR_DARKENING && d < 1 - MAX_CLEAR_DARKENING);
  if (!graded) {
    return {
      ok: false, darkening,
      message:
        `alpha is binary, not graded: every level is either invisible or fully opaque ` +
        `(${fmt}) - there is no semi-transparent setting`,
    };
  }
  return {
    ok: true, darkening,
    message: `alpha drives opacity across ${(range * 100).toFixed(0)} points: ${fmt}`,
  };
}

/**
 * The colour route to a soft shadow.
 *
 * Alpha does not grade, but the decal's colour does. Under DARKEN with a fully
 * opaque source the blend `(Cs - Cd) * As + Cd` collapses to `Cs`, so the decal
 * paints the ground with its own colour at the PS2's 0..128 scale — measured as
 * `luma = grey * 128`. A dark grey therefore gives a genuinely soft shadow, and
 * past the ground's own brightness it turns into a bright patch instead.
 *
 * `usableMax` is the grey at which the decal matches the ground and becomes
 * invisible; anything above it is no longer a shadow.
 */
export function judgeColourSweep(samples) {
  const fmt = samples
    .map((s) => `grey ${s.grey.toFixed(2)} -> luma ${s.shadowLuma}`)
    .join(", ");
  const lumas = samples.map((s) => s.shadowLuma);
  const ground = samples[0].groundLuma;

  if (Math.max(...lumas) - Math.min(...lumas) < 5) {
    return {
      ok: false, usableMax: 0,
      message: `the decal colour has no effect: ${fmt}`,
    };
  }
  for (let i = 1; i < lumas.length; i++) {
    if (lumas[i] < lumas[i - 1] - 2) {
      return { ok: false, usableMax: 0, message: `a lighter colour gave a darker shadow: ${fmt}` };
    }
  }
  // Straight-line fit through the measured points, solved for luma == ground.
  const n = samples.length;
  const sx = samples.reduce((a, s) => a + s.grey, 0);
  const sy = lumas.reduce((a, v) => a + v, 0);
  const sxy = samples.reduce((a, s, i) => a + s.grey * lumas[i], 0);
  const sxx = samples.reduce((a, s) => a + s.grey * s.grey, 0);
  const slope = (n * sxy - sx * sy) / (n * sxx - sx * sx);
  const intercept = (sy - slope * sx) / n;
  const usableMax = slope > 0 ? (ground - intercept) / slope : 0;

  return {
    ok: true, usableMax,
    message:
      `the decal colour drives the shadow's darkness: ${fmt}. It matches the ground ` +
      `at grey ${usableMax.toFixed(2)}, so that is the ceiling - above it the decal ` +
      `paints lighter than what it sits on`,
  };
}

export function expectedBlob({ casterW, casterH, extent, sizeX, sizeZ }) {
  return { across: (casterW / extent) * sizeX, along: (casterH / extent) * sizeZ };
}

export function judgeSize(m, { across, along }, cal) {
  const px = (cal.pxPerUnitX + cal.pxPerUnitZ) / 2;
  const wantAcross = across * px;
  const wantAlong = along * px;
  // alongPx/acrossPx are extents projected onto the blob's own axis. major and
  // minor come from second moments, which describe how the mass is spread
  // rather than how far it reaches, so two blobs of the same length but
  // different shape score differently - they are only a fallback for callers
  // that do not have the projected extents.
  const gotAcross = m.shadow.acrossPx ?? m.shadow.minor;
  const gotAlong = m.shadow.alongPx ?? m.shadow.major;

  const rAcross = gotAcross / wantAcross;
  const rAlong = gotAlong / wantAlong;

  if (rAcross > 1.8) {
    return {
      ok: false,
      message:
        `the shadow is ${rAcross.toFixed(1)}x wider across the light than the silhouette ` +
        `should map to (${m.shadow.minor.toFixed(0)}px against ${wantAcross.toFixed(0)}px due) - ` +
        `this is what reads as an outline around the caster`,
    };
  }
  if (rAcross < 0.6) {
    return { ok: false, message: `the shadow is ${rAcross.toFixed(1)}x narrower than the caster` };
  }
  if (rAlong < 0.6) {
    return {
      ok: false,
      message:
        `the shadow is ${rAlong.toFixed(1)}x shorter along the light than it should be ` +
        `(${gotAlong.toFixed(0)}px against ${wantAlong.toFixed(0)}px) - the 1/sin(elevation) ` +
        `foreshortening is missing`,
    };
  }
  if (rAlong > 1.8) {
    return { ok: false, message: `the shadow is ${rAlong.toFixed(1)}x longer along the light than due` };
  }
  return {
    ok: true,
    message: `${gotAcross.toFixed(0)}x${gotAlong.toFixed(0)}px against ${wantAcross.toFixed(0)}x${wantAlong.toFixed(0)}px due`,
  };
}

// ═══════════════════════════════════════════════════════════════════════
//  The matrix
// ═══════════════════════════════════════════════════════════════════════

export const SHADOW_CASES = [
  {
    id: "base", azimuth: 0, pos: { x: 0, z: 0 }, rotY: 0,
    proves: "the baseline: a light on +X must cast the shadow toward -X, stretched about 1.9x along it",
  },
  {
    id: "movedX", azimuth: 0, pos: { x: 2, z: 0 }, rotY: 0,
    proves: "the decal follows the caster along X, and calibrates pixels per world unit in X",
  },
  {
    id: "movedZ", azimuth: 0, pos: { x: 0, z: 2 }, rotY: 0,
    proves: "the decal follows the caster along Z, and calibrates pixels per world unit in Z",
  },
  {
    id: "az90", azimuth: 90, pos: { x: 0, z: 0 }, rotY: 0,
    proves: "the decal turns with the light: on +Z the shadow must run along Z, not stay on X",
  },
  {
    id: "az180", azimuth: 180, pos: { x: 0, z: 0 }, rotY: 0,
    proves: "the shadow flips to the far side when the light crosses to -X",
  },
  {
    id: "az270", azimuth: 270, pos: { x: 0, z: 0 }, rotY: 0,
    proves: "the fourth quadrant, which catches a sign error that the first three would miss",
  },
  {
    id: "rot90", azimuth: 0, pos: { x: 0, z: 0 }, rotY: 90,
    proves: "rotating the caster re-renders its silhouette without moving or turning the decal itself",
  },
  // The diagonals. Azimuths 0/90/180/270 all land on a boundary of the
  // [-90, 90] fold in shadowmath, where phi is exactly 0 or +-90 and the
  // scale compensation is either 1 or its extreme. The diagonals are the
  // ordinary interior case, and a mirror error shows up differently there.
  { id: "az45", azimuth: 45, pos: { x: 0, z: 0 }, rotY: 0, proves: "an interior azimuth, away from the fold boundaries the cardinal cases sit on" },
  { id: "az135", azimuth: 135, pos: { x: 0, z: 0 }, rotY: 0, proves: "the second diagonal, which separates a mirror in X from a mirror in Z" },
  { id: "az225", azimuth: 225, pos: { x: 0, z: 0 }, rotY: 0, proves: "the first azimuth where the UV fold actually engages" },
  { id: "az315", azimuth: 315, pos: { x: 0, z: 0 }, rotY: 0, proves: "the fourth diagonal, completing the circle" },

  // ── a moved caster under a TURNED light ─────────────────────────────
  //
  // The combination the matrix was missing, and it is the one every real
  // scene is in. The decal's `position` is pre-rotated by the light's azimuth
  // (world = (local + position) . R, so the position turns with the grid), and
  // that pre-rotation was only ever exercised where it cannot say anything:
  //
  //   * movedX / movedZ move the caster, but at azimuth 0, where phi is -90
  //     degrees and the pre-rotation collapses to an axis swap.
  //   * az45 .. az315 turn the light, but with the caster at the ORIGIN, where
  //     rotating (0, 0) gives (0, 0) whatever the angle.
  //
  // So a rotation applied by the wrong angle - or to the wrong term - would
  // have passed the whole matrix while making the shadow slide off in its own
  // direction the moment the character walked anywhere. Which is exactly the
  // symptom that prompted these cases.
  // The sweep that pins the law rather than one point of it. phi is the decal's
  // own turn, atan2(-L.x, L.z) folded into [-90, 90]:
  //   azimuth  22.5 -> phi -67.5      azimuth 112.5 -> phi +67.5
  //   azimuth  45   -> phi -45        azimuth 135   -> phi +45
  //   azimuth  67.5 -> phi -22.5
  // Both signs and three magnitudes, which is enough to tell a factor from an
  // offset and to catch a law that is only right at the cardinal angles.
  { id: "az22", azimuth: 22.5, pos: { x: 0, z: 0 }, rotY: 0, proves: "phi = -67.5, between the cardinal and the diagonal" },
  { id: "az22movedX", azimuth: 22.5, pos: { x: 2, z: 0 }, rotY: 0, follows: { of: "az22", dx: MOVE_UNITS, dz: 0 }, proves: "how far the decal's motion is turned at phi = -67.5" },
  // A second, independent reading at the same |phi|. SHADOW_MAGNIFY_TABLE's
  // entry for 67.5 rested on az22movedX alone, and one sample cannot tell a
  // measurement from its noise — every other entry in the table has two.
  { id: "az22movedZ", azimuth: 22.5, pos: { x: 0, z: 2 }, rotY: 0, follows: { of: "az22", dx: 0, dz: MOVE_UNITS }, proves: "the same, along Z, so the 67.5 entry is not a single reading" },
  { id: "az67", azimuth: 67.5, pos: { x: 0, z: 0 }, rotY: 0, proves: "phi = -22.5" },
  { id: "az67movedX", azimuth: 67.5, pos: { x: 2, z: 0 }, rotY: 0, follows: { of: "az67", dx: MOVE_UNITS, dz: 0 }, proves: "how far the decal's motion is turned at phi = -22.5" },
  { id: "az135movedX", azimuth: 135, pos: { x: 2, z: 0 }, rotY: 0, follows: { of: "az135", dx: MOVE_UNITS, dz: 0 }, proves: "the other sign of phi: +45" },
  { id: "az112", azimuth: 112.5, pos: { x: 0, z: 0 }, rotY: 0, proves: "phi = +22.5, the mirror of az67" },
  { id: "az112movedX", azimuth: 112.5, pos: { x: 2, z: 0 }, rotY: 0, follows: { of: "az112", dx: MOVE_UNITS, dz: 0 }, proves: "how far the decal's motion is turned at phi = +22.5" },

  { id: "az45movedX", azimuth: 45, pos: { x: 2, z: 0 }, rotY: 0, follows: { of: "az45", dx: MOVE_UNITS, dz: 0 }, proves: "the decal follows the caster in X while the light is turned 45 degrees" },
  { id: "az45movedZ", azimuth: 45, pos: { x: 0, z: 2 }, rotY: 0, follows: { of: "az45", dx: 0, dz: MOVE_UNITS }, proves: "and in Z, which separates a swapped axis from a wrong angle" },
  { id: "az225movedX", azimuth: 225, pos: { x: 2, z: 0 }, rotY: 0, follows: { of: "az225", dx: MOVE_UNITS, dz: 0 }, proves: "a moved caster where the UV fold is engaged as well" },
];

// A separate camera for the one question that must not depend on anyone's
// convention: a tilted view where the caster's lit side and the shadow are
// both visible in the same frame.
export const LIT_CASE = {
  id: "lit", azimuth: 0, pos: { x: 0, z: 0 }, rotY: 0,
  cam: { x: 0, y: 6, z: 11 }, fov: 45,
  // A sphere, because the brightest point on one moves with the light and can
  // be located to a pixel. The flat-shaded prism used before differed by 1 luma
  // between its two halves, which decided nothing.
  mesh: "sphere.obj",
  // Low ambient, high diffuse: the lit cap then reaches past 200 while the
  // ground, whose normal is +Y and whose shading never changes, tops out near
  // 162. Anything above 200 is therefore the caster's lit side and nothing else.
  light: { ambient: 0.25, diffuse: 0.75 },
  proves: "the shadow falls on the opposite side of the caster from the face the engine is lighting",
};

/**
 * The opacity sweep: the base scene, one case per alpha level.
 *
 * Geometry is identical across them — only `shadow.color.a` changes — so the
 * decal lands in the same place every time and one sample rectangle serves the
 * whole set.
 */
/**
 * The same sweep with the project's alpha test turned down.
 *
 * The display default is `ALPHA_TEST_REF 50` with `ALPHA_GREATER` and
 * `ALPHA_FAIL_NO_UPDATE` (codegen/index.js:93), and PS2 alpha runs 0..128, so
 * any decal fragment at or below about 0.39 opacity is **discarded outright**
 * before it ever reaches the blend. That alone would make a shadow look
 * all-or-nothing, whatever the blend equation does.
 */
export const ALPHA_REF0_CASES = [0.1, 0.25, 0.5, 0.75, 1.0].map((a) => ({
  id: `alpharef0_${String(Math.round(a * 100)).padStart(3, "0")}`,
  azimuth: 0, pos: { x: 0, z: 0 }, rotY: 0, alpha: a,
  blend: "SHADOW_BLEND_ALPHA", alphaRef: 0,
  proves: `alpha ${a} with the project's alpha test out of the way`,
}));

/**
 * The whole alpha sweep in ONE boot.
 *
 * Every level shares the scene's geometry and differs only in the decal's
 * colour, so there is no reason to boot the emulator once per level: five
 * casters in a row, each with its own shadow at its own alpha, measure the
 * same thing in a fifth of the wall time. The light points along +Z so the
 * shadows run away from the camera rather than into each other.
 *
 * `deno task ps2shadow --serial` runs them one boot at a time instead, which
 * is what the batch was checked against — the two agree to a luma.
 */
export const BATCH_SPACING = 2.5;

export function batchedAlphaCase(levels = ALPHA_LEVELS) {
  return {
    id: "alphabatch",
    azimuth: 90, pos: { x: 0, z: 0 }, rotY: 0,
    batch: levels.map((a, i) => ({
      alpha: a,
      x: (i - (levels.length - 1) / 2) * BATCH_SPACING,
    })),
    proves: "every alpha level at once, one boot instead of one per level",
  };
}

/**
 * The alpha sweep with PABE off.
 *
 * `Screen.setParam(PIXEL_ALPHA_BLEND_ENABLE, ...)` writes the GS **PABE**
 * register (graphics.c:479), not the per-primitive ABE bit — ABE comes from
 * gsGlobal->PrimAlphaEnable (render.c:383) and is on by default. PABE = 1
 * means "blend only where the source alpha's MSB is set", i.e. only at alpha
 * 128 on the PS2's 0..128 scale. Every alpha below that is written straight
 * through, opaque, which is exactly the all-or-nothing behaviour measured.
 */
export const PABE_OFF_CASES = [0.1, 0.25, 0.5, 0.75, 1.0].map((a) => ({
  id: `pabe0_${String(Math.round(a * 100)).padStart(3, "0")}`,
  azimuth: 0, pos: { x: 0, z: 0 }, rotY: 0, alpha: a,
  blend: "SHADOW_BLEND_ALPHA", alphaRef: 0,
  proves: `alpha ${a} blends properly now that PABE is off by default`,
}));

/**
 * The other way to get a softer shadow: leave alpha alone and lighten the
 * decal's COLOUR. Under DARKEN the blend is `(Cs - Cd) * As + Cd`, so a grey
 * source lands part way between the ground and black even when the source is
 * fully opaque - which is what a semi-transparent shadow looks like.
 */
export const GREY_LEVELS = [0.0, 0.2, 0.4, 0.6, 0.8];
export const GREY_CASES = GREY_LEVELS.map((v) => ({
  id: `grey${String(Math.round(v * 100)).padStart(3, "0")}`,
  azimuth: 0, pos: { x: 0, z: 0 }, rotY: 0, alpha: 1.0, grey: v,
  proves: `a decal colour of ${v} grey at full alpha produces a proportionally lighter shadow`,
}));

export const ALPHA_CASES = ALPHA_LEVELS.flatMap((a) =>
  // Both blends, because DARKEN is `min(dst, src)`-shaped and has no reason to
  // respect alpha at all, while ALPHA is the one that should.
  [
    {
      id: `alpha${String(Math.round(a * 100)).padStart(3, "0")}`,
      azimuth: 0, pos: { x: 0, z: 0 }, rotY: 0, alpha: a, blend: "SHADOW_BLEND_DARKEN",
      proves: `a colour alpha of ${a} under DARKEN produces the matching opacity`,
    },
    {
      id: `alphablend${String(Math.round(a * 100)).padStart(3, "0")}`,
      azimuth: 0, pos: { x: 0, z: 0 }, rotY: 0, alpha: a, blend: "SHADOW_BLEND_ALPHA",
      proves: `a colour alpha of ${a} under ALPHA blending produces the matching opacity`,
    },
  ]
);

/**
 * A UV sphere, radius 0.5, centred on the origin.
 *
 * Written here rather than in src/templates/assets.js: it exists to make the
 * lighting measurable, not to be offered to anyone building a game.
 */
export function sphereObj(rings = 16, segments = 24, r = 0.5) {
  const v = [], vn = [], f = [];
  for (let i = 0; i <= rings; i++) {
    const theta = (i * Math.PI) / rings;
    for (let j = 0; j <= segments; j++) {
      const phi = (j * 2 * Math.PI) / segments;
      const x = Math.sin(theta) * Math.cos(phi);
      const y = Math.cos(theta);
      const z = Math.sin(theta) * Math.sin(phi);
      v.push(`v ${(x * r).toFixed(4)} ${(y * r).toFixed(4)} ${(z * r).toFixed(4)}`);
      vn.push(`vn ${x.toFixed(4)} ${y.toFixed(4)} ${z.toFixed(4)}`);
    }
  }
  const at = (i, j) => i * (segments + 1) + j + 1;
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segments; j++) {
      const a = at(i, j), b = at(i + 1, j), c = at(i + 1, j + 1), d = at(i, j + 1);
      f.push(`f ${a}//${a} ${b}//${b} ${c}//${c}`);
      f.push(`f ${a}//${a} ${c}//${c} ${d}//${d}`);
    }
  }
  return ["# Sphere - generated by tools/ps2shadow.js", "o Sphere", ...v, ...vn, ...f, ""].join("\n");
}

// ═══════════════════════════════════════════════════════════════════════
//  Scene
// ═══════════════════════════════════════════════════════════════════════

// Fixed for every case: the screen mapping must not change between runs.
const CAM = { x: 0, y: 18, z: 3 };
const CAM_FOV = 45;
const GROUND_HALF = 30;

export function shadowScene(A, kase) {
  const p = A.mkProject();
  const scene = p.scenes[0];
  scene.name = `Shadow_${kase.id}`;
  scene.objects = [];
  scene.defaultCameraRig = false;

  const obj = (name, comps = {}, pos) => {
    const o = A.mkObject(name);
    for (const [k, patch] of Object.entries(comps)) {
      o.components[k] = Object.assign(A.makeComponent(k), patch);
    }
    if (pos) o.components.transform.position = pos;
    return o;
  };

  const c = kase.cam || CAM;
  const cam = obj("Main Camera", {
    camera: { fov: kase.fov || CAM_FOV, target: { x: 0, y: kase.cam ? 0.5 : 0, z: 0 } },
  }, A.v3(c.x, c.y, c.z));

  // Ambient high and diffuse moderate: the ground must land well above the
  // shadow threshold whatever the light azimuth, since the ground's normal is
  // +Y and its diffuse term only depends on elevation, which is fixed.
  if (kase.alphaRef !== undefined) {
    p.display.alphaTest = { ...p.display.alphaTest, ref: kase.alphaRef };
  }
  if (kase.pixelBlend !== undefined) {
    p.display.alphaTest = { ...p.display.alphaTest, pixelBlend: kase.pixelBlend };
  }

  const amb = kase.light?.ambient ?? 0.55;
  const dif = kase.light?.diffuse ?? 0.45;
  const sun = obj("Sun", {
    light: {
      direction: lightDirFor(kase.azimuth),
      ambient: { r: amb, g: amb, b: amb },
      diffuse: { r: dif, g: dif, b: dif },
      specular: { r: 0, g: 0, b: 0 },
    },
  });

  const ground = obj("Ground", { model: { file: "ground.obj" } });

  // y = 0.5 puts playerObj's feet on the ground: the mesh spans y -0.5..0.5.
  const caster = obj("Caster", {
    model: { file: kase.mesh || "player.obj" },
    script: { file: "Probe.js" },
  }, A.v3(kase.pos.x, 0.5, kase.pos.z));
  if (kase.rotY) {
    caster.components.transform.rotation = A.v3(0, (kase.rotY * Math.PI) / 180, 0);
  }

  // Nearly opaque, so a luma threshold separates shadow from ground with
  // nothing ambiguous in between.
  const shadow = obj("CasterShadow", {
    shadow: {
      caster: "Caster", lightSource: "Sun", follow: true, groundY: 0.02,
      // 0.95 for the geometry cases, so a luma threshold separates the decal
      // from the ground with nothing ambiguous in between. The opacity sweep
      // overrides it, which is the whole point of that sweep.
      color: { r: kase.grey ?? 0, g: kase.grey ?? 0, b: kase.grey ?? 0, a: kase.alpha ?? 0.95 },
      blend: kase.blend || "SHADOW_BLEND_DARKEN",
    },
  });

  if (kase.batch) {
    // One caster and one decal per level, side by side. Everything else is
    // shared, so a single boot measures the whole sweep.
    scene.objects = [cam, sun, ground];
    for (const [i, step] of kase.batch.entries()) {
      const c = obj(`Caster${i}`, {
        model: { file: kase.mesh || "player.obj" },
        ...(i === 0 ? { script: { file: "Probe.js" } } : {}),
      }, A.v3(step.x, 0.5, 0));
      const s = obj(`Shadow${i}`, {
        shadow: {
          caster: `Caster${i}`, lightSource: "Sun", follow: true, groundY: 0.02,
          color: { r: step.grey ?? 0, g: step.grey ?? 0, b: step.grey ?? 0, a: step.alpha ?? 0.95 },
          blend: kase.blend || "SHADOW_BLEND_DARKEN",
        },
      });
      scene.objects.push(c, s);
    }
    return A.migrateProject(p);
  }

  scene.objects = [cam, sun, ground, caster, shadow];
  return A.migrateProject(p);
}

// ═══════════════════════════════════════════════════════════════════════
//  Running
// ═══════════════════════════════════════════════════════════════════════

async function measure(png, mask, boxes) {
  const ps1 = decodeURIComponent(new URL("ps2measure.ps1", HERE).pathname).replace(/^\//, "");
  const args = ["-ExecutionPolicy", "Bypass", "-File", ps1, "-In", png, "-Top", "60"];
  if (mask) args.push("-Mask", mask);
  if (boxes) args.push("-Boxes", boxes);
  const out = await new Deno.Command("powershell", { args, stdout: "piped", stderr: "piped" }).output();
  const text = new TextDecoder().decode(out.stdout).trim();
  const err = new TextDecoder().decode(out.stderr).trim();
  const line = text.split(/\r?\n/).find((l) => l.trim().startsWith("{"));
  if (!line) throw new Error(`ps2measure produced no JSON:\n${text}\n${err}`);
  return JSON.parse(line);
}

async function runCase(A, kase, dir, outDir, keep, opts = {}) {
  const project = shadowScene(A, kase);
  const modelDir = project.dirs?.models || "3dmodels";

  // A ground big enough that Screen.clear's dark grey never reaches the frame.
  const assets = [
    { path: `${modelDir}/ground.obj`, text: A.groundObj(GROUND_HALF) },
    kase.mesh === "sphere.obj"
      ? { path: `${modelDir}/sphere.obj`, text: sphereObj() }
      : { path: `${modelDir}/player.obj`, text: A.playerObj() },
  ];
  const gen = A.generateProject(project, [
    { name: "Probe.js", cat: "scripts", content: probeScript({ frames: 150 }) },
    ...assets.map(file => ({ name: file.path.split("/").pop(), cat: "models", folder: modelDir, content: file.text })),
  ]);
  const errs = gen.diagnostics.filter((d) => d.level === "error");
  if (errs.length) throw new Error(errs.map((d) => d.message).join("; "));

  // --scaleprobe multiplies the emitted decal scale, to find out whether
  // `.scale` reaches the engine at all. If the blob shrinks with it, the scale
  // is live and the compensation can be corrected; if nothing moves, the
  // magnitude has to be taken out of setSize and the position instead.
  if (opts.scaleProbe) {
    const before = gen.main;
    gen.main = gen.main.replace(
      /^(\w+\.scale\s*= \{x: )([\d.]+)(, y: 1\.0, z: )([\d.]+)(\};)$/m,
      (_, a, x, b, z, c) =>
        `${a}${(Number(x) * opts.scaleProbe).toFixed(6)}${b}${(Number(z) * opts.scaleProbe).toFixed(6)}${c}`,
    );
    if (gen.main === before) throw new Error("scaleprobe: no decal scale line found");
  }

  await stage(dir, gen, assets);
  const png = `${outDir}\\${kase.id}.png`;
  await launch(dir, { seconds: 13, png });

  const mask = keep ? `${outDir}\\${kase.id}-mask.png` : null;
  const m = await measure(png, mask);
  m.case = kase.id;
  m.png = png;
  m.probe = parseProbe(await Deno.readTextFile(`${dir}/probe.log`).catch(() => ""));
  return m;
}

/**
 * Run the alpha sweep as one boot and measure each level out of that frame.
 *
 * The decals sit in a row, so each level's sample box is found by splitting
 * the frame into equal columns around the batch's own centre. Returns the same
 * {alpha, shadowLuma, groundLuma} rows the serial path produces, so both feed
 * judgeAlphaSweep unchanged.
 */
async function runBatchedAlpha(A, dir, outDir, keep, levels = ALPHA_LEVELS) {
  const kase = batchedAlphaCase(levels);
  const m = await runCase(A, kase, dir, outDir, keep);

  // Where each decal must be, from geometry rather than from the blob: the
  // casters sit at known world X, and with the light on +Z every shadow runs
  // the same distance toward -Z, which is up the screen. Those two numbers are
  // the calibration and the az90 offset the serial matrix already measured.
  const PX_PER_UNIT = 43.76;
  const ORIGIN_X = 328;          // world x = 0 on screen, fixed camera
  const CASTER_Y = 265;          // world (x, 0.5, 0) on screen, fixed camera
  const SHADOW_UP = 40;          // az90 puts the decal this far above its caster
  const BOX_W = 18, BOX_H = 12;

  const boxes = kase.batch
    .map((step, i) =>
      `c${i}:${Math.round(ORIGIN_X + step.x * PX_PER_UNIT - BOX_W / 2)},` +
      `${Math.round(CASTER_Y - SHADOW_UP - BOX_H / 2)},${BOX_W},${BOX_H}`
    )
    .join(";");

  // One measure call for the whole row — the frame is read once either way.
  const re = await measure(m.png, null, boxes);
  const rows = kase.batch.map((step, i) => ({
    alpha: step.alpha,
    shadowLuma: re.boxes[`c${i}`].mean,
    groundLuma: re.modeLuma,
  }));
  return { rows, measurement: m };
}

async function main() {
  const argv = Deno.args;
  const keep = argv.includes("--keep");
  const spIx = argv.indexOf("--scaleprobe");
  const scaleProbe = spIx >= 0 ? Number(argv[spIx + 1]) : 0;
  const onlyIx = argv.indexOf("--only");
  const only = onlyIx >= 0 ? argv[onlyIx + 1] : null;
  const dir = "C:\\ps2run";
  const outDir = `${ROOT}\\docs\\hardware\\shadow`.replace(/\//g, "\\");

  const pre = checkBootPath(dir);
  if (!pre.ok) { console.error(pre.message); Deno.exit(2); }
  await Deno.mkdir(outDir, { recursive: true });

  const all = [...SHADOW_CASES, LIT_CASE, ...ALPHA_CASES, ...ALPHA_REF0_CASES, ...GREY_CASES, ...PABE_OFF_CASES];
  if (argv.includes("--alpha-only")) all.splice(0, SHADOW_CASES.length + 1);
  // Comma-separated, so a follow case and the base it is judged against can be
  // run together — measuring one without the other says nothing.
  const wanted = only ? new Set(only.split(",").map((s) => s.trim())) : null;
  const cases = wanted ? all.filter((c) => wanted.has(c.id)) : all;

  // Re-measuring the frames already on disk keeps threshold and crop changes
  // honest: the pixels do not move, so any change in the verdict is a change
  // in the analysis, not in the run.
  const remeasure = argv.includes("--remeasure");
  const A = remeasure ? null : await load([...PURE_MODULES, "templates/assets.js"]);

  const got = {};
  for (const kase of cases) {
    if (remeasure) {
      const png = `${outDir}\\${kase.id}.png`;
      process_line(`re-measuring ${kase.id}`);
      got[kase.id] = await measure(png, keep ? `${outDir}\\${kase.id}-mask.png` : null);
      got[kase.id].case = kase.id;
      got[kase.id].png = png;
    } else {
      process_line(`running ${kase.id} (azimuth ${kase.azimuth}, pos ${kase.pos.x},${kase.pos.z}, rotY ${kase.rotY})`);
      got[kase.id] = await runCase(A, kase, dir, outDir, keep, { scaleProbe });
    }
    const s = got[kase.id].shadow;
    const c = got[kase.id].caster;
    const lit = got[kase.id].casterLit;
    console.log(
      `  caster: n=${c.n} at (${c.cx}, ${c.cy})` +
      (lit ? `  lit L=${lit.left} R=${lit.right}` : "") + "\n" +
      (s.n
        ? `  shadow: n=${s.n} centroid=(${s.cx}, ${s.cy}) bbox=${s.w}x${s.h} ` +
          `axis=${s.angleDeg}deg major=${s.major} minor=${s.minor}  ` +
          `offset=(${(s.cx - c.cx).toFixed(1)}, ${(s.cy - c.cy).toFixed(1)})px`
        : `  shadow: NONE - no dark pixels at all`),
    );
  }

  await Deno.writeTextFile(`${outDir}\\measurements.json`, JSON.stringify(got, null, 2));
  if (only) { console.log(`\nwrote ${outDir}\\measurements.json`); return; }

  await report(got, outDir);
}

function process_line(s) { console.log(`\n== ${s}`); }

async function report(got, outDir) {
  console.log("\n" + "=".repeat(70));

  // --alpha-only skips the geometry cases, and calibration needs them. The
  // opacity sweep does not use a world scale at all, so run it without one.
  const haveGeometry = got.base && got.movedX && got.movedZ;
  const cal = haveGeometry
    ? calibrate({ base: got.base, movedX: got.movedX, movedZ: got.movedZ }, MOVE_UNITS, "caster")
    : { ok: false, pxPerUnitX: 0, pxPerUnitZ: 0, message: "skipped - geometry cases were not run" };
  console.log(`\ncalibration (from the caster): ${cal.ok ? "OK" : "SKIPPED"} - ${cal.message}`);
  if (!cal.ok && haveGeometry) {
    console.log("\nWithout a scale nothing else can be judged in world units.");
    Deno.exit(1);
  }

  // playerObj is 0.6 wide in X and 1.0 tall. The decal's own extents come from
  // shadowProjection: with no mesh bounds available, auto-fit falls back to the
  // manual 2.0 extent, and sizeZ already carries the 1/sin(elevation) stretch.
  const expected = expectedBlob({
    casterW: 0.6, casterH: 1.0,
    extent: 2.0, sizeX: 2.0, sizeZ: 2.0 * (1 / (LIGHT_Y / Math.hypot(1, LIGHT_Y))),
  });
  console.log(
    `expected blob: ${expected.across.toFixed(2)} x ${expected.along.toFixed(2)} world units`,
  );

  const rows = [];
  for (const kase of (haveGeometry ? [...SHADOW_CASES, LIT_CASE] : [])) {
    const m = got[kase.id];
    if (!m) continue;
    // The caster is its own luma population, so its screen position is
    // measured per case rather than inferred from the camera.
    m.casterScreen = { x: m.caster.cx, y: m.caster.cy };
    const checks = [];
    if (!m.shadow.n) {
      rows.push([kase, [["shadow", { ok: false, message: "no shadow was drawn at all" }]]]);
      continue;
    }
    // The lit case uses a different camera, so only the convention-free
    // comparison applies to it.
    if (kase.id === "lit") {
      // Where the light actually lands, measured off the sphere's own shading:
      // the lit side is brighter, so it pulls the luma-weighted centroid toward
      // it. Comparing that with the shadow's offset settles the question from
      // one frame, without assuming which way `direction` points.
      const lit = m.casterLit;
      const offLit = (lit?.weightedCx ?? 0) - m.caster.cx;
      const offShadow = m.shadow.cx - m.caster.cx;
      const spread = Math.abs(lit.right - lit.left) / Math.max(1, (lit.right + lit.left) / 2);
      if (spread < 0.05 || Math.abs(offLit) < 0.5) {
        rows.push([kase, [["lit-vs-shadow", {
          ok: false, skipped: true,
          message:
            `inconclusive: the caster's sides differ by only ${(spread * 100).toFixed(1)}% ` +
            `and its weighted centre is ${offLit.toFixed(2)}px off - too flatly shaded to read`,
        }]]]);
        continue;
      }
      const opposite = (offLit > 0) !== (offShadow > 0);
      rows.push([kase, [["lit-vs-shadow", {
        ok: opposite,
        message:
          `the light lands on ${offLit > 0 ? "+X" : "-X"} (weighted centre ` +
          `${offLit.toFixed(1)}px off, sides ${(spread * 100).toFixed(0)}% apart) and the ` +
          `shadow is on ${offShadow > 0 ? "+X" : "-X"} (${offShadow.toFixed(0)}px) - ` +
          (opposite
            ? "opposite sides, which is what a cast shadow does"
            : "the SAME side, so the shadow is thrown toward the light"),
      }]]]);
      continue;
    }
    checks.push(["direction", judgeDirection(m, kase.azimuth)]);
    checks.push(["azimuth", judgeAzimuth(m, kase.azimuth)]);
    checks.push(["size", judgeSize(m, expected, cal)]);
    if (kase.id === "movedX") checks.push(["follow", judgeFollow(got.base, m, { dx: MOVE_UNITS, dz: 0 }, cal)]);
    if (kase.id === "movedZ") checks.push(["follow", judgeFollow(got.base, m, { dx: 0, dz: MOVE_UNITS }, cal)]);
    // A case that names the one it moved away from judges itself against that
    // one, so follow can be measured at any azimuth rather than only at 0.
    // The caster moves horizontally, so its ground point moves by the same
    // vector whatever the light is doing — the calibration still applies.
    if (kase.follows) {
      const from = got[kase.follows.of];
      checks.push(["follow", from
        ? judgeFollow(from, m, kase.follows, cal)
        : { skipped: true, ok: true, message: `needs case ${kase.follows.of}, which was not run` }]);
    }
    rows.push([kase, checks]);
  }

  let failures = 0, skipped = 0;
  for (const [kase, checks] of rows) {
    console.log(`\n${kase.id}  (${kase.proves})`);
    for (const [name, r] of checks) {
      const tag = r.skipped ? "SKIP" : r.ok ? "PASS" : "FAIL";
      if (r.skipped) skipped++; else if (!r.ok) failures++;
      console.log(`  ${tag}  ${name.padEnd(10)} ${r.message}`);
    }
  }

  // ── opacity ────────────────────────────────────────────────────────
  // The opaque case gives the footprint; a box well inside it is sampled in
  // every case. Geometry is identical across the sweep, so one box serves.
  const families = [
    ["SHADOW_BLEND_DARKEN, alpha test ref 50", ALPHA_CASES.filter((c) => c.blend === "SHADOW_BLEND_DARKEN")],
    ["SHADOW_BLEND_ALPHA, alpha test ref 50", ALPHA_CASES.filter((c) => c.blend === "SHADOW_BLEND_ALPHA")],
    ["SHADOW_BLEND_ALPHA, alpha test ref 0", ALPHA_REF0_CASES],
    ["decal COLOUR swept, alpha left at 1.0", GREY_CASES, "colour"],
    ["ALPHA blend, alpha test ref 0, PABE OFF", PABE_OFF_CASES],
  ];
  for (const [blend, mine, kind] of families) {
    // The sample box comes from whichever case in the family left the biggest
    // dark blob, not from the last one: a light-grey decal is never classified
    // as shadow at all, so taking the last case would silently skip the family
    // that most needs measuring.
    const opaque = mine
      .map((k) => got[k.id])
      .filter((m) => m?.shadow?.n)
      .sort((a, b) => b.shadow.n - a.shadow.n)[0];
    if (!opaque) continue;

    const s = opaque.shadow;
    const bw = Math.max(8, Math.round(s.w * 0.3));
    const bh = Math.max(6, Math.round(s.h * 0.3));
    const box = `core:${Math.round(s.cx - bw / 2)},${Math.round(s.cy - bh / 2)},${bw},${bh}`;

    const samples = [];
    for (const kase of mine) {
      const m = got[kase.id];
      if (!m) continue;
      const re = await measure(m.png, null, box);
      samples.push({
        alpha: kase.alpha, grey: kase.grey,
        shadowLuma: re.boxes.core.mean, groundLuma: re.modeLuma,
      });
    }
    if (!samples.length) continue;

    const r = kind === "colour" ? judgeColourSweep(samples) : judgeAlphaSweep(samples);
    console.log(`\nopacity under ${blend}  (sampling ${bw}x${bh}px at the decal's core)`);
    for (const s2 of samples) {
      const pct = (1 - s2.shadowLuma / s2.groundLuma) * 100;
      const knob = kind === "colour"
        ? `grey  ${s2.grey.toFixed(2)}`
        : `alpha ${s2.alpha.toFixed(2)}`;
      console.log(
        `  ${knob}  luma ${String(s2.shadowLuma).padStart(6)} ` +
        `of ${s2.groundLuma}  = ${pct.toFixed(0)}% dark`,
      );
    }
    console.log(`  ${r.ok ? "PASS" : "FAIL"}  opacity   ${r.message}`);
    if (!r.ok) failures++;
  }

  console.log("\n" + "=".repeat(70));
  console.log(`${failures} failing, ${skipped} inconclusive`);
  console.log(`measurements and frames in ${outDir}`);
  Deno.exit(failures ? 1 : 0);
}

if (import.meta.main && !Deno.args.includes("--batch-alpha")) await main();

// ── batch check ───────────────────────────────────────────────────────────
// `deno run -A tools/ps2shadow.js --batch-alpha` runs the sweep as one boot.
// Kept beside the serial path rather than replacing it: a batched measurement
// that disagrees with the serial one is worse than no measurement, so the two
// are compared before the batch is trusted.
if (import.meta.main && Deno.args.includes("--batch-alpha")) {
  const dir = "C:\\ps2run";
  const outDir = `${ROOT.replace(/[\\/]+$/, "")}/docs/hardware/shadow`.replace(/\//g, "\\");
  await Deno.mkdir(outDir, { recursive: true });
  const A2 = await load([...PURE_MODULES, "templates/assets.js"]);
  const t0 = performance.now();
  const { rows } = await runBatchedAlpha(A2, dir, outDir, true);
  const secs = ((performance.now() - t0) / 1000).toFixed(1);
  console.log(`\nbatched alpha sweep, one boot, ${secs}s`);
  for (const r of rows) {
    console.log(
      `  alpha ${r.alpha.toFixed(2)}  luma ${String(r.shadowLuma).padStart(6)} of ${r.groundLuma}` +
      `  = ${((1 - r.shadowLuma / r.groundLuma) * 100).toFixed(0)}% dark`,
    );
  }
  // Checked against the serial sweep, which is the authority. The batch places
  // its sample boxes from geometry rather than finding each decal, so a column
  // whose decal sits slightly off centre reads low - measured 69% at alpha 1.0
  // where the serial run gives 100%. Good enough to watch a trend, NOT good
  // enough to judge a build on, so it does not report a verdict.
  const SERIAL = { 0: 0, 0.25: 25, 0.5: 50, 0.75: 75, 1: 100 };
  let worst = 0;
  for (const r of rows) {
    const want = SERIAL[r.alpha];
    if (want === undefined) continue;
    worst = Math.max(worst, Math.abs((1 - r.shadowLuma / r.groundLuma) * 100 - want));
  }
  console.log(
    `\n  EXPERIMENTAL: worst disagreement with the serial sweep is ${worst.toFixed(0)} points.\n` +
    `  Use \`deno task ps2shadow\` for anything that matters - the serial path is the authority.`,
  );
}
