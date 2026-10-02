// ═══════════════════════════════════════════════════════════════════════
//  TEMPLATE REGISTRY — what File ▸ New Project offers
//
//  Each entry is { id, label, blurb, needs[], make() }.
//
//  `make` is a pure `() => project`: no DOM, no disk, no async. That is what
//  lets tests/template_test.js export every template and assert on the code
//  it produces, and what lets core/scaffold.js lay a folder out before the
//  user has anything on disk.
//
//  `needs` lists the meshes a template refers to by convention. It is the one
//  place that decides both what the dialog promises and which placeholders
//  core/scaffold.js writes — templateAssetNames() reads it — so the two
//  cannot drift apart.
//
//  Every id here must also have `template.<id>.label` and `.blurb` in all
//  three languages in core/i18n.js; the literals below are only the English
//  fallback for a key that has gone missing.
// ═══════════════════════════════════════════════════════════════════════

const PROJECT_TEMPLATES = [
  {
    id: "empty",
    label: "Empty",
    blurb: "A camera and a light. Nothing else.",
    needs: [],
    make: () => mkProject(),
  },
  {
    id: "first-person",
    label: "First Person",
    blurb: "Walk with the left stick, look with the right, jump with ✕. The camera is the player.",
    needs: ["3dmodels/ground.obj", "3dmodels/crate.obj"],
    make: templateFirstPerson,
  },
  {
    id: "third-person",
    label: "Third Person",
    blurb: "Character runs relative to the camera and turns to face travel. The right stick orbits behind them.",
    needs: ["3dmodels/player.obj", "3dmodels/ground.obj"],
    make: templateThirdPerson,
  },
  {
    id: "side-scroller",
    label: "Side Scroller",
    blurb: "Momentum platformer: ✕ jumps, R1 sprints, ↓ rolls or charges, and □ dashes. Side camera anticipates movement.",
    needs: ["3dmodels/player.obj", "3dmodels/ground.obj", "3dmodels/platform.obj"],
    make: templateSideScroller,
  },
  {
    id: "top-down",
    label: "Top Down",
    blurb: "Character moves on the ground plane and turns to face travel. Camera looks down from behind.",
    needs: ["3dmodels/player.obj", "3dmodels/ground.obj"],
    make: templateTopDown,
  },
];

// Named in the New Project dialog so the list is honest about what is coming.
// Empty now that all five of the planned set ship — kept because the next
// template will want it, and the dialog already hides the line when it is.
const PLANNED_TEMPLATES = [];
