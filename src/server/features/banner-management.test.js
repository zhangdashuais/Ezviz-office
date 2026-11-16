const test = require('node:test');
const assert = require('node:assert/strict');

const { createBannerManagement, planVisibleBannerUtmFixes } = require('./banner-management');
const { buildCampaignUrl } = require('./campaign-link-inspector');

test('Banner submission uses the injected plan builder', async () => {
  let buildCount = 0;
  const banner = createBannerManagement({
    normalizeBool: () => false,
    logLine: () => {},
    readCampaignConfig: () => ({ sites: [] }),
    selectedCampaignSites: () => [{ siteCode: 'vn' }],
    parseSelectedSites: () => ['vn'],
    buildBannerPlan: () => {
      buildCount += 1;
      return { items: [{ fields: {} }] };
    }
  });

  await assert.rejects(
    banner.submit({}, {}, []),
    /Banner/
  );
  assert.equal(buildCount, 1);
});

test('Banner editor opens the legacy Homepage URL directly', async () => {
  const homepageUrl = 'https://shop.ezvizlife.com/pages/index';
  const editorUrl = 'https://shop.ezvizlife.com/pages/editor?theme_id=123&tpl_id=351';
  const visited = [];
  let currentUrl = 'https://new-sa-shop.ezvizlife.com/templates/list';
  const page = {
    url: () => currentUrl,
    goto: async (url) => {
      visited.push(url);
      currentUrl = url;
    },
    waitForTimeout: async () => {},
    evaluate: async () => editorUrl
  };
  const banner = createBannerManagement({
    SHOP_HOMEPAGE_URL: homepageUrl,
    logLine: () => {}
  });

  await banner.openEditor(page, []);

  assert.deepEqual(visited, [homepageUrl, editorUrl]);
});

test('Banner editor selects the enabled redesigned Homepage theme', async () => {
  const homepageUrl = 'https://shop.ezvizlife.com/pages/index';
  const visited = [];
  let currentUrl = '';
  const page = {
    url: () => currentUrl,
    goto: async (url) => {
      visited.push(url);
      currentUrl = url === homepageUrl ? 'https://new-shop.ezvizlife.com/pages/index' : url;
    },
    waitForTimeout: async () => {},
    evaluate: async () => 'https://sgpshop-api.ezvizlife.com',
    request: { post: async () => ({ ok: () => true, json: async () => ({ code: 200, data: [
      { themeNo: 'old', template: 'web.index.index4', status: 0 },
      { themeNo: 'new', template: 'web.index.index6', status: 1 }
    ] }) }) },
    getByRole: () => ({ waitFor: async () => {} })
  };
  const banner = createBannerManagement({ SHOP_HOMEPAGE_URL: homepageUrl, logLine: () => {} });
  await banner.openEditor(page, []);
  assert.deepEqual(visited, [homepageUrl, 'https://new-shop.ezvizlife.com/pages/editor?themeNo=new']);
});

test('Banner editor stops when redesigned Homepage has multiple enabled themes', async () => {
  let currentUrl = '';
  const page = {
    url: () => currentUrl,
    goto: async () => { currentUrl = 'https://new-shop.ezvizlife.com/pages/index'; },
    waitForTimeout: async () => {},
    evaluate: async () => 'https://sgpshop-api.ezvizlife.com',
    request: { post: async () => ({ ok: () => true, json: async () => ({ code: 200, data: [
      { themeNo: 'a', template: 'web.index.index6', status: 1 },
      { themeNo: 'b', template: 'web.index.index4', status: 1 }
    ] }) }) }
  };
  const banner = createBannerManagement({ SHOP_HOMEPAGE_URL: 'https://shop.ezvizlife.com/pages/index', logLine: () => {} });
  await assert.rejects(banner.openEditor(page, []), /无法唯一确定/);
});

test('Poland banner is inserted in the first position', () => {
  const banner = createBannerManagement({});
  assert.equal(banner.targetPosition({ siteCode: 'pl' }), 1);
  assert.equal(banner.targetPosition({ siteCode: 'de' }), 1);
});

test('UTM repair follows rendered order and skips scheduled-out slides', () => {
  const slides = [
    'https://www.ezviz.com/pl/a?utm_medium=banner1',
    'https://external.example/b',
    'https://www.ezviz.com/pl/hidden',
    'https://www.ezviz.com/pl/c?utm_medium=banner4'
  ];
  const visible = [slides[0], slides[1], slides[3]];
  const changes = planVisibleBannerUtmFixes(slides, visible, 'pl', {}, buildCampaignUrl);
  assert.deepEqual(changes.map(({ index, position }) => ({ index, position })), [
    { index: 0, position: 1 }, { index: 3, position: 3 }
  ]);
  assert.match(changes[1].to, /utm_medium=banner3/);
  assert.ok(!changes.some(({ index }) => index === 2));
});

test('UTM repair matches redesigned Homepage relative links and preserves relative format', () => {
  const slides = [
    '/category/smart-home?utm_medium=banner4#Smart%20Entry',
    'https://www.ezviz.com/inter/product/cb8-lite-4k/293389'
  ];
  const visible = slides.map((url) => new URL(url, 'https://www.ezviz.com').toString());
  const changes = planVisibleBannerUtmFixes(slides, visible, 'hq', {}, buildCampaignUrl);
  assert.equal(changes.length, 2);
  assert.match(changes[0].to, /^\/category\/smart-home\?/);
  assert.match(changes[0].to, /utm_medium=banner1/);
  assert.match(changes[1].to, /utm_medium=banner2/);
});
