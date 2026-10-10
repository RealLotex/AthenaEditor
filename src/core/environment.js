function normalizedEnvironment(value={}) {
  const defaults={recess:{color:rgb(.35,.35,.35),strength:.6},mid:{color:rgb(1,1,1),strength:0},highlight:{color:rgb(1,1,1),strength:0}};
  const out={radius:clamp(num(value.radius,1),.01,100),lighting:value.lighting===true,quality:['draft','balanced','high'].includes(value.quality)?value.quality:'balanced',fog:normalizedSceneFog(value.fog)};
  for(const key of Object.keys(defaults)){
    const input=value[key]||{},d=defaults[key];
    out[key]={strength:clamp(num(input.strength,d.strength),0,1),color:{}};
    for(const k of ['r','g','b'])out[key].color[k]=clamp(num(input.color?.[k],d.color[k]),0,1);
  }
  return out;
}

function normalizedSceneFog(value={}) {
  const start=clamp(num(value.start,20),0,4000);
  return {enabled:!!value.enabled,start,end:clamp(num(value.end,100),start+.1,10000),
    color:{r:clamp(num(value.color?.r,.65),0,1),g:clamp(num(value.color?.g,.8),0,1),b:clamp(num(value.color?.b,.92),0,1)}};
}

// The release has no fog binding. An untextured overlay uses the same triangles
// and depth test, blending a fog color over visible surfaces. No VRAM texture.
function createFogState(positions,colors,settings) {
  const state={positions,colors,settings,clock:1,cursor:0,coefficients:new Float64Array(4),snapshot:new Float64Array(22).fill(NaN),numberBuffer:new Float64Array(1)};
  state.number=function(v){state.numberBuffer[0]=v;return state.numberBuffer[0];};
  state.start=state.number(settings.start);state.end=state.number(settings.end);
  for(let i=0;i<colors.length;i+=4){colors[i]=settings.color.r;colors[i+1]=settings.color.g;colors[i+2]=settings.color.b;colors[i+3]=-1;}
  return state;
}

function advanceFogArrays(state,dt,matrix,camera,budget=512) {
  state.clock=state.number(state.clock+state.number(dt));
  const p=camera.position,t=camera.target,dx=t.x-p.x,dy=t.y-p.y,dz=t.z-p.z,length=Math.hypot(dx,dy,dz)||1;
  const fx=dx/length,fy=dy/length,fz=dz/length,positions=state.positions,colors=state.colors,a=state.coefficients;
  if(state.cursor===0){
    if(state.clock<state.number(.1))return false;state.clock=0;
    const snap=state.snapshot;let changed=false;
    for(let i=0;i<16;i++){if(snap[i]!==matrix[i])changed=true;snap[i]=matrix[i];}
    const values=[p.x,p.y,p.z,t.x,t.y,t.z];for(let i=0;i<6;i++){if(snap[16+i]!==values[i])changed=true;snap[16+i]=values[i];}
    if(!changed)return false;
    for(let i=0;i<3;i++)a[i]=(matrix[i*4]*fx+matrix[i*4+1]*fy+matrix[i*4+2]*fz)/(state.end-state.start);
    a[3]=((matrix[12]-p.x)*fx+(matrix[13]-p.y)*fy+(matrix[14]-p.z)*fz-state.start)/(state.end-state.start);
  }
  // Cap CPU work per frame, including dense terrain. A moving camera refreshes
  // a complete overlay over several frames instead of stalling the game.
  const end=Math.min(positions.length,state.cursor+budget*4);
  for(let i=state.cursor;i<end;i+=4){
    const alpha=positions[i]*a[0]+positions[i+1]*a[1]+positions[i+2]*a[2]+a[3];
    // No-lights VU adds diffuse alpha (1) to vertex alpha.
    colors[i+3]=Math.max(0,Math.min(1,alpha))-1;
  }
  state.cursor=end===positions.length?0:end;
  return true;
}

// Three independent tints, with a partition of unity so strength changes remain
// predictable. AO assigns recesses; exposure divides the remaining mid/high tones.
function environmentVertexColor(normal,ao,lights,settings) {
  return evaluateEnvironmentColor(normal,ao,lights,normalizedEnvironment(settings));
}

function evaluateEnvironmentColor(normal,ao,lights,env) {
  const occlusion=clamp(ao,0,1),illumination=[0,0,0];
  let exposure=0;
  for(const light of lights){
    const dir=vnorm(light.direction,{x:0,y:1,z:0}),dot=Math.max(0,normal.x*dir.x+normal.y*dir.y+normal.z*dir.z);
    exposure=Math.max(exposure,dot);
    for(let k=0;k<3;k++){const c=['r','g','b'][k];illumination[k]+=num(light.ambient?.[c],.12)+num(light.diffuse?.[c],.5)*dot;}
  }
  if(!lights.length){illumination.fill(1);exposure=Math.max(0,normal.y);}
  const recess=occlusion+(1-occlusion)*(1-exposure)*.35;
  const weights={recess,mid:(1-recess)*(1-exposure*exposure),highlight:(1-recess)*exposure*exposure};
  return ['r','g','b'].map((c,k)=>{
    let tint=1;
    for(const key of ['recess','mid','highlight'])tint+=weights[key]*env[key].strength*(env[key].color[c]-1);
    return clamp((env.lighting?illumination[k]:1)*tint,0,1);
  });
}
