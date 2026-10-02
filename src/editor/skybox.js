async function prepareSkyboxTexture(asset) {
  const image = new Image();
  await new Promise((resolve, reject) => { image.onload = resolve; image.onerror = () => reject(Error("Could not open this image. Try another PNG, JPG or WebP.")); image.src = asset.dataUrl; });
  if (Math.abs(image.naturalWidth / image.naturalHeight - 2) > .05) throw Error("Choose a 360° panorama with a 2:1 ratio, such as 2048 × 1024.");
  const canvas = document.createElement("canvas"); canvas.width = 512; canvas.height = 256;
  const ctx = canvas.getContext("2d"); ctx.fillStyle = "#000"; ctx.fillRect(0, 0, 512, 256);
  ctx.drawImage(image, 0, 0, 512, 256);
  const dataUrl = canvas.toDataURL("image/png");
  return { name: `skybox_${ident(asset.name.replace(/\.[^.]+$/, ""), "panorama")}.png`, cat: "textures", dataUrl,
    size: atob(dataUrl.split(",")[1]).length, image: { width: 512, height: 256, bpp: 32, format: "png" },
    editKind: "skybox", skyboxLabel: asset.skyboxLabel || asset.name.replace(/\.[^.]+$/, ""), libraryFolder: "Skyboxes", owned: true };
}

async function importSkyboxTexture(file) {
  if (!/\.(png|jpe?g|webp)$/i.test(file.name) || (file.type && !["image/png", "image/jpeg", "image/webp"].includes(file.type))) throw Error("Choose a PNG, JPG or WebP image.");
  if (file.size > 32 * 1024 * 1024) throw Error("This image exceeds 32 MB. Resize it and import it again.");
  const dataUrl = await new Promise((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => reject(Error("Could not read this image.")); reader.readAsDataURL(file); });
  return prepareSkyboxTexture({ name: file.name, dataUrl });
}

function applySkybox(project, scene, settings, asset, external = []) {
  if (asset) {
    const files = editorAssets(project, external);
    const same = files.find(f => f.cat === "textures" && f.dataUrl === asset.dataUrl);
    if (same) settings = { ...settings, texture: same.name };
    else {
      const previous = asset.skyboxPreset && files.find(f => f.owned && f.editKind === "skybox" && f.skyboxPreset === asset.skyboxPreset);
      const name = previous?.name || freeAssetName(files, asset.name.replace(/\.[^.]+$/, ""), "png");
      putProjectAsset(project, { ...asset, name });
      settings = { ...settings, texture: name };
    }
  }
  scene.skybox = normalizedSkybox(settings);
}
