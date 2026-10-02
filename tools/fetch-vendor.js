// Downloads the browser runtime libs once into vendor/ so the built editor
// works with no network. Re-run only when bumping a version.
const LIBS = [
  ["react.js",           "https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"],
  ["react-dom.js",       "https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"],
  ["three.js",           "https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js"],
  ["OrbitControls.js",   "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/controls/OrbitControls.js"],
  ["GLTFLoader.js",      "https://cdn.jsdelivr.net/npm/three@0.128.0/examples/js/loaders/GLTFLoader.js"],
];
for (const [name, url] of LIBS) {
  const r = await fetch(url);
  if (!r.ok) { console.error(`FAIL ${name}: ${r.status}`); Deno.exit(1); }
  const text = await r.text();
  await Deno.writeTextFile(`vendor/${name}`, text);
  console.log(`${name.padEnd(20)} ${(text.length/1024).toFixed(0)} KB`);
}
