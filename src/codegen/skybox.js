function resolveSkybox(scene, files, names, textures, problem) {
  const settings = normalizedSkybox(scene.skybox);
  if (!settings.enabled) return null;
  const issues = skyboxAssetProblems(scene, files);
  for (const issue of issues) problem(issue.level, issue.message, null, "skybox");
  if (issues.some(issue => issue.level === "error")) return null;
  return { ...settings, mesh: freeAssetName(files, "atheditor_skybox", "obj"),
    materialFile: settings.tiles.length > 0 ? freeAssetName(files, "atheditor_skybox", "mtl") : null,
    textureVN: textures.find(t => t.file === settings.texture && t.filter === settings.textureFilter)?.vn || names.take("skybox_texture"),
    sharedTexture: textures.some(t => t.file === settings.texture && t.filter === settings.textureFilter),
    ...(settings.upperOnly && settings.backdropMode !== "mirror" ? {backdropMesh:freeAssetName(files,"atheditor_sky_backdrop","obj"),backdropDataVN:names.take("sky_backdrop_data"),backdropVN:names.take("sky_backdrop_object")} : {}),
    dataVN: names.take("skybox_data"), objectVN: names.take("skybox_object") };
}

function emitSkyboxSetup(e, ir) {
  const sky = ir.skybox; if (!sky) return;
  e.section("Skybox — one panorama, unlit and camera-centred");
  if (!sky.tiles.length && !sky.sharedTexture) {
    e.w(`os.chdir("${jsStr(ir.dirs.textures)}");`);
    e.w(`const ${sky.textureVN} = new Image("${jsStr(sky.texture)}");`);
    e.w(`os.chdir("..");`);
  }
  e.w(`os.chdir("${jsStr(ir.dirs.models)}");`);
  e.w(`const ${sky.dataVN} = new RenderData("${jsStr(sky.mesh)}"${sky.tiles.length > 0 ? "" : `, ${sky.textureVN}`});`);
  e.w(`os.chdir("..");`);
  e.w(`${sky.dataVN}.pipeline = Render.PL_NO_LIGHTS;`);
  e.w(`${sky.dataVN}.face_culling = Render.CULL_FACE_NONE;`);
  e.w(`${sky.dataVN}.accurate_clipping = true;`);
  if (sky.tiles.length > 0) e.w(`for (let i = 0, image; (image = ${sky.dataVN}.getTexture(i)); i++) image.filter = ${sky.textureFilter};`);
  else e.w(`${sky.textureVN}.filter = ${sky.textureFilter};`);
  e.w(`for (let i = 0, n = ${sky.dataVN}.materials.length; i < n; i++) ${sky.dataVN}.updateMaterial(i, {diffuse: {r: ${fl(sky.brightness)}, g: ${fl(sky.brightness)}, b: ${fl(sky.brightness)}}});`);
  e.w(`const ${sky.objectVN} = new RenderObject(${sky.dataVN});`);
  e.w(`${sky.objectVN}.rotation = {x: 0, y: ${fl(sky.rotation * Math.PI / 180)}, z: 0};`);
  if(sky.backdropMesh){
    const colors=skyboxBackdropGeometry(sky).colors.map((v,i)=>i%4===3?v-1:v*sky.brightness);
    e.w(`os.chdir("${jsStr(ir.dirs.models)}");`);
    e.w(`const ${sky.backdropDataVN}=new RenderData("${jsStr(sky.backdropMesh)}");os.chdir("..");`);
    e.w(`${sky.backdropDataVN}.pipeline=Render.PL_NO_LIGHTS;${sky.backdropDataVN}.texture_mapping=false;${sky.backdropDataVN}.face_culling=Render.CULL_FACE_NONE;${sky.backdropDataVN}.accurate_clipping=true;${sky.backdropDataVN}.shade_model=1;`);
    e.w(`for(let i=0,n=${sky.backdropDataVN}.materials.length;i<n;i++)${sky.backdropDataVN}.updateMaterial(i,{diffuse:{r:0,g:0,b:0}});`);
    e.w(`{const colors=new Float32Array(${sky.backdropDataVN}.vertices.colors),baked=JSON.parse(${JSON.stringify(JSON.stringify(colors))});if(colors.length!==baked.length)throw Error("Sky backdrop color count does not match its mesh.");colors.set(baked);}`);
    e.w(`const ${sky.backdropVN}=new RenderObject(${sky.backdropDataVN});`);
  }
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
  if(sky.backdropVN){
    e.w(`Screen.setParam(Screen.ALPHA_TEST_REF,0);Screen.setParam(Screen.PIXEL_ALPHA_BLEND_ENABLE,true);`);
    e.w(`${sky.backdropVN}.position=${sky.objectVN}.position;${sky.backdropVN}.render();`);
    e.w(`Screen.setParam(Screen.ALPHA_TEST_REF,${il(ir.project.display?.alphaTest?.ref??50)});Screen.setParam(Screen.PIXEL_ALPHA_BLEND_ENABLE,${ir.project.display?.alphaTest?.pixelBlend!==false});`);
  }
  e.w(`Render.setView(${fl(ir.camera.fov)}, ${fl(ir.camera.near)}, ${fl(ir.camera.far)});`);
  e.w(`Screen.setBuffer(Screen.DEPTH_BUFFER, _mainDepth, 0);`);
  e.nl();
}
