import { execFile } from "node:child_process";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const auditRoot = path.resolve(__dirname, "..");
const defaultConfigPath = path.join(auditRoot, "config", "banner-check.json");
const reportsDir = path.join(auditRoot, "outputs", "campaign-audit");
const playwrightCli = process.platform === "win32"
  ? path.join(process.env.APPDATA || "", "npm", "playwright-cli.ps1")
  : "playwright-cli";

const args = parseArgs(process.argv.slice(2));
const configPath = path.resolve(args.config || defaultConfigPath);
const config = JSON.parse((await fs.readFile(configPath, "utf8")).replace(/^\uFEFF/, ""));
const session = args.session || `ezviz-rendered-audit-${Date.now()}`;

await fs.mkdir(reportsDir, { recursive: true });

const startedAt = new Date();
const sites = config.sites
  .filter((site) => site.enabled !== false)
  .filter((site) => !args.site || site.name.toLowerCase() === args.site.toLowerCase() || site.siteCode?.toLowerCase() === args.site.toLowerCase());
const results = [];

try {
  await cli([`-s=${session}`, "open", sites[0]?.url || "about:blank"]);
  await cli([`-s=${session}`, "resize", String(config.rendered?.viewportWidth || 1366), String(config.rendered?.viewportHeight || 900)]);

  for (let index = 0; index < sites.length; index += 1) {
    const site = sites[index];
    console.log(`[progress] ${index + 1}/${sites.length} start ${site.name} (${site.siteCode || ""}) ${site.url}`);
    const result = await auditRenderedSite(site, config);
    results.push(result);
    console.log(`[progress] ${index + 1}/${sites.length} done ${site.name} (${site.siteCode || ""}) banner=${result.bannerLinksFound} popup=${result.popupLinksFound} homepageError=${result.homepageError || "none"}`);
  }
} finally {
  if (args.keepOpen !== true) {
    await cli([`-s=${session}`, "close"]).catch(() => {});
  }
}

const report = {
  generatedAt: new Date().toISOString(),
  mode: "playwright-cli-rendered",
  configPath,
  session,
  summary: summarize(results),
  sites: results
};

const stamp = formatStamp(startedAt);
const jsonPath = path.join(reportsDir, `homepage-campaign-rendered-${stamp}.json`);
const csvPath = path.join(reportsDir, `homepage-campaign-rendered-${stamp}.csv`);
const mdPath = path.join(reportsDir, `homepage-campaign-rendered-${stamp}.md`);

await fs.writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
await fs.writeFile(csvPath, toCsv(results), "utf8");
await fs.writeFile(mdPath, toMarkdown(report), "utf8");

console.log(`Report written:\n- ${jsonPath}\n- ${csvPath}\n- ${mdPath}`);
console.log(JSON.stringify(report.summary, null, 2));

async function auditRenderedSite(site, cfg) {
  const result = {
    site: site.name,
    siteCode: site.siteCode || site.name.toLowerCase(),
    homepage: site.url,
    homepageStatus: null,
    homepageError: null,
    bannerLinksFound: 0,
    popupLinksFound: 0,
    links: []
  };

  try {
    if (cfg.rendered?.resetStorageBeforeSite !== false) {
      await resetBrowserStorage();
    }
    await cli([`-s=${session}`, "goto", site.url], cfg.rendered?.navigationTimeoutMs || 45000);
    await sleep(cfg.rendered?.settleMs || 3000);
    await sleep(Number(args.popupWaitMs || cfg.rendered?.popupWaitMs || 5000));
    result.homepageStatus = await readMainDocumentStatus();
  } catch (error) {
    result.homepageError = normalizeError(error);
    return result;
  }

  let renderedLinks = [];
  try {
    renderedLinks = await extractRenderedLinks();
  } catch (error) {
    result.homepageError = `Rendered extraction failed: ${normalizeError(error)}`;
    return result;
  }

  const bannerLinks = args.placement && args.placement !== "banner"
    ? []
    : renderedLinks.filter((link) => link.placement === "banner");
  const popupLinks = args.placement && args.placement !== "popup"
    ? []
    : renderedLinks.filter((link) => link.placement === "popup");
  result.bannerLinksFound = bannerLinks.length;
  result.popupLinksFound = popupLinks.length;

  const auditedBannerLinks = bannerLinks.map((link, index) => auditLink(link, cfg, site, "banner", index + 1));
  const auditedPopupLinks = popupLinks.map((link, index) => auditLink(link, cfg, site, "popup", index + 1));
  result.links.push(...await Promise.all([...auditedBannerLinks, ...auditedPopupLinks]));

  return result;
}

async function resetBrowserStorage() {
  await cli([`-s=${session}`, "cookie-clear"]).catch(() => {});
  await cli([`-s=${session}`, "localstorage-clear"]).catch(() => {});
  await cli([`-s=${session}`, "sessionstorage-clear"]).catch(() => {});
}

async function readMainDocumentStatus() {
  const raw = await cli([`-s=${session}`, "requests", "--json"]);
  try {
    const parsed = JSON.parse(raw);
    const requests = Array.isArray(parsed) ? parsed : parsed.requests || [];
    const doc = requests.find((request) => request.url && request.resourceType === "document");
    return doc?.status || null;
  } catch {
    return null;
  }
}

async function extractRenderedLinks() {
  const source = renderedExtractorSource();
  const encoded = Buffer.from(`(${source})()`, "utf8").toString("base64");
  const raw = await cli([`-s=${session}`, "eval", `() => eval(atob('${encoded}'))`, "--raw"]);
  return parseCliJson(raw);
}

function renderedExtractorSource() {
  return `() => {
    const clean = value => String(value || '').replace(/\\s+/g, ' ').trim();
    const rectOf = el => {
      const rect = el.getBoundingClientRect();
      return { x: rect.x, y: rect.y, width: rect.width, height: rect.height, top: rect.top, left: rect.left, right: rect.right, bottom: rect.bottom };
    };
    const visible = el => {
      const rect = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return rect.width > 2 && rect.height > 2 && style.display !== 'none' && style.visibility !== 'hidden' && Number(style.opacity || 1) > 0;
    };
    const linkItem = (a, placement, sourceHint) => {
      const ctx = a.closest('.swiper-slide, [class*=banner i], [class*=hero i], [class*=carousel i], [class*=popup i], [class*=modal i], [class*=dialog i]') || a;
      return {
        placement,
        href: a.getAttribute('href') || '',
        resolvedUrl: a.href,
        text: clean(a.innerText || a.textContent).slice(0, 160),
        sourceHint,
        domIndex: [...document.querySelectorAll('a[href]')].indexOf(a),
        rect: rectOf(a),
        contextClass: clean(ctx.className),
        contextId: ctx.id || ''
      };
    };

    const anchors = [...document.querySelectorAll('a[href]')].filter(a => {
      const href = a.getAttribute('href') || '';
      return href && !href.startsWith('#') && !/^(javascript:|mailto:|tel:|sms:|data:)/i.test(href);
    });

    const bannerCandidates = anchors
      .filter(a => visible(a))
      .filter(a => {
        const rect = a.getBoundingClientRect();
        const ctx = a.closest('.swiper-slide, [class*=banner i], [class*=hero i], [class*=carousel i]');
        const haystack = clean([a.className, a.id, ctx?.className, ctx?.id].join(' ')).toLowerCase();
        return Math.abs(rect.y) < 80 && rect.width >= 240 && rect.height >= 160 && /(swiper|slide|banner|hero|carousel)/.test(haystack);
      })
      .map(a => linkItem(a, 'banner', 'rendered-top-hero'));

    const popupCandidates = anchors
      .filter(a => visible(a))
      .filter(a => {
        const ctx = a.closest('[class*=popup i], [class*=modal i], [class*=dialog i], [role=dialog], .layui-layer, .el-dialog');
        if (!ctx) return false;
        const rect = ctx.getBoundingClientRect();
        const haystack = clean([a.className, a.id, ctx.className, ctx.id, ctx.getAttribute('role')].join(' ')).toLowerCase();
        return rect.width >= 120 && rect.height >= 80 && /(popup|modal|dialog|layui-layer|el-dialog)/.test(haystack);
      })
      .map(a => linkItem(a, 'popup', 'rendered-visible-popup'));

    const dedupe = links => {
      const seen = new Set();
      return links.filter(link => {
        const key = link.placement + '|' + link.resolvedUrl + '|' + link.domIndex;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    };

    return JSON.stringify(dedupe([...bannerCandidates, ...popupCandidates]), null, 2);
  }`;
}

async function auditLink(link, cfg, site, placement, position) {
  const item = {
    placement,
    text: link.text,
    href: link.href,
    resolvedUrl: link.resolvedUrl,
    sourceHint: link.sourceHint,
    position: placement === "banner" ? position : null,
    rendered: {
      domIndex: link.domIndex,
      rect: link.rect,
      contextClass: link.contextClass,
      contextId: link.contextId
    },
    expectedUtm: expectedUtm(site, placement, position, cfg),
    actualUtm: readUtm(link.resolvedUrl),
    utmValid: true,
    utmProblems: [],
    correctedUrl: null,
    autoFixAvailable: false,
    internal: isInternalUrl(link.resolvedUrl, cfg.internalDomains),
    hasUtm: hasUtm(link.resolvedUrl),
    missingUtm: false,
    status: null,
    finalUrl: null,
    ok: false,
    error: null
  };

  if (item.internal) {
    const validation = validateUtm(item.actualUtm, item.expectedUtm);
    item.utmValid = validation.valid;
    item.utmProblems = validation.problems;
    item.missingUtm = !validation.valid;
    item.correctedUrl = applyExpectedUtm(link.resolvedUrl, item.expectedUtm);
    item.autoFixAvailable = !item.utmValid && item.correctedUrl !== link.resolvedUrl;
  }

  try {
    const response = await checkUrl(item.resolvedUrl, cfg);
    item.status = response.status;
    item.finalUrl = response.url;
    item.ok = response.status >= 200 && response.status < 400;
  } catch (error) {
    item.error = normalizeError(error);
  }

  return item;
}

function applyExpectedUtm(rawUrl, expected) {
  try {
    const url = new URL(rawUrl);
    for (const [key, value] of Object.entries(expected)) {
      url.searchParams.set(key, value);
    }
    return url.toString();
  } catch {
    return rawUrl;
  }
}

async function checkUrl(url, cfg) {
  try {
    const head = await fetchWithTimeout(url, cfg, { method: "HEAD" });
    if (head.status !== 405 && head.status !== 403) return head;
  } catch {
    // Fall back to GET below.
  }
  return fetchWithTimeout(url, cfg, { method: "GET" });
}

async function fetchWithTimeout(url, cfg, options = {}) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), cfg.request?.timeoutMs || 15000);
  try {
    return await fetch(url, {
      redirect: "follow",
      ...options,
      signal: controller.signal,
      headers: {
        "user-agent": cfg.request?.userAgent || "EZVIZ Website Audit",
        ...(options.headers || {})
      }
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function cli(args, timeoutMs = 30000) {
  const command = process.platform === "win32" ? "powershell.exe" : playwrightCli;
  const windowsLine = `& ${psQuote(playwrightCli)} ${args.map(psQuote).join(" ")}`;
  const commandArgs = process.platform === "win32"
    ? ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", windowsLine]
    : args;
  const { stdout, stderr } = await execFileAsync(command, commandArgs, {
    cwd: auditRoot,
    timeout: timeoutMs,
    windowsHide: true,
    maxBuffer: 1024 * 1024 * 20
  });
  if (stderr.trim()) {
    return stdout.trim() || stderr.trim();
  }
  return stdout.trim();
}

function psQuote(value) {
  return `'${String(value).replace(/'/g, "''")}'`;
}

function parseCliJson(raw) {
  const text = raw.trim();
  const parsed = JSON.parse(text);
  return typeof parsed === "string" ? JSON.parse(parsed) : parsed;
}

function isInternalUrl(url, domains) {
  try {
    const host = new URL(url).hostname.toLowerCase();
    return domains.some((domain) => {
      const normalized = domain.toLowerCase();
      return host === normalized || host.endsWith(`.${normalized}`);
    });
  } catch {
    return false;
  }
}

function hasUtm(url) {
  try {
    const params = new URL(url).searchParams;
    for (const key of params.keys()) {
      if (key.toLowerCase().startsWith("utm_")) return true;
    }
    return false;
  } catch {
    return false;
  }
}

function expectedUtm(site, placement, position, cfg) {
  const policy = getUtmPolicy(placement, cfg);
  const siteCode = site.siteCode || site.name.toLowerCase();
  return {
    utm_source: renderTemplate(policy.sourceTemplate, { siteCode, position }),
    utm_medium: renderTemplate(policy.mediumTemplate, { siteCode, position }),
    utm_campaign: renderTemplate(policy.campaignTemplate, { siteCode, position })
  };
}

function getUtmPolicy(placement, cfg) {
  const defaults = {
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
  return {
    ...defaults[placement],
    ...(placement === "banner" ? cfg.utmPolicy || {} : {}),
    ...(cfg.utmPolicies?.[placement] || {})
  };
}

function renderTemplate(template, values) {
  return template
    .replaceAll("{siteCode}", values.siteCode)
    .replaceAll("{position}", String(values.position));
}

function readUtm(url) {
  try {
    const params = new URL(url).searchParams;
    return {
      utm_source: params.get("utm_source") || "",
      utm_medium: params.get("utm_medium") || "",
      utm_campaign: params.get("utm_campaign") || ""
    };
  } catch {
    return { utm_source: "", utm_medium: "", utm_campaign: "" };
  }
}

function validateUtm(actual, expected) {
  const problems = [];
  for (const key of ["utm_source", "utm_medium", "utm_campaign"]) {
    if (!actual[key]) {
      problems.push(`${key} missing; expected ${expected[key]}`);
    } else if (actual[key] !== expected[key]) {
      problems.push(`${key}=${actual[key]}; expected ${expected[key]}`);
    }
  }
  return { valid: problems.length === 0, problems };
}

function summarize(siteResults) {
  const allLinks = siteResults.flatMap((site) => site.links);
  return {
    sitesChecked: siteResults.length,
    homepageErrors: siteResults.filter((site) => site.homepageError).length,
    campaignLinksFound: allLinks.length,
    bannerLinksFound: allLinks.filter((link) => link.placement === "banner").length,
    popupLinksFound: allLinks.filter((link) => link.placement === "popup").length,
    brokenLinks: allLinks.filter((link) => !link.ok).length,
    internalLinksInvalidUtm: allLinks.filter((link) => link.internal && !link.utmValid).length
  };
}

function toCsv(siteResults) {
  const rows = [["site", "site_code", "homepage", "placement", "position", "campaign_link", "corrected_url", "auto_fix_available", "status", "ok", "internal", "has_utm", "final_url", "source_hint", "expected_utm_source", "actual_utm_source", "expected_utm_medium", "actual_utm_medium", "expected_utm_campaign", "actual_utm_campaign", "utm_valid", "utm_problems", "error"]];
  for (const site of siteResults) {
    if (!site.links.length) {
      rows.push([site.site, site.siteCode || "", site.homepage, "", "", "", "", "", site.homepageStatus || "", "", "", "", "", "", "", "", "", "", "", "", "", "", site.homepageError || "No rendered campaign links found"]);
      continue;
    }
    for (const link of site.links) {
      rows.push([site.site, site.siteCode || "", site.homepage, link.placement || "", link.position || "", link.resolvedUrl, link.correctedUrl || "", String(link.autoFixAvailable), link.status || "", String(link.ok), String(link.internal), String(link.hasUtm), link.finalUrl || "", link.sourceHint || "", link.expectedUtm?.utm_source || "", link.actualUtm?.utm_source || "", link.expectedUtm?.utm_medium || "", link.actualUtm?.utm_medium || "", link.expectedUtm?.utm_campaign || "", link.actualUtm?.utm_campaign || "", String(link.utmValid), (link.utmProblems || []).join("; "), link.error || ""]);
    }
  }
  return rows.map((row) => row.map(csvCell).join(",")).join("\n") + "\n";
}

function csvCell(value) {
  const text = String(value ?? "");
  return `"${text.replace(/"/g, '""')}"`;
}

function toMarkdown(report) {
  const lines = [];
  lines.push("# Homepage Campaign Rendered Audit");
  lines.push("");
  lines.push(`Generated: ${report.generatedAt}`);
  lines.push("");
  lines.push("## Summary");
  lines.push("");
  lines.push(`- Sites checked: ${report.summary.sitesChecked}`);
  lines.push(`- Homepage errors: ${report.summary.homepageErrors}`);
  lines.push(`- Campaign links found: ${report.summary.campaignLinksFound}`);
  lines.push(`- Banner links found: ${report.summary.bannerLinksFound}`);
  lines.push(`- Popup links found: ${report.summary.popupLinksFound}`);
  lines.push(`- Broken links: ${report.summary.brokenLinks}`);
  lines.push(`- Internal links invalid UTM: ${report.summary.internalLinksInvalidUtm}`);
  lines.push("");
  lines.push("## Findings");
  lines.push("");
  lines.push("| Site | Placement | Position | Link | Suggested URL | Status | Problem |");
  lines.push("| --- | --- | --- | --- | --- | --- | --- |");
  for (const site of report.sites) {
    if (site.homepageError) {
      lines.push(`| ${site.site} | homepage |  | ${site.homepage} |  | ${site.homepageStatus || ""} | Homepage error: ${site.homepageError} |`);
      continue;
    }
    for (const link of site.links) {
      const problems = [];
      if (!link.ok) problems.push(link.error || "Broken link");
      if (link.missingUtm) problems.push(`Internal link UTM invalid: ${(link.utmProblems || []).join("; ")}`);
      if (!problems.length) continue;
      lines.push(`| ${site.site} | ${link.placement || ""} | ${link.position || ""} | ${link.resolvedUrl} | ${link.correctedUrl || ""} | ${link.status || ""} | ${problems.join("; ")} |`);
    }
  }
  return lines.join("\n") + "\n";
}

function formatStamp(date) {
  const pad = (value) => String(value).padStart(2, "0");
  return [date.getFullYear(), pad(date.getMonth() + 1), pad(date.getDate()), "-", pad(date.getHours()), pad(date.getMinutes()), pad(date.getSeconds())].join("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeError(error) {
  if (error?.name === "AbortError") return "Request timeout";
  return error?.message || String(error);
}

function parseArgs(argv) {
  const parsed = {};
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--config") {
      parsed.config = argv[index + 1];
      index += 1;
    } else if (arg === "--session") {
      parsed.session = argv[index + 1];
      index += 1;
    } else if (arg === "--site") {
      parsed.site = argv[index + 1];
      index += 1;
    } else if (arg === "--popup-wait-ms") {
      parsed.popupWaitMs = Number(argv[index + 1]);
      index += 1;
    } else if (arg === "--placement") {
      parsed.placement = argv[index + 1];
      index += 1;
    } else if (arg === "--keep-open") {
      parsed.keepOpen = true;
    }
  }
  return parsed;
}
