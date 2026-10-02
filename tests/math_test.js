import { assert, assertAlmostEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";

const M = await load(["core/util.js", "core/math.js"]);

const near = (a, b, tol = 1e-5) => assertAlmostEquals(a, b, tol);

Deno.test("euler round-trips through the engine's Z-Y-X order", () => {
  const cases = [
    [0, 0, 0],
    [0.3, 0, 0], [0, 0.3, 0], [0, 0, 0.3],
    [0.4, -0.7, 1.2],
    [-2.9, 0.2, 0.5],
    [1.1, 1.4, -0.6],
  ];
  for (const [x, y, z] of cases) {
    const m = M.matFromEuler(x, y, z);
    const e = M.eulerFromMat(m);
    // Compare the matrices, not the angles: different triples can encode the
    // same rotation, and that is fine as long as the result is identical.
    const m2 = M.matFromEuler(e.x, e.y, e.z);
    for (let i = 0; i < 16; i++) near(m2[i], m[i]);
  }
});

Deno.test("gimbal lock stays finite and produces the right rotation", () => {
  const m = M.matFromEuler(0.5, Math.PI / 2, 0.9);
  const e = M.eulerFromMat(m);
  assert(Number.isFinite(e.x) && Number.isFinite(e.y) && Number.isFinite(e.z));
  const m2 = M.matFromEuler(e.x, e.y, e.z);
  for (let i = 0; i < 16; i++) near(m2[i], m[i], 1e-4);
});

Deno.test("TRS composes and decomposes", () => {
  const pos = { x: 3, y: -2, z: 7 };
  const rot = { x: 0.2, y: -1.1, z: 0.45 };
  const scl = { x: 2, y: 2, z: 2 };
  const m = M.matFromTRS(pos, rot, scl);
  const d = M.trsFromMat(m);
  near(d.position.x, 3); near(d.position.y, -2); near(d.position.z, 7);
  near(d.scale.x, 2); near(d.scale.y, 2); near(d.scale.z, 2);
  assert(!d.lossy, "uniform scale must not be flagged lossy");
  const m2 = M.matFromTRS(d.position, d.rotation, d.scale);
  for (let i = 0; i < 16; i++) near(m2[i], m[i], 1e-4);
});

Deno.test("non-uniform scale plus rotation decomposes exactly", () => {
  const m = M.matFromTRS({ x: 0, y: 0, z: 0 }, { x: 0, y: 0.7, z: 0 }, { x: 3, y: 1, z: 1 });
  const d = M.trsFromMat(m);
  assert(!d.lossy);
  const rebuilt = M.matFromTRS(d.position, d.rotation, d.scale);
  m.forEach((v, i) => near(rebuilt[i], v));
});

// ── ODE rotation decoding ──────────────────────────────────────────────
//
// Build a dMatrix3 the way ODE stores one (stride 4, padding lane), keep only
// the 9 floats the JS binding actually returns, and check we recover the
// original orientation.
function odeArrayFor(rx, ry, rz) {
  // Engine (row-vector) matrix, then transpose to get ODE's column-vector R.
  const m = M.matFromEuler(rx, ry, rz);
  const R = [
    [m[0], m[4], m[8]],
    [m[1], m[5], m[9]],
    [m[2], m[6], m[10]],
  ];
  // stride-4 layout, truncated to 9 elements exactly like ath_ode.c does
  const full = [
    R[0][0], R[0][1], R[0][2], 0,
    R[1][0], R[1][1], R[1][2], 0,
    R[2][0], R[2][1], R[2][2], 0,
  ];
  return full.slice(0, 9);
}

Deno.test("ODE rotation survives the stride-4 truncation", () => {
  for (const [x, y, z] of [[0, 0, 0], [0.4, 0.2, -0.9], [-1.2, 0.6, 0.3], [0, 2.4, 0]]) {
    const a = odeArrayFor(x, y, z);
    const e = M.eulerFromOdeRotation(a);
    const m1 = M.matFromEuler(x, y, z);
    const m2 = M.matFromEuler(e.x, e.y, e.z);
    for (let i = 0; i < 16; i++) near(m2[i], m1[i], 1e-4);
  }
});

Deno.test("the runtime helper embedded in generated code agrees with the editor's", () => {
  const runtime = new Function(`${M.ODE_EULER_RUNTIME}; return _odeEuler;`)();
  for (const [x, y, z] of [[0.4, 0.2, -0.9], [-1.2, 0.6, 0.3], [0.1, 0, 2.0]]) {
    const a = odeArrayFor(x, y, z);
    const got = runtime(a);
    const want = M.eulerFromOdeRotation(a);
    near(got.x, want.x); near(got.y, want.y); near(got.z, want.z);
  }
});
