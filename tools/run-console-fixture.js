// Engine probes use HostFS and the same isolated, owned-process launcher as Run.
import { createGameLauncher } from "./play.js";
import { fromFileUrl, join } from "jsr:@std/path@1";
const root = fromFileUrl(new URL("..", import.meta.url));
export async function runConsoleFixture(generated, { timeoutMs = 45000, complete = text => text.includes('"tag":"DONE"') } = {}) {
  const token = crypto.randomUUID();
  const launcher = createGameLauncher(root, token, { configFile: join(root, ".verification", "fixtures-launch-settings.json") });
  const request = async (action, body) => {
    const response = await launcher(new Request(`http://127.0.0.1/__play/${action}`, {
      method: "POST", headers: { "x-athena-launch-token": token }, body: JSON.stringify(body),
    }));
    const data = await response.json();
    if (!response.ok) throw Error(data.error);
    return data;
  };
  if (generated.diagnostics?.some(d => d.level === "error")) throw Error(JSON.stringify(generated.diagnostics));
  try {
    const { directory } = await request("launch", generated);
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      const log = await Deno.readTextFile(join(directory, "probe.log")).catch(() => "");
      if (complete(log)) return log;
      await new Promise(r => setTimeout(r, 250));
    }
    throw Error("The console fixture did not report completion.");
  } finally { await request("stop", {}).catch(() => {}); }
}
