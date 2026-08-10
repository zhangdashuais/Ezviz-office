(function () {
  const $ = (id) => document.getElementById(id);
  const propertyInput = $("ga4PropertyId");
  const statusElement = $("ga4Status");
  const outputElement = $("ga4Output");
  const buttons = ["ga4Connect", "ga4Test", "gscListSites", "gscTest"].reduce((all, id) => ({ ...all, [id]: $(id) }), {});
  if (!propertyInput || !statusElement || !outputElement || !buttons.ga4Connect || !buttons.ga4Test) return;

  function status(message, type) {
    statusElement.textContent = message;
    statusElement.classList.toggle("ok", type === "ok");
    statusElement.classList.toggle("warn", type === "warn");
  }

  async function request(path, options) {
    const response = await fetch(path, options);
    const data = await response.json().catch(() => ({}));
    if (!response.ok || !data.ok) throw new Error(data.error || `Request failed (${response.status}).`);
    return data.result ?? data;
  }

  function write(lines, message) {
    outputElement.value = lines.join("\n");
    status(message, "ok");
  }

  function setDataButtons(enabled) {
    [buttons.ga4Test, buttons.gscListSites, buttons.gscTest].forEach((button) => {
      if (button) button.disabled = !enabled;
    });
  }

  async function run(button, waiting, work) {
    if (button) button.disabled = true;
    status(waiting);
    try {
      await work();
    } catch (error) {
      status(error.message, "warn");
    } finally {
      if (button) button.disabled = false;
    }
  }

  function showGa4(result) {
    propertyInput.value = result.propertyId || propertyInput.value;
    const report = result.report || {};
    write([
      `GA4 connected: Property ${result.propertyId}`,
      "Scopes: analytics.readonly + webmasters.readonly",
      "",
      ...(report.headers ? [report.headers.join("\t"), ...report.rows.map((row) => row.join("\t"))] : [])
    ], "Google data connection OK.");
  }

  function showGscQuery(result) {
    write([
      `Search Console: ${result.siteUrl}`,
      "",
      "date\tclicks\timpressions\tctr\tposition",
      ...result.rows.map((row) => [row.keys?.[0] || "", row.clicks, row.impressions, Number(row.ctr || 0).toFixed(4), Number(row.position || 0).toFixed(2)].join("\t"))
    ], "Search Console data loaded.");
  }

  async function testGa4() {
    showGa4(await request("/api/ga4/test", { method: "POST" }));
  }

  buttons.ga4Connect.addEventListener("click", () => run(buttons.ga4Connect, "Opening Google OAuth...", async () => {
    const popup = window.open("about:blank", "googleOAuth", "width=620,height=760");
    const { authUrl } = await request("/api/ga4/oauth/start", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ propertyId: propertyInput.value.trim() })
    });
    if (popup) popup.location = authUrl;
    else window.open(authUrl, "_blank");
    status("Finish authorization in the Google window.");
  }));

  buttons.ga4Test.addEventListener("click", () => run(buttons.ga4Test, "Reading GA4 data...", testGa4));

  buttons.gscListSites?.addEventListener("click", () => run(buttons.gscListSites, "Reading Search Console sites...", async () => {
    const sites = await request("/api/gsc/sites");
    if (!$("gscSiteUrl").value && sites[0]?.siteUrl) $("gscSiteUrl").value = sites[0].siteUrl;
    write([`Search Console sites: ${sites.length}`, "", ...sites.map((site) => `${site.siteUrl}\t${site.permissionLevel}`)], "Search Console sites loaded.");
  }));

  buttons.gscTest?.addEventListener("click", () => run(buttons.gscTest, "Reading Search Console data...", async () => {
    showGscQuery(await request("/api/gsc/query", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ siteUrl: $("gscSiteUrl")?.value.trim() })
    }));
  }));

  window.addEventListener("message", async (event) => {
    if (event.origin === location.origin && event.data?.type === "ga4-connected") {
      setDataButtons(true);
      await run(null, "Verifying Google data connection...", testGa4);
    }
  });

  request("/api/ga4/status").then((data) => {
    setDataButtons(data.connected);
    propertyInput.value = data.propertyId || propertyInput.value;
    if (data.connected) return testGa4();
    status(data.configured ? "OAuth client configured. Log in with Google to connect." : "Missing credentials/ga4-oauth-client.json.");
  }).catch((error) => status(error.message, "warn"));
})();
