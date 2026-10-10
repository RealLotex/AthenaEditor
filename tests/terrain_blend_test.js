import {assert,assertEquals,assertThrows} from 'jsr:@std/assert@1';
import {load} from './_load.js';
const A=await load();
const tiles=[[255,0,0],[0,255,0],[0,0,255],[70,70,70]].map(c=>({width:1,height:1,data:new Uint8ClampedArray([...c,255])}));

Deno.test('hill strokes form rounded peaks with a smooth edge and remain reversible',()=>{
  const t=A.makeTerrain(16,16),tool={mode:'hills',size:16,strength:1},next=A.terrainBrush(t,{x:0,z:0},tool),row=x=>next.hills[8*17+x];
  assertEquals(row(8),1);assertEquals(row(0),0);assert(row(9)>.95&&row(15)<.05);
  const undo=A.terrainBrush(next,{x:0,z:0},{...tool,reverse:true});assert(undo.hills.every(h=>Math.abs(h)<1e-8));
});

Deno.test('blended terrain transitions mix adjacent surfaces inside one hardware-sized atlas',()=>{
  const t=A.makeTerrain(8,8);t.blend=true;t.blendSize=512;for(let z=0;z<8;z++)for(let x=4;x<8;x++)t.surfaces[z*8+x]=1;
  const image=A.terrainBlendedPixels(t,tiles),pixel=x=>Array.from(image.data.subarray((192*512+x)*4,(192*512+x)*4+4));
  assertEquals(pixel(32),[255,0,0,255]);assertEquals(pixel(480),[0,255,0,255]);
  const border=pixel(256);assert(border[0]>120&&border[0]<135&&border[1]>120&&border[1]<135);assertEquals(border[2],0);
  const mesh=A.terrainMesh(t);assert(mesh.uvs.every(uv=>uv.every(v=>v>=0&&v<=1)));
  assert(mesh.faces.filter(f=>A.meshFaceNormal(mesh,f).y>.99).every(f=>f.every(c=>mesh.uvs[c.uv][1]>.25)));
});

Deno.test('blended terrain can prefer resolution over colors and rejects unsupported settings',async()=>{
  const t=A.makeTerrain(4,4);t.blend=true;t.blendSize=1024;t.blendBits=4;
  const asset=await A.textureOutputAsset(A.terrainBlendedPixels(t,tiles),'blend.png',16);
  assertEquals(A.textureVRAMBytes(asset),524544);assertEquals(asset.image.bpp,4);
  assertThrows(()=>A.terrainBlendedPixels({...t,blendSize:4096},tiles));
});
