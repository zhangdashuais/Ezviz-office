const test = require('node:test');
const assert = require('node:assert/strict');

const { createPopupManagement } = require('./popup-management');

test('Popup submission uses the injected plan builder', async () => {
  let buildCount = 0;
  const popup = createPopupManagement({
    normalizeBool: () => false,
    logLine: () => {},
    readCampaignConfig: () => ({ sites: [] }),
    requireSingleCampaignSite: () => ({ siteCode: 'vn' }),
    buildPopupPlan: () => {
      buildCount += 1;
      return { items: [{ fields: {} }] };
    }
  });

  await assert.rejects(
    popup.submit({}, {}, []),
    /Popup/
  );
  assert.equal(buildCount, 1);
});

test('Popup submission stops before creating when the existing Period has not expired', async () => {
  const calls = [];
  const page = {
    setDefaultTimeout: () => {},
    goto: async () => {},
    waitForTimeout: async () => {},
    request: {
      post: async (url) => {
        calls.push(url);
        return {
          ok: () => true,
          text: async () => JSON.stringify({
            code: 0,
            data: { list: [{ configNo: 'current', content: { popupName: 'Current', period: '2026-08-01 00:00:00 to 2099-08-31 23:59:59' } }] }
          })
        };
      }
    }
  };
  const popup = createPopupManagement({
    fs: { existsSync: () => true }, path: require('node:path'), logLine: () => {}, normalizeBool: () => false,
    FS_UPLOAD_URL: '', NEW_SHOP_API_BASE: 'https://api.example.test', NEW_SHOP_POPUP_EDIT_URL: 'https://new-shop.ezvizlife.com/popup/edit',
    readCampaignConfig: () => ({}), requireSingleCampaignSite: () => ({ siteCode: 'jp' }),
    getShopContext: async () => ({}), getOpenPage: async () => page, ensureShopLoggedIn: async () => page,
    credentialDomainForSite: () => 'www.ezviz.com/jp',
    buildPopupPlan: () => ({ items: [{ fields: {} }] })
  });

  await assert.rejects(
    popup.submit({}, { image: [{ path: 'popup.jpg' }] }, []),
    /已有未过期配置/
  );
  assert.equal(calls.some((url) => url.endsWith('/shop-config/create')), false);
  assert.equal(calls.some((url) => url.endsWith('/shop-config/delete')), false);
});

test('Popup submission deletes an expired Period, verifies deletion, then creates', async () => {
  let rows = [{ configNo: 'expired', content: { popupName: 'Expired', period: '2020-01-01 00:00:00 to 2020-01-31 23:59:59' } }];
  const order = [];
  const page = {
    setDefaultTimeout: () => {}, goto: async () => {}, waitForTimeout: async () => {}, url: () => 'https://new-shop.ezvizlife.com/popup/edit',
    request: {
      post: async (url) => {
        const operation = url.split('/').pop();
        order.push(operation);
        if (operation === 'delete') rows = [];
        const data = operation === 'list' ? { list: rows }
          : operation === 'create' ? { configNo: 'new-popup' }
            : operation === 'get-fs-token' ? { token: 'token', appid: 'appid' }
              : {};
        return { ok: () => true, text: async () => JSON.stringify({ code: 0, data }) };
      }
    }
  };
  const popup = createPopupManagement({
    fs: { existsSync: () => true, readFileSync: () => Buffer.from('image') }, path: require('node:path'), logLine: () => {}, normalizeBool: () => false,
    FS_UPLOAD_URL: '', NEW_SHOP_API_BASE: 'https://api.example.test', NEW_SHOP_POPUP_EDIT_URL: 'https://new-shop.ezvizlife.com/popup/edit',
    readCampaignConfig: () => ({}), requireSingleCampaignSite: () => ({ siteCode: 'jp' }),
    getShopContext: async () => ({}), getOpenPage: async () => page, ensureShopLoggedIn: async () => page,
    credentialDomainForSite: () => 'www.ezviz.com/jp',
    buildPopupPlan: () => ({ items: [{ fields: { name: 'New', brief: '', whereToShow: 'all', startAt: '', endAt: '', frequency: '', enableAfterSubmit: false }, webUrl: '', mobileUrl: '' }] })
  });
  const originalFetch = global.fetch;
  global.fetch = async () => ({ ok: true, text: async () => JSON.stringify({ status: true, uri: 'image.jpg' }) });
  try {
    const result = await popup.submit({}, { image: [{ path: 'popup.jpg', originalname: 'popup.jpg' }] }, []);
    assert.equal(result.slotCleanup.action, 'deleted-expired');
    assert.ok(order.indexOf('delete') < order.indexOf('create'));
    assert.ok(order.filter((item) => item === 'list').length >= 2);
  } finally {
    global.fetch = originalFetch;
  }
});
