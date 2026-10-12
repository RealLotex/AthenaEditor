function tourToneAsset() {
  const rate=11025,count=Math.floor(rate*.35),buffer=new ArrayBuffer(44+count*2),view=new DataView(buffer),bytes=new Uint8Array(buffer);
  const word=(at,text)=>{for(let i=0;i<text.length;i++)bytes[at+i]=text.charCodeAt(i);};
  word(0,'RIFF');view.setUint32(4,buffer.byteLength-8,true);word(8,'WAVEfmt ');view.setUint32(16,16,true);view.setUint16(20,1,true);view.setUint16(22,1,true);view.setUint32(24,rate,true);view.setUint32(28,rate*2,true);view.setUint16(32,2,true);view.setUint16(34,16,true);word(36,'data');view.setUint32(40,count*2,true);
  for(let i=0;i<count;i++)view.setInt16(44+i*2,Math.sin(i/rate*660*Math.PI*2)*Math.sin(i/count*Math.PI)**2*5000,true);
  return {name:'tour_chime.wav',cat:'sounds',dataUrl:bytesDataURL(bytes,'audio/wav'),size:bytes.length,owned:true};
}
function tourAnimatedModelAsset() {
  const arrays=[new Float32Array([-.5,0,0,.5,0,0,.5,2,0,-.5,2,0]),new Float32Array([0,0,1,0,0,1,0,0,1,0,0,1]),new Uint16Array(16),new Float32Array([1,0,0,0,1,0,0,0,1,0,0,0,1,0,0,0]),new Uint16Array([0,1,2,0,2,3]),new Float32Array([1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]),new Float32Array([0,.5,1]),new Float32Array([0,0,0,0,.6,0,0,0,0])];
  const bufferViews=[];let length=0;for(const a of arrays){length=Math.ceil(length/4)*4;bufferViews.push({buffer:0,byteOffset:length,byteLength:a.byteLength});length+=a.byteLength;}
  const bytes=new Uint8Array(length);arrays.forEach((a,i)=>bytes.set(new Uint8Array(a.buffer),bufferViews[i].byteOffset));
  const accessors=[{componentType:5126,count:4,type:'VEC3',min:[-.5,0,0],max:[.5,2,0]},{componentType:5126,count:4,type:'VEC3'},{componentType:5123,count:4,type:'VEC4'},{componentType:5126,count:4,type:'VEC4'},{componentType:5123,count:6,type:'SCALAR'},{componentType:5126,count:1,type:'MAT4'},{componentType:5126,count:3,type:'SCALAR',min:[0],max:[1]},{componentType:5126,count:3,type:'VEC3'}].map((a,i)=>({...a,bufferView:i}));
  const content=JSON.stringify({asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[{name:'Guide',mesh:0,skin:0},{name:'Root'}],skins:[{joints:[1],inverseBindMatrices:5}],buffers:[{byteLength:length,uri:bytesDataURL(bytes,'application/octet-stream')}],bufferViews,accessors,meshes:[{primitives:[{attributes:{POSITION:0,NORMAL:1,JOINTS_0:2,WEIGHTS_0:3},indices:4}]}],animations:[{name:'Wave',samplers:[{input:6,output:7,interpolation:'LINEAR'}],channels:[{sampler:0,target:{node:1,path:'translation'}}]}]});
  return {name:'tour_actor.gltf',cat:'models',content,size:content.length,owned:true};
}
let tourExampleAssetsPromise=null;
async function prepareTourExampleAssets() {
  if(!tourExampleAssetsPromise)tourExampleAssetsPromise=(async()=>{
    const size=64,data=new Uint8ClampedArray(size*size*4);
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const frame=Math.floor(x/16)+Math.floor(y/16)*4,u=x%16/16-.5,v=y%16/16-.5,r=Math.hypot(u,v),a=clamp(1-r*2,0,1),at=(y*size+x)*4;
      data[at]=255;data[at+1]=80+frame*9;data[at+2]=30;data[at+3]=Math.round(a*(1-frame/20)*255);
    }
    const flipbook={...await textureOutputAsset({width:size,height:size,data},'tour_flipbook.png',16),owned:true};
    const portrait={...await textureOutputAsset(particleSpritePixels(true,64),'tour_portrait.png',16),owned:true};
    return [tourToneAsset(),tourAnimatedModelAsset(),flipbook,portrait];
  })();
  return tourExampleAssetsPromise;
}
