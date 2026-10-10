// Build one indexed landscape atlas in the editor. The console still samples
// one texture in one draw pass; no splat maps or extra runtime uploads.
function terrainBlendedPixels(t, tiles) {
  checkTerrain(t);
  const size=[256,512,1024].includes(t.blendSize)?t.blendSize:512,ground=size*3/4;
  const data=new Uint8ClampedArray(size*size*4),smooth=v=>v*v*(3-2*v);
  const sample=(tile,u,v,c)=>tile.data[(Math.min(tile.height-1,Math.floor(((v%1+1)%1)*tile.height))*tile.width+Math.min(tile.width-1,Math.floor(((u%1+1)%1)*tile.width)))*4+c];
  const surface=(x,z)=>t.surfaces[clamp(z,0,t.depth-1)*t.width+clamp(x,0,t.width-1)];
  for(let y=0;y<size;y++)for(let x=0;x<size;x++){
    const at=(y*size+x)*4;
    if(y>=ground){for(let c=0;c<3;c++)data[at+c]=sample(tiles[3],x/(size/4),(y-ground)/(size/4),c);}
    else {
      const gx=x/(size-1)*t.width,gz=y/(ground-1)*t.depth,ix=Math.floor(gx-.5),iz=Math.floor(gz-.5),u=smooth(gx-.5-ix),v=smooth(gz-.5-iz);
      const slots=[surface(ix,iz),surface(ix+1,iz),surface(ix,iz+1),surface(ix+1,iz+1)],weights=[(1-u)*(1-v),u*(1-v),(1-u)*v,u*v];
      for(let c=0;c<3;c++){let color=0;for(let i=0;i<4;i++)color+=sample(tiles[slots[i]],gx/4,gz/4,c)*weights[i];data[at+c]=Math.round(color);}
    }
    data[at+3]=255;
  }
  return {width:size,height:size,data};
}

async function blendedTerrainAsset(t,files,name) {
  const base=terrainAtlasPixels(),tiles=[];
  for(let slot=0;slot<4;slot++){
    const filename=t.textures?.[slot],file=files.find(f=>f.cat==='textures'&&f.name===filename);
    if(filename&&!file)throw Error(`The terrain texture ${filename} is missing.`);
    if(file)tiles.push(await readTexturePixels(file));
    else {
      const data=new Uint8ClampedArray(128*128*4),ox=slot%2*128,oy=Math.floor(slot/2)*128;
      for(let y=0;y<128;y++)data.set(base.data.subarray(((oy+y)*256+ox)*4,((oy+y)*256+ox+128)*4),y*128*4);
      tiles.push({width:128,height:128,data});
    }
  }
  return {...await textureOutputAsset(terrainBlendedPixels(t,tiles),name,t.blendBits===4?16:256),terrainTextureVersion:TERRAIN_DEFAULT_ATLAS.terrainTextureVersion,editKind:'terrain',libraryFolder:'Generated/Terrain'};
}
