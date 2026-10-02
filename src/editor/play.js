async function editorPlayRequest(action, body) {
  let token = document.querySelector('meta[name="athena-launch-token"]')
    ?.content;
  const unavailable = () =>
    Error("Open Start AthEditor to enable Run in PCSX2, then try again.");
  const renew = async () => {
    try {
      const session = await fetch("/__app/session", { cache: "no-store" });
      if (!session.ok) throw unavailable();
      const result = await session.json();
      if (!result.token) throw unavailable();
      token = result.token;
      const meta = document.querySelector('meta[name="athena-launch-token"]');
      if (meta) meta.content = token;
    } catch {
      throw unavailable();
    }
  };
  if (!token) await renew();
  const request = () =>
    fetch(`/__play/${action}`, {
      method: body === undefined ? "GET" : "POST",
      headers: {
        "x-athena-launch-token": token,
        "content-type": "application/json",
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
  let response;
  try {
    response = await request();
    if (response.status === 403) {
      await renew();
      response = await request();
    }
  } catch {
    throw unavailable();
  }
  const result = await response.json();
  if (!response.ok) throw Error(result.error || "PCSX2 could not be started.");
  return result;
}
