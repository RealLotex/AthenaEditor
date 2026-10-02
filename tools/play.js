// Local-only game launcher. Export into a fresh temporary directory; never
// overwrite the user's game folder or take over another PCSX2 process.
import { dirname, isAbsolute, join, normalize } from "jsr:@std/path@1";

export function playFiles(result) {
  if (
    typeof result?.main !== "string" || !Array.isArray(result.scripts) ||
    !Array.isArray(result.assets)
  ) throw Error("Invalid game export.");
  const files = [
    { filename: "main.js", content: result.main },
    ...(result.sceneFiles || []),
    ...result.scripts,
    ...result.assets,
  ];
  const names = new Set(["athena.elf", "athena.ini", "pcsx2.log"]);
  let total = 0;
  for (const file of files) {
    const path = file.filename;
    if (
      typeof path !== "string" || !path || path.includes("\\") ||
      /[:<>"|?*\x00-\x1f]/.test(path) || path.split("/").some((p) =>
        !p || p === "." || p === ".." || /[. ]$/.test(p) ||
        /^(con|prn|aux|nul|com[0-9]|lpt[0-9])(?:\.|$)/i.test(p)
      )
    ) {
      throw Error("Invalid export filename.");
    }
    if (names.has(path.toLowerCase())) {
      throw Error(`Duplicate export filename: ${path}`);
    }
    names.add(path.toLowerCase());
    if (file.dataUrl) {
      if (
        typeof file.dataUrl !== "string" ||
        !/^data:[^,]*;base64,[a-z0-9+/=]*$/i.test(file.dataUrl)
      ) {
        throw Error("Invalid binary asset.");
      }
      file.bytes = Uint8Array.from(
        atob(file.dataUrl.split(",")[1]),
        (c) =>
          c.charCodeAt(0),
      );
    } else if (typeof file.content !== "string") {
      throw Error("Invalid asset content.");
    }
    total += file.bytes?.length ||
      new TextEncoder().encode(file.content).length;
    if (total > 128 * 1024 * 1024) {
      throw Error("The game is too large for this launcher (128 MB maximum).");
    }
  }
  return files;
}

export function allowedPlayRequest(req, token) {
  const url = new URL(req.url), origin = req.headers.get("origin");
  return url.hostname === "127.0.0.1" && (!origin || origin === url.origin) &&
    req.headers.get("x-athena-launch-token") === token;
}

async function exists(path) {
  try {
    return (await Deno.stat(path)).isFile;
  } catch {
    return false;
  }
}

export function createGameLauncher(root, token, options = {}) {
  const configFile = options.configFile ||
    join(root, ".verification", "play-settings.json");
  let config = null, run = null, busy = false;
  const readConfig = async () => {
    if (config) return config;
    let saved = {};
    try {
      saved = JSON.parse(await Deno.readTextFile(configFile));
    } catch {}
    const programFiles = Deno.env.get("ProgramFiles") || "C:/Program Files";
    config = {
      pcsx2: saved.pcsx2 || join(programFiles, "PCSX2", "pcsx2-qt.exe"),
      runtime: saved.runtime ||
        join(root, "reference", "AthenaEnvReleaseAndExamples", "athena.elf"),
    };
    return config;
  };
  const status = async () => {
    const c = await readConfig();
    return {
      ...c,
      available: Deno.build.os === "windows" && await exists(c.pcsx2) &&
        await exists(c.runtime),
      running: !!run,
      pid: run?.child.pid || null,
    };
  };
  const stop = async () => {
    const current = run;
    if (!current) return;
    try {
      current.child.kill("SIGTERM");
    } catch {}
    await current.child.status;
    if (run === current) run = null;
  };
  return async function handle(req) {
    if (!allowedPlayRequest(req, token)) {
      return Response.json({ error: "Local editor access required." }, {
        status: 403,
      });
    }
    const action = new URL(req.url).pathname;
    try {
      if (action === "/__play/status" && req.method === "GET") {
        return Response.json(await status());
      }
      if (action === "/__play/settings" && req.method === "POST") {
        const next = await req.json();
        for (const key of ["pcsx2", "runtime"]) {
          if (
            typeof next[key] !== "string" || !isAbsolute(next[key]) ||
            !await exists(next[key])
          ) {
            throw Error(
              `Choose an existing ${
                key === "pcsx2" ? "PCSX2 executable" : "AthenaEnv player"
              }.`,
            );
          }
        }
        if (
          !/^pcsx2(?:-qt)?\.exe$/i.test(next.pcsx2.split(/[\\/]/).at(-1)) ||
          !next.runtime.toLowerCase().endsWith(".elf")
        ) throw Error("Choose pcsx2-qt.exe and athena.elf.");
        config = {
          pcsx2: normalize(next.pcsx2),
          runtime: normalize(next.runtime),
        };
        await Deno.mkdir(dirname(configFile), { recursive: true });
        await Deno.writeTextFile(configFile, JSON.stringify(config));
        return Response.json(await status());
      }
      if (action === "/__play/stop" && req.method === "POST") {
        await stop();
        return Response.json(await status());
      }
      if (action === "/__play/launch" && req.method === "POST") {
        if (busy || run) {
          return Response.json({
            error: "A game is already running. Stop it before running again.",
          }, { status: 409 });
        }
        if (!(await status()).available) {
          throw Error(
            "PCSX2 or the console player could not be found. Open Run settings.",
          );
        }
        busy = true;
        try {
          const files = playFiles(await req.json()), c = await readConfig();
          const dir = await Deno.makeTempDir({ prefix: "athena-play-" });
          if (dir.length > 135) {
            throw Error(
              "The temporary folder path is too long for PCSX2 HostFS. Use a shorter TEMP folder.",
            );
          }
          for (const file of files) {
            const target = join(dir, file.filename);
            await Deno.mkdir(dirname(target), { recursive: true });
            if (file.bytes) await Deno.writeFile(target, file.bytes);
            else await Deno.writeTextFile(target, file.content);
          }
          await Deno.copyFile(c.runtime, join(dir, "athena.elf"));
          await Deno.writeTextFile(
            join(dir, "athena.ini"),
            'boot_logo = false\ndark_mode = true\ndefault_script = "main.js"\naudsrv = true\n',
          );
          const child = (options.spawn || ((cmd, args, cwd) =>
            new Deno.Command(cmd, { args, cwd, stdout: "null", stderr: "null" })
              .spawn()))(c.pcsx2, [
              "-batch",
              "-fastboot",
              "-logfile",
              join(dir, "pcsx2.log"),
              "--",
              join(dir, "athena.elf"),
            ], dir);
          const current = { child, dir };
          run = current;
          child.status.then(() => {
            if (run === current) {
              run = null;
            }
          });
          const ended = await Promise.race([
            child.status,
            new Promise((resolve) =>
              setTimeout(() =>
                resolve(null), 700)
            ),
          ]);
          if (ended) {
            throw Error(
              "PCSX2 closed immediately. Close an existing emulator window and check its BIOS and HostFS settings.",
            );
          }
          return Response.json({ ...await status(), directory: dir });
        } finally {
          busy = false;
        }
      }
      return Response.json({ error: "Unknown launcher action." }, {
        status: 404,
      });
    } catch (e) {
      return Response.json({ error: e.message }, { status: 400 });
    }
  };
}
