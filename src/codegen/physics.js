// ═══════════════════════════════════════════════════════════════════════
//  PHYSICS — ODE world, spaces, bodies, geoms, contacts
//
//  Verified against reference/AthenaEnv/src/js_api/ath_ode.c and the
//  engine's own bin/shadows.js. Signatures that the previous generator got
//  backwards, and which silently disabled all physics:
//
//    world.stepWithContacts(space, jointGroup, stepSize, callback?)
//    ODE.GeomRenderObject(space, renderObject)
//    ODE.GeomBox(space, x, y, z)      ODE.GeomSphere(space, radius)
//    ODE.GeomPlane(space, a, b, c, d) ODE.GeomRay(space, length)
//
//  stepWithContacts does the whole job: broad phase, contact joints,
//  dWorldStep, then it empties the joint group itself. Never build contact
//  joints by hand and never call space.collide() for the same space in the
//  same frame — that runs the broad phase twice.
//
//  Two constraints come from the engine and are surfaced as diagnostics
//  rather than worked around:
//
//   * Body.setRotation()/Geom.setRotation() take 9 floats but ODE's dMatrix3
//     is 12 with a padding lane, so the last row is filled with stack
//     garbage. Initial rotations are therefore never emitted; bodies start
//     axis-aligned.
//   * GeomRenderObject builds its trimesh from the mesh's own vertex buffer,
//     so object scale is not applied to the collider.
//
//  Contact surface parameters (mu 0.5, bounce 0.1, soft CFM 0.01) are baked
//  into the engine's contact_callback and cannot be set from script.
// ═══════════════════════════════════════════════════════════════════════

function emitPhysicsSetup(e, ir) {
  const P = ir.physics;
  if (!P.enabled) return;

  const s = P.settings;
  const g = s.gravity || { x: 0, y: -9.81, z: 0 };

  e.section("Physics — ODE");
  e.w(`const ode_world    = ODE.World();`);
  e.w(`const ode_space    = ODE.Space();`);
  e.w(`const ode_contacts = ODE.JointGroup();`);
  e.nl();
  e.w(`ode_world.setGravity(${f3(g.x)}, ${f3(g.y)}, ${f3(g.z)});`);
  e.w(`ode_world.setCFM(${s.cfm ?? 1e-5});`);
  e.w(`ode_world.setERP(${s.erp ?? 0.8});`);
  e.w(`ode_world.setQuickStepIterations(${il(s.iterations ?? 10)});`);
  e.nl();

  const triggers = P.bodies.filter((b) => b.isTrigger);
  const solids = P.bodies.filter((b) => !b.isTrigger);

  for (const b of solids) emitBody(e, ir, b, "ode_space");

  if (triggers.length) {
    e.comment(
      "Triggers are created outside any space so the solver never sees them.",
      "That is what keeps them from blocking movement; overlaps are polled below.",
    );
    e.nl();
    for (const b of triggers) emitBody(e, ir, b, "null");
  }

  // Only needed where a body's rotation actually drives a visual.
  if (P.bodies.some((b) => b.isDynamic && b.model && !b.freezeRotation)) {
    e.section("ODE rotation -> engine euler");
    e.w(...ODE_EULER_RUNTIME.split("\n"));
    e.nl();
  }

  emitContactCallback(e, ir);
  emitTriggerTables(e, ir);
}

function emitBody(e, ir, b, spaceExpr) {
  const t = b.world;
  const px = f3(t.position.x), py = f3(t.position.y), pz = f3(t.position.z);
  const rotated = Math.abs(t.rotation.x) + Math.abs(t.rotation.y) + Math.abs(t.rotation.z) > 1e-4;

  e.comment(`${b.obj.name} — ${b.mode} ${b.shape}`);

  if (b.isDynamic) {
    e.w(`const ${b.bodyVN} = ODE.Body(ode_world);`);
    if (b.shape === "sphere") {
      e.w(`${b.bodyVN}.setMassSphere(${fl(b.rb.mass ?? 1)}, ${fl(b.radius)});`);
    } else {
      e.w(`${b.bodyVN}.setMassBox(${fl(b.rb.mass ?? 1)}, ${fl(b.size.x)}, ${fl(b.size.y)}, ${fl(b.size.z)});`);
    }
    e.w(`${b.bodyVN}.setPosition(${px}, ${py}, ${pz});`);
    if (rotated) {
      e.problem("warn",
        `"${b.obj.name}" starts rotated, but ODE's setRotation binding is unsafe ` +
        `(it writes 9 of the 12 floats a dMatrix3 needs). The body starts axis-aligned.`,
        { objectId: b.obj.id, objectName: b.obj.name, component: "rigidbody" });
    }
  }

  switch (b.shape) {
    case "sphere":
      e.w(`const ${b.geomVN} = ODE.GeomSphere(${spaceExpr}, ${fl(b.radius)});`);
      break;
    case "plane":
      // a*x + b*y + c*z = d, normal pointing up.
      e.w(`const ${b.geomVN} = ODE.GeomPlane(${spaceExpr}, 0.0, 1.0, 0.0, ${fl(b.rb.planeY ?? 0)});`);
      break;
    case "mesh":
      e.w(`const ${b.geomVN} = ODE.GeomRenderObject(${spaceExpr}, ${b.model.vn});`);
      if (Math.abs(t.scale.x - 1) + Math.abs(t.scale.y - 1) + Math.abs(t.scale.z - 1) > 1e-3) {
        e.problem("warn",
          `"${b.obj.name}" has a mesh collider and a non-unit scale. ODE builds the ` +
          `trimesh from the raw mesh, so the collider stays at 1:1.`,
          { objectId: b.obj.id, objectName: b.obj.name, component: "rigidbody" });
      }
      break;
    case "ray":
      e.w(`const ${b.geomVN} = ODE.GeomRay(${spaceExpr}, ${fl(b.rb.rayLength ?? 5)});`);
      e.w(`${b.geomVN}.raySetParams(1, 0);`);
      e.w(`${b.geomVN}.raySetClosestHit(1);`);
      e.w(`${b.geomVN}.raySet(${px}, ${py}, ${pz}, 0.0, -1.0, 0.0);`);
      break;
    default:
      e.w(`const ${b.geomVN} = ODE.GeomBox(${spaceExpr}, ${fl(b.size.x)}, ${fl(b.size.y)}, ${fl(b.size.z)});`);
  }

  // A plane is an implicit surface: it has no position to set and no body.
  if (b.shape !== "plane" && b.shape !== "ray") {
    if (b.isDynamic) e.w(`${b.geomVN}.setBody(${b.bodyVN});`);
    else e.w(`${b.geomVN}.setPosition(${px}, ${py}, ${pz});`);
  }
  if (!b.isDynamic && rotated && b.shape !== "plane") {
    e.problem("info",
      `"${b.obj.name}" is rotated, but ODE's geom rotation binding has the same ` +
      `truncation problem, so the collider stays axis-aligned.`,
      { objectId: b.obj.id, objectName: b.obj.name, component: "rigidbody" });
  }

  // Identity tags read back from contacts.
  e.w(`${b.geomVN}._name = "${jsStr(b.obj.name)}";`);
  if (b.events && b.ctxKey) e.w(`${b.geomVN}._ctxKey = "${jsStr(b.ctxKey)}";`);
  e.nl();
}

function emitContactCallback(e, ir) {
  const solidEvents = ir.physics.bodies.filter((b) => !b.isTrigger && b.events);
  if (!solidEvents.length) return;

  e.comment(
    "Contact events — the engine creates and resolves contact joints itself.",
    "The release ELF reports numeric geom IDs; newer bindings report JS geoms.",
  );
  e.w(`let _odeLegacyContacts = false;`);
  e.w(`function ode_onCollide(c) {`);
  e.block((b) => {
    b.w(`if (typeof c.geom1 === "number" || typeof c.geom2 === "number") {`);
    b.block((x) => {
      x.w(`_odeLegacyContacts = true;`);
      x.w(`return;`);
    });
    b.w(`}`);
    b.w(`const a = c.geom1, d = c.geom2;`);
    b.w(`if (a && a._ctxKey && ctx[a._ctxKey]) {`);
    b.block((x) => {
      x.w(`ctx[a._ctxKey].lastHit = d ? d._name : null;`);
      x.w(`ctx[a._ctxKey].lastHitNormal = c.normal;`);
      x.w(`ctx[a._ctxKey].lastHitPosition = c.position;`);
    });
    b.w(`}`);
    b.w(`if (d && d._ctxKey && ctx[d._ctxKey]) {`);
    b.block((x) => {
      x.w(`ctx[d._ctxKey].lastHit = a ? a._name : null;`);
      x.w(`ctx[d._ctxKey].lastHitNormal = c.normal;`);
      x.w(`ctx[d._ctxKey].lastHitPosition = c.position;`);
    });
    b.w(`}`);
  });
  e.w(`}`);
  e.nl();

  // The shipped ELF's numeric IDs have no public lookup binding. Poll only
  // pairs involving an event geom to recover their identities. geomCollide
  // (ath_ode.c:639) queries contacts without creating joints or stepping ODE.
  const solids = ir.physics.bodies.filter((b) => !b.isTrigger);
  e.w(`const _odeEventPairs = [`);
  e.block((b) => {
    for (let i = 0; i < solids.length; i++) {
      for (let j = i + 1; j < solids.length; j++) {
        const a = solids[i], d = solids[j];
        if (!(a.events || d.events) || !(a.isDynamic || d.isDynamic)) continue;
        b.w(`[${a.geomVN}, ${d.geomVN}],`);
      }
    }
  });
  e.w(`];`);
  e.w(`function _odePollContacts() {`);
  e.block((b) => {
    b.w(`for (const pair of _odeEventPairs) {`);
    b.block((x) => {
      x.w(`const hits = ODE.geomCollide(pair[0], pair[1]);`);
      x.w(`for (const hit of hits || []) {`);
      x.block((y) => {
        y.w(`hit.geom1 = pair[0];`);
        y.w(`hit.geom2 = pair[1];`);
        y.w(`ode_onCollide(hit);`);
      });
      x.w(`}`);
    });
    b.w(`}`);
  });
  e.w(`}`);
  e.nl();
}

function emitTriggerTables(e, ir) {
  const triggers = ir.physics.bodies.filter((b) => b.isTrigger);
  if (!triggers.length) return;

  // Anything that can move is worth testing a trigger against.
  const movers = ir.physics.bodies.filter((b) => b.isDynamic);

  e.comment("Trigger volumes — overlap only, no physical response.");
  e.w(`const _triggers = [`);
  e.block((b) => {
    for (const t of triggers) {
      b.w(`{ geom: ${t.geomVN}, key: ${t.ctxKey ? `"${jsStr(t.ctxKey)}"` : "null"}, name: "${jsStr(t.obj.name)}", hit: null },`);
    }
  });
  e.w(`];`);
  e.w(`const _movers = [`);
  e.block((b) => {
    for (const m of movers) b.w(`{ geom: ${m.geomVN}, name: "${jsStr(m.obj.name)}" },`);
  });
  e.w(`];`);
  e.nl();

  if (!movers.length) {
    e.problem("info", "Trigger volumes exist but no dynamic body can enter them.");
  }

  e.w(`function _updateTriggers() {`);
  e.block((b) => {
    b.w(`for (let i = 0; i < _triggers.length; i++) {`);
    b.block((x) => {
      x.w(`const t = _triggers[i];`);
      x.w(`const was = t.hit;`);
      x.w(`t.hit = null;`);
      x.w(`for (let j = 0; j < _movers.length; j++) {`);
      x.block((y) => {
        y.w(`const hits = ODE.geomCollide(t.geom, _movers[j].geom);`);
        y.w(`if (hits && hits.length) { t.hit = _movers[j].name; break; }`);
      });
      x.w(`}`);
      x.w(`if (t.key && ctx[t.key]) {`);
      x.block((y) => {
        y.w(`ctx[t.key].overlapping = t.hit;`);
        y.w(`ctx[t.key].entered = (t.hit !== null && was === null);`);
        y.w(`ctx[t.key].exited  = (t.hit === null && was !== null);`);
      });
      x.w(`}`);
    });
    b.w(`}`);
  });
  e.w(`}`);
  e.nl();
}

/** The per-frame step, emitted inside the loop. */
function emitPhysicsStep(e, ir) {
  const P = ir.physics;
  if (!P.enabled) return;

  const dt = f3(P.settings.stepSize ?? 0.016);
  const cb = P.bodies.some((b) => !b.isTrigger && b.events) ? ", ode_onCollide" : "";

  e.comment("Physics step — broad phase, contact joints, solve, all in one call");
  if (cb) e.w(`if (_odeLegacyContacts) _odePollContacts();`);
  e.w(`ode_world.stepWithContacts(ode_space, ode_contacts, ${fl(dt)}${cb});`);
  if (P.bodies.some((b) => b.isTrigger)) e.w(`_updateTriggers();`);
  e.nl();

  const frozen = P.bodies.filter((b) => b.freezeRotation);
  if (frozen.length) {
    e.comment("Upright bodies — kill the spin the solver just introduced");
    for (const b of frozen) e.w(`${b.bodyVN}.setAngularVel(0.0, 0.0, 0.0);`);
    e.nl();
  }

  const dyn = P.bodies.filter((b) => b.isDynamic && b.model);
  if (dyn.length) {
    e.comment("Drive the visuals from the simulation");
    for (const b of dyn) {
      e.w(`{`);
      e.block((x) => {
        x.w(`const _p = ${b.bodyVN}.getPosition();`);
        x.w(`${b.model.vn}.position = {x: _p[0], y: _p[1], z: _p[2]};`);
        // A frozen body keeps whatever rotation the script assigned, so the
        // sync deliberately leaves .rotation alone.
        if (!b.freezeRotation) x.w(`${b.model.vn}.rotation = _odeEuler(${b.bodyVN}.getRotation());`);
      });
      e.w(`}`);
    }
    e.nl();
  }

  // A dynamic body with nothing to draw is usually an oversight — but not when
  // a script drives it. A first-person player is exactly that: a collider you
  // look out of, and a mesh would only be clipped by the near plane. Saying
  // nothing there keeps the message meaningful where it is a real mistake.
  const dynNoModel = P.bodies.filter((b) => b.isDynamic && !b.model && !b.obj.components?.script?.file);
  for (const b of dynNoModel) {
    e.problem("info", `"${b.obj.name}" is a dynamic body with no Model — it simulates but draws nothing.`,
      { objectId: b.obj.id, objectName: b.obj.name, component: "rigidbody" });
  }
}
