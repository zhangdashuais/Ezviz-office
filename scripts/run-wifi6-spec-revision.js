const fs = require("fs");
const path = require("path");

const baseUrl = "http://localhost:3217";
const products = [
  "H8c Pro 3K (New)", "H8c Pro 4K (New)", "C8c 3K (New)",
  "C8c 3K 2-Camera Bundle", "C8c 4K (New)", "C9c Dual 2K",
  "C9c Dual 3K", "H9c Dual 2K (R105)", "H9c Dual 3K (R105)",
  "HB8 Lite 4K", "HB8 Lite 4K Kit", "HB8 Lite 3K⁺", "HB8 Lite 3K⁺ Kit",
  "CB8 Lite 4K", "CB8 Lite 4K Kit", "CB8 Lite 3K⁺", "CB8 Lite 3K⁺ Kit"
];
const reportPath = path.resolve("runtime", "wifi6-spec-revision-report.json");
const common = {
  productNames: products.join("\n"),
  revisionType: "specification",
  specificationOperations: [{ type: "sanitize-wifi6" }]
};

async function request(pathname, body) {
  const response = await fetch(`${baseUrl}${pathname}`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
  const data = await response.json();
  if (!response.ok || !data.ok) throw new Error(data.error || `${pathname} failed`);
  return data.result;
}

function save(report) {
  fs.mkdirSync(path.dirname(reportPath), { recursive: true });
  fs.writeFileSync(reportPath, JSON.stringify(report, null, 2));
}

async function main() {
  const siteResponse = await fetch(`${baseUrl}/api/campaign/sites`);
  const siteData = await siteResponse.json();
  const sites = siteData.sites.filter((site) => site.enabled !== false);
  const report = { startedAt: new Date().toISOString(), status: "running", products, sites: {} };
  save(report);
  for (const site of sites) {
    try {
      const preview = await request("/api/product-revision/common-preview", { ...common, sites: [site.siteCode] });
      const ready = preview.results.filter((entry) => entry.status === "ready");
      const fingerprints = Object.fromEntries(ready.map((entry) => [
        `${entry.result.site.siteCode}\n${entry.result.productName.toLowerCase()}`,
        { siteCode: entry.result.site.siteCode, productName: entry.result.productName, fingerprint: entry.result.fingerprint }
      ]));
      const submit = ready.length
        ? await request("/api/product-revision/common-submit", { ...common, sites: [site.siteCode], fingerprints })
        : null;
      report.sites[site.siteCode] = { site: site.name, preview, submit };
      console.log(`${site.siteCode}: preview ready ${preview.readyCount}, no-change ${preview.noChangeCount}, failed ${preview.failedCount}; submitted ${submit?.completedCount || 0}`);
    } catch (error) {
      report.sites[site.siteCode] = { site: site.name, error: error.message };
      console.error(`${site.siteCode}: ${error.message}`);
    }
    save(report);
  }
  report.status = "completed";
  report.completedAt = new Date().toISOString();
  save(report);
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
