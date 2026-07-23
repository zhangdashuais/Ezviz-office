const DEFAULT_POLICIES = {
  banner: {
    sourceTemplate: "{siteCode}_banner",
    mediumTemplate: "banner{position}",
    campaignTemplate: "web_{siteCode}_banner"
  },
  popup: {
    sourceTemplate: "{siteCode}_popup",
    mediumTemplate: "popup",
    campaignTemplate: "web_{siteCode}_popup"
  }
};

function fillTemplate(template, values) {
  return String(template || "").replace(/\{(\w+)\}/g, (match, key) =>
    values[key] == null ? "" : String(values[key])
  );
}

function campaignCodeForSite(site) {
  return site?.campaignCode || (site?.siteCode === "inter" ? "hq" : site?.siteCode) || "";
}

function isInternalUrl(rawUrl, config) {
  try {
    const host = new URL(rawUrl).hostname.toLowerCase();
    return (config.internalDomains || ["ezviz.com"]).some((domain) => {
      const normalized = String(domain).toLowerCase();
      return host === normalized || host.endsWith("." + normalized);
    });
  } catch {
    return false;
  }
}

function validateCampaignUtm(rawUrl, site, placement, position, config = {}) {
  const internal = isInternalUrl(rawUrl, config);
  if (!internal) {
    return { required: false, valid: true, expected: null, actual: null, problems: [], correctedUrl: "" };
  }

  const campaignCode = campaignCodeForSite(site);
  const policy = config.utmPolicies?.[placement] || DEFAULT_POLICIES[placement];
  const values = { siteCode: campaignCode, position: position || 1 };
  const expected = {
    utm_source: fillTemplate(policy.sourceTemplate, values),
    utm_medium: fillTemplate(policy.mediumTemplate, values),
    utm_campaign: fillTemplate(policy.campaignTemplate, values)
  };
  const parsed = new URL(rawUrl);
  const actual = Object.fromEntries(Object.keys(expected).map((key) => [key, parsed.searchParams.get(key) || ""]));
  const problems = Object.keys(expected)
    .filter((key) => actual[key] !== expected[key])
    .map((key) => `${key} 应为 ${expected[key]}，当前为 ${actual[key] || "空"}`);
  const corrected = new URL(parsed.toString());
  Object.entries(expected).forEach(([key, value]) => corrected.searchParams.set(key, value));

  return {
    required: true,
    valid: problems.length === 0,
    expected,
    actual,
    problems,
    correctedUrl: problems.length ? corrected.toString() : ""
  };
}

async function checkLinkAvailability(request, rawUrl) {
  if (!/^https?:\/\//i.test(rawUrl || "")) {
    return { checked: false, ok: false, status: 0, finalUrl: "", error: "不是 HTTP/HTTPS 链接" };
  }
  try {
    const response = await request.get(rawUrl, { timeout: 30000, failOnStatusCode: false, maxRedirects: 10 });
    const status = response.status();
    return {
      checked: true,
      ok: status >= 200 && status < 400,
      status,
      finalUrl: response.url(),
      error: ""
    };
  } catch (error) {
    return {
      checked: true,
      ok: false,
      status: 0,
      finalUrl: "",
      error: error?.message || String(error)
    };
  }
}

async function extractFirstBanner(page) {
  await page.waitForSelector(".swiper-container-home", { timeout: 20000 }).catch(() => {});
  return page.evaluate(() => {
    const validHref = (value) => value && !/^(?:javascript:|#)/i.test(value.trim());
    const containers = [...document.querySelectorAll(".swiper-container-home")];
    for (const container of containers) {
      const slides = [...container.querySelectorAll(":scope > .swiper-wrapper > .swiper-slide")];
      const indexed = slides
        .map((slide) => ({ slide, index: Number(slide.getAttribute("data-swiper-slide-index")) }))
        .filter((item) => Number.isFinite(item.index))
        .sort((a, b) => a.index - b.index);
      const ordered = indexed.length ? indexed.map((item) => item.slide) : slides.filter((slide) => !slide.classList.contains("swiper-slide-duplicate"));
      for (const slide of ordered) {
        const anchor = [...slide.querySelectorAll("a[href]")].find((item) => validHref(item.getAttribute("href")));
        if (!anchor) continue;
        const configuredIndex = Number(slide.getAttribute("data-swiper-slide-index"));
        return {
          found: true,
          position: Number.isFinite(configuredIndex) ? configuredIndex + 1 : 1,
          text: (anchor.innerText || anchor.textContent || "").replace(/\s+/g, " ").trim(),
          href: new URL(anchor.getAttribute("href"), location.href).href,
          selector: ".swiper-container-home [data-swiper-slide-index=\"0\"] a[href]"
        };
      }
    }
    return { found: false, position: 1, text: "", href: "", selector: ".swiper-container-home" };
  });
}

async function extractFirstPopup(page, popupWaitMs) {
  await page.waitForTimeout(Math.max(0, Number(popupWaitMs) || 0));
  return page.evaluate(() => {
    const validHref = (value) => value && !/^(?:javascript:|#)/i.test(value.trim());
    const selectors = [
      ".J_DialogGo.pc-show[href]",
      ".J_DialogGo.mobile-show[href]",
      "[class*='popup'] a[href]",
      "[class*='dialog'] a[href]"
    ];
    const candidates = [...new Set(selectors.flatMap((selector) => [...document.querySelectorAll(selector)]))]
      .filter((anchor) => validHref(anchor.getAttribute("href")));
    const anchor = candidates.find((item) => item.offsetWidth || item.offsetHeight || item.getClientRects().length) || candidates[0];
    if (!anchor) return { found: false, position: 1, text: "", href: "", selector: selectors.slice(0, 2).join(", ") };
    return {
      found: true,
      position: 1,
      text: (anchor.innerText || anchor.textContent || anchor.getAttribute("aria-label") || "").replace(/\s+/g, " ").trim(),
      href: new URL(anchor.getAttribute("href"), location.href).href,
      selector: anchor.matches(".J_DialogGo.pc-show") ? ".J_DialogGo.pc-show[href]" : anchor.matches(".J_DialogGo.mobile-show") ? ".J_DialogGo.mobile-show[href]" : "popup/dialog anchor"
    };
  });
}

function createCampaignLinkInspector({ chromium }) {
  async function inspect(site, options = {}, config = {}) {
    const placement = ["banner", "popup", "all"].includes(options.placement) ? options.placement : "banner";
    const popupWaitMs = Math.max(0, Number(options.popupWaitMs ?? config.rendered?.popupWaitMs ?? 5000));
    const browser = await chromium.launch({ headless: true });
    const context = await browser.newContext({ viewport: { width: 1440, height: 1000 } });
    const page = await context.newPage();
    try {
      await page.goto(site.url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForTimeout(2500);
      const placements = placement === "all" ? ["banner", "popup"] : [placement];
      const results = [];
      for (const currentPlacement of placements) {
        const extracted = currentPlacement === "banner"
          ? await extractFirstBanner(page)
          : await extractFirstPopup(page, popupWaitMs);
        if (!extracted.found) {
          results.push({ placement: currentPlacement, ...extracted, availability: null, utm: null });
          continue;
        }
        const availability = await checkLinkAvailability(context.request, extracted.href);
        const utm = validateCampaignUtm(extracted.href, site, currentPlacement, extracted.position, config);
        results.push({ placement: currentPlacement, ...extracted, availability, utm });
      }
      return {
        site,
        requestedUrl: site.url,
        renderedUrl: page.url(),
        placement,
        popupWaitMs,
        results
      };
    } finally {
      await context.close().catch(() => {});
      await browser.close().catch(() => {});
    }
  }

  return { inspect };
}

module.exports = {
  DEFAULT_POLICIES,
  campaignCodeForSite,
  validateCampaignUtm,
  createCampaignLinkInspector
};
