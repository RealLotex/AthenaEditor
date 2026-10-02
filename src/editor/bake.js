// Static direct light baked into a new diffuse texture, with unique triangle UVs.
// This uses scene ambient/directional lights and optional static shadow rays.
async function bakeModelLighting(
  obj,
  mesh,
  scene,
  files,
  { size = 128, shadows = true, onProgress, signal } = {},
) {
  const matrices = new Map();
  walk(scene.objects, (node, parents) => {
    const local = (n) => {
      const t = n.components.transform;
      return matFromTRS(t.position, t.rotation, t.scale);
    };
    let matrix = local(node);
    for (let i = parents.length - 1; i >= 0; i--) {
      matrix = matMul(matrix, local(parents[i]));
    }
    matrices.set(node.id, matrix);
  });
  const transform = new THREE.Matrix4().fromArray(matrices.get(obj.id));
  const normalMatrix = new THREE.Matrix3().getNormalMatrix(transform);
  const lights = exportableObjects(scene.objects).filter((o) =>
    o.components.light
  ).map((o) => o.components.light);
  if (!lights.length) throw new Error("Add a scene light before baking.");
  const originalTexture = files.find((f) =>
    f.name === obj.components.model.textureFile
  );
  if (mesh.materialLibraries?.length && !originalTexture) {
    throw Error(
      "Choose an explicit texture for this OBJ material before baking.",
    );
  }
  const pixels =
    originalTexture && obj.components.model.texture_mapping !== false
      ? await readTexturePixels(originalTexture)
      : null;
  const packed = packMeshUV(mesh, size, 2),
    data = new Uint8ClampedArray(size * size * 4),
    occluders = [],
    covered = new Uint8Array(size * size);
  const raycaster = new THREE.Raycaster();
  raycaster.near = .002;
  raycaster.far = 1e5;
  if (shadows) {
    for (const other of exportableObjects(scene.objects)) {
      if (
        other.components.rigidbody?.mode === "dynamic" ||
        other.components.animator
      ) continue;
      const asset = files.find((f) => f.name === other.components.model?.file);
      if (
        !asset?.content || !asset.name.toLowerCase().endsWith(".obj")
      ) continue;
      const geometry = parseOBJ(asset.content),
        material = new THREE.MeshBasicMaterial({ side: THREE.DoubleSide });
      const blocker = new THREE.Mesh(geometry, material);
      blocker.matrixAutoUpdate = false;
      blocker.matrix.fromArray(matrices.get(other.id));
      blocker.updateMatrixWorld(true);
      occluders.push(blocker);
    }
  }
  const sample = (uv) => {
    if (!pixels) return [255, 255, 255, 255];
    const u = ((uv[0] % 1) + 1) % 1, v = ((uv[1] % 1) + 1) % 1;
    const x = clamp(Math.floor(u * pixels.width), 0, pixels.width - 1),
      y = clamp(Math.floor((1 - v) * pixels.height), 0, pixels.height - 1);
    return pixels.data.subarray(
      (y * pixels.width + x) * 4,
      (y * pixels.width + x) * 4 + 4,
    );
  };
  try {
    for (let i = 0; i < mesh.faces.length; i++) {
      if (signal?.aborted) throw new Error("Bake cancelled.");
      const face = mesh.faces[i],
        out = packed.faces[i],
        uv = out.map((c) =>
          packed.uvs[c.uv].map((v, axis) => (axis ? 1 - v : v) * size)
        );
      const pts = face.map((c) =>
        new THREE.Vector3(...mesh.positions[c.v]).applyMatrix4(transform)
      );
      const fn = meshFaceNormal(mesh, face);
      const normals = face.map((c) =>
        new THREE.Vector3(...(mesh.normals[c.n] || [fn.x, fn.y, fn.z]))
          .applyMatrix3(normalMatrix).normalize()
      );
      const sourceUV = face.map((c) => mesh.uvs[c.uv] || [0, 0]);
      const [a, b, c] = uv,
        den = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1]);
      const xmin = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[0])))),
        xmax = Math.min(size - 1, Math.ceil(Math.max(...uv.map((p) => p[0]))));
      const ymin = Math.max(0, Math.floor(Math.min(...uv.map((p) => p[1])))),
        ymax = Math.min(size - 1, Math.ceil(Math.max(...uv.map((p) => p[1]))));
      for (let y = ymin; y <= ymax; y++) {
        for (let x = xmin; x <= xmax; x++) {
          const w0 = ((b[1] - c[1]) * (x + .5 - c[0]) +
            (c[0] - b[0]) * (y + .5 - c[1])) / den;
          const w1 = ((c[1] - a[1]) * (x + .5 - c[0]) +
              (a[0] - c[0]) * (y + .5 - c[1])) / den,
            w2 = 1 - w0 - w1;
          if (Math.min(w0, w1, w2) < 0) continue;
          const weights = [w0, w1, w2],
            pos = new THREE.Vector3(),
            normal = new THREE.Vector3(),
            originalUV = [0, 0];
          weights.forEach((w, k) => {
            pos.addScaledVector(pts[k], w);
            normal.addScaledVector(normals[k], w);
            originalUV[0] += sourceUV[k][0] * w;
            originalUV[1] += sourceUV[k][1] * w;
          });
          normal.normalize();
          const illumination = [0, 0, 0];
          for (const light of lights) {
            const L = vnorm(light.direction),
              direction = new THREE.Vector3(L.x, L.y, L.z);
            let lambert = Math.max(0, normal.dot(direction));
            if (shadows && lambert > 0) {
              raycaster.set(
                pos.clone().addScaledVector(normal, .003),
                direction,
              );
              if (
                raycaster.intersectObjects(occluders, false).length
              ) lambert = 0;
            }
            ["r", "g", "b"].forEach((key, k) =>
              illumination[k] += (light.ambient?.[key] ?? .12) +
                (light.diffuse?.[key] ?? .5) * lambert
            );
          }
          const color = sample(originalUV), at = (y * size + x) * 4;
          for (let k = 0; k < 3; k++) {
            data[at + k] = color[k] * clamp(illumination[k], 0, 1);
          }
          data[at + 3] = color[3];
          covered[y * size + x] = 1;
        }
      }
      if (i % 8 === 0) {
        onProgress?.(i / mesh.faces.length);
        await new Promise((resolve) => setTimeout(resolve, 0));
      }
    }
    // Dilate two pixels into each empty island border, preventing black filter seams.
    for (let step = 0; step < 2; step++) {
      const previous = data.slice(), coverage = covered.slice();
      for (let y = 1; y < size - 1; y++) {
        for (let x = 1; x < size - 1; x++) {
          const at = (y * size + x) * 4;
          if (coverage[y * size + x]) continue;
          const neighbour = [at - 4, at + 4, at - size * 4, at + size * 4].find(
            (n) => coverage[n / 4],
          );
          if (neighbour !== undefined) {
            data.set(previous.subarray(neighbour, neighbour + 4), at);
            covered[y * size + x] = 1;
          }
        }
      }
    }
    onProgress?.(1);
    return { mesh: packed, image: { width: size, height: size, data } };
  } finally {
    for (const blocker of occluders) disposeObject(blocker);
  }
}
