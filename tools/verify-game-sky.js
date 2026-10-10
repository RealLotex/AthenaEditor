// Reproduce the downward 55-degree camera with an upper-only 16-bit sky.
import { load, shutdown } from "../tests/_load.js";
import { runConsoleFixture } from "./run-console-fixture.js";
import { assert, assertEquals } from "jsr:@std/assert@1";
const A=await load();
try{
 const results=[];
 for(const backdropMode of A.SKYBOX_BACKDROPS){
  const p=A.mkProject("Game sky regression"),s=p.scenes[0];
  s.objects=[];s.defaultCameraRig=false;s.camera={...s.camera,position:A.v3(0,4.75,7.51),target:A.v3(0,2,0),fov:55};
  const settings={enabled:true,preset:"clear",textureSize:1024,bitDepth:16,upperOnly:true,textureFilter:"NEAREST",backdropMode};
  A.applySkybox(p,s,settings,await A.prepareSkyboxLayout(A.skyboxPresetAsset("clear"),settings));
  const probe=A.mkObject("Probe");probe.components.script={...A.makeComponent("script"),file:"Probe.js"};s.objects.push(probe);
  p.scripts.push({name:"Probe.js",content:`export function update(ctx){if(ctx.frame===60){const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'DONE',frame:ctx.frame})+String.fromCharCode(10));f.close();}}`});
  const generated=A.generateProject(p);assert(!generated.diagnostics.some(d=>d.level==="error"));
  const obj=generated.assets.find(f=>f.filename.endsWith('atheditor_skybox.obj')),mesh=A.readMeshOBJ(obj.content);
  const backdrop=backdropMode==='mirror'?null:A.skyboxBackdropGeometry(settings);
  const expected=backdrop?.colors.map((v,i)=>i%4===3?v-1:v);
  const inspect=`{const textures=[],positions=new Float32Array(skybox_data.vertices.positions),values=new Float64Array(positions.length);values.set(positions);let lowerCorners=0;for(let i=1;i<values.length;i+=4)if(values[i]<-.99)lowerCorners++;for(let i=0,image;(image=skybox_data.getTexture(i));i++)textures.push({width:image.texWidth,height:image.texHeight,bpp:image.bpp,nearest:image.filter===NEAREST});let backdropCorners=0,maxColorError=0;${backdrop?`{const raw=new Float32Array(sky_backdrop_data.vertices.colors),colors=new Float64Array(raw.length),expected=JSON.parse(${JSON.stringify(JSON.stringify(expected))});colors.set(raw);backdropCorners=colors.length/4;for(let i=0;i<colors.length;i++)maxColorError=Math.max(maxColorError,Math.abs(colors[i]-expected[i]));}`:''}const f=std.open('probe.log','a');f.puts(JSON.stringify({tag:'SKY',textures,corners:positions.length/4,lowerCorners,backdropCorners,maxColorError})+String.fromCharCode(10));f.close();}\n`;
  generated.main=generated.main.replace('Screen.display(() => {',inspect+'Screen.display(() => {');
  const log=await runConsoleFixture(generated,{timeoutMs:30000}),data=JSON.parse(log.split(/\r?\n/).find(l=>l.includes('"tag":"SKY"')));
  const lowerCorners=mesh.faces.flat().filter(c=>mesh.positions[c.v][1]<-.99).length;
  assert(log.includes('"tag":"DONE"'));assertEquals(data.corners,mesh.faces.length*3);assertEquals(data.lowerCorners,lowerCorners);
  assertEquals(data.backdropCorners,backdrop?backdrop.positions.length/3:0);assert(data.maxColorError<1e-6);
  assertEquals(data.textures,[{width:1024,height:512,bpp:16,nearest:true},{width:1024,height:512,bpp:16,nearest:true}]);
  results.push({passed:true,backdropMode,camera:s.camera,...data});
  console.log(`Downward Game camera: ${backdropMode}, native colors and two 16-bit textures passed 60 frames.`);
 }
 await Deno.writeTextFile('.verification/game-sky-native.json',JSON.stringify(results,null,2));
}finally{await shutdown();}
