// Windows double-click entry point. Keep one fixed origin, reuse this editor's
// local service and show errors in a dialog instead of a disappearing console.
import { fromFileUrl, join, resolve } from "jsr:@std/path@1";

export function matchesEditorService(status, root) {
  return status?.app === "AthEditor" && status.mode === "app" &&
    typeof status.root === "string" &&
    resolve(status.root).toLowerCase() === resolve(root).toLowerCase();
}

async function main() {
  const root = fromFileUrl(new URL("..", import.meta.url));
  const url = "http://127.0.0.1:8080";
  const probe = async () => {
    try {
      const response = await fetch(`${url}/__app/status`, {
        signal: AbortSignal.timeout(800),
      });
      if (!response.ok) return { occupied: true };
      return await response.json();
    } catch {
      return null;
    }
  };
  let service = await probe(), child;
  if (service && !matchesEditorService(service, root)) {
    throw Error(
      "Another application is using AthEditor's address. Close the editor development server on port 8080, then open Start AthEditor again.",
    );
  }
  if (!service) {
    await Deno.mkdir(join(root, ".verification"), { recursive: true });
    const log = await Deno.open(
      join(root, ".verification", "app-service.log"),
      { create: true, append: true },
    );
    child = new Deno.Command(Deno.execPath(), {
      args: ["run", "-A", join(root, "tools", "serve.js"), "--app"],
      cwd: root,
      stdin: "null",
      stdout: "piped",
      stderr: "piped",
      windowsRawArguments: false,
    }).spawn();
    // Keep the launcher alive to drain the service's output. WScript hides
    // this process; no startup task, registry entry or shell window is needed.
    const drain = (stream) =>
      stream.pipeTo(
        new WritableStream({
          async write(bytes) {
            let offset = 0;
            while (offset < bytes.length) {
              offset += await log.write(bytes.subarray(offset));
            }
          },
        }),
      );
    const drained = Promise.allSettled([
      drain(child.stdout),
      drain(child.stderr),
    ]);
    let exited = false;
    child.status.then(() => {
      exited = true;
    });
    for (let i = 0; i < 120 && !exited; i++) {
      await new Promise((r) => setTimeout(r, 250));
      service = await probe();
      if (matchesEditorService(service, root)) break;
    }
    if (!matchesEditorService(service, root)) {
      try {
        child.kill("SIGTERM");
      } catch { /* Already exited. */ }
      await drained;
      log.close();
      throw Error(
        "AthEditor could not start. See .verification/app-service.log in the editor folder.",
      );
    }
    await openEditor(root, url);
    await child.status;
    await drained;
    log.close();
  } else await openEditor(root, url);
}

async function openEditor(root, url) {
  // Explorer opens the default browser without passing the URL through cmd.
  // The installed PWA can then be opened from Start or the taskbar as usual.
  if (Deno.build.os !== "windows") {
    throw Error("Open http://127.0.0.1:8080 in your browser.");
  }
  const launch = new Deno.Command("wscript.exe", {
    args: [join(root, "tools", "open-editor.vbs"), url],
    stdout: "null",
    stderr: "null",
  }).spawn();
  const result = await launch.status;
  if (!result.success) {
    throw Error("Open http://127.0.0.1:8080 in Chrome or Edge.");
  }
}

if (import.meta.main) {
  try {
    await main();
  } catch (error) {
    if (Deno.build.os === "windows") {
      const root = fromFileUrl(new URL("..", import.meta.url));
      await new Deno.Command("wscript.exe", {
        args: [
          join(root, "tools", "open-editor.vbs"),
          "--error",
          error.message,
        ],
      }).output();
    } else console.error(error.message);
    Deno.exit(1);
  }
}
