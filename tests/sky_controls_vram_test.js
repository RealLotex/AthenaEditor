import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import { PNG } from "npm:pngjs@7.0.0";
import { Buffer } from "node:buffer";
import { load } from "./_load.js";
const A = await load();
const decode = asset => {
  const bytes = Uint8Array.from(atob(asset.dataUrl.split(",")[1]), c=>c.charCodeAt(0));
  return { bytes, image: asset.image.format === "png" ? PNG.sync.read(Buffer.from(bytes)) : null };
};
const prepared = (settings, id="clear") => A.prepareSkyboxLayout(A.skyboxPresetAsset(id), {enabled:true, ...settings});

Deno.test('changing sky settings retires only unreferenced generated tiles',()=>{
  const project=A.mkProject(),scene=project.scenes[0],other=A.mkScene('Other');project.scenes.push(other);
  project.assets=['old','shared','edited','scripted','new'].map(name=>({name:name+'.png',cat:'textures',owned:true,editKind:name==='edited'?'optimize':'skyboxTile',dataUrl:name}));
  scene.skybox={tiles:['old.png','shared.png','edited.png','scripted.png']};
  other.skybox={texture:'shared.png'};project.scripts=[{name:'Keep.js',content:"new Image('scripted.png')"}];
  A.applySkybox(project,scene,{tiles:['new.png']});
  assertEquals(project.assets.map(file=>file.name),['shared.png','edited.png','scripted.png','new.png']);
});

Deno.test("sky settings snap to supported sizes/depths and preserve legacy full-sphere skies", () => {
  const sky = A.normalizedSkybox({enabled:true,texture:"old.png",textureSize:9000,bitDepth:24,upperOnly:"true",textureFilter:"bogus"});
  assertEquals([sky.textureSize,sky.bitDepth,sky.upperOnly,sky.textureFilter,sky.tiles], [512,8,false,"LINEAR",[]]);
});

Deno.test("packed sky sources preserve original resolution and maximum native precision without an intermediate resize", async () => {
  for (const preset of A.SKYBOX_PRESETS) {
    const original = PNG.sync.read(Buffer.from(await Deno.readFile(`assets/skyboxes/${preset.id}.png`)));
    const packed = A.SKYBOX_PRESET_HIGH_IMAGES[preset.id], decoded = await A.decodeSkyboxSource(packed);
    assertEquals([packed.width, packed.height], [original.width, original.height]);
    assertEquals(A.skyboxSourceSize(A.skyboxPresetAsset(preset.id)), {width: original.width, height: original.height});
    assertEquals([packed.width,packed.height],[1774,887], 'The deferred 4K reconstruction must not replace the original single_image panoramas.');
    assertEquals(await Deno.readFile(`assets/skyboxes/${preset.id}.png`), await Deno.readFile(`assets/skyboxes/illustrated/${preset.id}.png`));
    for(let i=0;i<decoded.data.length;i+=103*4)assertEquals([...decoded.data.subarray(i,i+4)],[...original.data.subarray(i,i+3)].map(v=>v&248).concat(255));
  }
});

Deno.test("4 and 8 bit skies use native indexed PNG, shared opaque palettes and equal seam texels", async () => {
  for (const bitDepth of [4,8]) for (const upperOnly of [false,true]) {
    const asset=await prepared({textureSize:128,bitDepth,upperOnly});
    const tiles=asset.preparedTiles.map(decode),height=upperOnly?64:128;
    for (const tile of tiles) {
      assertEquals([tile.bytes[24],tile.bytes[25]],[bitDepth,3]);
      assertEquals([tile.image.width,tile.image.height],[128,height]);
      for(let i=3;i<tile.image.data.length;i+=4)assertEquals(tile.image.data[i],255);
    }
    for (let y=0;y<height;y++) {
      const pixel=(part,x)=>[...tiles[part].image.data.subarray((y*128+x)*4,(y*128+x+1)*4)];
      assertEquals(pixel(0,127),pixel(1,0));assertEquals(pixel(0,0),pixel(1,127));
    }
    const paletteCost=bitDepth===4?256:1024;
    assertEquals(asset.preparedTiles.reduce((sum,t)=>sum+A.textureVRAMBytes(t),0),2*(128*height*bitDepth/8+paletteCost));
  }
});

Deno.test("16 bit skies store opaque RGB555 BMP; upper-only halves texture cost", async () => {
  const full=await prepared({textureSize:256,bitDepth:16}),upper=await prepared({textureSize:256,bitDepth:16,upperOnly:true});
  for(const tile of full.preparedTiles) {
    assertEquals(A.textureFormatOfAsset(tile),"CT16");const {bytes}=decode(tile),view=new DataView(bytes.buffer);
    assertEquals(view.getUint16(28,true),16);
    for(let at=54;at<bytes.length;at+=2)assert(view.getUint16(at,true)&32768);
  }
  assertEquals(A.textureVRAMBytes(full.preparedTiles[0]),2*A.textureVRAMBytes(upper.preparedTiles[0]));
});

Deno.test("maximum CT16 conversion resizes directly from the restored original, with no intermediate preview", async () => {
  const original = A.resizeTexturePixels(await A.decodeSkyboxSource(A.SKYBOX_PRESET_HIGH_IMAGES.clear),4096,2048);
  const asset = await prepared({textureSize:2048,bitDepth:16,upperOnly:false});
  for(let part=0;part<8;part++) {
    const {bytes}=decode(asset.preparedTiles[part]),view=new DataView(bytes.buffer);
    for(let y=19;y<1023;y+=109)for(let x=17;x<1023;x+=113) {
      const at=((Math.floor(part/4)*1024+y)*4096+(part%4)*1024+x)*4;
      const expected=0x8000|(original.data[at]>>3)<<10|(original.data[at+1]>>3)<<5|original.data[at+2]>>3;
      assertEquals(view.getUint16(54+((1023-y)*1024+x)*2,true),expected,`${part}:${x},${y}`);
    }
  }
});

Deno.test("small originals warn without disabling the sky, and edited tiles are never automatically refreshed", async () => {
  const p=A.mkProject(),s=p.scenes[0],settings={enabled:true,textureSize:128,bitDepth:8};
  const preparedAsset=await prepared(settings);A.applySkybox(p,s,settings,preparedAsset);
  assertEquals(A.skyboxNeedsSourceRefresh(s,A.editorAssets(p)),false);
  for(const tile of p.assets.filter(a=>a.editKind==='skyboxTile'))delete tile.skyboxSourceRevision;
  assertEquals(A.skyboxNeedsSourceRefresh(s,A.editorAssets(p)),true);
  p.assets.find(a=>a.name===s.skybox.tiles[0]).editKind='optimize';
  assertEquals(A.skyboxNeedsSourceRefresh(s,A.editorAssets(p)),false);
  const small=preparedAsset.preparedTiles[0];
  p.assets=[{...small,name:'small.png',editKind:'skybox',skyboxPreset:null}];
  s.skybox={enabled:true,texture:'small.png'};
  const result=A.generateProject(p);
  assert(result.diagnostics.some(d=>d.level==='warn'&&d.component==='skybox'&&d.message.includes('without adding detail')));
  assertStringIncludes(result.main,'new RenderObject(skybox_data)');
});

Deno.test("maximum-size 4 bit upper sky shares two textures with an untextured backdrop, survives save and deduplicates selections", async () => {
  const settings={enabled:true,preset:"clear",textureSize:1024,bitDepth:4,upperOnly:true,textureFilter:"NEAREST"},asset=await prepared(settings);
  const p=A.mkProject(),scene=p.scenes[0];A.applySkybox(p,scene,settings,asset);
  A.applySkybox(p,scene,scene.skybox,asset);assertEquals(p.assets.length,3);
  const restored=A.migrateProject(JSON.parse(JSON.stringify(p)));assertEquals(restored.scenes[0].skybox,scene.skybox);
  assert(!A.skyboxAssetProblems(scene,A.editorAssets(p)).some(problem=>problem.level==='error'));
  assertEquals(A.projectAssetReferences(p).filter(r=>r.component==="skybox").length,3);
  const result=A.generateProject(p);
  assertEquals(result.diagnostics.filter(d=>d.level==="error"),[]);
  assertEquals((result.main.match(/new RenderObject\(/g)||[]).length,2);
  assertStringIncludes(result.main,"getTexture(i)); i++) image.filter = NEAREST");
  assert(result.main.indexOf("image.filter = NEAREST")>result.main.indexOf("new RenderData"));
  const obj=result.assets.find(a=>/atheditor_skybox\.obj$/.test(a.filename)).content,mesh=A.readMeshOBJ(obj);
  assert(!mesh.positions.some(p=>p[1]<-.99));assert(obj.includes("usemtl Sky0")&&obj.includes("usemtl Sky1"));
  const backdrop=A.readMeshOBJ(result.assets.find(a=>/atheditor_sky_backdrop\.obj$/.test(a.filename)).content);
  assert(backdrop.positions.some(p=>p[1]<-.99));assertStringIncludes(result.main,'texture_mapping=false');
  const mtl=result.assets.find(a=>/atheditor_skybox\.mtl$/.test(a.filename)).content;
  for(const name of scene.skybox.tiles)assertStringIncludes(mtl,`../textures/${name}`);
  p.assets=p.assets.filter(a=>a.name!==scene.skybox.tiles[0]);assert(A.skyboxAssetProblems(scene,A.editorAssets(p)).length);
});

Deno.test("a full tiled sky covers the lower hemisphere",()=>{
  const mesh=A.readMeshOBJ(A.skyboxTiledMeshOBJ("sky.mtl",false));assert(mesh.positions.some(p=>p[1]<-.99));
});

Deno.test("2048 skies double both dimensions using four or eight legal tiles with shared seams",async()=>{
  assertEquals(A.SKYBOX_TEXTURE_SIZES.at(-1),2048);
  for(const upperOnly of [true,false]){
    const settings={enabled:true,textureSize:2048,bitDepth:4,upperOnly},asset=await prepared(settings),layout=A.skyboxTextureLayout(settings);
    assertEquals([layout.width,layout.height,layout.count],[4096,upperOnly?1024:2048,upperOnly?4:8]);
    const tiles=asset.preparedTiles.map(decode);assertEquals(tiles.length,layout.count);
    for(const tile of tiles)assertEquals([tile.image.width,tile.image.height],[1024,1024]);
    const pixel=(i,x,y)=>[...tiles[i].image.data.subarray((y*1024+x)*4,(y*1024+x+1)*4)];
    for(let row=0;row<layout.rows;row++)for(let col=0;col<4;col++)for(let y=0;y<1024;y++)assertEquals(pixel(row*4+col,1023,y),pixel(row*4+(col+1)%4,0,y));
    if(!upperOnly)for(let col=0;col<4;col++)for(let x=0;x<1024;x++)assertEquals(pixel(col,x,1023),pixel(4+col,x,0));
    const p=A.mkProject(),s=p.scenes[0];A.applySkybox(p,s,settings,asset);
    const restored=A.migrateProject(JSON.parse(JSON.stringify(p)));assertEquals(restored.scenes[0].skybox.tiles.length,layout.count);
    assert(!A.skyboxAssetProblems(s,A.editorAssets(p)).some(problem=>problem.level==='error'));
    const result=A.generateProject(p);assert(!result.diagnostics.some(d=>d.level==='error'));
    const obj=result.assets.find(f=>f.filename.endsWith('atheditor_skybox.obj')).content,mesh=A.readMeshOBJ(obj);
    assertEquals((obj.match(/usemtl Sky/g)||[]).length,layout.count);assertEquals(mesh.faces.length,upperOnly?1984:1920);
    assertEquals((result.main.match(/new RenderObject\(/g)||[]).length,upperOnly?2:1);
    assertEquals(A.sceneVRAMBudget(s,A.editorAssets(p),p).textures,layout.count*524544);
  }
});

Deno.test("GS budget counts paletted storage, swizzle alignment and CT24/Z24 as 32-bit allocation",()=>{
  assertEquals(A.gsSurfaceBytes(640,448,"CT16S"),573440);
  assertEquals(A.gsSurfaceBytes(640,448,"Z24"),1146880);
  assertEquals(A.gsSurfaceBytes(1,1,"T4"),256);
  const p=A.mkProject(),s=p.scenes[0];
  assertEquals(A.sceneVRAMBudget(s,[],p).framebuffers,1720320);
  p.display.psm="CT32_Z24";assertEquals(A.sceneVRAMBudget(s,[],p).framebuffers,3440640);
  p.display.psm="custom";p.display.psmCustomColor="Screen.CT24";p.display.psmCustomDepth="Screen.Z16";
  assertEquals(A.sceneVRAMBudget(s,[],p).framebuffers,2867200);
  p.display.mode="PAL";assertEquals(A.sceneVRAMBudget(s,[],p).height,512);
});

Deno.test("Problems distinguishes streaming pressure from an image that cannot fit beside 32-bit buffers",async()=>{
  const p=A.mkProject(),s=p.scenes[0];p.display.psm="CT32_Z32";
  const settings={enabled:true,textureSize:1024,bitDepth:4,upperOnly:false};A.applySkybox(p,s,settings,await prepared(settings));
  let budget=A.sceneVRAMBudget(s,A.editorAssets(p),p);assertEquals(budget.textures,1049088);
  let problems=A.validateScene(s,[],p).filter(d=>d.component==="vram");assertEquals(problems[0].level,"warn");assertStringIncludes(problems[0].message,"CT16S + Z16S");
  assert(A.generateProject(p).diagnostics.some(d=>d.component==="vram"&&d.level==="warn"));
  const big={...settings,bitDepth:8};A.applySkybox(p,s,big,await prepared(big));
  problems=A.validateScene(s,[],p).filter(d=>d.component==="vram");assertEquals(problems[0].level,"error");assertStringIncludes(problems[0].message,"cannot fit");
  p.display.psm="CT16S_Z16S";assert(!A.validateScene(s,[],p).some(d=>d.component==="vram"&&d.level==="error"));
});

Deno.test("VRAM excludes inactive geometry and unused assets, but includes HUD, cinematic portraits and locked shadow targets",async()=>{
  const p=A.mkProject(),s=p.scenes[0],asset=await prepared({textureSize:256,bitDepth:8});
  p.assets=asset.preparedTiles;
  const model=A.mkObject("Caster");model.components.model={...A.makeComponent("model"),file:"cube.obj",textureFile:p.assets[0].name};
  model.components.shadow={...A.makeComponent("shadow"),rtSize:128,rtBpp:32};s.objects=[model];
  s.uiElements=[{type:"Image",name:"HUD",image:p.assets[0].name,imageFilter:"LINEAR"}];
  s.sequences=[{name:"Intro",tracks:[{type:"portrait",clips:[{file:p.assets[1].name}]}]}];
  let b=A.sceneVRAMBudget(s,A.editorAssets(p),p);assertEquals(b.renderTargets,65536);assertEquals(b.uploads.length,2);
  model.visible=false;s.sequences=[];s.uiElements=[];b=A.sceneVRAMBudget(s,A.editorAssets(p),p);assertEquals(b.textures,0);assertEquals(b.renderTargets,0);
});

Deno.test("backdrop modes use predictable colors, opaque lower geometry and bounded fog above the horizon",()=>{
  for(const backdropMode of ["solid","gradient","foggy"]){
    const settings={upperOnly:true,backdropMode,backdropColor:{r:255,g:0,b:0},horizonColor:{r:0,g:0,b:255},fogHeight:30};
    const data=A.skyboxBackdropGeometry(settings),mesh=A.readMeshOBJ(A.skyboxBackdropOBJ(settings));
    assertEquals(mesh.faces.length*9,data.positions.length);assertEquals(data.colors.length,data.positions.length/3*4);
    let translucent=false;
    for(let i=0;i<data.colors.length;i+=4){
      const y=data.positions[i/4*3+1],c=data.colors.slice(i,i+4);
      assert(c.every(v=>Number.isFinite(v)&&v>=0&&v<=1));
      if(y<=1e-7)assertEquals(c[3],1);
      if(backdropMode==='solid')assertEquals(c.slice(0,3),[1,0,0]);
      if(y<-.99)assertEquals(c,[1,0,0,1]);
      if(y>1e-7){assertEquals(backdropMode,'foggy');assert(y<=.5000001);translucent ||= c[3]<1;}
    }
    assertEquals(translucent,backdropMode==='foggy');
  }
});
Deno.test("all four backdrops preserve texture VRAM; mirrored lower UVs reuse the upper panorama",async()=>{
  const p=A.mkProject(),s=p.scenes[0],settings={enabled:true,textureSize:128,bitDepth:4,upperOnly:true};
  A.applySkybox(p,s,settings,await prepared(settings));const original=A.sceneVRAMBudget(s,A.editorAssets(p),p).textures;
  for(const backdropMode of A.SKYBOX_BACKDROPS){
    s.skybox.backdropMode=backdropMode;
    assertEquals(A.sceneVRAMBudget(s,A.editorAssets(p),p).textures,original);
    const generated=A.generateProject(p);assert(!generated.diagnostics.some(d=>d.level==='error'));
    const mesh=A.readMeshOBJ(generated.assets.find(a=>a.filename.endsWith('atheditor_skybox.obj')).content);
    assertEquals(generated.assets.some(a=>a.filename.endsWith('atheditor_sky_backdrop.obj')),backdropMode!=='mirror');
    if(backdropMode==='mirror'){
      for(const face of mesh.faces)for(const c of face){const y=mesh.positions[c.v][1],v=mesh.uvs[c.uv][1];if(y<-.999999)assertEquals(v,1);if(Math.abs(y)<1e-6)assertEquals(v,0);}
      assertEquals((generated.main.match(/new Image\(/g)||[]).length,0);
    }
    const restored=A.migrateProject(JSON.parse(JSON.stringify(p)));assertEquals(restored.scenes[0].skybox,s.skybox);
  }
});
Deno.test("invalid backdrop values normalize before creating geometry",()=>{
  const sky=A.normalizedSkybox({backdropMode:'noise',fogHeight:Infinity,backdropColor:{r:-9,g:900,b:NaN}});
  assertEquals(sky.backdropMode,'foggy');assertEquals(sky.backdropColor,{r:0,g:255,b:100});assertEquals(sky.fogHeight,20);
});
Deno.test("refreshing identical generated tiles updates their revision without duplicating bytes",async()=>{
  const p=A.mkProject(),s=p.scenes[0],sky={enabled:true,preset:"clear",textureSize:128,bitDepth:4,upperOnly:false},asset=await prepared(sky);
  A.applySkybox(p,s,sky,asset);const ids=p.assets.map(f=>f.id);
  for(const f of p.assets.filter(f=>f.editKind==='skyboxTile'))f.skyboxSourceRevision=1;
  assert(A.skyboxNeedsSourceRefresh(s,A.editorAssets(p)));A.applySkybox(p,s,sky,asset);
  assertEquals(p.assets.map(f=>f.id),ids);assertEquals(A.skyboxNeedsSourceRefresh(s,A.editorAssets(p)),false);
});
