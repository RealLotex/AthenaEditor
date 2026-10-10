// A bounded, median-split triangle index for editor baking. Rays visit nearby
// leaves instead of testing every terrain face for every surface sample.
class EnvironmentOcclusionIndex {
  constructor(meshes=[],triangles=null) {
    const values=triangles||[],point=meshes.length?new THREE.Vector3():null;
    for(const mesh of meshes){
      const positions=mesh.geometry.attributes.position,indices=mesh.geometry.index,count=indices?.count||positions.count;
      for(let i=0;i<count;i++){point.fromBufferAttribute(positions,indices?indices.getX(i):i).applyMatrix4(mesh.matrixWorld);values.push(point.x,point.y,point.z);}
    }
    this.triangles=new Float64Array(values);this.order=Int32Array.from({length:values.length/9},(_,i)=>i);this.nodes=[];this.stack=[];
    const build=(begin,end)=>{
      const lo=[Infinity,Infinity,Infinity],hi=[-Infinity,-Infinity,-Infinity];
      for(let i=begin;i<end;i++)for(let v=0;v<3;v++)for(let c=0;c<3;c++){const value=this.triangles[this.order[i]*9+v*3+c];lo[c]=Math.min(lo[c],value);hi[c]=Math.max(hi[c],value);}
      const id=this.nodes.length,node={lo,hi,begin,end,left:-1,right:-1};this.nodes.push(node);
      if(end-begin>8){
        let axis=0;for(let c=1;c<3;c++)if(hi[c]-lo[c]>hi[axis]-lo[axis])axis=c;
        const center=i=>this.triangles[i*9+axis]+this.triangles[i*9+3+axis]+this.triangles[i*9+6+axis];
        this.order.subarray(begin,end).sort((a,b)=>center(a)-center(b));const mid=begin+Math.floor((end-begin)/2);
        node.left=build(begin,mid);node.right=build(mid,end);
      }
      return id;
    };
    if(this.order.length)build(0,this.order.length);
  }
  trace(origin,direction,limit) {
    if(!this.nodes.length)return null;
    const p=[origin.x,origin.y,origin.z],d=[direction.x,direction.y,direction.z],stack=this.stack,tri=this.triangles;stack.length=0;stack.push(0);let nearest=limit,hit=false;
    while(stack.length){
      const node=this.nodes[stack.pop()];let near=0,far=nearest,intersects=true;
      for(let c=0;c<3;c++){
        if(Math.abs(d[c])<1e-12){if(p[c]<node.lo[c]||p[c]>node.hi[c]){intersects=false;break;}}
        else{const a=(node.lo[c]-p[c])/d[c],b=(node.hi[c]-p[c])/d[c];near=Math.max(near,Math.min(a,b));far=Math.min(far,Math.max(a,b));if(near>far){intersects=false;break;}}
      }
      if(!intersects)continue;
      if(node.left>=0){stack.push(node.left,node.right);continue;}
      for(let i=node.begin;i<node.end;i++){
        const at=this.order[i]*9,ax=tri[at],ay=tri[at+1],az=tri[at+2],ex=tri[at+3]-ax,ey=tri[at+4]-ay,ez=tri[at+5]-az,fx=tri[at+6]-ax,fy=tri[at+7]-ay,fz=tri[at+8]-az;
        const qx=d[1]*fz-d[2]*fy,qy=d[2]*fx-d[0]*fz,qz=d[0]*fy-d[1]*fx,det=ex*qx+ey*qy+ez*qz;if(Math.abs(det)<1e-12)continue;
        const inv=1/det,tx=p[0]-ax,ty=p[1]-ay,tz=p[2]-az,u=(tx*qx+ty*qy+tz*qz)*inv;if(u<0||u>1)continue;
        const rx=ty*ez-tz*ey,ry=tz*ex-tx*ez,rz=tx*ey-ty*ex,v=(d[0]*rx+d[1]*ry+d[2]*rz)*inv;if(v<0||u+v>1)continue;
        const distance=(fx*rx+fy*ry+fz*rz)*inv;if(distance>=.001&&distance<nearest){nearest=distance;hit=true;}
      }
    }
    return hit?nearest:null;
  }
}
