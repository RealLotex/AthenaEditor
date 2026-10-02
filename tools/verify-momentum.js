import { load, PURE_MODULES, shutdown } from '../tests/_load.js';
import { runConsoleFixture } from './run-console-fixture.js';
import { assert } from 'jsr:@std/assert@1';
const A = await load([...PURE_MODULES, 'templates/assets.js', 'templates/sidescroller.js']);
const project = A.migrateProject(A.templateSideScroller());
const scene = project.scenes[0];
scene.objects = scene.objects.filter(o => !['Platform2','Platform3'].includes(o.name));
scene.objects.find(o => o.name === 'Platform1').components.transform.position.x = -80;
const probe = A.mkObject('Movement Probe');
probe.components.script = {...A.makeComponent('script'), file:'MovementProbe.js', ctxKey:'probe'};
scene.objects.unshift(probe);
const content = `import { init as resetPlayer } from './SideScrollerController.js';
let log, n = 0, lastBtns = 0, airDashes = 0;
function sample(tag, ctx) {
 const body = ctx.physics.bodies.player, s = ctx.player;
 log.puts(JSON.stringify({tag:tag,n:n,p:body.getPosition(),v:body.getLinearVel(),motion:s.motion,grounded:s.grounded,tier:s.speedTier,charge:s.charge,sprintTime:s.sprintTime,vx:s.vx,vy:s.vy,normal:s.lastHitNormal,events:s.events,airDashes:airDashes}) + '\\n'); log.flush();
}
function reset(ctx, x, y, vx, vy) {
 resetPlayer(ctx); ctx.player.lastHitNormal = null;
 ctx.physics.bodies.player.setPosition(x, y, 0);
 ctx.physics.bodies.player.setLinearVel(vx, vy, 0);
 lastBtns = 0;
}
export function init(ctx) { log = std.open('probe.log', 'w'); }
export function update(ctx, pad) {
 n++;
 if (ctx.player.events.dash && n > 800 && n < 930) airDashes++;
 if (ctx.player.events.slamLand && n > 680 && n < 800) sample('slamLand',ctx);
 pad.lx = 0; pad.ly = 0; let buttons = 0;
 if (n === 1) reset(ctx,-35,0.5,0,0);
 if (n >= 61 && n <= 210) { pad.lx = 127; buttons = Pads.R1; }
 if (n === 62) sample('acceleration',ctx);
 if (n === 100) sample('run',ctx);
 if (n === 145) sample('fast',ctx);
 if (n === 210) sample('mach',ctx);
 if (n === 224) sample('coast',ctx);
 if (n >= 225 && n <= 230) pad.lx = -127;
 if (n === 226) sample('skid',ctx);
 if (n === 231) reset(ctx,0,0.5,12,0);
 if (n >= 232 && n <= 300) buttons = Pads.DOWN;
 if (n === 240) sample('roll',ctx);
 if (n === 331) reset(ctx,0,0.5,0,0);
 if (n >= 332 && n <= 410) buttons = Pads.DOWN;
 if (n === 333) buttons |= Pads.CROSS;
 if (n === 410) sample('charge',ctx);
 if (n === 412) sample('launch',ctx);
 if (n === 481) reset(ctx,0,0.5,0,0);
 if (n >= 511 && n <= 580) buttons = Pads.CROSS;
 if (n === 541) sample('fullJump',ctx);
 if (n === 591) reset(ctx,0,0.5,0,0);
 if (n === 621) buttons = Pads.CROSS;
 if (n === 641) sample('shortJump',ctx);
 if (n === 681) reset(ctx,0,3,5,3);
 if (n >= 701 && n < 780) buttons = Pads.DOWN;
 if (n === 702) sample('slam',ctx);
 if (n === 780) sample('recovered',ctx);
 if (n === 801) reset(ctx,0,20,0,0);
 if (n === 821 || n === 861) buttons = Pads.SQUARE;
 if (n === 822) sample('airDash',ctx);
 if (n === 862) sample('airDashAgain',ctx);
 if (n === 931) reset(ctx,-80,1.7,0,0);
 if (n === 960) sample('platformRest',ctx);
 if (n >= 961 && n <= 1000) buttons = Pads.CROSS;
 if (n === 991) sample('platformJump',ctx);
 pad.old_btns = lastBtns; pad.btns = buttons; lastBtns = buttons;
 if (n === 1030) { sample('DONE',ctx); log.close(); log = null; }
}`;
const assets = A.templateAssetFiles(project, ['ground.obj','player.obj','platform.obj']);
assets.find(a => a.path.endsWith('ground.obj')).text = A.groundObj(200);
const out = A.generateProject(project, [{name:'MovementProbe.js',cat:'scripts',content},
 ...assets.map(f => ({name:f.path.split('/').pop(),cat:'models',content:f.text}))]);
const log = await runConsoleFixture(out);
await Deno.writeTextFile('.verification/momentum-optimized.log', log);
const records = log.trim().split('\n').map(line => JSON.parse(line));
const at = tag => { const r = records.find(r => r.tag === tag); assert(r, 'missing '+tag); return r; };
at('DONE');
assert(at('acceleration').v[0] > 0 && at('acceleration').v[0] < 1, 'gradual acceleration');
assert(at('run').v[0] <= 9.05 && at('run').v[0] > 8, 'first sprint stage speed limit');
assert(at('fast').v[0] <= 12.05 && at('fast').v[0] > 11, 'second sprint stage speed limit');
assert(at('mach').v[0] > 13, 'mach speed');
assert(at('coast').v[0] > 8, 'coast instead of instant stop');
assert(at('skid').v[0] > 0 && at('skid').motion === 'skid', 'skid before reversing');
assert(at('roll').motion === 'roll' && at('roll').v[0] > 9, 'rolling momentum');
assert(at('charge').motion === 'charge' && at('charge').charge >= 7.9, 'charged launch');
assert(at('launch').events.launch && at('launch').v[0] > 16, 'launch on release');
assert(at('fullJump').p[1] > 2.3 && at('shortJump').p[1] < 1.2, 'variable jump height');
assert(at('slam').motion === 'slam' && at('slam').v[1] < -17, 'ground pound');
assert(at('slamLand').events.slamLand, 'ground pound landing event');
assert(at('recovered').grounded, 'recover after ground pound');
assert(at('airDash').v[0] > 11 && at('airDash').events.dash, 'air shoulder dash');
assert(at('airDashAgain').airDashes === 1, 'one dash before landing');
assert(at('platformRest').grounded && at('platformJump').p[1] > 3.5, 'platform jump');
await Deno.writeTextFile('docs/verification/momentum-optimized.json', JSON.stringify({date:'2026-10-02',passed:true,frames:1030,records},null,2));
console.log('PASS: acceleration, mach run, coast, skid, roll, charge, launch, variable jump, slam, recovery, air dash, platform jump');
await shutdown();
