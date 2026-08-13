"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");
const { createDtcCampaign, DTC_MODEL_BY_SITE, DTC_SITE_CODES } = require("./dtc-campaign");

test("DTC plan fixes sites, shared times, and localized banner model", () => {
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
    headline: "Sale",
    link: "https://www.ezviz.com/",
    onlineAtUtc: "2026-09-01 00:00:00",
    offlineAtUtc: "2026-09-10 23:59:59"
  }, {});

  assert.deepEqual(bannerBodies.map((body) => JSON.parse(body.sites)[0]), DTC_SITE_CODES);
  assert.deepEqual(popupBodies.map((body) => JSON.parse(body.sites)[0]), DTC_SITE_CODES);
  assert.deepEqual(plan.banner.items.map((item) => item.fields.model), DTC_SITE_CODES.map((site) => DTC_MODEL_BY_SITE[site]));
  assert.ok(plan.popup.items.every((item) => item.fields.startAt === "2026-09-01 00:00:00"));
  assert.ok(plan.popup.items.every((item) => item.fields.endAt === "2026-09-10 23:59:59"));
});
