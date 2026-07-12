const { auditProductTaglines } = require("./product-tagline-language");
const { auditProductDetailPage } = require("./product-detail-audit");
const { runRandomSiteAudit } = require("./random-site-audit");

function assertAllowedEzvizUrl(value) {
  const url = new URL(String(value || ""));
  if (url.protocol !== "https:" || !["www.ezviz.com", "m.ezviz.com"].includes(url.hostname)) {
    throw new Error("巡查地址必须是 https://www.ezviz.com 或 https://m.ezviz.com 下的页面。");
  }
  return url.href;
}

function createEzvizSiteAuditFeature({ chromium }) {
  const jobs = new Map();
  async function auditProductTaglineUrl(value) {
    const url = assertAllowedEzvizUrl(value);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector(".site-product-desc.J_SiteProductDesc", { timeout: 30000 });
      return await auditProductTaglines(page);
    } finally {
      await browser.close();
    }
  }

  async function auditProductDetailUrl(value) {
    const url = assertAllowedEzvizUrl(value);
    const browser = await chromium.launch({ headless: true });
    try {
      const context = await browser.newContext();
      const page = await context.newPage();
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });
      await page.waitForSelector("#J_items", { timeout: 30000 });
      return await auditProductDetailPage(page);
    } finally {
      await browser.close();
    }
  }

  function startRandomAuditJob(options = {}) {
    const sampleSize = Math.min(20, Math.max(1, Number(options.sampleSize) || 5));
    const id = `ezviz-site-audit-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const job = {
      id,
      status: "running",
      sampleSize,
      startedAt: new Date().toISOString(),
      finishedAt: null,
      progress: null,
      logs: [],
      result: null,
      error: null
    };
    jobs.set(id, job);

    runRandomSiteAudit({
      chromium,
      sampleSize,
      onProgress(progress) {
        job.progress = progress;
        job.logs.push({ at: new Date().toISOString(), ...progress });
        if (job.logs.length > 500) job.logs.splice(0, job.logs.length - 500);
      }
    }).then((result) => {
      job.status = "completed";
      job.result = result;
      job.finishedAt = new Date().toISOString();
    }).catch((error) => {
      job.status = "failed";
      job.error = error?.message || String(error);
      job.finishedAt = new Date().toISOString();
    });

    return job;
  }

  function getRandomAuditJob(id) {
    return jobs.get(String(id || "")) || null;
  }

  return { auditProductTaglineUrl, auditProductDetailUrl, startRandomAuditJob, getRandomAuditJob };
}

module.exports = { createEzvizSiteAuditFeature, assertAllowedEzvizUrl };
