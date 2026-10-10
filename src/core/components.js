const FLIPBOOK_FIELDS=[
  {key:'columns',label:'Columns',type:'int',min:1,max:16,step:1},
  {key:'rows',label:'Rows',type:'int',min:1,max:16,step:1},
  {key:'fps',label:'Frames / second',type:'number',min:1,max:30,step:1},
];

// ═══════════════════════════════════════════════════════════════════════
//  COMPONENT REGISTRY
//
//  One definition per component drives: the Add-Component menu, the whole
//  Inspector, validation, and the codegen's notion of what exists. Adding a
//  component means adding an entry here plus an emitter in src/codegen/ —
//  nothing else in the UI needs to change.
//
//  field.type values understood by the Inspector (src/panels/inspector-components.jsx):
//    vec3 vec2xz number int bool text enum asset objectRef rgb01 rgba01 rgba255
//  Optional per-field keys:
//    when(c, obj, scene)  show only when this returns true
//    help                 one-line hint under the control
//    warn(c, obj, scene)  return a string to show an inline warning
//    min max step         numeric bounds (also enforced on input)
//    options              [{value,label,help}] for enum
//    cat                  asset category filter for type:"asset"
//    filter(o)            predicate for type:"objectRef"
// ═══════════════════════════════════════════════════════════════════════

// ── shared option lists (mirror AthenaEnv's Render.* constants) ─────────
const PIPELINES = [
  { value: "PL_DEFAULT", label: "Default", help: "Textured, lit" },
  { value: "PL_NO_LIGHTS", label: "No Lights", help: "Flat — cheapest" },
  { value: "PL_SPECULAR", label: "Specular", help: "Adds specular term" },
];
const CULLING = [
  { value: "CULL_FACE_BACK", label: "Back" },
  { value: "CULL_FACE_FRONT", label: "Front" },
  { value: "CULL_FACE_NONE", label: "None", help: "Draws both sides — 2x fill cost" },
];
const SHADING = [
  { value: "SHADE_GOURAUD", label: "Gouraud" },
  { value: "SHADE_FLAT", label: "Flat" },
];
const FILTERS = [
  { value: "LINEAR", label: "Linear" },
  { value: "NEAREST", label: "Nearest", help: "Crisp pixels — good for pixel-art textures" },
];
const BLEND_MODES = [
  { value: "SHADOW_BLEND_DARKEN", label: "Darken", help: "Multiplies the surface — the usual choice" },
  { value: "SHADOW_BLEND_ALPHA", label: "Alpha" },
  { value: "SHADOW_BLEND_ADD", label: "Add", help: "Brightens — for light pools, not shadows" },
];

// ODE geom kinds. `plane` is infinite and cannot move or carry a body.
const GEOM_KINDS = [
  { value: "box", label: "Box", help: "GeomBox — fastest, works for most props" },
  { value: "sphere", label: "Sphere", help: "GeomSphere — cheapest of all" },
  { value: "plane", label: "Plane (infinite)", help: "GeomPlane — static ground. Never moves." },
  { value: "mesh", label: "Mesh (exact)", help: "GeomRenderObject — trimesh from the model. Expensive; static geometry only." },
  { value: "ray", label: "Ray", help: "GeomRay — a probe you cast from a script" },
];

const BODY_MODES = [
  {
    value: "static",
    label: "Static",
    help: "Never moves. Other bodies collide with it. No ODE.Body is created.",
  },
  {
    value: "dynamic",
    label: "Dynamic",
    help: "Falls, tumbles and is pushed by contacts. Its transform is driven by physics each frame.",
  },
  {
    value: "trigger",
    label: "Trigger",
    help: "Reports overlaps to your script but never blocks anything.",
  },
];

// ═══════════════════════════════════════════════════════════════════════
//  Definitions
// ═══════════════════════════════════════════════════════════════════════

const EVENT_ACTION_PRESETS = [
  {id:"playSequence",label:"Play Cinematic",filename:"Event_PlayCinematic.js",action:"ctx.cinematics.play(action.sequenceId);"},
  { id: "playSound", label: "Play Sound Oneshot", filename: "Event_PlaySound.js",
    action: "action.sound.loop = false; action.sound.pause(); action.sound.play(); action.sound.rewind();" },
  { id: "changeScene", label: "Change Scene", filename: "Event_ChangeScene.js",
    action: "ctx.goToScene(action.sceneId);" },
  { id: "destroyObject", label: "Destroy Object", filename: "Event_DestroyObject.js",
    action: 'ctx.destroyObject(action.target === "other" ? event.otherId : action.objectId);' },
  { id: "playAnimation", label: "Play Animation", filename: "Event_PlayAnimation.js",
    action: "action.model.playAnim(action.animations[action.clip], action.loop);" },
];

const COMPONENTS = {
  events: {
    label:'Events',icon:'⚡',color:'#a88bff',make:()=>({rules:[],gameplayEnabled:true}),
    fields:[{key:'gameplayEnabled',label:'Behaviours enabled at start',type:'bool',inlineLabel:true},
      {key:'rules',label:'Conditions and actions',type:'eventRules'}],
  },
  // ── transform ────────────────────────────────────────────────────────
  transform: {
    label: "Transform",
    icon: "✥",
    color: "#47dd83",
    required: true, // cannot be removed
    order: 0,
    make: () => ({ type: "transform", position: v3(), rotation: v3(), scale: v3(1, 1, 1) }),
    fields: [
      { key: "position", label: "Position", type: "vec3", step: 0.1 },
      {
        key: "rotation", label: "Rotation", type: "vec3", step: 1, degrees: true,
        help: "Euler angles. The engine applies Z, then Y, then X.",
      },
      { key: "scale", label: "Scale", type: "vec3", step: 0.1, uniformLock: true },
    ],
  },

  // ── model ────────────────────────────────────────────────────────────
  model: {
    label: "Model",
    icon: "◈",
    color: "#4488ff",
    order: 10,
    make: () => ({
      type: "model", file: "", textureFile: "", textureFilter: "LINEAR",
      pipeline: "PL_DEFAULT", face_culling: "CULL_FACE_BACK",
      shade_model: "SHADE_GOURAUD", texture_mapping: true, accurate_clipping: false,
    }),
    fields: [
      {
        key: "file", label: "Mesh", type: "asset", cat: "models", required: true,
        help: "Loaded from the scene's models directory.",
      },
      { key: "textureFile", label: "Texture", type: "asset", cat: "textures" },
      { key: "textureFilter", label: "Filter", type: "enum", options: FILTERS, advanced: true },
      { key: "pipeline", label: "Pipeline", type: "enum", options: PIPELINES, group: "Render", advanced: true },
      { key: "face_culling", label: "Culling", type: "enum", options: CULLING, group: "Render", advanced: true },
      { key: "shade_model", label: "Shading", type: "enum", options: SHADING, group: "Render", advanced: true },
      { key: "texture_mapping", label: "Texture Map", type: "bool", group: "Render", advanced: true },
      {
        key: "accurate_clipping", label: "Accurate Clip", type: "bool", group: "Render",
        help: "Per-triangle clipping. Fixes geometry popping at screen edges; costs VU time.",
      advanced: true,
      },
    ],
  },

  reflection:{
    label:'Fake reflections',icon:'◉',color:'#9bd8ff',order:17,requires:['model'],
    make:()=>({type:'reflection',texture:'',filter:'LINEAR'}),
    fields:[{key:'texture',label:'Environment map',type:'asset',cat:'textures',required:true,help:'A small shared image supplies the reflected sky. Environment can generate presets.'},{key:'filter',label:'Filter',type:'enum',options:FILTERS}],
    validate:(c,o)=>o.components.particles?[{level:'error',msg:'Reflections need a surface model, not a particle emitter.'}]:[],
  },

  particles:{
    label:'Particles',icon:'✧',color:'#80dfff',order:16,requires:['model'],
    make:()=>({type:'particles',flipbook:false,columns:4,rows:4,fps:12,animationLoop:false,preset:'bubbles',loop:true,playOnStart:true,count:24,lifetime:3,rate:8,speed:2,spread:.6,size:.18,opacity:.8,color:rgb(.7,.95,1)}),
    fields:[
      {key:'preset',label:'Motion',type:'enum',options:[{value:'bubbles',label:'Bubbles'},{value:'splash',label:'Splash'},{value:'fountain',label:'Fountain'}]},
      {key:'loop',label:'Loop',type:'bool'},{key:'playOnStart',label:'Play on start',type:'bool'},
      {key:'count',label:'Pool size',type:'int',min:1,max:64,step:1,help:'A fixed pool: more particles cost more drawing time.'},
      {key:'rate',label:'Particles / second',type:'number',min:.1,max:64,step:1,when:c=>c.loop},
      {key:'lifetime',label:'Lifetime',type:'number',min:.1,max:10,step:.1},
      {key:'speed',label:'Speed',type:'number',min:0,max:30,step:.1},{key:'spread',label:'Spread',type:'number',min:0,max:10,step:.1},
      {key:'size',label:'Size',type:'number',min:.01,max:4,step:.01},{key:'color',label:'Tint',type:'rgb01'},{key:'opacity',label:'Opacity',type:'number',min:0,max:1,step:.05},
      {key:'flipbook',label:'Animate sprite sheet',type:'bool',help:'Use the Model texture as an atlas. Each particle starts on frame one.'},
      ...FLIPBOOK_FIELDS.map(f=>({...f,when:c=>c.flipbook,group:'Sprite animation'})),
      {key:'animationLoop',label:'Repeat frames',type:'bool',when:c=>c.flipbook,group:'Sprite animation'},
    ],
    validate:(c,o)=>{const out=c.flipbook?flipbookProblems(c):[];for(const [k,min,max] of [['count',1,64],['rate',.1,64],['lifetime',.1,10],['speed',0,30],['spread',0,10],['size',.01,4],['opacity',0,1]])if(!Number.isFinite(c[k])||c[k]<min||c[k]>max)out.push({level:'error',msg:'Particle '+k+' is outside its supported range.'});if(o.components.animator||o.components.water)out.push({level:'error',msg:'Particles need a separate sprite model.'});if(c.count>32)out.push({level:'warn',msg:'More than 32 particles per emitter can be expensive on PS2.'});if(c.loop&&c.rate*c.lifetime>c.count)out.push({level:'info',msg:'Emission rate is limited by the pool size and lifetime.'});return out;},
  },

  textureAnimation:{
    label:'Texture animation',icon:'▦',color:'#e0adff',order:17,requires:['model'],
    make:()=>({type:'textureAnimation',columns:4,rows:4,fps:12,loop:true}),
    fields:[...FLIPBOOK_FIELDS,{key:'loop',label:'Repeat frames',type:'bool'}],
    validate:(c,o)=>{
      const out=flipbookProblems(c);
      if(o.components.water||o.components.particles||o.components.animator)out.push({level:'error',msg:'Texture animation needs a separate static model. Particle sprites have their own animation settings.'});
      if(!o.components.model?.textureFile||o.components.model.texture_mapping===false)out.push({level:'error',msg:'Assign a sprite sheet to the Model texture and enable texture mapping.'});
      return out;
    },
  },

  water: {
    label:"Water",icon:"≈",color:"#24bfe8",order:15,requires:["model"],
    make:()=>({type:"water",opacity:.6,color:rgb(1,1,1),tiling:4,flow:{x:0,z:0},waveHeight:0,waveSpeed:1,rippleStrength:0,updateRate:15,caustics:false,depth:4,causticStrength:.45,causticTexture:""}),
    fields:[
      {key:"color",label:"Tint",type:"rgb01"},
      {key:"opacity",label:"Opacity",type:"number",min:0,max:1,step:.05},
      {key:"tiling",label:"Pattern size",type:"number",min:.1,max:32,step:.1,help:"Texture repeats across the surface. More repeats make smaller ripples."},
      {key:"flow",label:"Flow",type:"vec2xz",step:.01},
      {key:"waveHeight",label:"Wave height",type:"number",min:0,max:.5,step:.005},
      {key:"waveSpeed",label:"Wave speed",type:"number",min:0,max:8,step:.1},
      {key:"rippleStrength",label:"Ripple distortion",type:"number",min:0,max:.25,step:.005,help:"Crossing ripples deform the pattern. Wave speed also controls the 3D pattern evolution."},
      {key:"depth",label:"Seafloor depth",type:"number",min:.1,max:100,step:.1,when:c=>normalizedWater(c).caustics,help:"Caustics follow static terrain and platforms. This depth sets their flat fallback."},
      {key:"causticStrength",label:"Caustic strength",type:"number",min:0,max:1,step:.05,when:c=>normalizedWater(c).caustics},
      {key:"causticTexture",label:"Caustic pattern",type:"asset",cat:"textures",required:true,when:c=>normalizedWater(c).caustics},
    ],
    validate:(c,o)=>{
      const out=[];
      for(const [key,min,max] of [["opacity",0,1],["tiling",.1,32],["waveHeight",0,.5],["waveSpeed",0,8],["rippleStrength",0,.25],["updateRate",5,30],["depth",.1,100],["causticStrength",0,1]])if(!Number.isFinite(c[key])||c[key]<min||c[key]>max)out.push({level:"error",msg:`Water ${key} must be between ${min} and ${max}.`});
      if(o.components.animator)out.push({level:"error",msg:"Water needs a static mesh; remove its Animator."});
      return out;
    },
  },

  // ── animator ─────────────────────────────────────────────────────────
  animator: {
    label: "Animator",
    icon: "▶",
    color: "#ffaa44",
    order: 20,
    requires: ["model"],
    make: () => ({ type: "animator", file: "", defaultAnim: "ArmatureAction", loop: true }),
    fields: [
      { key: "file", label: "Clips", type: "asset", cat: "models", required: true, help: "A GLTF/GLB holding the animation set." },
      { key: "defaultAnim", label: "Play On Start", type: "text", required: true },
      { key: "loop", label: "Loop", type: "bool" },
    ],
  },

  // ── light ────────────────────────────────────────────────────────────
  light: {
    label: "Light",
    icon: "✦",
    color: "#ffdd44",
    order: 30,
    make: () => ({
      type: "light", direction: v3(0, 1, 1),
      ambient: rgb(0.15, 0.15, 0.15), diffuse: rgb(0.5, 0.5, 0.5), specular: rgb(1, 1, 1),
    }),
    fields: [
      {
        key: "direction", label: "Direction", type: "vec3", step: 0.1,
        help: "Points toward the light, like a vector to the sun.",
      },
      { key: "ambient", label: "Ambient", type: "rgb01" },
      { key: "diffuse", label: "Diffuse", type: "rgb01" },
      { key: "specular", label: "Specular", type: "rgb01", advanced: true },
    ],
    // AthenaEnv exposes exactly 4 hardware lights.
    limit: 4,
    limitMessage: "AthenaEnv supports 4 lights. Extra lights are ignored at runtime.",
  },

  // ── camera ───────────────────────────────────────────────────────────
  camera: {
    label: "Camera",
    icon: "◉",
    color: "#88ffcc",
    order: 40,
    make: () => ({ type: "camera", fov: 60, near: 1.0, far: 4000.0, target: v3(0, 0, 0) }),
    fields: [
      { key: "fov", label: "FOV", type: "number", min: 1, max: 179, step: 1 },
      { key: "target", label: "Look At", type: "vec3", step: 0.1 },
      { key: "near", label: "Near", type: "number", min: 0.01, step: 0.1, group: "Clipping", advanced: true },
      { key: "far", label: "Far", type: "number", min: 1, step: 10, group: "Clipping", advanced: true },
    ],
  },

  // ── sound ────────────────────────────────────────────────────────────
  sound: {
    label: "Sound",
    icon: "♫",
    color: "#44ffaa",
    order: 50,
    // No `volume`: the engine has no per-stream volume binding, only a global
    // Sound.setVolume (ath_sound.c:284). It lives on the project instead.
    make: () => ({ type: "sound", file: "", loop: false, playOnStart: true }),
    fields: [
      { key: "file", label: "Audio", type: "asset", cat: "sounds", required: true },
      { key: "playOnStart", label: "Play On Start", type: "bool" },
      { key: "loop", label: "Loop", type: "bool" },
    ],
  },

  // ── script ───────────────────────────────────────────────────────────
  script: {
    label: "Script",
    icon: "⌨",
    color: "#ff66cc",
    order: 60,
    make: () => ({ type: "script", file: "", ctxKey: "" }),
    fields: [
      { key: "file", label: "Script", type: "asset", cat: "scripts", required: true, help: "Optional init(ctx) and update(ctx, pad) functions run in the game." },
      {
        key: "ctxKey", label: "ctx Key", type: "text",
        help: "Name this object gets on ctx. Defaults to the object name.",
      advanced: true,
      },
    ],
  },

  // ── rigidbody ────────────────────────────────────────────────────────
  rigidbody: {
    label: "Rigidbody",
    icon: "⬡",
    color: "#ff8844",
    order: 70,
    make: () => ({
      type: "rigidbody",
      mode: "static",
      shape: "box",
      size: v3(1, 1, 1),
      radius: 0.5,
      autoFit: true,
      mass: 1.0,
      freezeRotation: false,
      planeY: 0,
      rayLength: 5,
      collisionEvents: false,
      onCollide: "",
      eventPreset: "", eventScript: "", eventPhase: "enter", eventOtherId: "",
      eventAudio: "", eventSceneId: "", eventTarget: "self",
      eventAnimationFile: "", eventAnimation: "", eventAnimationLoop: false, eventSequenceId: "",
    }),
    fields: [
      { key: "mode", label: "Mode", type: "enum", options: BODY_MODES },
      { key: "shape", label: "Shape", type: "enum", options: GEOM_KINDS },
      {
        key: "autoFit", label: "Fit To Mesh", type: "bool",
        when: (c) => c.shape === "box" || c.shape === "sphere",
        help: "Size the collider from the model's bounding box.",
      },
      {
        key: "size", label: "Size", type: "vec3", step: 0.1, min: 0.001,
        when: (c) => c.shape === "box" && !c.autoFit,
      },
      {
        key: "radius", label: "Radius", type: "number", step: 0.1, min: 0.001,
        when: (c) => c.shape === "sphere" && !c.autoFit,
      },
      {
        key: "planeY", label: "Ground Y", type: "number", step: 0.1,
        when: (c) => c.shape === "plane",
        help: "Infinite horizontal plane at this height, normal +Y.",
      },
      {
        key: "rayLength", label: "Ray Length", type: "number", step: 0.5, min: 0.01,
        when: (c) => c.shape === "ray",
      },
      {
        key: "mass", label: "Mass", type: "number", min: 0.001, step: 0.1, advanced: true,
        when: (c) => c.mode === "dynamic",
        // Total mass, not density: the binding calls dMassAdjust (ath_ode.c:1084).
        // But it behaves as a stiffness dial, because the engine fixes contact
        // softness and never exposes it — see the warning below.
        help: "How heavily it rests on things. Keep it small: 1–10 for a character. " +
          "This is not kilograms in practice — see the warning above 20.",
      },
      {
        key: "freezeRotation", label: "Keep upright", type: "bool",
        when: (c) => c.mode === "dynamic",
        help: "Keeps the body upright and lets a script own the visual rotation. " +
          "What you want for a character; wrong for a barrel.",
      },
      { key: "collisionEvents", label: "Generate Collision / Overlap Events", type: "bool", group: "Events", inlineLabel: true,
        help: "Report each pair entering or leaving contact / overlap. Triggers do not block movement." },
      { key: "eventPreset", label: "Script Preset", type: "enum", group: "Events",
        when: c => c.collisionEvents,
        options: [{ value: "", label: "Custom Script / No Preset" }, ...EVENT_ACTION_PRESETS.map(p => ({ value: p.id, label: p.label }))] },
      { key: "eventPhase", label: "When", type: "enum", group: "Events",
        when: c => c.collisionEvents && !!c.eventPreset,
        options: [{ value: "enter", label: "On Enter" }, { value: "exit", label: "On Exit" }] },
      { key: "eventOtherId", label: "Only With", type: "objectIdRef", group: "Events",
        when: c => c.collisionEvents && !!c.eventPreset, placeholder: "Any object" },
      { key: "eventAudio", label: "Audio", type: "asset", cat: "sounds", group: "Events", required: true,
        when: c => c.collisionEvents && c.eventPreset === "playSound" },
      { key: "eventSceneId", label: "Scene", type: "sceneRef", group: "Events", required: true,
        when: c => c.collisionEvents && c.eventPreset === "changeScene" },
      { key: "eventTarget", label: "Destroy", type: "enum", group: "Events",
        when: c => c.collisionEvents && c.eventPreset === "destroyObject",
        options: [{ value: "self", label: "This object" }, { value: "other", label: "Other object" }] },
      { key: "eventAnimationFile", label: "Animation File", type: "asset", cat: "models", group: "Events", required: true,
        when: c => c.collisionEvents && c.eventPreset === "playAnimation" },
      { key: "eventAnimation", label: "Animation", type: "text", group: "Events", required: true,
        when: c => c.collisionEvents && c.eventPreset === "playAnimation", placeholder: "Clip name" },
      { key: "eventAnimationLoop", label: "Loop Animation", type: "bool", group: "Events",
        when: c => c.collisionEvents && c.eventPreset === "playAnimation" },
      { key: "eventScript", label: "Event Script", type: "asset", cat: "scripts", group: "Events",
        when: c => c.collisionEvents && !!c.eventPreset },
      {key:"eventSequenceId",label:"Sequence",type:"sequenceRef",group:"Events",required:true,
        when:c=>c.collisionEvents&&c.eventPreset==="playSequence"},
      {
        key: "onCollide", label: "ctx Key", type: "text", group: "Events", advanced: true,
        when: (c) => c.collisionEvents,
        help: "Assign onCollisionEnter, onCollisionExit, onTriggerEnter or onTriggerExit callbacks in ctx.<key>. Existing lastHit and entered/exited fields remain available.",
      },
    ],
    validate(c, obj, scene) {
      const out = [];
      // Contact softness is hardcoded (soft_cfm 0.01, ath_ode.c:825) and there
      // is no binding for it, so a contact is a spring of fixed stiffness and
      // penetration grows in proportion to the load. Measured on PCSX2 with a
      // 0.5 sphere on a plane: mass 1 sinks 2 mm, 20 sinks 39 mm, 40 sinks
      // 79 mm and takes three seconds to stop moving, 60 never quite settles,
      // 200 oscillates through the floor forever. A box sinks about a third as
      // much, having up to four contact points to share the load.
      // The numbers are in docs/HARDWARE-NOTES.md.
      if (c.mode === "dynamic" && (c.mass ?? 1) > 100) {
        out.push({
          level: "error",
          msg: `Mass ${c.mass} never comes to rest — the body sinks through the floor and ` +
            `bounces back out forever. The engine's contact stiffness is fixed and cannot ` +
            `carry it. Use 1–10 for a character.`,
          fix: { path: "components.rigidbody.mass", value: 5, label: "Set mass to 5" },
        });
      } else if (c.mode === "dynamic" && (c.mass ?? 1) > 20) {
        out.push({
          level: "warn",
          msg: `Mass ${c.mass} sinks about ${(0.002 * c.mass * 100).toFixed(0)} cm into whatever ` +
            `it stands on, and above 40 it visibly jitters. Mass here is a stiffness dial rather ` +
            `than kilograms: the engine fixes contact softness and exposes no way to stiffen it.`,
          // The same repair as the error above. A warning that describes a
          // problem the editor knows how to fix, next to an error that offers
          // the fix, teaches people that the button is arbitrary.
          fix: { path: "components.rigidbody.mass", value: 5, label: "Set mass to 5" },
        });
      }
      if (c.mode === "dynamic" && c.shape === "plane") {
        out.push({
          level: "error",
          msg: "A plane cannot be dynamic — planes are infinite and immovable.",
          fix: { path: "components.rigidbody.mode", value: "static", label: "Make it static" },
        });
      }
      if (c.mode === "dynamic" && c.shape === "mesh") {
        out.push({
          level: "error",
          msg: "Trimesh bodies are not supported as dynamic. Use a box or sphere collider on moving objects.",
          // A box is the collider that works for most things and the cheapest;
          // the alternative repair — making it static — is offered by the
          // plane rule above and would silently stop the object moving.
          fix: { path: "components.rigidbody.shape", value: "box", label: "Use a box collider" },
        });
      }
      if (c.shape === "mesh" && !obj.components.model?.file) {
        out.push({
          level: "error",
          msg: "Mesh collider needs a Model component with a mesh assigned.",
          fix: obj.components.model ? undefined : "add:model",
        });
      }
      if (!scene?.physics?.enabled) {
        out.push({ level: "warn", msg: "Scene physics is off — this rigidbody will not be exported.", fix: "enablePhysics" });
      }
      return out;
    },
  },

  // ── shadow ───────────────────────────────────────────────────────────
  shadow: {
    label: "Shadow",
    icon: "◐",
    color: "#aa88ff",
    order: 80,
    make: () => ({
      type: "shadow",
      source: "rendertarget",       // "rendertarget" | "texture"
      texture: "",
      rtSize: 128,
      rtBpp: 32,
      caster: "",                   // "" = this object's own model
      autoFit: true,                // size the decal from the caster's bounds
      // For a live silhouette only `x` is read — the length along the light is
      // the projection's own foreshortening. A blob uses both.
      size: { x: 2, z: 2 },
      // Caps 1/sin(elevation) so a low sun cannot stretch the decal off-screen.
      maxStretch: 4,
      grid: { x: 12, z: 12 },
      lightSource: "",              // "" = use lightDir below
      lightDir: v3(0, 1, 1),
      bias: -0.02,
      lightOffset: 0,
      slopeLimit: -1,               // -1 disables the filter (engine: > -0.5 enables)
      color: { r: 0, g: 0, b: 0, a: 0.65 },
      blend: "SHADOW_BLEND_DARKEN",
      raycast: true,
      rayLength: 12.0,
      follow: true,
      // A decal exactly on the ground z-fights with it. The projector is drawn
      // after opaque geometry with the depth test on, so it needs a small lift.
      groundY: 0.02,
      // Narrow, so the silhouette camera sits far enough back to be nearly
      // orthographic. The distance is derived from this and the extent.
      camFov: 20,
    }),
    fields: [
      {
        key: "source", label: "Source", type: "enum",
        options: [
          { value: "rendertarget", label: "Live silhouette", help: "Renders the caster from the light each frame, projected onto the ground. Costs one offscreen pass + VRAM." },
          { value: "texture", label: "Blob texture", help: "A static image. Nearly free." },
        ],
      },
      {
        key: "texture", label: "Blob", type: "asset", cat: "textures",
        when: (c) => c.source === "texture", required: true,
      },
      {
        key: "caster", label: "Caster", type: "objectRef",
        filter: (o) => !!o.components?.model?.file,
        when: (c) => c.source === "rendertarget",
        help: "Which model to render into the target. Blank uses this object's own model.",
      },
      {
        key: "rtSize", label: "Target Size", type: "enum",
        when: (c) => c.source === "rendertarget",
        options: [
          { value: 64, label: "64 (16 KB)" },
          { value: 128, label: "128 (64 KB)" },
          { value: 256, label: "256 (256 KB)" },
        ],
        help: "Square offscreen buffer, permanently locked in the PS2's 4 MB of VRAM.",
        advanced: true,
      },
      {
        // This existed in make(), was emitted into main.js and was counted
        // twice in the VRAM budget — but had no control anywhere, so the one
        // setting that halves a shadow's VRAM cost could not be reached.
        key: "rtBpp", label: "Target Depth", type: "enum",
        when: (c) => c.source === "rendertarget",
        options: [
          { value: 16, label: "16-bit (half the VRAM)", help: "Enough for a silhouette; the decal is a mask, not a picture." },
          { value: 32, label: "32-bit" },
        ],
        help: "Colour depth of the offscreen buffer. A shadow rarely needs 32.",
        advanced: true,
      },
      {
        key: "autoFit", label: "Fit To Caster", type: "bool",
        when: (c) => c.source === "rendertarget",
        help: "Size the decal from the caster's bounding sphere and place the silhouette camera to match. Usually all you want.",
      },
      {
        // Only X is used for a live silhouette: the length along the light is
        // the foreshortening of a directional light, not a free choice.
        key: "size.x", label: "Extent", type: "number", step: 0.1, min: 0.01,
        when: (c) => c.source === "rendertarget" && !c.autoFit,
        help: "How much ground the shadow covers across the light. Its length along the light is derived from the light's angle.",
      },
      {
        key: "size", label: "Extent", type: "vec2xz", step: 0.1, min: 0.01,
        when: (c) => c.source !== "rendertarget",
        help: "Footprint on the ground, in world units.",
      },
      {
        key: "maxStretch", label: "Max Stretch", type: "number", step: 0.5, min: 1, max: 8,
        when: (c) => c.source === "rendertarget",
        help: "A directional shadow lengthens as 1/sin(elevation), which runs away near sunset. " +
          "This caps it by raising the light for the shadow only. 1 gives a plain overhead blob.",
      advanced: true,
      },
      {
        key: "grid", label: "Tesselation", type: "vec2xz", step: 1, min: 2, integer: true,
        help: "Subdivision of the decal. Higher follows uneven ground better. Minimum 2.",
      advanced: true,
      },
      {
        key: "lightSource", label: "Light", type: "objectRef",
        filter: (o) => !!o.components?.light,
        help: "Track a Light object's direction. Blank uses the vector below.",
      },
      {
        key: "lightDir", label: "Light Dir", type: "vec3", step: 0.1,
        when: (c) => !c.lightSource,
        help: "Points toward the light. Aims the silhouette camera and sets how far the shadow is cast and stretched.",
      },
      { key: "color", label: "Color", type: "rgba01", help: "0..1 floats. Alpha is the shadow's strength." },
      { key: "blend", label: "Blend", type: "enum", options: BLEND_MODES, advanced: true },
      { key: "follow", label: "Follow Caster", type: "bool", group: "Placement" },
      {
        key: "groundY", label: "Ground Y", type: "number", step: 0.01, group: "Placement", when: (c) => c.follow && !c.raycast,
        help: "Height the decal sits at. A little above the floor, or it z-fights with it.",
      },
      {
        key: "lightOffset", label: "Light Offset", type: "number", step: 0.1, group: "Placement",
        help: "Slides the decal away from the light on X/Z — a cheap way to fake a slanted sun. 0 keeps it under the caster.",
      advanced: true,
      },
      {
        key: "raycast", label: "Drape On Geometry", type: "bool", group: "Raycast",
        help: "Follow floors and platforms using their solid colliders. Excludes the caster's own colliders and triggers. Uses Ground Y when no receivers are available.",
      },
      { key: "rayLength", label: "Ray Length", type: "number", step: 0.5, min: 0.01, group: "Raycast", when: (c) => c.raycast, advanced: true },
      {
        key: "slopeLimit", label: "Slope Limit", type: "number", step: 0.05, min: -1, max: 1, group: "Raycast",
        when: (c) => c.raycast,
        help: "cos of the steepest surface that accepts shadow. -1 disables the filter.",
      advanced: true,
      },
      {
        // The engine only applies bias to a ray hit position, so it does
        // nothing at all without draping. It used to sit under Placement,
        // where it read like a general z-fighting control.
        key: "bias", label: "Bias", type: "number", step: 0.005, group: "Raycast",
        when: (c) => c.raycast,
        help: "Lifts a draped node off the surface it hit. Negative lifts it toward the light.",
      advanced: true,
      },
      {
        key: "camFov", label: "Light Cam FOV", type: "number", min: 1, max: 179, group: "Light Pass",
        // Fit To Caster derives this too, from the caster's height — a FOV that
        // put the camera inside the model would be a silent black shadow.
        when: (c) => c.source === "rendertarget" && !c.autoFit,
        help: "Narrower is more orthographic, and pushes the silhouette camera further from the caster. " +
          "The distance is derived so the decal is always 1:1 with the extent.",
      advanced: true,
      },
    ],
    validate(c, obj, scene) {
      const out = [];
      const src = c.source || "rendertarget";
      if (src === "rendertarget") {
        const casterName = (c.caster || "").trim();
        if (casterName) {
          const found = findByName(scene, casterName);
          if (!found) out.push({ level: "error", msg: `Caster "${casterName}" does not exist in this scene.` });
          else if (!found.components.model?.file) out.push({ level: "error", msg: `Caster "${casterName}" has no mesh assigned.` });
        } else if (!obj.components.model?.file) {
          out.push({ level: "error", msg: "No caster set and this object has no Model — nothing to cast a shadow." });
        }
      } else if (!(c.texture || "").trim()) {
        out.push({ level: "error", msg: "Blob shadows need a texture." });
      }
      if (c.lightSource && !findByName(scene, c.lightSource)) {
        out.push({ level: "error", msg: `Light "${c.lightSource}" does not exist in this scene.` });
      }
      if (c.raycast && !scene?.physics?.enabled) {
        out.push({
          level: "warn",
          msg: "Enable scene physics and add solid colliders to drape shadows. Using a flat shadow at Ground Y until then.",
          fix: "enablePhysics",
        });
      }
      if ((c.grid?.x ?? 0) < 2 || (c.grid?.z ?? 0) < 2) {
        out.push({ level: "warn", msg: "Tesselation below 2 is clamped to 2 by the engine." });
      }
      return out;
    },
  },
};

// Stable display order for the Inspector and the Add menu.
const COMPONENT_KEYS = Object.keys(COMPONENTS).sort(
  (a, b) => COMPONENTS[a].order - COMPONENTS[b].order,
);

const compDef = (key) => COMPONENTS[key] || null;
const makeComponent = (key) => (COMPONENTS[key] ? COMPONENTS[key].make() : null);

/** The component that decides an object's icon in the outliner. */
const PRIMARY_ORDER = ["camera", "light", "model", "sound", "shadow", "rigidbody", "script"];
const primaryComponent = (obj) => PRIMARY_ORDER.find((k) => obj?.components?.[k]) || "empty";
const objIcon = (obj) => COMPONENTS[primaryComponent(obj)]?.icon || "◇";
const objColor = (obj) => COMPONENTS[primaryComponent(obj)]?.color || "#667788";

/**
 * Legacy project migration. Old files used `static_solid` / `dynamic_solid` /
 * `static_overlappable`, `geomType`, `geomSize` and `density`; shadows shipped
 * with slopeLimit 0, which the engine reads as an *enabled* filter.
 */
function migrateComponent(key, c) {
  if (!c || typeof c !== "object") return c;
  if (key === "rigidbody") {
    if (c.mode === "static_solid") c.mode = "static";
    else if (c.mode === "dynamic_solid") c.mode = "dynamic";
    else if (c.mode === "static_overlappable") c.mode = "trigger";
    if (!c.shape && c.geomType) {
      c.shape = { GeomBox: "box", GeomSphere: "sphere", GeomPlane: "plane", GeomRenderObject: "mesh", GeomRay: "ray" }[c.geomType] || "box";
    }
    if (!c.size && c.geomSize) c.size = { ...c.geomSize };
    if (c.radius === undefined) c.radius = c.geomSize?.x ?? 0.5;
    if (c.mass === undefined) c.mass = c.density ?? 1;
    if (c.collisionEvents === undefined) c.collisionEvents = !c.noCollisionEvents && !!c.onCollideCtx;
    if (!c.onCollide && c.onCollideCtx) c.onCollide = c.onCollideCtx;
    if (c.autoFit === undefined) c.autoFit = false; // keep explicit sizes from old files
    if (c.planeY === undefined) c.planeY = 0;
    if (c.rayLength === undefined) c.rayLength = c.geomSize?.x ?? 5;
    delete c.geomType; delete c.geomSize; delete c.density;
    delete c.noCollisionEvents; delete c.onCollideCtx;
  }
  if (key === "shadow") {
    if (c.slopeLimit === 0) c.slopeLimit = -1;      // 0 meant "off" in the editor, "on" in the engine
    if (c.rtSize !== undefined) c.rtSize = [64, 128, 256].includes(c.rtSize) ? c.rtSize : 128;
    // camDist used to be set by hand alongside the extent, and the two had to
    // satisfy extent = 2 * dist * tan(fov/2) or the shadow came out the wrong
    // size. The distance is derived from the extent now, so the old value is
    // dropped and the FOV is recomputed from the pair the user had — which
    // preserves the scale they were actually seeing.
    if (c.camDist !== undefined) {
      const dist = typeof c.camDist === "number" && c.camDist > 0.01 ? c.camDist : 8;
      const extent = Math.max(0.01, c.size?.x ?? 2, c.size?.z ?? 2);
      c.camFov = clamp(Math.round((Math.atan((extent / 2) / dist) * 360) / Math.PI), 1, 179);
      delete c.camDist;
    }
    // Keep whatever extent an existing project was tuned to; auto-fit is only
    // the default for shadows added from here on.
    if (c.autoFit === undefined) c.autoFit = false;
  }
  // Fill in any key added since the project was saved.
  const def = COMPONENTS[key];
  if (def) {
    const fresh = def.make();
    for (const k of Object.keys(fresh)) if (c[k] === undefined) c[k] = fresh[k];
  }
  return c;
}
