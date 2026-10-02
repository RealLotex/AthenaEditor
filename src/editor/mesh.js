// Editable OBJ data shared by UV, atlas and lighting tools.
function readMeshOBJ(text) {
  const mesh = {
    positions: [],
    uvs: [],
    normals: [],
    faces: [],
    materials: [],
    materialLibraries: [],
  };
  let material = "";
  const index = (s, length) => {
    const n = Number(s);
    return n < 0 ? length + n : n - 1;
  };
  for (const raw of String(text).split(/\r?\n/)) {
    const [kind, ...args] = raw.split("#")[0].trim().split(/\s+/);
    if (kind === "mtllib") mesh.materialLibraries.push(args.join(" "));
    if (kind === "usemtl") material = args.join(" ");
    if (kind === "v" || kind === "vn" || kind === "vt") {
      const list = kind === "v"
        ? mesh.positions
        : kind === "vn"
        ? mesh.normals
        : mesh.uvs;
      const values = args.slice(0, kind === "vt" ? 2 : 3).map(Number);
      if (
        values.length < (kind === "vt" ? 2 : 3) ||
        values.some((n) => !Number.isFinite(n))
      ) throw new Error("Invalid OBJ coordinates.");
      list.push(values);
    } else if (kind === "f") {
      const corners = args.map((s) => {
        const [v, uv, n] = s.split("/");
        const corner = {
          v: index(v, mesh.positions.length),
          uv: uv ? index(uv, mesh.uvs.length) : -1,
          n: n ? index(n, mesh.normals.length) : -1,
        };
        if (
          !mesh.positions[corner.v] || (uv && !mesh.uvs[corner.uv]) ||
          (n && !mesh.normals[corner.n])
        ) throw new Error("Invalid OBJ face index.");
        return corner;
      });
      for (let i = 1; i + 1 < corners.length; i++) {
        mesh.faces.push(
          [corners[0], corners[i], corners[i + 1]].map((c) => ({ ...c })),
        );
        mesh.materials.push(material);
      }
    }
  }
  if (!mesh.faces.length) throw new Error("The OBJ has no faces.");
  return mesh;
}

function meshFaceNormal(mesh, face) {
  const [a, b, c] = face.map((v) => mesh.positions[v.v]);
  return vnorm(
    vcross({ x: b[0] - a[0], y: b[1] - a[1], z: b[2] - a[2] }, {
      x: c[0] - a[0],
      y: c[1] - a[1],
      z: c[2] - a[2],
    }),
  );
}

function writeMeshOBJ(mesh, name = "mesh") {
  const out = [`# ${name} — edited in AthEditor`, `o ${ident(name)}`];
  for (const library of mesh.materialLibraries || []) {
    out.push(`mtllib ${library}`);
  }
  const coords = (p) => p.map((v) => Number(v.toFixed(7))).join(" ");
  mesh.positions.forEach((p) => out.push(`v ${coords(p)}`));
  mesh.uvs.forEach((p) => out.push(`vt ${coords(p)}`));
  const normals = mesh.normals.map((n) => [...n]);
  const faces = mesh.faces.map((f) => {
    const normal = meshFaceNormal(mesh, f);
    const fallback = normals.push([normal.x, normal.y, normal.z]) - 1;
    return f.map((c) =>
      `${c.v + 1}/${c.uv >= 0 ? c.uv + 1 : ""}/${
        (c.n >= 0 ? c.n : fallback) + 1
      }`
    );
  });
  normals.forEach((p) => out.push(`vn ${coords(p)}`));
  let material = "";
  faces.forEach((f, i) => {
    if (mesh.materials?.[i] && mesh.materials[i] !== material) {
      material = mesh.materials[i];
      out.push(`usemtl ${material}`);
    }
    out.push(`f ${f.join(" ")}`);
  });
  return out.join("\n") + "\n";
}

function projectMeshUV(mesh, plane = "box") {
  const result = deepClone(mesh);
  result.uvs = [];
  const ranges = [0, 1, 2].map((axis) => {
    let lo = Infinity, hi = -Infinity;
    for (const p of result.positions) {
      lo = Math.min(lo, p[axis]);
      hi = Math.max(hi, p[axis]);
    }
    return [lo, Math.max(hi - lo, 1e-8)];
  });
  for (const face of result.faces) {
    const n = meshFaceNormal(result, face);
    const axes = plane === "xy"
      ? [0, 1]
      : plane === "xz"
      ? [0, 2]
      : plane === "yz"
      ? [2, 1]
      : Math.abs(n.x) >= Math.abs(n.y) && Math.abs(n.x) >= Math.abs(n.z)
      ? [2, 1]
      : Math.abs(n.y) >= Math.abs(n.z)
      ? [0, 2]
      : [0, 1];
    for (const c of face) {
      c.uv = result.uvs.length;
      result.uvs.push(
        axes.map((axis) =>
          (result.positions[c.v][axis] - ranges[axis][0]) / ranges[axis][1]
        ),
      );
    }
  }
  return result;
}

// Separate triangle islands are deliberately simple and guarantee unique bake UVs.
function packMeshUV(mesh, resolution = 256, padding = 2) {
  const result = deepClone(mesh),
    columns = Math.ceil(Math.sqrt(mesh.faces.length));
  const cell = resolution / columns;
  if (cell < padding * 2 + 4) {
    throw new Error(
      "Too many faces for this bake size. Increase the resolution or simplify the mesh.",
    );
  }
  result.uvs = [];
  result.faces.forEach((face, i) => {
    const x = (i % columns) * cell + padding,
      y = Math.floor(i / columns) * cell + padding;
    const size = cell - padding * 2;
    [[x, y], [x + size, y], [x, y + size]].forEach(([u, v], k) => {
      face[k].uv = result.uvs.length;
      result.uvs.push([u / resolution, 1 - v / resolution]);
    });
  });
  return result;
}

function transformMeshUV(
  mesh,
  ids,
  { x = 0, y = 0, scale = 1, angle = 0 } = {},
) {
  const result = deepClone(mesh),
    selected = new Set(ids.length ? ids : mesh.uvs.map((_, i) => i));
  const points = [...selected].map((i) => mesh.uvs[i]).filter(Boolean);
  if (!points.length) return result;
  const centre = [0, 1].map((axis) =>
    points.reduce((sum, p) => sum + p[axis], 0) / points.length
  );
  const c = Math.cos(angle), s = Math.sin(angle);
  for (const i of selected) {
    if (!result.uvs[i]) continue;
    const u = (mesh.uvs[i][0] - centre[0]) * scale,
      v = (mesh.uvs[i][1] - centre[1]) * scale;
    result.uvs[i] = [
      centre[0] + u * c - v * s + x,
      centre[1] + u * s + v * c + y,
    ];
  }
  return result;
}

function remapAtlasUV(mesh, rect, width, height) {
  if (mesh.faces.some((f) => f.some((c) => c.uv < 0))) {
    throw new Error("Every face needs UVs before creating an atlas.");
  }
  if (mesh.uvs.some((p) => p.some((v) => v < -1e-6 || v > 1 + 1e-6))) {
    throw new Error(
      "Atlas remapping needs UVs inside 0–1. Tiled UVs must be adjusted first.",
    );
  }
  const result = deepClone(mesh);
  result.uvs = mesh.uvs.map((
    [u, v],
  ) => [
    (rect.x + u * rect.width) / width,
    1 - (rect.y + (1 - v) * rect.height) / height,
  ]);
  return result;
}

function prototypeOBJ(kind) {
  const factories = {
    cube: () => new THREE.BoxGeometry(1, 1, 1),
    plane: () => new THREE.PlaneGeometry(4, 4).rotateX(-Math.PI / 2),
    sphere: () => new THREE.SphereGeometry(.5, 12, 8),
    cylinder: () => new THREE.CylinderGeometry(.5, .5, 1, 12),
    cone: () => new THREE.ConeGeometry(.5, 1, 12),
    torus: () => new THREE.TorusGeometry(.4, .12, 6, 12),
  };
  if (kind === "ramp") {
    const b = new ObjBuilder("ramp");
    [[-.5, -.5, -.5], [.5, -.5, -.5], [-.5, -.5, .5], [.5, -.5, .5], [
      -.5,
      .5,
      .5,
    ], [.5, .5, .5]].forEach((p) => b.vertex(...p));
    [[1, 3, 4, 2], [3, 5, 6, 4], [1, 2, 6, 5]].forEach((f) => {
      const n = b.normal(0, 1, 0);
      b.quad(...f, n);
    });
    b.tri(1, 5, 3, b.normal(-1, 0, 0));
    b.tri(2, 4, 6, b.normal(1, 0, 0));
    // Regenerate face normals rather than retaining the placeholder normals.
    const m = readMeshOBJ(b.toString());
    m.normals = [];
    m.faces.forEach((f) => {
      f.reverse();
      f.forEach((v) => v.n = -1);
    });
    return writeMeshOBJ(m, "ramp");
  }
  const geometry = factories[kind]?.();
  if (!geometry) throw new Error("Unknown primitive.");
  const mesh = { positions: [], uvs: [], normals: [], faces: [] };
  const p = geometry.attributes.position,
    uv = geometry.attributes.uv,
    normal = geometry.attributes.normal;
  for (let i = 0; i < p.count; i++) {
    mesh.positions.push([p.getX(i), p.getY(i), p.getZ(i)]);
    mesh.uvs.push([uv.getX(i), uv.getY(i)]);
    mesh.normals.push([normal.getX(i), normal.getY(i), normal.getZ(i)]);
  }
  const indices = geometry.index
    ? Array.from(geometry.index.array)
    : Array.from({ length: p.count }, (_, i) => i);
  for (let i = 0; i < indices.length; i += 3) {
    mesh.faces.push(indices.slice(i, i + 3).map((v) => ({ v, uv: v, n: v })));
  }
  geometry.dispose();
  return writeMeshOBJ(mesh, kind);
}
