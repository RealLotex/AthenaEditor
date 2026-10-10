// Decode animation data once in the editor. The PS2 receives compact channels,
// so its frame loop needs neither a glTF parser nor new native render handles.
const CINEMATIC_ANIMATION_CACHE=new WeakMap();
function cinematicAnimationDocument(asset){
  const info=cinematicGltfInfo(asset);if(!info)throw Error('Animation mixing needs a glTF / GLB asset.');
  let binary=null;
  if(/\.glb$/i.test(asset.name)){
    const bytes=bytesFromDataUrl(asset.dataUrl,Infinity),view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
    for(let offset=12;offset+8<=bytes.length;){const length=view.getUint32(offset,true),type=view.getUint32(offset+4,true);if(offset+8+length>bytes.length)throw Error('Truncated GLB buffer.');if(type===0x004e4942)binary=bytes.subarray(offset+8,offset+8+length);offset+=8+length;}
  }
  const buffers=(info.buffers||[]).map(b=>b.uri?.startsWith('data:')?bytesFromDataUrl(b.uri,Infinity):!b.uri&&binary?binary:null);
  if(buffers.some((b,i)=>!b||b.length<info.buffers[i].byteLength))throw Error('Animation mixing requires self-contained, complete buffers.');
  return {info,buffers};
}
function cinematicAnimationAccessor(doc,index,type){
  const a=doc.info.accessors?.[index],width={SCALAR:1,VEC3:3,VEC4:4}[type];
  if(!a||a.componentType!==5126||a.type!==type||a.sparse||!Number.isInteger(a.count)||a.count<1)throw Error('Animation channels need non-sparse float '+type+' accessors.');
  const b=doc.info.bufferViews?.[a.bufferView],bytes=doc.buffers[b?.buffer],stride=b?.byteStride||width*4,start=(b?.byteOffset||0)+(a.byteOffset||0);
  if(!bytes||stride<width*4||start+(a.count-1)*stride+width*4>bytes.length|| (a.byteOffset||0)+(a.count-1)*stride+width*4>b.byteLength)throw Error('Animation accessor exceeds its buffer.');
  const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength),values=[];
  for(let i=0;i<a.count;i++)for(let j=0;j<width;j++){const value=view.getFloat32(start+i*stride+j*4,true);if(!Number.isFinite(value))throw Error('Animation channels contain non-finite values.');values.push(value);}
  return values;
}
function compileCinematicAnimation(source,target,name){
  let cache=CINEMATIC_ANIMATION_CACHE.get(source);if(!cache){cache=new WeakMap();CINEMATIC_ANIMATION_CACHE.set(source,cache);}let targetCache=cache.get(target);
  if(!targetCache){targetCache=new Map();cache.set(target,targetCache);}const cached=targetCache.get(name);
  if(cached&&cached.source===source.content&&cached.target===target.content&&cached.sourceUrl===source.dataUrl&&cached.targetUrl===target.dataUrl)return cached.data;
  const doc=cinematicAnimationDocument(source),model=cinematicGltfInfo(target),animation=doc.info.animations?.find((a,i)=>(a.name||'Animation_'+i)===name);
  if(!animation||model?.skins?.length!==1||doc.info.skins?.length!==1)throw Error('Animation mixing requires an animation and one compatible skeleton per asset.');
  const sourceJoints=doc.info.skins[0].joints,targetJoints=model.skins[0].joints;
  const sourceNames=sourceJoints.map((id,i)=>doc.info.nodes[id]?.name||'Bone_'+i),targetNames=targetJoints.map((id,i)=>model.nodes[id]?.name||'Bone_'+i);
  if(sourceNames.length!==targetNames.length||sourceNames.some((n,i)=>n!==targetNames[i]))throw Error('Animation and model must have the same bone names and joint order.');
  if(targetJoints.some(id=>model.nodes[id]?.matrix))throw Error('Convert bone matrices to position / quaternion / scale before mixing.');
  const channels=[],written=new Set();let duration=0;
  for(const c of animation.channels||[]){
    const bone=sourceJoints.indexOf(c.target?.node);if(bone<0)continue;
    const path=c.target.path,width=path==='rotation'?4:3,offset=path==='translation'?0:path==='rotation'?3:path==='scale'?7:-1;
    if(offset<0)throw Error('Mixing supports bone translation, rotation and scale channels.');
    const sampler=animation.samplers?.[c.sampler],interpolation=sampler?.interpolation||'LINEAR';
    if(!['LINEAR','STEP','CUBICSPLINE'].includes(interpolation))throw Error('Unknown animation interpolation.');
    const times=cinematicAnimationAccessor(doc,sampler?.input,'SCALAR'),values=cinematicAnimationAccessor(doc,sampler?.output,width===4?'VEC4':'VEC3');
    if(times.some((t,i)=>t<0||i>0&&times[i-1]>=t)||values.length!==times.length*width*(interpolation==='CUBICSPLINE'?3:1))throw Error('Animation keys must be ordered and match their channel values.');
    if(written.has(bone+':'+path))throw Error('Animation has duplicate channels for a bone property.');written.add(bone+':'+path);
    duration=Math.max(duration,times[times.length-1]);channels.push({bone,offset,width,interpolation,times,values});
  }
  if(!channels.length)throw Error('Animation has no bone channels for this model.');
  const data={duration,boneCount:targetJoints.length,channels};targetCache.set(name,{source:source.content,target:target.content,sourceUrl:source.dataUrl,targetUrl:target.dataUrl,data});return data;
}
function cinematicMixedClips(sequences){
  const result=new Set();
  for(const s of sequences){const clips=s.tracks.filter(t=>t.type==='animation').flatMap(t=>t.clips),mixed=new Set();
    for(let i=0;i<clips.length;i++){const a=clips[i];if(a.blendIn||a.blendOut||(a.weight??1)!==1)mixed.add(a.objectId);
      for(let j=i+1;j<clips.length;j++){const b=clips[j];if(a.objectId===b.objectId&&a.start<b.start+b.duration&&b.start<a.start+a.duration)mixed.add(a.objectId);}}
    for(const c of clips)if(mixed.has(c.objectId))result.add(c.id);
  }return result;
}
function cinematicAnimationWeight(clip,age){
  return (clip.weight??1)*Math.max(0,Math.min(clip.blendIn?cinematicCurve(age/clip.blendIn,clip.curve):1,clip.blendOut?cinematicCurve((clip.duration-age)/clip.blendOut,clip.curve):1));
}
function cinematicQuaternionLerp(out,offset,a,ai,b,bi,t){
  let dot=0;for(let j=0;j<4;j++)dot+=a[ai+j]*b[bi+j];const sign=dot<0?-1:1;dot=Math.abs(dot);let wa=1-t,wb=t;
  if(dot<.9995){const theta=Math.acos(Math.min(1,dot)),sin=Math.sin(theta);wa=Math.sin((1-t)*theta)/sin;wb=Math.sin(t*theta)/sin;}
  let length=0;for(let j=0;j<4;j++){const v=a[ai+j]*wa+b[bi+j]*sign*wb;out[offset+j]=v;length+=v*v;}length=Math.sqrt(length)||1;for(let j=0;j<4;j++)out[offset+j]/=length;
}
function sampleCinematicPose(data,age,loop,base,out){
  out.set(base);const time=loop&&data.duration>0?age%data.duration:Math.min(age,data.duration);
  for(const c of data.channels){const times=c.times,values=c.values,width=c.width,stride=width*(c.interpolation==='CUBICSPLINE'?3:1),o=c.bone*10+c.offset;
    let lo=0,hi=times.length-1;if(time>=times[hi])lo=hi;else if(time>times[0]){while(hi-lo>1){const m=(lo+hi)>>1;if(times[m]<=time)lo=m;else hi=m;}}else hi=0;
    const span=times[hi]-times[lo],t=span>0?Math.max(0,Math.min(1,(time-times[lo])/span)):0;
    if(c.interpolation==='CUBICSPLINE'){
      const t2=t*t,t3=t2*t;let length=0;
      for(let j=0;j<width;j++){const a=lo*stride+width+j,b=hi*stride+width+j,value=(2*t3-3*t2+1)*values[a]+(t3-2*t2+t)*span*values[a+width]+(-2*t3+3*t2)*values[b]+(t3-t2)*span*values[b-width];out[o+j]=value;length+=value*value;}
      if(width===4){length=Math.sqrt(length)||1;for(let j=0;j<4;j++)out[o+j]/=length;}
    }else if(c.interpolation==='STEP'||lo===hi){for(let j=0;j<width;j++)out[o+j]=values[lo*stride+j];}
    else if(width===4)cinematicQuaternionLerp(out,o,values,lo*stride,values,hi*stride,t);
    else for(let j=0;j<width;j++)out[o+j]=values[lo*stride+j]+(values[hi*stride+j]-values[lo*stride+j])*t;
  }
}
class CinematicPoseMixer {
  constructor(platform){this.platform=platform;this.groups=new Map();}
  enter(model,clip,data){
    let group=this.groups.get(clip.objectId);
    if(!group){const base=this.platform.read(model);group={model,base,output:new Float64Array(base.length),entries:[],restore:this.platform.stop(model,clip.objectId)};this.groups.set(clip.objectId,group);}
    const compiled={...data,channels:data.channels.map(c=>({...c,times:new Float64Array(c.times),values:new Float64Array(c.values)}))};
    const state={clip,data:compiled,group,pose:new Float64Array(group.base.length),age:0,weight:0};group.entries.push(state);return state;
  }
  sample(state,age){state.age=age;state.weight=cinematicAnimationWeight(state.clip,age);}
  flush(){
    for(const group of this.groups.values()){
      const entries=group.entries,base=group.base,out=group.output;let sum=0;
      for(const e of entries){sum+=e.weight;if(e.weight>0)sampleCinematicPose(e.data,e.age,e.clip.loop,base,e.pose);}
      const scale=sum>1?1/sum:1,baseWeight=Math.max(0,1-sum);
      for(let b=0;b<base.length;b+=10){
        let reference=base;if(baseWeight===0)for(const e of entries)if(e.weight>0){reference=e.pose;break;}
        for(let j=0;j<10;j++)out[b+j]=base[b+j]*baseWeight;
        for(const e of entries){const weight=e.weight*scale;if(weight<=0)continue;const p=e.pose;let dot=0;for(let j=3;j<7;j++)dot+=reference[b+j]*p[b+j];const sign=dot<0?-1:1;
          for(let j=0;j<10;j++)out[b+j]+=p[b+j]*weight*(j>=3&&j<7?sign:1);}
        let norm=0;for(let j=3;j<7;j++)norm+=out[b+j]*out[b+j];norm=Math.sqrt(norm)||1;for(let j=3;j<7;j++)out[b+j]/=norm;
      }this.platform.write(group.model,out);
    }
  }
  exit(state){const g=state.group,index=g.entries.indexOf(state);if(index<0)return;g.entries.splice(index,1);if(g.entries.length)this.flush();else{this.platform.write(g.model,g.base);this.platform.resume(g.model,g.restore);this.groups.delete(state.clip.objectId);}}
}
