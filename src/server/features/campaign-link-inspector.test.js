const test = require("node:test");
const assert = require("node:assert/strict");
const { campaignCodeForSite, validateCampaignUtm } = require("./campaign-link-inspector");

const config = { internalDomains: ["ezviz.com"] };

test("uses hq as the international site's campaign code", () => {
  assert.equal(campaignCodeForSite({ siteCode: "inter" }), "hq");
});

test("validates the first banner UTM", () => {
  const result = validateCampaignUtm(
    "https://www.ezviz.com/inter/product/test?utm_source=hq_banner&utm_medium=banner1&utm_campaign=web_hq_banner",
    { siteCode: "inter" },
    "banner",
    1,
    config
  );
  assert.equal(result.valid, true);
});

test("returns popup UTM problems and a corrected URL", () => {
  const result = validateCampaignUtm(
    "https://www.ezviz.com/fr/product/test?utm_source=wrong",
    { siteCode: "fr" },
    "popup",
    1,
    config
  );
  assert.equal(result.valid, false);
  assert.equal(result.problems.length, 3);
  assert.match(result.correctedUrl, /utm_source=fr_popup/);
  assert.match(result.correctedUrl, /utm_medium=popup/);
  assert.match(result.correctedUrl, /utm_campaign=web_fr_popup/);
});

test("does not require UTM on external links", () => {
  const result = validateCampaignUtm("https://example.com/deal", { siteCode: "fr" }, "banner", 1, config);
  assert.equal(result.required, false);
  assert.equal(result.valid, true);
});
