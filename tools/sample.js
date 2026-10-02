// Generates a representative scene and prints main.js.
//   deno run -A tools/sample.js            full scene
//   deno run -A tools/sample.js > out.js   to a file
import { load } from "../tests/_load.js";

const A = await load();
const p = A.mkProject();
const s = p.scenes[0];
s.name = "Demo";
p.display.debugHUD = true;   // project-wide as of v3
s.physics.enabled = true;
s.objects = [];

const obj = (name, comps = {}, pos) => {
  const o = A.mkObject(name);
  for (const [k, patch] of Object.entries(comps)) o.components[k] = Object.assign(A.makeComponent(k), patch);
  if (pos) o.components.transform.position = pos;
  return o;
};

const cam = obj("Main Camera", { camera: { fov: 55 } }, A.v3(0, 4, 14));
const sun = obj("Sun", { light: { direction: A.v3(0, 1, 1) } });

const ground = obj("Ground", {
  model: { file: "ground.obj", textureFile: "grass.png" },
  rigidbody: { mode: "static", shape: "plane", planeY: 0 },
});

const hero = obj("Hero", {
  model: { file: "hero.gltf" },
  animator: { file: "hero.gltf", defaultAnim: "Run", loop: true },
  script: { file: "Hero.js" },
  rigidbody: { mode: "dynamic", shape: "sphere", radius: 0.6, mass: 3, autoFit: false, collisionEvents: true, onCollide: "hero" },
}, A.v3(0, 2, 0));

const heroShadow = obj("HeroShadow", {
  shadow: { caster: "Hero", lightSource: "Sun", raycast: true, rayLength: 12, follow: true, groundY: 0, camDist: 6 },
});

// a nested crate stack, to exercise baked world transforms
const stack = obj("Stack", {}, A.v3(6, 0, -3));
stack.components.transform.rotation = A.v3(0, 0.6, 0);
for (let i = 0; i < 2; i++) {
  const c = obj(`Crate`, {
    model: { file: "crate.obj", textureFile: "crate.png" },
    rigidbody: { mode: "dynamic", shape: "box", size: A.v3(1, 1, 1), mass: 1, autoFit: false },
  }, A.v3(0, 1 + i * 1.1, 0));
  stack.children.push(c);
}

const zone = obj("GoalZone", {
  rigidbody: { mode: "trigger", shape: "box", size: A.v3(3, 3, 3), autoFit: false, collisionEvents: true, onCollide: "goal" },
}, A.v3(-8, 1.5, 0));

s.objects = [cam, sun, ground, hero, heroShadow, stack, zone];

const hud = A.mkUIEl("Text");
hud.name = "ScoreLabel";
hud.text = 'Score: 0';
const bar = A.mkUIEl("ProgressBar");
bar.name = "HealthBar";
s.uiElements = [hud, bar];

A.migrateProject(p);
const out = A.generateProject(p, [
  { name: "Hero.js", cat: "scripts", content: "export function init(ctx){}\nexport function update(ctx,pad){}\n" },
]);

console.log(out.main);
console.error(`\n--- stats ---\n${JSON.stringify(out.stats, null, 2)}`);
console.error(`\n--- diagnostics (${out.diagnostics.length}) ---`);
for (const d of out.diagnostics) console.error(`[${d.level}] ${d.objectName ? d.objectName + ": " : ""}${d.message}`);
