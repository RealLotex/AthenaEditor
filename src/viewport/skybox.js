// Separate from object picking and lighting. Each texture has one owner and is
// disposed even when a slow load finishes after switching skies or scenes.
function clearViewportSkybox(g) {
  if (!g.skybox) return;
  g.three.remove(g.skybox);
  g.skybox.geometry.dispose();
  g.skybox.material.map?.dispose();
  g.skybox.material.dispose();
  g.skybox = null;
}

function placeViewportSkybox(g) {
  if (!g?.skybox) return;
  g.skybox.position.copy(g.camera.position);
  const camera=g.camera, viewRadius=camera.isOrthographicCamera
    ? Math.hypot(camera.right-camera.left,camera.top-camera.bottom)/(2*camera.zoom)*1.05 : 0;
  g.skybox.scale.setScalar(Math.min(camera.far * .5, Math.max(10, camera.near * 10, viewRadius)));
}

function syncViewportSkybox(g, scene, files) {
  const sky = normalizedSkybox(scene?.skybox);
  const asset = sky.enabled && files.find(f => f.cat === "textures" && f.name === sky.texture);
  const key = asset?.dataUrl || null;
  if (g.skyboxSource !== key) {
    g.skyboxSource = key;
    clearViewportSkybox(g);
    if (key) {
      const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthTest: false, depthWrite: false });
      const mesh = new THREE.Mesh(new THREE.SphereGeometry(1, 32, 16), material);
      mesh.renderOrder = -1000; mesh.frustumCulled = false;
      g.skybox = mesh; g.three.add(mesh);
      const texture = new THREE.TextureLoader().load(key, loaded => {
        if (g.skybox !== mesh) { loaded.dispose(); return; }
        loaded.wrapS = THREE.RepeatWrapping;
        loaded.minFilter = THREE.LinearFilter;
        loaded.magFilter = THREE.LinearFilter;
        loaded.generateMipmaps = false; loaded.needsUpdate = true;
      });
      material.map = texture;
    }
  }
  if (g.skybox) {
    placeViewportSkybox(g);
    g.skybox.rotation.y = sky.rotation * Math.PI / 180;
    g.skybox.material.color.setRGB(sky.brightness, sky.brightness, sky.brightness);
  }
  const bg = scene?.background || { r: 7, g: 11, b: 17 };
  g.renderer.setClearColor(new THREE.Color(bg.r / 255, bg.g / 255, bg.b / 255), 1);
}
