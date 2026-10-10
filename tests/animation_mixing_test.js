import {assert,assertEquals,assertAlmostEquals,assertThrows} from 'jsr:@std/assert@1';
import {encodeBase64} from 'jsr:@std/encoding@1/base64';
import {load} from './_load.js';
const A=await load();
function asset(interpolation='LINEAR'){
  const values=interpolation==='CUBICSPLINE'?[0,0,0,0,0,0,4,0,0,4,0,0,4,0,0,0,0,0]:[0,0,0,4,0,0];
  const floats=new Float32Array([0,1,...values]);return {cat:'models',name:'skin.gltf',content:JSON.stringify({asset:{version:'2.0'},nodes:[{name:'Root'}],skins:[{joints:[0]}],buffers:[{byteLength:floats.byteLength,uri:'data:application/octet-stream;base64,'+encodeBase64(new Uint8Array(floats.buffer))}],bufferViews:[{buffer:0,byteLength:8},{buffer:0,byteOffset:8,byteLength:values.length*4}],accessors:[{bufferView:0,componentType:5126,count:2,type:'SCALAR'},{bufferView:1,componentType:5126,count:values.length/3,type:'VEC3'}],animations:[{name:'Move',samplers:[{input:0,output:1,interpolation}],channels:[{sampler:0,target:{node:0,path:'translation'}}]}]})};
}
const base=new Float64Array([0,0,0,0,0,0,1,1,1,1]);
Deno.test('compiler reads self-contained animation buffers, samples linear, step and cubic keys, and fails early on incompatible bones',()=>{
  for(const interpolation of ['LINEAR','STEP','CUBICSPLINE']){const source=asset(interpolation),data=A.compileCinematicAnimation(source,source,'Move'),out=new Float64Array(10);A.sampleCinematicPose(data,.5,false,base,out);assertAlmostEquals(out[0],interpolation==='STEP'?0:2);A.sampleCinematicPose(data,2,false,base,out);assertEquals(out[0],4);A.sampleCinematicPose(data,1.5,true,base,out);assertEquals(out[0],interpolation==='STEP'?0:2);}
  const source=asset(),target={...source,content:source.content.replace('Root','Different')};assertThrows(()=>A.compileCinematicAnimation(source,target,'Move'),Error,'same bone names');
  const doc=JSON.parse(source.content);doc.accessors[1].sparse={};source.content=JSON.stringify(doc);assertThrows(()=>A.compileCinematicAnimation(source,source,'Move'),Error,'non-sparse');
});
Deno.test('rotation uses shortest-arc slerp and weighted overlap preserves normalized quaternions and restores one captured pose',()=>{
  const out=new Float64Array(4);A.cinematicQuaternionLerp(out,0,[0,0,0,1],0,[0,-1,0,0],0,.5);assertAlmostEquals(Math.abs(out[1]),Math.SQRT1_2);assertAlmostEquals(out[3],Math.SQRT1_2);
  let pose=new Float64Array(base),stops=0,resumes=0;const mixer=new A.CinematicPoseMixer({read:()=>new Float64Array(pose),write:(_m,p)=>pose.set(p),stop:()=>stops++,resume:()=>resumes++}),source=asset(),data=A.compileCinematicAnimation(source,source,'Move');
  const first={...A.mkCinematicClip('animation'),objectId:'hero',weight:1,blendOut:1,duration:2},second={...first,id:'second',blendOut:0,blendIn:1};
  const a=mixer.enter({},first,data),b=mixer.enter({},second,{...data,channels:[{bone:0,offset:0,width:3,interpolation:'LINEAR',times:[0,1],values:[4,0,0,8,0,0]}]});
  mixer.sample(a,1.5);mixer.sample(b,.5);mixer.flush();assertAlmostEquals(pose[0],5);assertEquals(stops,1);mixer.exit(a);assertEquals(resumes,0);mixer.exit(b);assertEquals(resumes,1);assertEquals([...pose],[...base]);
});
Deno.test('animation overlap is allowed and requests pose mixing; other component overlaps still fail',()=>{
  const p=A.mkProject(),s=p.scenes[0],o=A.mkObject('hero'),f=asset();o.components.model={...A.makeComponent('model'),file:f.name};s.objects=[o];p.assets=[f];
  const sequence=A.mkSequence(),track=A.mkCinematicTrack('animation');track.clips=[{...A.mkCinematicClip('animation'),objectId:o.id,file:f.name,animation:'Move'},{...A.mkCinematicClip('animation',1),objectId:o.id,file:f.name,animation:'Move'}];sequence.tracks=[track];s.sequences=[sequence];
  assertEquals(A.cinematicProblems(s,p.assets),[]);assertEquals(A.cinematicMixedClips([sequence]).size,2);const result=A.generateProject(p);assertEquals(result.diagnostics.filter(d=>d.level==='error'),[]);assert(result.main.includes('new CinematicPoseMixer'));new Function(result.main);
  track.clips[1].weight=2;assert(A.cinematicProblems(s,p.assets).some(p=>p.message.includes('weight')));
});
