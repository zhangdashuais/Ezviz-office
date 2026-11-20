import fs from 'node:fs';
import path from 'node:path';
import { createRequire } from 'node:module';
import { ProxyAgent, setGlobalDispatcher } from 'undici';

const root = process.cwd();
const require = createRequire(path.join(root, 'package.json'));
const { load } = require('cheerio');
const proxy = process.env.HTTPS_PROXY || process.env.HTTP_PROXY || process.env.ALL_PROXY;
if (proxy) setGlobalDispatcher(new ProxyAgent(proxy));

const args = process.argv.slice(2);
const inputUrl = args[0];
if (!inputUrl || args.includes('--help')) {
  console.error('Usage: node report.mjs <https://www.ezviz.com/...> [--start YYYY-MM-DD] [--end YYYY-MM-DD]');
  process.exit(2);
}
const pageUrl = new URL(inputUrl);
if (pageUrl.protocol !== 'https:') throw new Error('Page URL must use HTTPS.');
const pagePath = pageUrl.pathname.replace(/\/$/, '') || '/';
const option = (name) => {
  const index = args.indexOf(name);
  return index < 0 ? null : args[index + 1];
};
const validDate = (value) => /^\d{4}-\d{2}-\d{2}$/.test(value || '') && !Number.isNaN(Date.parse(value));
const dateParts = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
  timeZone: 'Asia/Shanghai', year: 'numeric', month: '2-digit', day: '2-digit',
}).formatToParts(new Date()).filter((part) => part.type !== 'literal').map((part) => [part.type, Number(part.value)]));
const defaultEnd = new Date(Date.UTC(dateParts.year, dateParts.month - 1, dateParts.day - 1)).toISOString().slice(0, 10);
const endDate = option('--end') || defaultEnd;
const requestedStart = option('--start');
if (!validDate(endDate) || (requestedStart && !validDate(requestedStart))) throw new Error('Dates must be YYYY-MM-DD.');
if (requestedStart && requestedStart > endDate) throw new Error('Start date is after end date.');

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8').replace(/^\uFEFF/, ''));
const clientConfig = readJson('credentials/ga4-oauth-client.json');
const client = clientConfig.installed || clientConfig.web;
const savedToken = readJson('runtime/ga4-oauth-token.json');
const { propertyId } = readJson('runtime/ga4-config.json');
if (!client?.client_id || !client?.client_secret || !savedToken?.refresh_token || !/^\d+$/.test(String(propertyId))) {
  throw new Error('Local GA4 OAuth or property binding is incomplete.');
}
const refreshResponse = await fetch(client.token_uri || 'https://oauth2.googleapis.com/token', {
  method: 'POST',
  headers: { 'content-type': 'application/x-www-form-urlencoded' },
  body: new URLSearchParams({ client_id: client.client_id, client_secret: client.client_secret,
    refresh_token: savedToken.refresh_token, grant_type: 'refresh_token' }),
});
if (!refreshResponse.ok) throw new Error(`Google OAuth refresh failed (${refreshResponse.status}).`);
const { access_token } = await refreshResponse.json();
const apiUrl = `https://analyticsdata.googleapis.com/v1beta/properties/${propertyId}:runReport`;
const exact = (fieldName, value) => ({ filter: { fieldName, stringFilter: { matchType: 'EXACT', value } } });
const baseFilters = [exact('pagePath', pagePath), exact('hostName', pageUrl.hostname)];
async function report(startDate, dimensions, metrics, filters, until = endDate) {
  const body = {
    dateRanges: [{ startDate, endDate: until }],
    dimensions: dimensions.map((name) => ({ name })),
    metrics: metrics.map((name) => ({ name })),
    dimensionFilter: { andGroup: { expressions: [...baseFilters, ...filters] } },
    limit: '100000',
  };
  const response = await fetch(apiUrl, {
    method: 'POST',
    headers: { authorization: `Bearer ${access_token}`, 'content-type': 'application/json' },
    body: JSON.stringify(body),
  });
  const data = await response.json();
  if (!response.ok) throw new Error(`GA4 report failed (${response.status}): ${data.error?.message || 'unknown error'}`);
  return {
    rowCount: data.rowCount || 0,
    metadata: data.metadata || {},
    rows: (data.rows || []).map((row) => ({
      dimensions: (row.dimensionValues || []).map((value) => value.value),
      metrics: (row.metricValues || []).map((value) => Number(value.value)),
    })),
  };
}

const discoveryYear = Number(endDate.slice(0, 4));
const discoveryStart = `${discoveryYear}-01-01`;
let first = null;
if (!requestedStart) {
  for (let month = 1; month <= Number(endDate.slice(5, 7)); month++) {
    const monthStart = `${discoveryYear}-${String(month).padStart(2, '0')}-01`;
    const monthEnd = new Date(Date.UTC(discoveryYear, month, 0)).toISOString().slice(0, 10);
    const result = await report(monthStart, ['date'], ['eventCount'], [exact('eventName', 'page_view')], monthEnd < endDate ? monthEnd : endDate);
    if (!result.rows.length) continue;
    first = result;
    if (result.metadata.samplingMetadatas?.length) {
      const finish = monthEnd < endDate ? monthEnd : endDate;
      for (let cursor = Date.parse(monthStart); cursor <= Date.parse(finish); cursor += 7 * 86400000) {
        const weekStart = new Date(cursor).toISOString().slice(0, 10);
        const weekEnd = new Date(Math.min(cursor + 6 * 86400000, Date.parse(finish))).toISOString().slice(0, 10);
        const week = await report(weekStart, ['date'], ['eventCount'], [exact('eventName', 'page_view')], weekEnd);
        if (week.rows.length) { first = week; break; }
      }
    }
    break;
  }
}
const firstDay = first?.rows?.map((row) => row.dimensions[0]).sort()[0];
const startDate = requestedStart || firstDay?.replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') || discoveryStart;
const pageHtml = await fetch(pageUrl).then((response) => {
  if (!response.ok) throw new Error(`Page request failed (${response.status}).`);
  return response.text();
});
const $ = load(pageHtml);
const products = new Map();
$('a[id^="cta-"][href]').each((_index, element) => {
  const id = String($(element).attr('id') || '').trim();
  if (/^cta-(?:all|all-products|shop|store|hero|list)(?:-|$)/i.test(id)) return;
  let target;
  try { target = new URL($(element).attr('href'), pageUrl); } catch { return; }
  if (!/^https?:$/.test(target.protocol) || target.hostname === pageUrl.hostname) return;
  const section = $(element).closest('article, [data-product-id]').length
    ? $(element).closest('article, [data-product-id]')
    : $(element).closest('section');
  const heading = section.find('h1,h2,h3,h4').first().text().trim().replace(/\s+/g, ' ');
  products.set(id, { id, label: heading || id.slice(4), targetHost: target.hostname });
});

const page = await report(startDate, [], ['eventCount', 'sessions', 'totalUsers'], [exact('eventName', 'page_view')]);
const locations = await report(startDate, ['pageLocation'], ['eventCount'], [exact('eventName', 'page_view')]);
const taggedLinks = await report(startDate, ['eventName', 'linkId', 'pageLocation'], ['eventCount'], [
  { filter: { fieldName: 'linkId', stringFilter: { matchType: 'BEGINS_WITH', value: 'cta-' } } },
]);
const eventCandidates = {};
for (const row of taggedLinks.rows) {
  const [eventName, id] = row.dimensions;
  if (products.has(id)) eventCandidates[eventName] = (eventCandidates[eventName] || 0) + row.metrics[0];
}
const eventName = ['outbound_click', 'click'].filter((name) => eventCandidates[name] > 0)
  .sort((a, b) => eventCandidates[b] - eventCandidates[a])[0]
  || Object.entries(eventCandidates).sort((a, b) => b[1] - a[1])[0]?.[0] || null;
const category = (location) => {
  try {
    const query = new URL(location).searchParams;
    const medium = (query.get('utm_medium') || '').toLowerCase();
    const source = (query.get('utm_source') || '').toLowerCase();
    if (medium.includes('popup') || source.includes('popup')) return 'popup';
    if (medium.includes('banner') || source.includes('banner')) return 'banner';
  } catch { /* GA4 can return an invalid or hidden URL. */ }
  return 'other';
};
const sources = locations.rows.filter((row) => category(row.dimensions[0]) !== 'other')
  .map((row) => ({ type: category(row.dimensions[0]), url: row.dimensions[0], pageViews: row.metrics[0] }));
const productRows = [...products.values()].map((product) => ({ ...product, other: 0, popup: 0, banner: 0, totalClicks: 0 }));
const byId = new Map(productRows.map((row) => [row.id, row]));
for (const row of taggedLinks.rows) {
  const [name, id, location] = row.dimensions;
  if (name !== eventName || !byId.has(id)) continue;
  const product = byId.get(id);
  product[category(location)] += row.metrics[0];
  product.totalClicks += row.metrics[0];
}
productRows.sort((a, b) => b.totalClicks - a.totalClicks);

let click = null;
if (eventName && productRows.length) {
  const escaped = productRows.map(({ id }) => id.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'));
  const filter = { filter: { fieldName: 'linkId', stringFilter: {
    matchType: 'FULL_REGEXP', value: `^(?:${escaped.join('|')})$`,
  } } };
  click = await report(startDate, [], ['eventCount', 'sessions', 'totalUsers'], [exact('eventName', eventName), filter]);
}
const [pageViews = 0, pageSessions = 0, pageUsers = 0] = page.rows[0]?.metrics || [];
const [productClicks = 0, clickSessions = 0, clickUsers = 0] = click?.rows[0]?.metrics || [];
const warnings = [];
for (const [name, result] of Object.entries({ first, page, locations, taggedLinks, click })) {
  if (!result) continue;
  if (result.rowCount > result.rows.length) warnings.push(`${name}: row limit reached`);
  if (result.metadata?.dataLossFromOtherRow || result.metadata?.subjectToThresholding || result.metadata?.samplingMetadatas?.length) {
    warnings.push(`${name}: GA4 metadata reports data loss, thresholding or sampling`);
  }
}
if (productClicks !== productRows.reduce((sum, product) => sum + product.totalClicks, 0)) {
  warnings.push('Product event total differs from sum by linkId/pageLocation; inspect GA4 cardinality or date range.');
}
if (!productRows.length) warnings.push('No external product links with stable cta-* IDs found in current page HTML.');
if (!eventName) warnings.push('No GA4 event with current product link IDs found.');
if (eventCandidates.click > 0 && eventCandidates.outbound_click > 0) {
  warnings.push('Both click and outbound_click carry product IDs; selected the event with more matching clicks. Verify reporting setup before interpreting it.');
}
console.log(JSON.stringify({
  pageUrl: pageUrl.origin + pagePath, propertyId: String(propertyId), timeZone: page.metadata.timeZone || 'Asia/Shanghai',
  startDate, endDate, eventName, eventCandidates, discoveryMetadata: first?.metadata || null, pageViews, pageSessions, pageUsers,
  productClicks, clickSessions, clickUsers,
  sessionConversionRate: pageSessions ? clickSessions / pageSessions : null,
  userConversionRate: pageUsers ? clickUsers / pageUsers : null,
  sources, products: productRows, warnings,
}, null, 2));
