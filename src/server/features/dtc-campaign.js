"use strict";

const DTC_SITE_CODES = ["de", "fr", "es", "it", "nl"];
const DTC_MODEL_BY_SITE = {
  de: "Angebote",
  fr: "Promotion",
  es: "Venta Especial",
  it: "Offerte top",
  nl: "Mega deal"
};

function createDtcCampaign({ buildBannerPlan, buildPopupPlan, banner, popup, logLine }) {
  const boolOn = (value) => value !== false && value !== "0" && value !== "false";
  const siteBody = (body, siteCode) => ({ ...(body || {}), sites: JSON.stringify([siteCode]) });
  const bannerBody = (body, siteCode) => ({
    ...siteBody(body, siteCode),
    headline: body.bannerHeadline || body.headline,
    link: body.bannerLink || body.link || body.popupWebUrl || body.webUrl,
    slogan: body.bannerSlogan || body.slogan,
    model: DTC_MODEL_BY_SITE[siteCode],
    introduction: body.bannerIntroduction || body.introduction,
    onlineAtUtc: body.onlineAtUtc || body.onlineAt || body.startAt,
    offlineAtUtc: body.offlineAtUtc || body.offlineAt || body.endAt
  });
  const popupBody = (body, siteCode) => ({
    ...siteBody(body, siteCode),
    name: body.popupName || body.name || body.headline || body.bannerHeadline,
    brief: body.popupBrief || body.brief || body.slogan || body.bannerSlogan,
    webUrl: body.popupWebUrl || body.webUrl || body.link || body.bannerLink,
    mobileUrl: body.popupMobileUrl || body.mobileUrl || body.popupWebUrl || body.webUrl || body.link || body.bannerLink,
    startAt: body.startAt || body.onlineAtUtc || body.onlineAt,
    endAt: body.endAt || body.offlineAtUtc || body.offlineAt
  });
  const bannerFiles = (files) => ({
    pcImage: files?.bannerPcImage || files?.pcImage,
    mobileImage: files?.bannerMobileImage || files?.mobileImage || files?.bannerPcImage || files?.pcImage
  });
  const popupFiles = (files) => ({ image: files?.popupImage || files?.image });
  const merge = (mode, plans) => ({
    mode,
    fixedSites: DTC_SITE_CODES,
    modelBySite: DTC_MODEL_BY_SITE,
    note: "DTC 专用：固定德法西意荷；Banner 和 Popup 使用同一组上线/下线时间；Banner model 按站点自动写入。",
    items: plans.flatMap((plan) => plan.items || [])
  });

  function buildPlan(body, files) {
    const includeBanner = boolOn(body.includeBanner);
    const includePopup = boolOn(body.includePopup);
    const bannerPlans = includeBanner ? DTC_SITE_CODES.map((siteCode) => buildBannerPlan(bannerBody(body, siteCode), bannerFiles(files))) : [];
    const popupPlans = includePopup ? DTC_SITE_CODES.map((siteCode) => buildPopupPlan(popupBody(body, siteCode), popupFiles(files))) : [];
    return {
      mode: "dtc-plan",
      fixedSites: DTC_SITE_CODES,
      modelBySite: DTC_MODEL_BY_SITE,
      banner: includeBanner ? merge("dtc-banner-plan", bannerPlans) : null,
      popup: includePopup ? merge("dtc-popup-plan", popupPlans) : null
    };
  }

  async function submit(body, files, logs = []) {
    const results = [];
    for (const siteCode of DTC_SITE_CODES) {
      const item = { siteCode, model: DTC_MODEL_BY_SITE[siteCode] };
      if (boolOn(body.includeBanner)) {
        try {
          item.banner = await banner.submit(bannerBody(body, siteCode), bannerFiles(files), logs);
        } catch (error) {
          item.bannerError = error && error.message ? error.message : String(error);
          logLine(logs, `DTC ${siteCode} Banner 失败：${item.bannerError}`);
        }
      }
      if (boolOn(body.includePopup)) {
        try {
          item.popup = await popup.submit(popupBody(body, siteCode), popupFiles(files), logs);
        } catch (error) {
          item.popupError = error && error.message ? error.message : String(error);
          logLine(logs, `DTC ${siteCode} Popup 失败：${item.popupError}`);
        }
      }
      item.status = item.bannerError || item.popupError ? "failed" : "completed";
      results.push(item);
    }
    return { mode: "dtc-submit", plan: buildPlan(body, files), results };
  }

  return { buildPlan, submit };
}

module.exports = { createDtcCampaign, DTC_SITE_CODES, DTC_MODEL_BY_SITE };
