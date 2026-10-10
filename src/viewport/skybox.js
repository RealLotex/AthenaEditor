// Separate from object picking and lighting. Each texture has one owner and is
// disposed even when a slow load finishes after switching skies or scenes.
function clearViewportSkybox(g) {
  if (!g.skybox) return;
  g.three.remove(g.skybox);
  disposeObject(g.skybox);
  g.skybox = null;
  g.skyboxBackdrop = null; g.skyboxBackdropKey = null;
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
  const layout = skyboxTextureLayout(sky), tiled = sky.tiles.length === layout.count;
  const sources = tiled ? sky.tiles.map(name=>files.find(f=>f.cat === "textures" && f.name === name)?.dataUrl).filter(Boolean) : [asset?.dataUrl].filter(Boolean);
  const key = sky.enabled && sources.length === (tiled ? layout.count : 1) ? `${tiled}:${sky.textureSize}:${sky.upperOnly}:${sky.backdropMode==="mirror"}:${sources.join("|")}` : null;
  if (g.skyboxSource !== key) {
    g.skyboxSource = key;
    clearViewportSkybox(g);
    if (key) {
      const root = new THREE.Group();
      g.skybox = root; g.three.add(root);
      sources.forEach((source, i) => {
        const material = new THREE.MeshBasicMaterial({ side: THREE.BackSide, depthTest: false, depthWrite: false, fog:false });
        const phi = Math.PI * 2 / layout.columns, theta = Math.PI / (layout.rows * (sky.upperOnly ? 2 : 1));
        const geometry = tiled ? new THREE.SphereGeometry(1, Math.ceil(64 / layout.columns), Math.ceil(16 / layout.rows), i % layout.columns * phi, phi, Math.floor(i / layout.columns) * theta, theta) : new THREE.SphereGeometry(1, 32, 16);
        const mesh = new THREE.Mesh(geometry, material); root.add(mesh);
        mesh.renderOrder = -1000; mesh.frustumCulled = false;
        if(tiled && sky.upperOnly && sky.backdropMode === "mirror"){
          const lower=new THREE.SphereGeometry(1,Math.ceil(64/layout.columns),16,i*phi,phi,Math.PI/2,Math.PI/2);
          const uv=lower.attributes.uv;for(let j=0;j<uv.count;j++)uv.setY(j,1-uv.getY(j));
          const mirror=new THREE.Mesh(lower,material);mirror.renderOrder=-1000;mirror.frustumCulled=false;root.add(mirror);
        }
        const texture = new THREE.TextureLoader().load(source, loaded => {
          if (g.skybox !== root) { loaded.dispose(); return; }
          loaded.wrapS = tiled ? THREE.ClampToEdgeWrapping : THREE.RepeatWrapping;
          const filter = g.skyboxFilter === "NEAREST" ? THREE.NearestFilter : THREE.LinearFilter;
          loaded.minFilter = filter; loaded.magFilter = filter;
          loaded.generateMipmaps = false; loaded.needsUpdate = true;
        });
        material.map = texture;
      });
    }
  }
  if (g.skybox) {
    const backdropKey=tiled && sky.upperOnly && sky.backdropMode!=="mirror" ? JSON.stringify([sky.backdropMode,sky.backdropColor,sky.horizonColor,sky.fogHeight]) : null;
    if(g.skyboxBackdropKey!==backdropKey){
      if(g.skyboxBackdrop){g.skybox.remove(g.skyboxBackdrop);disposeObject(g.skyboxBackdrop);g.skyboxBackdrop=null;}
      g.skyboxBackdropKey=backdropKey;
      if(backdropKey){
        const data=skyboxBackdropGeometry(sky),geometry=new THREE.BufferGeometry();
        geometry.setAttribute("position",new THREE.Float32BufferAttribute(data.positions,3));
        geometry.setAttribute("color",new THREE.Float32BufferAttribute(data.colors,4));
        // Stay in the opaque queue so the sky blends before scene geometry.
        const material=new THREE.MeshBasicMaterial({side:THREE.DoubleSide,vertexColors:true,depthTest:false,depthWrite:false,fog:false,blending:THREE.CustomBlending,blendSrc:THREE.SrcAlphaFactor,blendDst:THREE.OneMinusSrcAlphaFactor,blendEquation:THREE.AddEquation});
        g.skyboxBackdrop=new THREE.Mesh(geometry,material);g.skyboxBackdrop.renderOrder=-999;g.skyboxBackdrop.frustumCulled=false;g.skybox.add(g.skyboxBackdrop);
      }
    }
    placeViewportSkybox(g);
    g.skybox.rotation.y = sky.rotation * Math.PI / 180;
    g.skyboxFilter = sky.textureFilter;
    g.skybox.traverse(node => {
      if (!node.material) return;
      node.material.color.setRGB(sky.brightness, sky.brightness, sky.brightness);
      const map = node.material.map, filter = sky.textureFilter === "NEAREST" ? THREE.NearestFilter : THREE.LinearFilter;
      if (map && map.minFilter !== filter) { map.minFilter = filter; map.magFilter = filter; if (map.image) map.needsUpdate = true; }
    });
  }
  const bg = scene?.background || { r: 7, g: 11, b: 17 };
  g.renderer.setClearColor(new THREE.Color(bg.r / 255, bg.g / 255, bg.b / 255), 1);
}
