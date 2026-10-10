function syncViewportEnvironment(world,scene) {
  const fog=normalizedSceneFog(scene.environment?.fog);
  world.fog=fog.enabled?new THREE.Fog(new THREE.Color(fog.color.r,fog.color.g,fog.color.b),fog.start,fog.end):null;
}

function configureReflectionPreview(root,value,files) {
  const file=files.find(f=>f.cat==='textures'&&f.name===value?.texture);if(!file?.dataUrl)return;
  const texture=makeTexture(file.dataUrl,value.filter||'LINEAR');texture.mapping=THREE.EquirectangularReflectionMapping;
  const done=new Set();root.traverse(node=>{
    if(!node.isMesh)return;
    for(const m of [].concat(node.material)){if(done.has(m))continue;done.add(m);m.envMap=texture;m.combine=THREE.AddOperation;m.reflectivity=.5;if(m.isMeshStandardMaterial){m.metalness=.25;m.roughness=.2;}m.needsUpdate=true;}
  });
}
