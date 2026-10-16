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
