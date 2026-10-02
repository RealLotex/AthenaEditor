// ═══════════════════════════════════════════════════════════════════════
//  LOADERS — asset bytes -> Three.js objects
//
//  Everything works from text or data URLs. Nothing fetches, so the editor
//  runs from file:// with no server and no CORS surprises.
// ═══════════════════════════════════════════════════════════════════════

/** Minimal OBJ reader: v / vt / vn / f, with negative indices and n-gons. */
function parseOBJ(text) {
  const P = [], T = [], N = [];
  const oP = [], oT = [], oN = [];

  for (const raw of text.split("\n")) {
    const line = raw.trim();
    if (!line || line[0] === "#") continue;
    const p = line.split(/\s+/);
    switch (p[0]) {
      case "v": P.push(+p[1], +p[2], +p[3]); break;
      case "vt": T.push(+p[1], +(p[2] || 0)); break;
      case "vn": N.push(+p[1], +p[2], +p[3]); break;
      case "f": {
        const verts = [];
        for (let i = 1; i < p.length; i++) {
          const tok = p[i].split("/");
          let vi = parseInt(tok[0], 10);
          if (vi < 0) vi = P.length / 3 + vi + 1;
          let ti = tok[1] ? parseInt(tok[1], 10) : 0;
          if (ti < 0) ti = T.length / 2 + ti + 1;
          let ni = tok[2] ? parseInt(tok[2], 10) : 0;
          if (ni < 0) ni = N.length / 3 + ni + 1;
          verts.push({ v: vi - 1, t: ti ? ti - 1 : -1, n: ni ? ni - 1 : -1 });
        }
        // Fan-triangulate.
        for (let i = 1; i < verts.length - 1; i++) {
          for (const x of [verts[0], verts[i], verts[i + 1]]) {
            const a = x.v * 3;
            oP.push(P[a] || 0, P[a + 1] || 0, P[a + 2] || 0);
            if (x.t >= 0) { const b = x.t * 2; oT.push(T[b] || 0, T[b + 1] || 0); } else oT.push(0, 0);
            if (x.n >= 0) { const c = x.n * 3; oN.push(N[c] || 0, N[c + 1] || 0, N[c + 2] || 0); } else oN.push(0, 1, 0);
          }
        }
        break;
      }
    }
  }
  if (!oP.length) throw new Error("no geometry in OBJ");

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.Float32BufferAttribute(oP, 3));
  geo.setAttribute("uv", new THREE.Float32BufferAttribute(oT, 2));
  if (N.length) geo.setAttribute("normal", new THREE.Float32BufferAttribute(oN, 3));
  else geo.computeVertexNormals();
  return geo;
}

/** NEAREST / LINEAR as the Model component means them. */
function setTextureFilter(tex, filter) {
  if (!tex) return tex;
  if (filter === "NEAREST") {
    tex.magFilter = THREE.NearestFilter;
    tex.minFilter = THREE.NearestFilter;
  } else {
    tex.magFilter = THREE.LinearFilter;
    tex.minFilter = THREE.LinearMipmapLinearFilter;
  }
  // TextureLoader marks its texture ready after the image arrives. Requesting
  // an upload before then makes the renderer try to use an undefined image.
  if (tex.image) tex.needsUpdate = true;
  return tex;
}

function makeTexture(dataUrl, filter) {
  const tex = new THREE.TextureLoader().load(dataUrl);
  tex.flipY = true; // matches AthenaEnv's UV convention
  return setTextureFilter(tex, filter);
}

function loadGLTF(dataUrl) {
  return new Promise((resolve, reject) => {
    if (!THREE.GLTFLoader) { reject(new Error("GLTFLoader is unavailable")); return; }
    let buf;
    try {
      buf = Uint8Array.from(atob(dataUrl.split(",")[1]), (c) => c.charCodeAt(0)).buffer;
    } catch (e) { reject(new Error("could not decode the model")); return; }
    new THREE.GLTFLoader().parse(buf, "", (gltf) => resolve(gltf.scene),
      (err) => reject(new Error(err?.message || "could not parse the model")));
  });
}

/**
 * Put the Model component's settings onto whatever was loaded.
 *
 * This exists because it used to happen on the OBJ path only: a GLTF was
 * returned exactly as the loader built it, so a texture assigned in the
 * Inspector never appeared on a .glb — the commonest case there is — while the
 * exported PS2 code applied it correctly. The viewport was contradicting the
 * program it is supposed to be previewing.
 *
 * An explicitly assigned texture WINS over the one baked into the mesh, which
 * is what the generator does too: `new RenderData(file, tex)` hands the engine
 * the image to use.
 */
function applyModelMaterial(root, modelComp, files) {
  const texFile = modelComp.textureFile
    ? files.find((f) => f.name === modelComp.textureFile && f.cat === "textures")
    : null;
  // One THREE.Texture for the whole model, not one per material.
  const tex = modelComp.texture_mapping !== false && texFile?.dataUrl ? makeTexture(texFile.dataUrl, modelComp.textureFilter) : null;
  const side = modelComp.face_culling === "CULL_FACE_NONE" ? THREE.DoubleSide
    : modelComp.face_culling === "CULL_FACE_FRONT" ? THREE.BackSide : THREE.FrontSide;
  const flat = modelComp.shade_model === "SHADE_FLAT";

  // glTF materials are shared between meshes, so each one is visited once —
  // otherwise the second visit disposes the texture the first just installed.
  const done = new Set();
  const unlit = new Map();
  root.traverse((ch) => {
    if (!ch.isMesh || !ch.material) return;
    if (modelComp.pipeline === "PL_NO_LIGHTS") {
      const old=[].concat(ch.material);
      ch.material=old.map(m=>{
        if(!unlit.has(m)){unlit.set(m,new THREE.MeshBasicMaterial({map:m.map,color:m.color,side,transparent:m.transparent,opacity:m.opacity,vertexColors:m.vertexColors}));m.dispose();}
        return unlit.get(m);
      });
      if(ch.material.length===1)ch.material=ch.material[0];
    }
    for (const m of [].concat(ch.material)) {
      if (done.has(m)) continue;
      done.add(m);
      m.side = side;
      m.flatShading = flat;
      if (modelComp.texture_mapping === false) {
        m.map?.dispose?.();
        m.map = null;
      } else if (tex) {
        // The mesh's own image is being replaced, so let go of it here rather
        // than leaving it to the GPU: disposeObject only ever sees the new one.
        if (m.map && m.map !== tex) m.map.dispose?.();
        m.map = tex;
        m.color?.set(0xffffff);
      } else if (m.map) {
        // A texture the mesh brought with it still obeys the component's
        // filter, the same way codegen sets getTexture(0).filter on a mesh
        // with no explicit texture.
        setTextureFilter(m.map, modelComp.textureFilter);
      }
      m.needsUpdate = true;
    }
  });
  return root;
}

/**
 * Build a displayable object for a model component.
 * Resolves to { object3d, bounds } — bounds feeds the Rigidbody auto-fit.
 */
async function buildModel(modelComp, files) {
  const meshFile = files.find((f) => f.name === modelComp.file && f.cat === "models");
  if (!meshFile) return null;

  let root;
  if (meshFile.isGltf) {
    root = applyModelMaterial(await loadGLTF(meshFile.dataUrl), modelComp, files);
  } else if (meshFile.content) {
    const geo = parseOBJ(meshFile.content);
    // Untextured OBJs get a flat blue so they read as geometry rather than as
    // something whose texture failed to load; applyModelMaterial then puts the
    // assigned texture over it if there is one.
    const mat = new THREE.MeshStandardMaterial({
      color: 0x6688cc, roughness: 0.85, metalness: 0.0,
    });
    root = applyModelMaterial(new THREE.Mesh(geo, mat), modelComp, files);
  } else {
    return null;
  }

  const box = new THREE.Box3().setFromObject(root);
  const size = new THREE.Vector3(), center = new THREE.Vector3();
  box.getSize(size); box.getCenter(center);
  return {
    object3d: root,
    bounds: {
      size: { x: size.x || 0.01, y: size.y || 0.01, z: size.z || 0.01 },
      center: { x: center.x, y: center.y, z: center.z },
    },
  };
}

/** Release GPU memory for a subtree. Three does not do this automatically. */
function disposeObject(root) {
  root.traverse((ch) => {
    ch.geometry?.dispose();
    if (ch.material) {
    for (const m of [].concat(ch.material)) {
        m.map?.dispose();
        m.dispose();
      }
    }
  });
}
