function registerGa4Routes(app, { feature }) {
  const send = (fn) => async (req, res) => {
    try {
      res.json({ ok: true, result: await fn(req) });
    } catch (error) {
      res.status(400).json({ ok: false, error: error?.message || String(error) });
    }
  };

  app.get("/api/ga4/status", (_req, res) => res.json({ ok: true, ...feature.status() }));
  app.post("/api/ga4/test", send(() => feature.test()));
  app.get("/api/gsc/sites", send(() => feature.listSearchConsoleSites()));
  app.post("/api/gsc/query", send((req) => feature.querySearchConsole(req.body || {})));

  app.post("/api/ga4/oauth/start", send((req) => feature.start({ propertyId: req.body?.propertyId })));

  app.get("/api/ga4/oauth/callback", sendHtml(async (req) => {
    await feature.complete(req.query.code, req.query.state);
    return "<!doctype html><meta charset=utf-8><title>Google connected</title><p>Google connected. You can close this window.</p><script>window.opener?.postMessage({type:'ga4-connected'},location.origin);window.close()</script>";
  }));
}

function sendHtml(fn) {
  return async (req, res) => {
    try {
      res.type("html").send(await fn(req));
    } catch (error) {
      res.status(400).type("html").send(`<meta charset=utf-8><p>Google connection failed: ${String(error?.message || error).replace(/[&<>]/g, "")}</p>`);
    }
  };
}

module.exports = { registerGa4Routes };
