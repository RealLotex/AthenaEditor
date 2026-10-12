const PARTICLE_PRESETS=['bubbles','splash','fountain'];
function normalizedParticles(value={}) {
  const preset=PARTICLE_PRESETS.includes(value.preset)?value.preset:'bubbles';
  const c={preset,loop:value.loop!==false,playOnStart:value.playOnStart!==false,flipbook:!!value.flipbook,animation:value.flipbook?normalizedFlipbook({...value,loop:!!value.animationLoop}):null,
    count:Math.round(clamp(num(value.count,24),1,64)),lifetime:clamp(num(value.lifetime,3),.1,10),rate:clamp(num(value.rate,8),0,64),
    speed:clamp(num(value.speed,2),0,30),spread:clamp(num(value.spread,.6),0,10),size:clamp(num(value.size,.18),.01,4),
    opacity:clamp(num(value.opacity,.8),0,1),color:{r:clamp(num(value.color?.r,.7),0,1),g:clamp(num(value.color?.g,.95),0,1),b:clamp(num(value.color?.b,1),0,1)}};
  return {...c,...normalizeParticleModules(value,c),modules:value.modules===true||value.shape!==undefined||value.lifetimeMin!==undefined};
}

// A fixed pool and deterministic seeds. Parametric motion avoids per-particle
// physics bodies and all arrays/transform scratch objects are allocated once.
function createParticleState(settings) {
  const s={settings:{...settings},time:0,playing:settings.playOnStart,numberBuffer:new Float64Array(1),seeds:new Float64Array(settings.count*3),particles:new Float64Array(settings.count*4),ages:new Float64Array(settings.count)};
  // Athena's QuickJS fork compares mixed float32/float64 tags incorrectly.
  // Promote timing values just as SceneEvents does; reuse one scratch slot.
  s.number=function(v){s.numberBuffer[0]=v;return s.numberBuffer[0];};
  for(const key of ['lifetime','rate','speed','spread','size','opacity','duration','lifetimeMin','lifetimeMax','speedMin','speedMax','sizeMin','sizeMax','gravityModifier','radius','coneAngle','bounce','collisionLifetimeLoss','rotation','rotationSpeed'])s.settings[key]=s.number(settings[key]);
  s.settings.bursts=settings.bursts.map(b=>({...b,time:s.number(b.time),interval:s.number(b.interval)}));
  for(const key of ['colorKeys','sizeKeys'])s.settings[key]=settings[key].map(k=>({...k,time:s.number(k.time)}));
  s.settings.collisionPlanes=settings.collisionPlanes.map(y=>s.number(y));
  let seed=2371;
  for(let i=0;i<s.seeds.length;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;s.seeds[i]=seed/4294967296;}
  initializeParticleModules(s);
  s.emit=function(origin){s.time=0;s.playing=true;s.emitOrigin=origin||null;if(s.births){s.births.fill(NaN);s.deadBirths.fill(NaN);s.collisionAges.fill(-1);s.injectionBirths.fill(-Infinity);}};
  s.emitAt=function(point,count){s.playing=true;s.settings.modules=true;const amount=Math.min(s.settings.count,count||s.settings.bursts[0]?.count||8);for(let j=0;j<amount;j++){const i=s.injectionHead++%s.settings.count;s.injectionBirths[i]=s.number(s.time);s.injectionOrigins.set([point.x,point.y,point.z],i*3);s.births[i]=NaN;s.deadBirths[i]=NaN;s.collisionAges[i]=-1;}};
  s.stop=function(){s.playing=false;s.activeCount=0;s.particles.fill(0);s.ages.fill(0);};
  s.activeCount=0;
  return s;
}

function stepParticleState(s,dt) {
  if(!s.playing)return;
  s.time=s.number(s.time+s.number(Math.max(0,Math.min(.1,dt))));
  if(s.settings.modules){stepParticleModules(s,dt);return;}
  const c=s.settings,rate=Math.min(c.rate,c.count/c.lifetime);let active=0;
  for(let i=0;i<c.count;i++){
    let age=s.number(s.time-(c.loop?i/rate:i/c.count*.04));
    if(c.loop&&age>=0)age=s.number(age%c.lifetime);
    const at=i*4,seed=i*3;
    s.ages[i]=Math.max(0,age);
    if(age<0||age>=c.lifetime){s.particles[at+3]=0;continue;}
    const x=(s.seeds[seed]-.5)*2,z=(s.seeds[seed+1]-.5)*2,speed=c.speed*(.75+s.seeds[seed+2]*.5);
    s.particles[at]=x*c.spread*(c.preset==='bubbles'?1:age);
    s.particles[at+2]=z*c.spread*(c.preset==='bubbles'?1:age);
    s.particles[at+1]=speed*age-(c.preset==='bubbles'?0:4.9*age*age);
    if(c.preset==='bubbles'){s.particles[at]+=Math.sin(age*3+i)*c.spread*.15;s.particles[at+2]+=Math.cos(age*2+i)*c.spread*.15;}
    s.particles[at+3]=Math.min(1,age/.04,(c.lifetime-age)/Math.min(.3,c.lifetime*.3));active++;
  }
  if(!c.loop&&s.time>s.number(c.lifetime+.04)&&!active)s.playing=false;
  s.activeCount=active;
}

// One quad per particle in one RenderData. Unique vertex/color lanes avoid the
// release driver's queued REF packets observing a later sprite's color.
function updateParticleUVs(state,i,alpha) {
  if(!state.flipbook||alpha<=0)return;
  const frame=flipbookFrame(state.settings.animation,state.ages[i]);
  if(state.frames[i]!==frame){state.uvs.set(state.flipbook.frames[frame],i*(state.particleUVSpan||24));state.frames[i]=frame;}
}
function updateParticleVertices(state,rotation,scale,camera) {
  if(state.meshTemplate){updateMeshParticleVertices(state);return;}
  if(!state.rotation||state.rotation.x!==rotation.x||state.rotation.y!==rotation.y||state.rotation.z!==rotation.z){state.rotation=rotation;state.basis=matFromEuler(rotation.x,rotation.y,rotation.z);}
  const basis=state.basis,p=camera.position,t=camera.target,dx=t.x-p.x,dy=t.y-p.y,dz=t.z-p.z,length=Math.hypot(dx,dy,dz)||1;
  const fx=dx/length,fy=dy/length,fz=dz/length,h=Math.hypot(fx,fz);
  const rx=h>1e-6?-fz/h:1,rz=h>1e-6?fx/h:0,ux=-rz*fy,uy=rz*fx-rx*fz,uz=rx*fy,local=state.billboard;
  for(let j=0;j<3;j++){
    const divisor=(j===0?scale.x:j===1?scale.y:scale.z)||1;
    local[j]=(rx*basis[j*4]+rz*basis[j*4+2])/divisor*Math.abs(scale.x)*state.settings.size;
    local[j+3]=(ux*basis[j*4]+uy*basis[j*4+1]+uz*basis[j*4+2])/divisor*Math.abs(scale.y)*state.settings.size*(state.settings.preset==='bubbles'?1:1.5);
  }
  const corners=state.corners,positions=state.positions,colors=state.colors,c=state.settings.color;
  for(let i=0;i<state.settings.count;i++){
    const at=i*4,alpha=state.particles[at+3]*state.settings.opacity,size=state.settings.modules?state.sizes[i]/state.settings.size:1,spin=state.spins?.[i]||0,cos=Math.cos(spin),sin=Math.sin(spin);
    updateParticleUVs(state,i,alpha);
    for(let j=0;j<6;j++){
      const world=state.settings.modules&&state.settings.simulationSpace==='world',width=world?Math.abs(state.spawnScales[i*3])/(Math.abs(scale.x)||1):1,height=world?Math.abs(state.spawnScales[i*3+1])/(Math.abs(scale.y)||1):1;
      const v=(i*6+j)*4,u=(corners[j*2]*cos-corners[j*2+1]*sin)*size*width,w=(corners[j*2]*sin+corners[j*2+1]*cos)*size*height;
      for(let k=0;k<3;k++)positions[v+k]=alpha>0?state.particles[at+k]+local[k]*u+local[k+3]*w:0;
      // The VU matrix multiply uses the fourth lane for translation.
      positions[v+3]=1;
      colors[v]=state.settings.modules?state.tints[at]:c.r;colors[v+1]=state.settings.modules?state.tints[at+1]:c.g;colors[v+2]=state.settings.modules?state.tints[at+2]:c.b;colors[v+3]=alpha-1;
    }
  }
}
