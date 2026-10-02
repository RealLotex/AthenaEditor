// Keep downloadable controllers identical to the embedded template sources.
import { load, shutdown } from "../tests/_load.js";
import { fromFileUrl, join } from "jsr:@std/path@1";
const root = fromFileUrl(new URL("..", import.meta.url));
try {
  await Deno.mkdir(join(root, "examples", "controllers"), { recursive: true });
  const A = await load(["templates/firstperson.js", "templates/thirdperson.js", "templates/sidescroller.js", "templates/topdown.js"]);
  for (const [name, source] of [["FirstPerson", "FIRSTPERSON"], ["ThirdPerson", "THIRDPERSON"],
    ["SideScroller", "SIDESCROLLER"], ["TopDown", "TOPDOWN"]]) {
    await Deno.writeTextFile(join(root, "examples", "controllers", `${name}Controller.js`), A[`${source}_CONTROLLER`]);
  }
} finally { await shutdown(); }
