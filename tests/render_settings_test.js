import { assertEquals } from "jsr:@std/assert@1";
import { load } from "./_load.js";
const A=await load();

function runMeshes(models) {
  const p=A.mkProject(), sc=p.scenes[0];
  for(const [name,model] of models) {
    const obj=A.mkObject(name); obj.components.model={...A.makeComponent("model"),...model}; sc.objects.push(obj);
  }
  const main=A.generateProject(p).main;
  const setup=main.slice(main.indexOf('os.chdir("3dmodels");'),main.indexOf("// Objects"));
  const images=[],datas=[];
  class Image {constructor(){this.filter=0;images.push(this);}}
  class RenderData {
    constructor(file,image){this.file=file;this.textures=image?[image]:[new Image(),new Image()];if(image)image.filter=1;datas.push(this);}
    clone(){const copy=Object.create(RenderData.prototype);Object.assign(copy,this);datas.push(copy);return copy;}
    getTexture(i){return this.textures[i];}
  }
  // Match the release: Render has pipeline/culling constants, but no SHADE_*.
  new Function("RenderData","Render","Image","std","os","NEAREST","LINEAR",setup)(RenderData,{PL_DEFAULT:1,CULL_FACE_BACK:1},Image,{open:()=>({close(){}})},{chdir(){}},0,1);
  return {images,datas};
}

Deno.test("release constructor resets do not override shared NEAREST images and Gouraud never reads a missing Render constant",()=>{
  const {images,datas}=runMeshes([
    ["Smooth",{file:"a.obj",textureFile:"atlas.png",textureFilter:"NEAREST"}],
    ["OtherMesh",{file:"b.obj",textureFile:"atlas.png",textureFilter:"NEAREST"}],
    ["Flat",{file:"a.obj",textureFile:"atlas.png",textureFilter:"NEAREST",shade_model:"SHADE_FLAT"}],
  ]);
  assertEquals(images.length,1); assertEquals(images[0].filter,0);
  assertEquals(datas.map(data=>data.shade_model),[1,1,0]);
});

Deno.test("embedded filtering applies to every material texture without recreating clone images",()=>{
  const {images,datas}=runMeshes([
    ["Embedded",{file:"a.glb",textureFilter:"NEAREST"}],
    ["Clone",{file:"a.glb",textureFilter:"NEAREST",shade_model:"SHADE_FLAT"}],
    ["Linear",{file:"b.obj",textureFile:"atlas.png",textureFilter:"LINEAR"}],
  ]);
  assertEquals(images.map(image=>image.filter),[1,0,0]);
  assertEquals(datas.map(data=>data.shade_model),[1,0,1]);
});
