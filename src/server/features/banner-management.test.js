const test = require('node:test');
const assert = require('node:assert/strict');

const { createBannerManagement } = require('./banner-management');

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
