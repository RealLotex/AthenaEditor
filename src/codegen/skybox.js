function resolveSkybox(scene, files, names, textures, problem) {
  const settings = normalizedSkybox(scene.skybox);
  if (!settings.enabled) return null;
  const issues = skyboxAssetProblems(scene, files);
  if (issues.length) { for (const issue of issues) problem(issue.level, issue.message, null, "skybox"); return null; }
  return { ...settings, mesh: freeAssetName(files, "atheditor_skybox", "obj"),
    textureVN: textures.find(t => t.file === settings.texture && t.filter === "LINEAR")?.vn || names.take("skybox_texture"),
    sharedTexture: textures.some(t => t.file === settings.texture && t.filter === "LINEAR"),
    dataVN: names.take("skybox_data"), objectVN: names.take("skybox_object") };
}

function emitSkyboxSetup(e, ir) {
  const sky = ir.skybox; if (!sky) return;
  e.section("Skybox — one panorama, unlit and camera-centred");
  if (!sky.sharedTexture) {
    e.w(`os.chdir("${jsStr(ir.dirs.textures)}");`);
    e.w(`const ${sky.textureVN} = new Image("${jsStr(sky.texture)}");`);
    e.w(`${sky.textureVN}.filter = LINEAR;`);
    e.w(`os.chdir("..");`);
  }
  e.w(`os.chdir("${jsStr(ir.dirs.models)}");`);
  e.w(`const ${sky.dataVN} = new RenderData("${jsStr(sky.mesh)}", ${sky.textureVN});`);
  e.w(`os.chdir("..");`);
  e.w(`${sky.dataVN}.pipeline = Render.PL_NO_LIGHTS;`);
  e.w(`${sky.dataVN}.face_culling = Render.CULL_FACE_NONE;`);
  e.w(`${sky.dataVN}.accurate_clipping = true;`);
  e.w(`${sky.dataVN}.updateMaterial(0, {diffuse: {r: ${fl(sky.brightness)}, g: ${fl(sky.brightness)}, b: ${fl(sky.brightness)}}});`);
  e.w(`const ${sky.objectVN} = new RenderObject(${sky.dataVN});`);
  e.w(`${sky.objectVN}.rotation = {x: 0, y: ${fl(sky.rotation * Math.PI / 180)}, z: 0};`);
  e.nl();
}

function emitSkyboxDraw(e, ir) {
  const sky = ir.skybox; if (!sky) return;
  e.comment("Draw sky before geometry; its own frustum keeps it independent of scene clipping");
  // Disabling comparison alone still lets the GS write sky depth. The separate
  // sky frustum must never enter scene depth; those writes also crash PCSX2 2.6.3
  // with CT16S + Z16S. Mask writes and use ALWAYS for a valid GS depth test.
  e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 1);`);
  e.w(`Screen.setParam(Screen.DEPTH_TEST_ENABLE, true);`);
  e.w(`Screen.setParam(Screen.DEPTH_TEST_METHOD, Screen.DEPTH_ALWAYS);`);
  e.w(`Render.setView(${fl(ir.camera.fov)}, 0.01, 4.0);`);
  e.w(`${sky.objectVN}.position = Camera.save().position;`);
  e.w(`${sky.objectVN}.render();`);
  e.w(`Render.setView(${fl(ir.camera.fov)}, ${fl(ir.camera.near)}, ${fl(ir.camera.far)});`);
  e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 0);`);
  e.nl();
}
