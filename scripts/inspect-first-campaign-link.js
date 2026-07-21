const fs = require("fs");
const path = require("path");
const { chromium } = require("playwright");
const { createCampaignLinkInspector } = require("../src/server/features/campaign-link-inspector");

function argument(name, fallback = "") {
  const index = process.argv.indexOf("--" + name);
  return index >= 0 && process.argv[index + 1] ? process.argv[index + 1] : fallback;
}

async function main() {
  const configPath = path.resolve(argument(
    "config",
    process.env.EZVIZ_CAMPAIGN_CONFIG || "E:\\Website-backend\\backend-operations\\website-audit\\config\\banner-check.json"
  ));
  const siteCode = argument("site", "inter");
  const placement = argument("placement", "banner");
  const popupWaitMs = argument("popup-wait-ms", "5000");
  if (!fs.existsSync(configPath)) throw new Error("Campaign config not found: " + configPath);
  const config = JSON.parse(fs.readFileSync(configPath, "utf8").replace(/^\uFEFF/, ""));
  const site = (config.sites || []).find((item) => item.siteCode === siteCode && item.enabled !== false);
  if (!site) throw new Error("Unknown or disabled site: " + siteCode);
  const inspector = createCampaignLinkInspector({ chromium });
  const result = await inspector.inspect(site, { placement, popupWaitMs }, config);
  process.stdout.write(JSON.stringify(result, null, 2) + "\n");
}

main().catch((error) => {
  process.stderr.write((error?.stack || error?.message || String(error)) + "\n");
  process.exitCode = 1;
});
