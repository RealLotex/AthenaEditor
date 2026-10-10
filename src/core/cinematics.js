// Serializable timeline data and one playback clock shared by Game and PS2.
const CINEMATIC_TRACKS = [
  {id:"dialogue", label:"Dialogue"}, {id:"portrait", label:"Portrait"},
  {id:"panel", label:"Text window"}, {id:"sfx", label:"SFX"}, {id:"voice", label:"Voice"},
  {id:"fade", label:"Screen fade"},
  {id:"camera", label:"Camera shot"}, {id:"transform", label:"Transform"},
  {id:"animation", label:"Character animation"}, {id:"mesh", label:"Mesh visibility"},
  {id:"particles", label:"Particles"},
];
const CINEMATIC_EVENTS = [
  {value:"sceneStart",label:"Scene starts"}, {value:"timer",label:"Timer finishes"},
  {value:"beforeSceneEnd",label:"Before scene ends"},
  {value:"onCollisionEnter",label:"Collision — enter"}, {value:"onCollisionExit",label:"Collision — exit"},
  {value:"onTriggerEnter",label:"Overlap — enter"}, {value:"onTriggerExit",label:"Overlap — exit"},
  {value:"custom",label:"Custom event"}, {value:"manual",label:"Manual / script"},
];
function mkSequence() {
  return {id:uid(), name:"Cinematic", event:{type:"sceneStart", seconds:3, name:"", objectId:"", otherId:""}, tracks:[]};
}
function mkCinematicTrack(type) {
  if (!CINEMATIC_TRACKS.some(t=>t.id===type)) throw new Error("Unknown timeline channel");
  return {id:uid(), type, name:CINEMATIC_TRACKS.find(t=>t.id===type).label, clips:[]};
}
function mkCinematicClip(type, start=0) {
  const c = {id:uid(), name:"Clip", start, duration:2};
  if(['transform','camera','fade'].includes(type))Object.assign(c,{curve:'linear',bezier:[.25,.1,.25,1],keys:[]});
  if(['dialogue','portrait','panel'].includes(type))Object.assign(c,{fadeIn:0,fadeOut:0});
  if(type==='fade')Object.assign(c,{name:'Screen fade',fromAlpha:0,toAlpha:128,color:{r:0,g:0,b:0,a:128}});
  if (["dialogue","portrait","panel"].includes(type)) Object.assign(c,{x:32,y:320,width:576,height:96});
  if(type==="dialogue") Object.assign(c,{name:"Dialogue",text:"Write dialogue here…",speaker:"",fontSize:20});
  if(type==="portrait") Object.assign(c,{name:"Portrait",file:"",x:32,y:180,width:128,height:128});
  if(type==="panel") Object.assign(c,{name:"Text window",color:{r:24,g:24,b:40,a:110}});
  if(["sfx","voice"].includes(type)) Object.assign(c,{name:type==="voice"?"Voice":"SFX",file:"",loop:false});
  if(type==="camera") Object.assign(c,{name:"Camera shot",transitionIn:0,position:{x:0,y:3,z:8},target:{x:0,y:1,z:0},toPosition:{x:0,y:3,z:8},toTarget:{x:0,y:1,z:0}});
  if(type==="transform") Object.assign(c,{objectId:"",property:"position",from:{x:0,y:0,z:0},to:{x:0,y:0,z:0}});
  if(type==="animation") Object.assign(c,{objectId:"",file:"",animation:"",loop:false,weight:1,blendIn:0,blendOut:0,curve:'linear'});
  if(type==="mesh") Object.assign(c,{objectId:"",visible:false});
  if(type==="particles") Object.assign(c,{objectId:"",count:16,speed:2,size:.1});
  return c;
}
function sequenceDuration(s) {
  return Math.max(0,...s.tracks.flatMap(t=>t.clips.map(c=>c.start+c.duration)));
}
// The shipped font renderer counts UTF-8 bytes as two-byte glyphs. Common
// typography can be represented safely without changing the editable dialogue.
function cinematicNativeText(text) {
  const punctuation={'…':'...','–':'-','—':'-','‘':"'",'’':"'",'“':'"','”':'"','•':'*'};
  return String(text||'').replace(/[…–—‘’“”•]/g,c=>punctuation[c]);
}
function cinematicDialogueLines(c) {
  const limit=Math.max(1,Math.floor(c.width/(c.fontSize*.6))),lines=[];
  const text=cinematicNativeText((c.speaker?c.speaker+':\n':'')+c.text);
  for(const paragraph of text.split('\n')) {
    let line='';
    for(const word of paragraph.split(/\s+/)) {
      if(line&&line.length+word.length+1>limit){lines.push(line);line='';}
      line+=(line?' ':'')+word;
      while(line.length>limit){lines.push(line.slice(0,limit));line=line.slice(limit);}
    }
    lines.push(line);
  }
  return lines.slice(0,Math.ceil(c.height/(c.fontSize*1.2)));
}
const CINEMATIC_GLTF_CACHE=new WeakMap();
function cinematicGltfInfo(asset) {
  if(!asset||! /\.(gltf|glb)$/i.test(asset.name))return null;
  const cached=CINEMATIC_GLTF_CACHE.get(asset);
  if(cached&&cached.content===asset.content&&cached.dataUrl===asset.dataUrl)return cached.info;
  let info=null;
  try {
    if(/\.gltf$/i.test(asset.name))info=JSON.parse(asset.content??new TextDecoder().decode(bytesFromDataUrl(asset.dataUrl,Infinity)));
    else {
      const header=bytesFromDataUrl(asset.dataUrl,20),view=new DataView(header.buffer);
      if(view.getUint32(0,true)===0x46546c67&&view.getUint32(4,true)===2&&view.getUint32(16,true)===0x4e4f534a){
        const end=20+view.getUint32(12,true),bytes=bytesFromDataUrl(asset.dataUrl,end);
        info=JSON.parse(new TextDecoder().decode(bytes.subarray(20,end)));
      }
    }
  }catch{}
  CINEMATIC_GLTF_CACHE.set(asset,{content:asset.content,dataUrl:asset.dataUrl,info});return info;
}
function cinematicAnimationNames(asset) {
  return (cinematicGltfInfo(asset)?.animations||[]).map((a,i)=>a.name||`Animation_${i}`);
}
function cinematicProblems(scene, files=[]) {
  const out=[], ids=new Set(), clipIds=new Set(), trackIds=new Set(), objects=exportableObjects(scene.objects||[]);
  const error=(s,m)=>out.push({level:"error",component:"timeline",message:`Timeline "${s.name}": ${m}`});
  const mixed=cinematicMixedClips(scene.sequences||[]);
  for(const s of scene.sequences||[]) {
    if(ids.has(s.id)||!s.id) error(s,"sequence IDs must be unique."); ids.add(s.id);
    if(!CINEMATIC_EVENTS.some(e=>e.value===s.event?.type)) error(s,"choose a valid start event.");
    if(s.event?.type==="timer"&&(!Number.isFinite(s.event.seconds)||s.event.seconds<0)) error(s,"timer must be non-negative.");
    if(s.event?.type==="custom"&&!s.event.name?.trim()) error(s,"enter the custom event name.");
    if(s.event?.type?.startsWith("on")) {
      const o=objects.find(o=>o.id===s.event.objectId);
      if(!scene.physics?.enabled||!o?.components.rigidbody?.collisionEvents) error(s,"the start event needs an exported collider with Generate Collision / Overlap Events enabled.");
      if(s.event.otherId&&!objects.some(o=>o.id===s.event.otherId&&o.components.rigidbody)) error(s,"Only With references a missing collider.");
    }
    for(const t of s.tracks||[]) {
      if(!t.id||trackIds.has(t.id))error(s,"channel IDs must be unique.");trackIds.add(t.id);
      if(!CINEMATIC_TRACKS.some(k=>k.id===t.type)) {error(s,"unknown channel type.");continue;}
      const sorted=[...t.clips].sort((a,b)=>a.start-b.start);
      for(let i=0;i<sorted.length;i++) {
        const c=sorted[i];
        if(!c.id||clipIds.has(c.id))error(s,"clip IDs must be unique.");clipIds.add(c.id);
        if(!Number.isFinite(c.start)||c.start<0||!Number.isFinite(c.duration)||c.duration<=0) error(s,"clips need a non-negative start and positive duration.");
        const validCurve=curve=>!curve||CINEMATIC_CURVES.some(option=>option.value===curve);
        const validBezier=bezier=>!bezier||Array.isArray(bezier)&&bezier.length===4&&bezier.every(Number.isFinite)&&bezier[0]>=0&&bezier[0]<=1&&bezier[2]>=0&&bezier[2]<=1;
        if(!validCurve(c.curve)||!validBezier(c.bezier))error(s,`"${c.name}" needs a valid interpolation curve.`);
        for(const field of ['fadeIn','fadeOut','transitionIn','blendIn','blendOut'])if(c[field]!==undefined&&(!Number.isFinite(c[field])||c[field]<0||c[field]>c.duration))error(s,`"${c.name}": ${field} must fit within the clip duration.`);
        if(c.keys!==undefined&&!Array.isArray(c.keys))error(s,`"${c.name}" has invalid keyframes.`);
        if(Array.isArray(c.keys)&&c.keys.length){
          const vector=v=>v&&['x','y','z'].every(axis=>Number.isFinite(v[axis]));
          const value=v=>t.type==='fade'?Number.isFinite(v)&&v>=0&&v<=128:t.type==='camera'?vector(v?.position)&&vector(v?.target):t.type==='transform'?vector(v):false;
          const keyIds=new Set();
          for(let k=0;k<c.keys.length;k++){
            const key=c.keys[k];
            if(!key||!key.id||keyIds.has(key.id)||!Number.isFinite(key.time)||key.time<0||key.time>c.duration+1e-6||k>0&&c.keys[k-1].time>=key.time||!value(key.value)||!validCurve(key.curve)||!validBezier(key.bezier))error(s,`"${c.name}" needs unique, ordered keyframes with valid values inside the clip.`);
            keyIds.add(key?.id);
          }
        }
        if(t.type==='fade'&&(!c.color||!['r','g','b'].every(k=>Number.isFinite(c.color[k])&&c.color[k]>=0&&c.color[k]<=255)||!['fromAlpha','toAlpha'].every(k=>Number.isFinite(c[k])&&c[k]>=0&&c[k]<=128)))error(s,`"${c.name}" needs a fade color and opacity 0–128.`);
        if(t.type!=='animation'&&i&&sorted[i-1].start+sorted[i-1].duration>c.start+1e-6) error(s,`clips overlap in channel "${t.name}". Use another channel for simultaneous clips.`);
        if(["transform","animation","mesh","particles"].includes(t.type)&&!objects.some(o=>o.id===c.objectId&&o.components.model)) error(s,`"${c.name}" needs an exported Model target.`);
        const cat=t.type==="portrait"?"textures":["voice","sfx"].includes(t.type)?"sounds":t.type==="animation"?"models":null;
        if(cat&&(!c.file||!files.some(f=>f.cat===cat&&f.name===c.file&&(f.dataUrl||f.content!==undefined)))) error(s,`"${c.name}" needs an imported ${cat} asset.`);
        if(t.type==="animation"&&!c.animation?.trim()) error(s,"enter the animation clip name.");
        if(t.type==='animation'){
          const asset=files.find(f=>f.cat==='models'&&f.name===c.file),info=cinematicGltfInfo(asset);
          const target=objects.find(o=>o.id===c.objectId),model=cinematicGltfInfo(files.find(f=>f.cat==='models'&&f.name===target?.components.model?.file));
          if(!info||!(info.animations||[]).some((a,i)=>(a.name||`Animation_${i}`)===c.animation))error(s,'choose an animation present in a glTF / GLB asset.');
          if(!model?.skins?.length)error(s,'character animations require a skinned glTF / GLB Model target.');
          if(info&&[...(info.buffers||[]),...(info.images||[])].some(a=>a.uri&&!a.uri.startsWith('data:')))error(s,'animation assets must be self-contained glTF / GLB files.');
          if(!Number.isFinite(c.weight??1)||(c.weight??1)<0||(c.weight??1)>1)error(s,'animation weight must be between 0 and 1.');
          if(mixed.has(c.id)&&asset&&model)try{compileCinematicAnimation(asset,files.find(f=>f.cat==='models'&&f.name===target.components.model.file),c.animation);}catch(e){error(s,e.message);}
        }
        if(['dialogue','portrait','panel'].includes(t.type)&&(['x','y','width','height'].some(k=>!Number.isFinite(c[k]))||c.width<=0||c.height<=0))error(s,"UI clips need finite coordinates and positive dimensions.");
        if(t.type==='dialogue'){
          if(!Number.isFinite(c.fontSize)||c.fontSize<=0)error(s,"dialogue font size must be positive.");
          if(/[^\u0000-\u07ff]/u.test(cinematicNativeText((c.speaker||'')+(c.text||''))))error(s,"the bundled font renderer supports Latin, Greek and Cyrillic text; this dialogue contains unsupported characters.");
        }
        if(t.type==='panel'&&(!c.color||['r','g','b','a'].some(k=>!Number.isFinite(c.color[k])||c.color[k]<0||c.color[k]>(k==='a'?128:255))))error(s,"text window colors need RGB 0–255 and alpha 0–128.");
        if(t.type==="transform"&&!['position','rotation','scale'].includes(c.property)) error(s,"unknown transform property.");
        const vectors=t.type==="camera"?[c.position,c.target,c.toPosition,c.toTarget]:t.type==="transform"?[c.from,c.to]:[];
        if(vectors.some(v=>!v||['x','y','z'].some(k=>!Number.isFinite(v[k])))) error(s,"invalid vector values.");
        if(t.type==="particles"&&(!Number.isInteger(c.count)||c.count<1||c.count>64||!Number.isFinite(c.speed)||!Number.isFinite(c.size)||c.size<=0)) error(s,"particles need 1–64 instances and a positive size.");
      }
    }
    // Two tracks must not fight over the same animated property.
    const writes=s.tracks.flatMap(t=>t.clips.map(c=>({c,key:['camera','fade'].includes(t.type)?t.type:['sfx','voice'].includes(t.type)?'audio':['transform','mesh'].includes(t.type)?`${t.type}:${c.objectId}:${c.property||''}`:t.type==='particles'&&objects.find(o=>o.id===c.objectId)?.components.particles?`particles:${c.objectId}`:null})));
    for(let i=0;i<writes.length;i++) for(let j=i+1;j<writes.length;j++) {
      const a=writes[i],b=writes[j];
      if(a.key&&a.key===b.key&&a.c.start<b.c.start+b.c.duration&&b.c.start<a.c.start+a.c.duration) error(s,a.key==='audio'?"voice and SFX clips cannot overlap: AthenaEnv has one streaming player.":"simultaneous clips cannot control the same property.");
    }
  }
  const sequences=scene.sequences||[];
  for(let i=0;i<sequences.length;i++)for(let j=i+1;j<sequences.length;j++){
    const a=sequences[i],b=sequences[j],x=a.event,y=b.event;
    const type=e=>e?.type==='custom'?e.name:e?.type;
    if(['timer','manual'].includes(x?.type)||['timer','manual'].includes(y?.type))continue;
    if(type(x)===type(y)&&(!x.objectId||!y.objectId||x.objectId===y.objectId)&&(!x.otherId||!y.otherId||x.otherId===y.otherId))error(b,`start event conflicts with "${a.name}". Only one sequence can own the scene.`);
  }
  return out;
}
