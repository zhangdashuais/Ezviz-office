"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");
const {
  createDtcCampaign, inspectDtcAssetRoot, DTC_MODEL_BY_SITE, DTC_SITE_CODES,
  DTC_HEADLINE, DTC_LINK_BY_SITE
} = require("./dtc-campaign");

function makeSiteAssets(root, siteCode, contents = "image") {
  const directory = path.join(root, siteCode);
  fs.mkdirSync(directory, { recursive: true });
  fs.writeFileSync(path.join(directory, "campaign-banner-pc.jpg"), contents);
  fs.writeFileSync(path.join(directory, "campaign-popup.png"), contents);
}

test("DTC plan fixes sites, shared times, and localized banner model", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dtc-plan-assets-"));
  DTC_SITE_CODES.forEach((siteCode) => makeSiteAssets(root, siteCode));
  const bannerBodies = [];
  const popupBodies = [];
  const dtc = createDtcCampaign({
    logLine: (logs, line) => logs.push(line),
    banner: { submit: async () => ({ ok: true }) },
    popup: { submit: async () => ({ ok: true }) },
    buildBannerPlan: (body) => {
      bannerBodies.push(body);
      const siteCode = JSON.parse(body.sites)[0];
      return { items: [{ site: { siteCode }, fields: { model: body.model, onlineAtUtc: body.onlineAtUtc, offlineAtUtc: body.offlineAtUtc } }] };
    },
    buildPopupPlan: (body) => {
      popupBodies.push(body);
      const siteCode = JSON.parse(body.sites)[0];
      return { items: [{ site: { siteCode }, fields: { startAt: body.startAt, endAt: body.endAt } }] };
    }
  });

  const plan = dtc.buildPlan({
    assetRootPath: root,
    headline: "must be ignored",
    link: "https://example.com/must-be-ignored",
    onlineAtUtc: "2026-09-01 00:00:00",
    offlineAtUtc: "2026-09-10 23:59:59"
  }, {});

  assert.deepEqual(bannerBodies.map((body) => JSON.parse(body.sites)[0]), DTC_SITE_CODES);
  assert.deepEqual(popupBodies.map((body) => JSON.parse(body.sites)[0]), DTC_SITE_CODES);
  assert.ok(bannerBodies.every((body) => body.headline === DTC_HEADLINE));
  assert.deepEqual(bannerBodies.map((body) => body.link), DTC_SITE_CODES.map((site) => DTC_LINK_BY_SITE[site]));
  assert.ok(bannerBodies.every((body) => body.noMoreButton && body.openNewTab && body.publishAfterUpload));
  assert.deepEqual(popupBodies.map((body) => body.name), DTC_SITE_CODES.map((site) => DTC_MODEL_BY_SITE[site]));
  assert.deepEqual(popupBodies.map((body) => body.webUrl), DTC_SITE_CODES.map((site) => DTC_LINK_BY_SITE[site]));
  assert.ok(popupBodies.every((body) => body.enableAfterSubmit));
  assert.deepEqual(plan.banner.items.map((item) => item.fields.model), DTC_SITE_CODES.map((site) => DTC_MODEL_BY_SITE[site]));
  assert.ok(plan.popup.items.every((item) => item.fields.startAt === "2026-09-01 00:00:00"));
  assert.ok(plan.popup.items.every((item) => item.fields.endAt === "2026-09-10 23:59:59"));
});

test("DTC local assets are grouped by country and oversized countries are skipped", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dtc-assets-"));
  makeSiteAssets(root, "Germany", "1234");
  makeSiteAssets(root, "fr", "12");

  const inspection = inspectDtcAssetRoot(root, { maxAssetBytes: 3 });
  const germany = inspection.sites.find((site) => site.siteCode === "de");
  const france = inspection.sites.find((site) => site.siteCode === "fr");

  assert.equal(germany.status, "skipped");
  assert.match(germany.issues.join(" "), /超过单文件/);
  assert.equal(france.status, "ready");
  assert.equal(france.files.bannerMobileImage.fallbackFromPc, true);
  assert.equal(inspection.sites.find((site) => site.siteCode === "es").status, "skipped");
});

test("DTC submit continues ready countries and reports skipped countries", async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dtc-submit-assets-"));
  makeSiteAssets(root, "de");
  const submitted = [];
  const dtc = createDtcCampaign({
    logLine: (logs, line) => logs.push(line),
    banner: { submit: async (body, files) => { submitted.push(["banner", JSON.parse(body.sites)[0], files.pcImage[0].path]); return { ok: true }; } },
    popup: { submit: async (body, files) => { submitted.push(["popup", JSON.parse(body.sites)[0], files.image[0].path]); return { ok: true }; } },
    buildBannerPlan: (body) => ({ items: [{ site: { siteCode: JSON.parse(body.sites)[0] } }] }),
    buildPopupPlan: (body) => ({ items: [{ site: { siteCode: JSON.parse(body.sites)[0] } }] })
  });

  const result = await dtc.submit({
    assetRootPath: root,
    onlineAtUtc: "2026-09-01 00:00:00",
    offlineAtUtc: "2026-09-10 23:59:59"
  }, {}, []);

  assert.deepEqual(submitted.map((item) => item.slice(0, 2)), [["banner", "de"], ["popup", "de"]]);
  assert.equal(result.results.find((item) => item.siteCode === "de").status, "completed");
  assert.ok(result.results.filter((item) => item.status === "skipped").length === 4);
});
