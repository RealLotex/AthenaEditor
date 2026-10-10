// Verify actual native image formats, filtering and both sky layouts.
import { load, shutdown } from "../tests/_load.js";
import { runConsoleFixture } from "./run-console-fixture.js";
import { assert, assertEquals } from "jsr:@std/assert@1";
const A = await load();
try {
  const results = [];
  const cases = [
    {preset:"clear"}, {preset:"aurora"},
    {preset:"clear",textureSize:1024,bitDepth:4,upperOnly:true,textureFilter:"NEAREST"},
    {preset:"clear",textureSize:512,bitDepth:8,upperOnly:false,textureFilter:"LINEAR"},
    {preset:"aurora",textureSize:1024,bitDepth:16,upperOnly:true,textureFilter:"NEAREST"},
    {preset:"clear",textureSize:1024,bitDepth:4,upperOnly:false,textureFilter:"NEAREST",framebuffer:"CT32_Z24"},
    {preset:"clear",textureSize:2048,bitDepth:4,upperOnly:true,textureFilter:"LINEAR"},
    {preset:"aurora",textureSize:2048,bitDepth:4,upperOnly:false,textureFilter:"LINEAR"},
    {preset:"clear",textureSize:2048,bitDepth:16,upperOnly:true,textureFilter:"NEAREST"},
    {preset:"dusk",textureSize:2048,bitDepth:16,upperOnly:false,textureFilter:"LINEAR"},
  ];
  const selected = Deno.args.includes('--original-only') ? cases.filter(c => !c.bitDepth)
    : Deno.args.includes('--max-only') ? cases.filter(c => c.textureSize === 2048) : cases;
  for (const settings of selected) {
    const {preset}=settings,tiled=!!settings.bitDepth;
    const p = A.mkProject("Sky verification"), s = p.scenes[0];
    if(settings.framebuffer)p.display.psm=settings.framebuffer;
    s.objects = []; s.defaultCameraRig = false; s.camera.fov = 100;
    const sky={enabled:true,...settings},asset=A.skyboxPresetAsset(preset);
    A.applySkybox(p, s, sky, tiled ? await A.prepareSkyboxLayout(asset,sky) : asset);
    const probe = A.mkObject("Probe");
    probe.components.script = { ...A.makeComponent("script"), file: "Probe.js" };
    s.objects.push(probe);
    p.scripts.push({ name: "Probe.js", content: `export function update(ctx){if(ctx.frame===40){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'DONE',frame:ctx.frame})+String.fromCharCode(10));f.close();}}` });
    const generated = A.generateProject(p);
    assert(!generated.diagnostics.some(d => d.level === "error"));
    const inspect = `{const textures=[]; for(let i=0,image;(image=skybox_data.getTexture(i));i++)textures.push({width:image.texWidth,height:image.texHeight,bpp:image.bpp,nearest:image.filter===NEAREST});const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'SKY',textures})+String.fromCharCode(10));f.close();}\n`;
    generated.main=generated.main.replace("Screen.display(() => {",inspect+"Screen.display(() => {");
    const log = await runConsoleFixture(generated, { timeoutMs: 30000 });
    assert(log.includes('"tag":"DONE"'), log);
    const data=JSON.parse(log.split(/\r?\n/).find(line=>line.includes('"tag":"SKY"')));
    const layout=A.skyboxTextureLayout(settings);
    assertEquals(data.textures.length,tiled?layout.count:1);
    for(const image of data.textures){assertEquals(image.width,tiled?layout.tileWidth:1024);assertEquals(image.height,tiled?layout.tileHeight:512);assertEquals(image.bpp,settings.bitDepth||8);assertEquals(image.nearest,settings.textureFilter==="NEAREST");}
    results.push({ ...settings, textures:data.textures, fov: 100, rendered: true });
    console.log(`${preset} ${settings.bitDepth||8} bits ${tiled?settings.upperOnly?'upper':'full':'legacy'}: native rendering passed`);
  }
  const output = Deno.args.includes('--original-only') ? ".verification/skyboxes-originals.json"
    : Deno.args.includes('--max-only') ? ".verification/skyboxes-2048.json" : ".verification/skyboxes.json";
  await Deno.writeTextFile(output, JSON.stringify({ passed: true, results }, null, 2));
} finally { await shutdown(); }
