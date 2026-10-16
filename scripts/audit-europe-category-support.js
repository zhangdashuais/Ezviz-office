const fs = require('node:fs');
const path = require('node:path');
const { chromium } = require('playwright');
const { runCategoryCoverageAudit } = require('../src/server/features/ezviz-site-audit/category-coverage-audit');

async function main() {
  const codes = new Set((process.env.CATEGORY_AUDIT_SITES || 'eu,de,fr,it,es,pl,cz,be,uk,nl,ro,tr').split(','));
  const response = await fetch('http://localhost:3217/api/campaign/sites');
  const config = await response.json();
  if (!response.ok || !config.ok) throw new Error('无法读取项目站点配置');
  const sites = config.sites.filter(s => codes.has(s.siteCode));
  if (sites.length !== codes.size) throw new Error('站点配置覆盖不完整');
  const outputDir = path.resolve(process.env.CATEGORY_AUDIT_OUTPUT || 'outputs/europe-category-support-audit-2026-10-15');
  const report = await runCategoryCoverageAudit({ chromium, sites, outputDir, resume: process.env.CATEGORY_AUDIT_RESUME === '1', onProgress: p => console.log(JSON.stringify(p)) });
  console.log(JSON.stringify({ finished: true, categories: report.categories.length, products: report.products.length, categoryErrors: report.errors.length, outputDir }));
}
main().catch(e => { console.error(e.message); process.exitCode = 1; });
