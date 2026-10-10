function configureFlipbookPreview(root,value,files,textureFile) {
  const image=files.find(f=>f.cat==='textures'&&f.name===textureFile)?.image||files.find(f=>f.cat==='textures'&&f.name===textureFile)?.imageSize||{},settings=normalizedFlipbook(value);
  root.traverse(node=>{
    if(!node.isMesh||!node.geometry.attributes.uv)return;
    const previous=node.geometry;node.geometry=previous.clone();previous.dispose();
    const uv=node.geometry.attributes.uv,state=createFlipbookUVState(uv.array,settings,2,true,image.width,image.height);
    applyFlipbookFrame(state,0);uv.needsUpdate=true;node.userData.flipbook=state;
  });
}

function advanceFlipbookPreview(root,dt) {
  root.traverse(node=>{if(node.userData.flipbook&&advanceFlipbookUVs(node.userData.flipbook,dt))node.geometry.attributes.uv.needsUpdate=true;});
}
