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

Deno.test("live shadow passes restore Gouraud and Flat after every silhouette render",()=>{
  const p=A.mkProject(),sc=p.scenes[0];
  for(const shade of ["SHADE_GOURAUD","SHADE_FLAT"]) {
    const obj=A.mkObject(shade);obj.components.model={...A.makeComponent("model"),file:"cube.obj",shade_model:shade};
    obj.components.shadow=A.makeComponent("shadow");sc.objects.push(obj);
  }
  const ir=A.resolveScene(p,sc,[]),e=new A.Emitter();A.emitShadowPass(e,ir);
  const names=["Screen","Camera","Draw","Color","Render"],values=[
    {switchContext(){},setBuffer(){}},{save:()=>({}),target(){},position(){},update(){},restore(){}},
    {rect(){}},{new:()=>0},{PL_DEFAULT:1,PL_NO_LIGHTS:0,setView(){}},
  ];
  const datas=[];let renders=0;
  for(const pass of ir.shadowPasses) {
    const data={shade_model:pass.caster.rd.model.shade_model==="SHADE_FLAT"?0:1,pipeline:1,texture_mapping:true};datas.push(data);
    names.push(pass.rtVN,pass.caster.vn,pass.caster.rd.dataVN);
    values.push({}, {position:{x:0,y:1,z:0},render(){assertEquals(data.shade_model,0);assertEquals(data.texture_mapping,false);renders++;}}, data);
  }
  new Function(...names,e.toString()+"\n_shadowPass();_shadowPass();")(...values);
  assertEquals(renders,4);assertEquals(datas.map(d=>d.shade_model),[1,0]);
  assertEquals(datas.map(d=>[d.pipeline,d.texture_mapping]),[[1,true],[1,true]]);
});
