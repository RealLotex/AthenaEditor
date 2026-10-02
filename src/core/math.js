// ═══════════════════════════════════════════════════════════════════════
//  MATH — matches AthenaEnv's own matrix conventions exactly.
//
//  Matches the default VU0 backend (matrix.c:vu0_matrix_scale), which scales
//  rows. The unused core_matrix_scale fallback scales columns instead.
//
//    MATRIX is float[16], ROW-major, ROW-vector convention (v' = v * M).
//    Translation lives at m[12], m[13], m[14].
//
//    update_object_space() builds an object's matrix as:
//        M = identity
//        M = rotate(M, rotation)   ->  M = Rz * Ry * Rx
//        M = scale(M, scale)       ->  M = S * Rz * Ry * Rx
//        M = translate(M, position)->  M = S * Rz * Ry * Rx * T
//
//    So RenderObject.rotation is EULER RADIANS applied Z, then Y, then X.
//    (Only bone/skin transforms and Shadows.Projector use quaternions.)
// ═══════════════════════════════════════════════════════════════════════

const M_IDENTITY = () => [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];

/** Row-major multiply, same as core_matrix_multiply(out, a, b). */
function matMul(a, b) {
  const o = new Array(16);
  for (let r = 0; r < 4; r++) {
    for (let c = 0; c < 4; c++) {
      o[r * 4 + c] =
        a[r * 4 + 0] * b[0 * 4 + c] +
        a[r * 4 + 1] * b[1 * 4 + c] +
        a[r * 4 + 2] * b[2 * 4 + c] +
        a[r * 4 + 3] * b[3 * 4 + c];
    }
  }
  return o;
}

/** Rz * Ry * Rx, exactly as core_matrix_rotate composes them. */
function matFromEuler(rx, ry, rz) {
  const cx = Math.cos(rx), sx = Math.sin(rx);
  const cy = Math.cos(ry), sy = Math.sin(ry);
  const cz = Math.cos(rz), sz = Math.sin(rz);
  return [
    cz * cy, sz * cx + cz * sy * sx, sz * sx - cz * sy * cx, 0,
    -sz * cy, cz * cx - sz * sy * sx, cz * sx + sz * sy * cx, 0,
    sy, -cy * sx, cy * cx, 0,
    0, 0, 0, 1,
  ];
}

/**
 * Inverse of matFromEuler. Returns {x,y,z} radians that reproduce the
 * rotation part of `m` under the engine's Z-Y-X order.
 */
function eulerFromMat(m) {
  const m00 = m[0], m01 = m[1], m02 = m[2];
  const m10 = m[4], m11 = m[5], m12 = m[6];
  const m20 = m[8], m21 = m[9], m22 = m[10];
  const sy = Math.max(-1, Math.min(1, m20));
  const y = Math.asin(sy);
  if (Math.abs(m20) < 0.99999) {
    return { x: Math.atan2(-m21, m22), y, z: Math.atan2(-m10, m00) };
  }
  // Gimbal lock: cos(y) == 0, so X and Z are not independent. Pin X to 0.
  return { x: 0, y, z: Math.atan2(m01, m11) };
}

/** Full object matrix: M = S * R * T, as the VU0 backend builds it. */
function matFromTRS(position, rotation, scale) {
  const R = matFromEuler(rotation?.x || 0, rotation?.y || 0, rotation?.z || 0);
  const S = M_IDENTITY();
  S[0] = scale?.x ?? 1; S[5] = scale?.y ?? 1; S[10] = scale?.z ?? 1;
  const T = M_IDENTITY();
  T[12] = position?.x ?? 0; T[13] = position?.y ?? 0; T[14] = position?.z ?? 0;
  return matMul(matMul(S, R), T);
}

/** Decompose S*R*T by row lengths; report actual shear, not rotation. */
function trsFromMat(m) {
  const position = { x: m[12], y: m[13], z: m[14] };
  let sx = Math.hypot(m[0], m[1], m[2]);
  const sy = Math.hypot(m[4], m[5], m[6]);
  const sz = Math.hypot(m[8], m[9], m[10]);
  const det = m[0] * (m[5] * m[10] - m[6] * m[9])
    - m[1] * (m[4] * m[10] - m[6] * m[8])
    + m[2] * (m[4] * m[9] - m[5] * m[8]);
  if (det < 0) sx = -sx;
  const r = M_IDENTITY();
  for (let row = 0; row < 3; row++) {
    for (let col = 0; col < 3; col++) {
      const scale = [sx, sy, sz][row];
      r[row * 4 + col] = Math.abs(scale) > 1e-8 ? m[row * 4 + col] / scale : +(row === col);
    }
  }
  const rotation = eulerFromMat(r);
  const scale = { x: sx, y: sy, z: sz };
  const rebuilt = matFromTRS(position, rotation, scale);
  const lossy = m.some((v, i) => Math.abs(v - rebuilt[i]) > 1e-4 * Math.max(1, Math.abs(v)));
  return { position, rotation, scale, lossy };
}

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;
const toDeg = (r) => r * DEG;
const toRad = (d) => d * RAD;

// ── ODE interop ────────────────────────────────────────────────────────
//
// dBodyGetRotation()/dGeomGetRotation() return a dMatrix3, which is
// float[4*3] with a padding lane: rows start at 0, 4 and 8. The JS binding
// copies only the first 9 elements, so what reaches script is
//
//     [R00 R01 R02  pad  R10 R11 R12  pad  R20]
//
// R21 and R22 never arrive. They are recoverable because a rotation matrix is
// orthonormal and right-handed: row2 == row0 x row1.
//
// ODE is column-vector (v_world = R * v_local); AthenaEnv is row-vector, so
// the engine matrix is the transpose.
const ODE_ROT_STRIDE = 4;

/** @param a the 9-element array from getRotation(). @returns {x,y,z} euler radians. */
function eulerFromOdeRotation(a) {
  const R00 = a[0], R01 = a[1], R02 = a[2];
  const R10 = a[4], R11 = a[5], R12 = a[6];
  // row2 = row0 x row1
  const R20 = R01 * R12 - R02 * R11;
  const R21 = R02 * R10 - R00 * R12;
  const R22 = R00 * R11 - R01 * R10;
  // transpose into the engine's row-vector layout
  return eulerFromMat([
    R00, R10, R20, 0,
    R01, R11, R21, 0,
    R02, R12, R22, 0,
    0, 0, 0, 1,
  ]);
}

/**
 * The same conversion, as source text to embed in the generated main.js.
 * Kept beside the implementation above so the two cannot drift apart.
 */
const ODE_EULER_RUNTIME = `function _odeEuler(a) {
    // dMatrix3 has a padding lane every 4th float, and the binding only
    // returns 9 of the 12 values, so row 2 must be rebuilt as row0 x row1.
    const r00 = a[0], r01 = a[1], r02 = a[2];
    const r10 = a[4], r11 = a[5], r12 = a[6];
    const r20 = r01 * r12 - r02 * r11;
    const r21 = r02 * r10 - r00 * r12;
    const r22 = r00 * r11 - r01 * r10;
    // ODE is column-vector, AthenaEnv is row-vector: transpose.
    const m00 = r00, m01 = r10, m10 = r01, m11 = r11, m20 = r02, m21 = r12, m22 = r22;
    const sy = m20 < -1 ? -1 : (m20 > 1 ? 1 : m20);
    const y = Math.asin(sy);
    if (Math.abs(m20) < 0.99999)
        return { x: Math.atan2(-m21, m22), y: y, z: Math.atan2(-m10, m00) };
    return { x: 0, y: y, z: Math.atan2(m01, m11) };
}`;
