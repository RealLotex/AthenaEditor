// Exercise release-specific float comparisons, camera bounds and forgiving jumps.
import { load, PURE_MODULES, shutdown } from "../tests/_load.js";
import { runConsoleFixture } from "./run-console-fixture.js";
import { assert } from "jsr:@std/assert@1";
const A = await load([...PURE_MODULES, "templates/assets.js", "templates/firstperson.js",
  "templates/thirdperson.js", "templates/sidescroller.js", "templates/topdown.js", "templates/registry.js"]);
const results = [];
for (const id of ["first-person", "third-person", "top-down"]) {
  const template = A.PROJECT_TEMPLATES.find(t => t.id === id), p = template.make(), sc = p.scenes[0];
  const jumping = id !== "top-down", radius = id === "first-person" ? .4 : .5;
  const probe = A.mkObject("Quality Probe");
  probe.components.script = { ...A.makeComponent("script"), file: "QualityProbe.js", ctxKey: "quality" };
  const ceiling = A.mkObject("Ceiling Probe");
  ceiling.components.transform.position = A.v3(50, 1.25, 0);
  ceiling.components.rigidbody = { ...A.makeComponent("rigidbody"), mode: "static", shape: "box", size: A.v3(3, .1, 3), autoFit: false };
  sc.objects.unshift(probe); sc.objects.push(ceiling);
  const content = `import { init as resetPlayer } from './${p.scripts[0].name}';
let log, n = 0, previous = 0;
function sample(tag,ctx) {
 const s=ctx.player;
 log.puts(JSON.stringify({tag,n,p:s.body.getPosition(),v:s.body.getLinearVel(),grounded:s.grounded,
  yaw:s.yaw,pitch:s.pitch,angle:s.angle,jumping:s.jumping,coyote:s.coyote,
  contactPoint:s.lastHitPosition,rotation:s.view ? s.view.rotation : null})+'\\n'); log.flush();
}
function reset(ctx,x,y,vy) {
 resetPlayer(ctx); ctx.player.lastHitNormal=null;
 ctx.player.body.setPosition(x,y,0); ctx.player.body.setLinearVel(0,vy,0); previous=0;
}
export function init(ctx) { log=std.open('probe.log','w'); }
export function update(ctx,pad) {
 n++; pad.lx=pad.ly=pad.rx=pad.ry=0; let buttons=0;
 if(n===1) reset(ctx,0,${radius + .02},0);
 ${jumping ? `
 if(n===61 || n===63) buttons=Pads.CROSS;
 if(n===62) sample('jump',ctx);
 if(n===64) sample('noDoubleJump',ctx);
 if(n===120) reset(ctx,0,${radius + .02},0);
 if(n===150) { ctx.player.body.setPosition(0,20,0);ctx.player.body.setLinearVel(0,0,0);ctx.player.lastHitNormal=null; }
 if(n===152) buttons=Pads.CROSS;
 if(n===153) sample('coyote',ctx);
 if(n===200) reset(ctx,0,${radius + .2},-1);
 if(n===204) buttons=Pads.CROSS;
 if(n===214) sample('bufferedJump',ctx);
 if(n===260) { ctx.player.yaw=3.12;ctx.player.pitch=99.0; }
 if(n>=260 && n<=265) pad.rx=-127;
 if(n===266) sample('cameraBounds',ctx);
 ` : ""}
 if(n===280) { reset(ctx,0,${radius + .02},0);ctx.player.angle=-3.0; }
 if(n>=281 && n<=288) { pad.lx=40;pad.ly=-127; }
 if(n===282) sample('shortTurn',ctx);
 if(n===300) { pad.lx=128;pad.ly=-128; }
 if(n===301) sample('diagonal',ctx);
 ${jumping ? `
 if(n===320) reset(ctx,50,${radius + .02},0);
 if(n===330 || n===336) buttons=Pads.CROSS;
 if(n===340) sample('ceiling',ctx);
 ` : ""}
 pad.old_btns=previous;pad.btns=buttons;previous=buttons;
 if(n===360) {sample('DONE',ctx);log.close();}
}`;
  const assets = A.templateAssetFiles(p, template.needs.map(n => n.split("/").pop()))
    .map(f => ({ name: f.path.split("/").pop(), cat: "models", content: f.text }));
  const log = await runConsoleFixture(A.generateProject(p, [...assets, { name: "QualityProbe.js", cat: "scripts", content }]));
  await Deno.writeTextFile(`.verification/quality-${id}.log`, log);
  const records = log.trim().split("\n").map(line => JSON.parse(line));
  const at = tag => { const r = records.find(r => r.tag === tag); assert(r, `${id}: missing ${tag}`); return r; };
  if (jumping) {
    const jump = at("jump").v[1];
    assert(jump > 4, `${id}: jump`);
    assert(at("noDoubleJump").v[1] < jump - .2 && !at("noDoubleJump").grounded, `${id}: stale double jump`);
    assert(at("coyote").v[1] > 4, `${id}: edge tolerance`);
    assert(at("bufferedJump").v[1] > 3 && at("bufferedJump").jumping, `${id}: buffered landing`);
    assert(Math.abs(at("cameraBounds").yaw) <= Math.PI && at("cameraBounds").pitch <= (id === "first-person" ? 1.35 : 1.2), `${id}: camera limits`);
    assert(at("ceiling").contactPoint?.[1] > 1.15 && !at("ceiling").grounded && at("ceiling").v[1] < 1, `${id}: ceiling support`);
  }
  if (id !== "first-person") assert(at("shortTurn").angle < -3, `${id}: shortest turn through PI`);
  assert(Math.hypot(at("diagonal").v[0], at("diagonal").v[2]) <= (id === "first-person" ? 5.01 : 6.01), `${id}: diagonal speed`);
  results.push({ id, passed: true, records }); console.log(JSON.stringify({ id, passed: true }));
}
await Deno.writeTextFile("docs/verification/controller-quality.json", JSON.stringify({ date: "2026-10-02", results }, null, 2));
await shutdown();
