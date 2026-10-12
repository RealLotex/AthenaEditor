const PARTICLE_SHAPES=['point','sphere','hemisphere','circle','cone','box','edge'];
function particleModuleDefaults() {
  return {duration:5,simulationSpace:'local',shape:'cone',radius:.6,coneAngle:25,box:{x:1,y:1,z:1},
    lifetimeMin:3,lifetimeMax:3,speedMin:2,speedMax:2,sizeMin:.18,sizeMax:.18,
    velocity:{x:0,y:0,z:0},gravityModifier:0,rotation:0,rotationSpeed:0,
    colorKeys:[{time:0,r:1,g:1,b:1,a:1},{time:1,r:1,g:1,b:1,a:1}],sizeKeys:[{time:0,value:1},{time:1,value:1}],
    collisionType:'none',collisionPlanes:[0],bounce:.3,collisionLifetimeLoss:0,subEmitters:[],bursts:[],
    renderMode:'billboard',meshFile:'',sortingFudge:0};
}
function normalizeParticleModules(value,c) {
  const d=particleModuleDefaults(),out={...d,...value};
  for(const [key,min,max] of [['duration',.01,3600],['radius',0,100],['coneAngle',0,90],['gravityModifier',-10,10],['rotation',-360,360],['rotationSpeed',-1080,1080],['bounce',0,1],['collisionLifetimeLoss',0,1],['sortingFudge',-100,100]])out[key]=clamp(num(out[key],d[key]),min,max);
  for(const [key,base,min,max] of [['lifetime',c.lifetime,.01,60],['speed',c.speed,0,100],['size',c.size,.001,20]]){
    out[key+'Min']=clamp(num(value[key+'Min'],base),min,max);out[key+'Max']=clamp(num(value[key+'Max'],base),out[key+'Min'],max);
  }
  out.box={};out.velocity={};for(const axis of ['x','y','z']){out.box[axis]=clamp(num(value.box?.[axis],1),0,100);out.velocity[axis]=clamp(num(value.velocity?.[axis],0),-100,100);}
  out.shape=PARTICLE_SHAPES.includes(out.shape)?out.shape:'cone';
  out.simulationSpace=out.simulationSpace==='world'?'world':'local';out.renderMode=out.renderMode==='mesh'?'mesh':'billboard';
  out.collisionType=['none','world','planes'].includes(out.collisionType)?out.collisionType:'none';
  out.bursts=(Array.isArray(value.bursts)?value.bursts:[]).slice(0,32).map(b=>({time:clamp(num(b.time),0,out.duration),count:Math.round(clamp(num(b.count,10),1,64)),cycles:Math.round(clamp(num(b.cycles,1),1,100)),interval:clamp(num(b.interval,.1),.01,3600)}));
  out.collisionPlanes=(Array.isArray(value.collisionPlanes)?value.collisionPlanes:[0]).slice(0,16).map(y=>clamp(num(y),-10000,10000));
  out.subEmitters=(Array.isArray(value.subEmitters)?value.subEmitters:[]).slice(0,16).map(s=>({event:['birth','death','collision'].includes(s.event)?s.event:'death',objectId:String(s.objectId||''),probability:clamp(num(s.probability,1),0,1)}));
  for(const key of ['colorKeys','sizeKeys']){
    const list=Array.isArray(value[key])&&value[key].length?value[key]:d[key];
    out[key]=list.slice(0,16).map(k=>key==='sizeKeys'?{time:clamp(num(k.time),0,1),value:clamp(num(k.value,1),0,10)}:{time:clamp(num(k.time),0,1),...Object.fromEntries(['r','g','b','a'].map(a=>[a,clamp(num(k[a],1),0,1)]))}).sort((a,b)=>a.time-b.time);
  }
  return out;
}
function particleCurveSample(keys,time,key) {
  if(time<=keys[0].time)return keys[0][key];
  for(let i=1;i<keys.length;i++)if(time<=keys[i].time){const a=keys[i-1],b=keys[i],t=(time-a.time)/Math.max(1e-6,b.time-a.time);return a[key]+(b[key]-a[key])*t;}
  return keys[keys.length-1][key];
}
function particleSpawnSample(c,seeds,i,position,direction) {
  const a=seeds[i*3],b=seeds[i*3+1],d=seeds[i*3+2],theta=a*Math.PI*2;
  position.x=position.y=position.z=0;direction.x=direction.z=0;direction.y=1;
  if(c.shape==='sphere'||c.shape==='hemisphere'){
    const y=c.shape==='sphere'?b*2-1:b,r=Math.sqrt(1-y*y);direction.x=Math.cos(theta)*r;direction.y=y;direction.z=Math.sin(theta)*r;
    const radius=c.radius*Math.cbrt(d);position.x=direction.x*radius;position.y=y*radius;position.z=direction.z*radius;
  }else if(c.shape==='circle'||c.shape==='cone'){
    const radius=Math.sqrt(b)*c.radius;position.x=Math.cos(theta)*radius;position.z=Math.sin(theta)*radius;
    if(c.shape==='cone'){const angle=c.coneAngle*Math.PI/180*Math.sqrt(d);direction.x=Math.cos(theta)*Math.sin(angle);direction.z=Math.sin(theta)*Math.sin(angle);direction.y=Math.cos(angle);}
  }else if(c.shape==='box'){position.x=(a-.5)*c.box.x;position.y=(b-.5)*c.box.y;position.z=(d-.5)*c.box.z;}
  else if(c.shape==='edge')position.x=(a-.5)*c.radius*2;
}
function particleModulesProblems(c,o,scene) {
  const out=[],error=msg=>out.push({level:'error',msg});
  if(c.shape&&!PARTICLE_SHAPES.includes(c.shape))error('Choose a supported particle shape.');
  for(const [key,min,max] of [['duration',.01,3600],['radius',0,100],['coneAngle',0,90],['gravityModifier',-10,10],['bounce',0,1],['collisionLifetimeLoss',0,1],['sortingFudge',-100,100]])if(c[key]!==undefined&&(!Number.isFinite(c[key])||c[key]<min||c[key]>max))error('Particle '+key+' must be between '+min+' and '+max+'.');
  for(const [key,min,max] of [['lifetime',.01,60],['speed',0,100],['size',.001,20]]){
    if(c[key+'Min']>c[key+'Max'])error('Particle '+key+' minimum must not exceed its maximum.');
    for(const suffix of ['Min','Max'])if(c[key+suffix]!==undefined&&(!Number.isFinite(c[key+suffix])||c[key+suffix]<min||c[key+suffix]>max))error('Start '+key+' must be between '+min+' and '+max+'.');
  }
  for(const key of ['colorKeys','sizeKeys'])if(c[key]!==undefined&&(!Array.isArray(c[key])||!c[key].length||c[key].some(k=>!Number.isFinite(k.time)||k.time<0||k.time>1)))error('Particle lifetime curves require keys between 0 and 1.');
  if(c.bursts?.some(b=>!Number.isFinite(b.time)||b.time<0||b.time>(c.duration||5)||!Number.isInteger(b.count)||b.count<1||b.count>64||!Number.isFinite(b.interval)||b.interval<=0))error('Particle bursts need a valid time, count and positive interval.');
  if(c.simulationSpace&&!['world','local'].includes(c.simulationSpace))error('Choose Local or World particle simulation.');
  if(c.renderMode&&!['billboard','mesh'].includes(c.renderMode))error('Choose Billboard or Mesh particle rendering.');
  if(c.renderMode==='mesh'&&!c.meshFile)error('Mesh particles need a mesh asset.');
  for(const sub of c.subEmitters||[])if(sub.objectId===o.id||!findObj(scene?.objects||[],sub.objectId)?.components.particles)error('Sub emitters need another particle emitter in this scene.');
  if(c.collisionType==='world'&&!scene?.physics?.enabled)error('World particle collisions need scene physics enabled.');
  if(c.collisionType==='planes'&&!c.collisionPlanes?.length)error('Add at least one collision plane height.');
  return out;
}
function initializeParticleModules(s) {
  const count=s.settings.count;
  s.births=new Float64Array(count);s.births.fill(NaN);s.deadBirths=new Float64Array(count);s.deadBirths.fill(NaN);s.lifeLoss=new Float64Array(count);s.origins=new Float64Array(count*3);s.spawnRotations=new Float64Array(count*3);s.spawnScales=new Float64Array(count*3);s.originOffsets=new Float64Array(count*3);
  s.sizes=new Float64Array(count);s.spins=new Float64Array(count);s.tints=new Float64Array(count*4);s.previous=new Float64Array(count*3);
  s.collisionPos=new Float64Array(count*3);s.collisionVel=new Float64Array(count*3);s.collisionAges=new Float64Array(count);s.collisionAges.fill(-1);
  s.spawnPoint={x:0,y:0,z:0};s.spawnDirection={x:0,y:1,z:0};s.emitter={position:{x:0,y:0,z:0},rotation:{x:0,y:0,z:0},scale:{x:1,y:1,z:1}};
  s.injectionBirths=new Float64Array(count);s.injectionBirths.fill(-Infinity);s.injectionOrigins=new Float64Array(count*3);s.injectionHead=0;
}
function notifyParticleSubEmitters(s,event,i,point) {
  if(!s.onSubEmit||s.cinematic)return;
  for(const sub of s.settings.subEmitters)if(sub.event===event&&s.seeds[i*3+2]<=sub.probability)s.onSubEmit(sub,point);
}
function stepParticleModules(s,dt) {
  const c=s.settings,emitter=s.emitter,time=s.number(s.time);
  if(s.lastTime>time){s.births.fill(NaN);s.deadBirths.fill(NaN);s.collisionAges.fill(-1);s.particles.fill(0);}s.lastTime=time;
  let active=0;
  const currentBasis=matFromEuler(emitter.rotation.x,emitter.rotation.y,emitter.rotation.z);
  for(let i=0;i<c.count;i++){
    const at=i*4,offset=i*3,seed=s.seeds[offset+2],life=s.number(c.lifetimeMin+(c.lifetimeMax-c.lifetimeMin)*seed),wasAlive=s.particles[at+3]>0;
    let birth=-Infinity;
    if(c.rate>0){const first=i/c.rate,period=Math.max(c.count/c.rate,c.lifetimeMax),until=c.loop?time:Math.min(time,c.duration-1e-9),cycle=Math.floor((until-first)/period);if(cycle>=0)birth=first+cycle*period;}
    for(const burst of c.bursts)if(i<burst.count){const epoch=c.loop?Math.floor((time-burst.time)/c.duration)*c.duration:0,cycle=Math.min(burst.cycles-1,Math.floor((c.duration-burst.time)/burst.interval),Math.floor((time-epoch-burst.time)/burst.interval));if(epoch>=0&&cycle>=0)birth=Math.max(birth,epoch+burst.time+cycle*burst.interval);}
    birth=Math.max(birth,s.injectionBirths[i]);
    const age=s.number(time-birth);s.ages[i]=Math.max(0,age);
    if(!Number.isFinite(birth)||age<0||age>=life){if(wasAlive)notifyParticleSubEmitters(s,'death',i,{x:s.previous[offset],y:s.previous[offset+1],z:s.previous[offset+2]});s.particles[at+3]=0;continue;}
    const fresh=s.births[i]!==birth;
    if(s.deadBirths[i]===birth){s.particles[at+3]=0;continue;}
    if(fresh){
      if(wasAlive)notifyParticleSubEmitters(s,'death',i,{x:s.previous[offset],y:s.previous[offset+1],z:s.previous[offset+2]});
      s.births[i]=birth;s.collisionAges[i]=-1;s.lifeLoss[i]=0;
      const injected=birth===s.injectionBirths[i],spawn=injected?{x:s.injectionOrigins[offset],y:s.injectionOrigins[offset+1],z:s.injectionOrigins[offset+2]}:s.emitOrigin||emitter.position;
      const ox=spawn.x-emitter.position.x,oy=spawn.y-emitter.position.y,oz=spawn.z-emitter.position.z;
      for(let k=0;k<3;k++){const axis=['x','y','z'][k];s.origins[offset+k]=spawn[axis];s.spawnRotations[offset+k]=emitter.rotation[axis];s.spawnScales[offset+k]=emitter.scale[axis];s.originOffsets[offset+k]=(ox*currentBasis[k*4]+oy*currentBasis[k*4+1]+oz*currentBasis[k*4+2])/(emitter.scale[axis]||1);}
    }
    particleSpawnSample(c,s.seeds,i,s.spawnPoint,s.spawnDirection);
    const speed=c.speedMin+(c.speedMax-c.speedMin)*seed,gravity=9.81*c.gravityModifier;
    let x=s.spawnPoint.x+(s.spawnDirection.x*speed+c.velocity.x)*age,y=s.spawnPoint.y+(s.spawnDirection.y*speed+c.velocity.y)*age-gravity*age*age*.5,z=s.spawnPoint.z+(s.spawnDirection.z*speed+c.velocity.z)*age;
    const basis=c.simulationSpace==='world'?matFromEuler(s.spawnRotations[offset],s.spawnRotations[offset+1],s.spawnRotations[offset+2]):currentBasis;
    const origin=c.simulationSpace==='world'?{x:s.origins[offset],y:s.origins[offset+1],z:s.origins[offset+2]}:emitter.position;
    if(c.simulationSpace==='local'){x+=s.originOffsets[offset];y+=s.originOffsets[offset+1];z+=s.originOffsets[offset+2];}
    const sx=c.simulationSpace==='world'?s.spawnScales[offset]:emitter.scale.x,sy=c.simulationSpace==='world'?s.spawnScales[offset+1]:emitter.scale.y,sz=c.simulationSpace==='world'?s.spawnScales[offset+2]:emitter.scale.z;
    let world={x:origin.x+basis[0]*x*sx+basis[4]*y*sy+basis[8]*z*sz,y:origin.y+basis[1]*x*sx+basis[5]*y*sy+basis[9]*z*sz,z:origin.z+basis[2]*x*sx+basis[6]*y*sy+basis[10]*z*sz};
    if(fresh){s.previous.set([world.x,world.y,world.z],offset);notifyParticleSubEmitters(s,'birth',i,world);}
    if(s.collisionAges[i]>=0){
      const elapsed=age-s.collisionAges[i];world={x:s.collisionPos[offset]+s.collisionVel[offset]*elapsed,y:s.collisionPos[offset+1]+s.collisionVel[offset+1]*elapsed-gravity*elapsed*elapsed*.5,z:s.collisionPos[offset+2]+s.collisionVel[offset+2]*elapsed};
    }
    let hit=null;
    if(c.collisionType==='planes')for(const plane of c.collisionPlanes)if(world.y<plane&&s.previous[offset+1]>=plane){hit={point:{...world,y:plane+.001},normal:{x:0,y:1,z:0}};break;}
    if(c.collisionType==='world'&&s.collide&&!fresh)hit=s.collide({x:s.previous[offset],y:s.previous[offset+1],z:s.previous[offset+2]},world);
    if(hit){
      const elapsed=Math.max(.001,dt),vx=(world.x-s.previous[offset])/elapsed,vy=(world.y-s.previous[offset+1])/elapsed,vz=(world.z-s.previous[offset+2])/elapsed,n=hit.normal,dot=vx*n.x+vy*n.y+vz*n.z;
      s.collisionAges[i]=age;s.collisionPos.set([hit.point.x,hit.point.y,hit.point.z],offset);s.collisionVel.set([vx-(1+c.bounce)*dot*n.x,vy-(1+c.bounce)*dot*n.y,vz-(1+c.bounce)*dot*n.z],offset);world=hit.point;
      notifyParticleSubEmitters(s,'collision',i,world);
      s.lifeLoss[i]+=life*c.collisionLifetimeLoss;
      if(age+s.lifeLoss[i]>=life){s.deadBirths[i]=birth;s.particles[at+3]=0;notifyParticleSubEmitters(s,'death',i,world);continue;}
    }
    if(age+s.lifeLoss[i]>=life){s.deadBirths[i]=birth;s.particles[at+3]=0;if(wasAlive)notifyParticleSubEmitters(s,'death',i,world);continue;}
    s.previous.set([world.x,world.y,world.z],offset);
    const dx=world.x-emitter.position.x,dy=world.y-emitter.position.y,dz=world.z-emitter.position.z;
    s.particles[at]=(dx*currentBasis[0]+dy*currentBasis[1]+dz*currentBasis[2])/(emitter.scale.x||1);
    s.particles[at+1]=(dx*currentBasis[4]+dy*currentBasis[5]+dz*currentBasis[6])/(emitter.scale.y||1);
    s.particles[at+2]=(dx*currentBasis[8]+dy*currentBasis[9]+dz*currentBasis[10])/(emitter.scale.z||1);
    const t=age/life;s.particles[at+3]=Math.min(1,age/.04,(life-age)/Math.min(.3,life*.3))*particleCurveSample(c.colorKeys,t,'a');
    s.sizes[i]=(c.sizeMin+(c.sizeMax-c.sizeMin)*s.seeds[offset])*particleCurveSample(c.sizeKeys,t,'value');s.spins[i]=(c.rotation+c.rotationSpeed*age)*Math.PI/180;
    for(let k=0;k<3;k++)s.tints[at+k]=c.color[['r','g','b'][k]]*particleCurveSample(c.colorKeys,t,['r','g','b'][k]);
    active++;
  }
  s.activeCount=active;if(!c.loop&&time>=s.number(c.duration+c.lifetimeMax)&&!active)s.playing=false;
}
function updateMeshParticleVertices(state) {
  const corners=state.meshTemplate.length/4,p=state.positions,c=state.colors;
  for(let i=0;i<state.settings.count;i++){
    const at=i*4,size=state.sizes?.[i]??state.settings.size,spin=state.spins?.[i]||0,cos=Math.cos(spin),sin=Math.sin(spin),alpha=state.particles[at+3]*state.settings.opacity;
    updateParticleUVs(state,i,alpha);
    const world=state.settings.simulationSpace==='world',offset=i*3,emitter=state.emitter,born=world?matFromEuler(state.spawnRotations[offset],state.spawnRotations[offset+1],state.spawnRotations[offset+2]):null,current=world?matFromEuler(emitter.rotation.x,emitter.rotation.y,emitter.rotation.z):null;
    for(let j=0;j<corners;j++){
      const v=(i*corners+j)*4,b=j*4,x=state.meshTemplate[b]*size,y=state.meshTemplate[b+1]*size,z=state.meshTemplate[b+2]*size;
      let lx=x*cos-y*sin,ly=x*sin+y*cos,lz=z;
      if(world){const bx=lx*state.spawnScales[offset],by=ly*state.spawnScales[offset+1],bz=lz*state.spawnScales[offset+2],wx=born[0]*bx+born[4]*by+born[8]*bz,wy=born[1]*bx+born[5]*by+born[9]*bz,wz=born[2]*bx+born[6]*by+born[10]*bz;lx=(wx*current[0]+wy*current[1]+wz*current[2])/(emitter.scale.x||1);ly=(wx*current[4]+wy*current[5]+wz*current[6])/(emitter.scale.y||1);lz=(wx*current[8]+wy*current[9]+wz*current[10])/(emitter.scale.z||1);}
      p[v]=alpha>0?state.particles[at]+lx:0;p[v+1]=alpha>0?state.particles[at+1]+ly:0;p[v+2]=alpha>0?state.particles[at+2]+lz:0;p[v+3]=1;
      for(let k=0;k<3;k++)c[v+k]=state.tints?state.tints[at+k]:state.settings.color[['r','g','b'][k]];c[v+3]=alpha-1;
    }
  }
}
