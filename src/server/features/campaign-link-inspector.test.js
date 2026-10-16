const test = require("node:test");
const assert = require("node:assert/strict");
const { campaignCodeForSite, validateCampaignUtm, buildCampaignUrl } = require("./campaign-link-inspector");

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

test("adds the default banner UTM while preserving query parameters and hash", () => {
  const result = buildCampaignUrl(
    "https://www.ezviz.com/br/product/test?sku=1#buy",
    { siteCode: "br", placement: "banner", position: 2 },
    config
  );
  const parsed = new URL(result);
  assert.equal(parsed.searchParams.get("sku"), "1");
  assert.equal(parsed.searchParams.get("utm_source"), "br_banner");
  assert.equal(parsed.searchParams.get("utm_medium"), "banner2");
  assert.equal(parsed.searchParams.get("utm_campaign"), "web_br_banner");
  assert.equal(parsed.hash, "#buy");
});

test("overwrites wrong popup UTM and maps the international site to hq", () => {
  const result = buildCampaignUrl(
    "https://www.ezviz.com/inter/product/test?utm_source=english&utm_medium=banner1",
    { siteCode: "inter", placement: "popup" },
    config
  );
  const parsed = new URL(result);
  assert.equal(parsed.searchParams.get("utm_source"), "hq_popup");
  assert.equal(parsed.searchParams.get("utm_medium"), "popup");
  assert.equal(parsed.searchParams.get("utm_campaign"), "web_hq_popup");
});

test("keeps external campaign links unchanged", () => {
  const rawUrl = "https://partner.example/deal?ref=ezviz#offer";
  assert.equal(buildCampaignUrl(rawUrl, { siteCode: "br", placement: "banner", position: 1 }, config), rawUrl);
});
