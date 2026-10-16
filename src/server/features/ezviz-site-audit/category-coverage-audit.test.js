const test = require('node:test');
const assert = require('node:assert/strict');
const { productId, classifyProductHtml } = require('./category-coverage-audit');

test('only product detail URLs yield a product id', () => {
  assert.equal(productId('https://www.ezviz.com/es/product/tp5-poe-kit/500733'), '500733');
  assert.equal(productId('https://www.ezviz.com/es/category/smart-home'), '');
});

test('a general site support menu does not count as product support', () => {
  const result = classifyProductHtml('<header><a href="https://support.ezviz.com">Support</a></header><ul id="J_ProductNavItems"><li>Detail</li><li>Specification</li></ul><div id="J_productContent">Overview</div><div id="cont2">Specification</div>', 'https://www.ezviz.com/es/product/tp5-poe-kit/500733', 200);
  assert.deepEqual(result.issues, ['产品详情页缺少 Support 入口']);
});

test('a bound product support URL is preserved for live checking', () => {
  const result = classifyProductHtml('<ul id="J_ProductNavItems"><li>Detail</li><li>Specification</li><li class="support"><a href="https://support.ezviz.com/products/HP4/48540">Support</a></li></ul><div id="J_productContent">Overview</div><div id="cont2">Specs</div>', 'https://www.ezviz.com/es/product/hp4/49849', 200);
  assert.equal(result.supportUrl, 'https://support.ezviz.com/products/HP4/48540');
  assert.deepEqual(result.issues, []);
});

test('an unavailable page is not classified as an unbound product', () => {
  const result = classifyProductHtml('<h1>404 Not Found</h1>', 'https://www.ezviz.com/es/product/deleted/1', 404);
  assert.deepEqual(result.issues, ['产品详情页不可用或缺少产品导航']);
});
