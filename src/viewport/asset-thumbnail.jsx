const MODEL_THUMBNAILS = new Map();
let modelThumbnailQueue = Promise.resolve();

function modelThumbnail(asset) {
  const cached = MODEL_THUMBNAILS.get(asset.name);
  if (cached && cached.content === asset.content && cached.dataUrl === asset.dataUrl) return cached.promise;
  // Serialize work: at most one thumbnail context and loaded mesh exist at once.
  const promise = modelThumbnailQueue.catch(() => {}).then(async () => {
    let renderer, model;
    try {
      model = /\.obj$/i.test(asset.name)
        ? new THREE.Mesh(parseOBJ(asset.content), new THREE.MeshStandardMaterial({color:0x8fb8ff, roughness:.7, side:THREE.DoubleSide}))
        : await loadGLTF(asset.dataUrl || asset.content);
      renderer = new THREE.WebGLRenderer({antialias:true, alpha:true});
      renderer.setSize(128, 96); renderer.setClearColor(0x101a29, 1);
      const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(35, 128/96, .001, 10000);
      scene.add(model, new THREE.AmbientLight(0xffffff, .8));
      const light = new THREE.DirectionalLight(0xffffff, 1.3); light.position.set(3,5,4); scene.add(light);
      const box = new THREE.Box3().setFromObject(model), center = box.getCenter(new THREE.Vector3());
      const radius = Math.max(box.getSize(new THREE.Vector3()).length()/2, .01);
      camera.position.copy(center).add(new THREE.Vector3(1,.7,1).normalize().multiplyScalar(radius * 4));
      camera.near = radius/100; camera.far = radius*10; camera.updateProjectionMatrix(); camera.lookAt(center);
      renderer.render(scene, camera);
      return renderer.domElement.toDataURL('image/png');
    } finally {
      if (model) disposeObject(model);
      if (renderer) {renderer.dispose(); renderer.forceContextLoss();}
    }
  });
  modelThumbnailQueue = promise;
  MODEL_THUMBNAILS.set(asset.name, {content:asset.content, dataUrl:asset.dataUrl, promise});
  if (MODEL_THUMBNAILS.size > 128) MODEL_THUMBNAILS.delete(MODEL_THUMBNAILS.keys().next().value);
  return promise;
}

function AssetThumbnail({asset}) {
  const [preview, setPreview] = useState(null), element = useRef(null);
  useEffect(() => {
    setPreview(null);
    if (asset.cat !== 'models' || asset.error || (!asset.dataUrl && !asset.content)) return;
    let cancelled = false, requested = false;
    const observer = new IntersectionObserver(entries => {
      if (!requested && entries.some(e => e.isIntersecting)) {
        requested = true; observer.disconnect();
        modelThumbnail(asset).then(url => {if (!cancelled) setPreview(url);}).catch(() => {});
      }
    });
    observer.observe(element.current);
    return () => {cancelled = true; observer.disconnect();};
  }, [asset.name, asset.content, asset.dataUrl, asset.error]);
  const url = asset.cat === 'textures' ? asset.dataUrl : preview;
  return <span ref={element} className="a-asset-preview">{url
    ? <img className="a-asset__thumb" src={url} alt="" loading="lazy"/>
    : <span className="a-asset__icon" style={{color:asset.error?'var(--err)':CAT_META[asset.cat]?.color}}>{CAT_META[asset.cat]?.icon || '▪'}</span>}</span>;
}
