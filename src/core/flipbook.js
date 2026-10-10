// Atlas animation changes UVs, never uploads a new image. Frames are ordered
// left to right, then top to bottom; particles use their own age as the clock.
function normalizedFlipbook(value={}) {
  return {columns:Math.round(clamp(num(value.columns,4),1,16)),rows:Math.round(clamp(num(value.rows,4),1,16)),
    fps:clamp(num(value.fps,12),1,30),loop:value.loop!==false};
}

function flipbookFrame(settings,time) {
  const count=settings.columns*settings.rows,frame=Math.max(0,Math.floor(time*settings.fps+1e-7));
  return settings.loop?frame%count:Math.min(count-1,frame);
}

function createFlipbookUVState(uvs,settings,stride=4,bottomUp=false,width=0,height=0) {
  const frames=[],columns=settings.columns,rows=settings.rows;
  const insetU=width>0?Math.min(.49,.5*columns/width):0,insetV=height>0?Math.min(.49,.5*rows/height):0;
  for(let frame=0;frame<columns*rows;frame++){
    const lane=new Float32Array(uvs),col=frame%columns,row=Math.floor(frame/columns),y=bottomUp?rows-row-1:row;
    for(let at=0;at<lane.length;at+=stride){
      lane[at]=(col+insetU+Math.max(0,Math.min(1,uvs[at]))*(1-2*insetU))/columns;
      lane[at+1]=(y+insetV+Math.max(0,Math.min(1,uvs[at+1]))*(1-2*insetV))/rows;
    }
    frames.push(lane);
  }
  return {uvs,settings,frames,frame:-1,clock:new Float64Array(1)};
}

function applyFlipbookFrame(state,time) {
  const frame=flipbookFrame(state.settings,time);
  if(frame===state.frame)return false;
  state.uvs.set(state.frames[frame]);state.frame=frame;return true;
}

function advanceFlipbookUVs(state,dt) {
  state.clock[0]+=Math.max(0,Math.min(.1,dt));
  return applyFlipbookFrame(state,state.clock[0]);
}

function flipbookProblems(value) {
  const out=[];
  for(const key of ['columns','rows'])if(!Number.isInteger(value[key])||value[key]<1||value[key]>16)out.push({level:'error',msg:'Flipbook '+key+' must be an integer between 1 and 16.'});
  if(!Number.isFinite(value.fps)||value.fps<1||value.fps>30)out.push({level:'error',msg:'Flipbook speed must be between 1 and 30 frames per second.'});
  return out;
}
