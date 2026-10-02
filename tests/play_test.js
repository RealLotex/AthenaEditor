import {
  assert,
  assertEquals,
  assertStringIncludes,
  assertThrows,
} from "jsr:@std/assert@1";
import { join } from "jsr:@std/path@1";
import {
  allowedPlayRequest,
  createGameLauncher,
  playFiles,
} from "../tools/play.js";

const game = () => ({
  main: "// current scene",
  scripts: [{ filename: "scripts/Player.js", content: "// edited" }],
  assets: [{
    filename: "textures/pixels.png",
    dataUrl: "data:image/png;base64,AQID",
  }],
});

Deno.test("launcher rejects paths outside its temporary game directory and duplicate files", () => {
  for (
    const path of [
      "../outside.js",
      "/outside.js",
      "C:/outside.js",
      "a/../../b.js",
      "a\\outside.js",
      "CON.obj",
      "a/b. ",
      "a/*.js",
      "athena.elf",
      "MAIN.js",
      "textures/pixels.png",
    ]
  ) {
    const result = game();
    result.assets.push({ filename: path, content: "bad" });
    assertThrows(() => playFiles(result), Error);
  }
  const result = playFiles(game());
  assertEquals([...result.at(-1).bytes], [1, 2, 3]);
});

Deno.test("native launcher requires the editor's token and same origin", () => {
  const request = (
    origin,
    token,
    url = "http://127.0.0.1:8093/__play/launch",
  ) =>
    new Request(url, {
      method: "POST",
      headers: { origin, "x-athena-launch-token": token },
    });
  assert(
    allowedPlayRequest(request("http://127.0.0.1:8093", "secret"), "secret"),
  );
  assert(
    !allowedPlayRequest(request("https://other.site", "secret"), "secret"),
  );
  assert(
    !allowedPlayRequest(request("http://127.0.0.1:8093", "bad"), "secret"),
  );
  assert(
    !allowedPlayRequest(
      request(
        "http://example.org",
        "secret",
        "http://example.org/__play/launch",
      ),
      "secret",
    ),
  );
});

Deno.test({
  name:
    "launch stages the actual scripts and binary assets, and stops only its own process",
  ignore: Deno.build.os !== "windows",
  fn: async () => {
    const root = await Deno.makeTempDir({ prefix: "athena-play-test-" });
    const runtime = join(root, "athena.elf"),
      exe = join(root, "pcsx2-qt.exe"),
      configFile = join(root, "settings.json");
    await Deno.writeTextFile(runtime, "fixture");
    await Deno.writeTextFile(exe, "");
    await Deno.writeTextFile(
      configFile,
      JSON.stringify({ pcsx2: exe, runtime }),
    );
    let resolve, killed = false, stage = null, args = null;
    const child = {
      pid: 42,
      status: new Promise((r) => resolve = r),
      kill() {
        killed = true;
        resolve({ success: true, code: 0 });
      },
    };
    const handle = createGameLauncher(root, "secret", {
      configFile,
      spawn: (_exe, a, cwd) => {
        args = a;
        stage = cwd;
        return child;
      },
    });
    const req = (action, body) =>
      new Request(`http://127.0.0.1:8093/__play/${action}`, {
        method: body ? "POST" : "GET",
        headers: { "x-athena-launch-token": "secret" },
        ...(body ? { body: JSON.stringify(body) } : {}),
      });
    try {
      const launched = await handle(req("launch", game()));
      assertEquals(launched.status, 200);
      assertEquals((await launched.json()).running, true);
      assertEquals(
        await Deno.readTextFile(join(stage, "scripts/Player.js")),
        "// edited",
      );
      assertEquals(
        [...await Deno.readFile(join(stage, "textures/pixels.png"))],
        [1, 2, 3],
      );
      assertStringIncludes(
        await Deno.readTextFile(join(stage, "athena.ini")),
        'default_script = "main.js"',
      );
      assertEquals(args.at(-1), join(stage, "athena.elf"));
      assertEquals((await handle(req("launch", game()))).status, 409);
      await handle(req("stop", {}));
      assert(killed);
      assertEquals((await (await handle(req("status"))).json()).running, false);
    } finally {
      if (!killed) child.kill();
      for (const path of [root, stage].filter(Boolean)) {
        assert(
          path.startsWith(Deno.env.get("TEMP")),
          "cleanup stays inside the test temporary directory",
        );
        await Deno.remove(path, { recursive: true });
      }
    }
  },
});
