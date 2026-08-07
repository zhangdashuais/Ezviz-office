const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isNonTranslatableText,
  extractTranslatableText,
  containsEnglishText,
  detectLanguageTableLayout,
  detectProductLanguageTableLayout,
  buildSourceKeyIndex,
  buildProductPrefix
} = require('../../../办公软件/111/src/i18n-conversion-rules');

test('i18n conversion skips protected standalone values', () => {
  const protectedValues = [
    '²', '₃', '...', '（！）', 'AES', 'AES-256', 'TLS', 'TLS 1.3',
    '90°', '-20 °C', '45度', '2.8mm', '2 mm', '10 cm', '5GHz', '100 Mbps'
  ];
  protectedValues.forEach(value => {
    assert.equal(isNonTranslatableText(value, 'H9c Dual'), true, value);
  });
  assert.equal(isNonTranslatableText('H9c Dual', 'H9c Dual'), true);
  assert.equal(isNonTranslatableText('(H9c Dual)', 'H9c Dual'), true);
});

test('i18n conversion only treats English copy as a new language field', () => {
  assert.equal(containsEnglishText('Clearer details'), true);
  assert.equal(containsEnglishText('2.8mm'), false);
  assert.equal(containsEnglishText('更清晰的画面'), false);
});

test('total language package detects field and en-US source columns', () => {
  assert.deepEqual(detectLanguageTableLayout([
    ['Category', 'Serial number', 'Single word (cannot be modified)', 'en-US(cannot be modified)', 'fr-FR'],
    ['goods', '1', 'camera_title', 'Smart camera', 'Caméra intelligente']
  ]), { keyColumn: 2, sourceColumn: 3, firstDataRow: 1, headerRow: 0 });
  assert.deepEqual(detectLanguageTableLayout([
    ['字段名', '原文'],
    ['camera_title', 'Smart camera']
  ]), { keyColumn: 0, sourceColumn: 1, firstDataRow: 1, headerRow: 0 });
  assert.throws(() => detectLanguageTableLayout([['A', 'B']]), /没有识别到/);
});

test('product language package only indexes source text with one corresponding key', () => {
  const index = buildSourceKeyIndex([
    { key: 'goods.h9c_1', source: 'Clear image.' },
    { key: 'goods.h9c_2', source: 'Fast alerts' },
    { key: 'goods.other_1', source: ' Clear   image. ' }
  ]);
  assert.equal(index.bySource.has('Clear image.'), false);
  assert.equal(index.bySource.get('Fast alerts').key, 'goods.h9c_2');
  assert.equal(index.duplicateSources.has('Clear image.'), true);
});

test('single-product language package requires the Datasheet key/source layout', () => {
  assert.deepEqual(detectProductLanguageTableLayout([
    ['Field', 'Source', 'Japanese'],
    ['camera_title', 'Smart camera', 'スマートカメラ']
  ]), { keyColumn: 0, sourceColumn: 1, firstDataRow: 1, headerRow: 0 });
  assert.throws(() => detectProductLanguageTableLayout([
    ['Category', 'Serial number', 'Single word (cannot be modified)', 'en-US(cannot be modified)', 'ja-JP'],
    ['goods', '1', 'camera_title', 'Smart camera', 'スマートカメラ']
  ]), /Datasheet/);
});

test('single-product language package accepts a real Datasheet language header', () => {
  assert.deepEqual(detectProductLanguageTableLayout([
    ['', '1_English (English-英文)', '29_日本語 (Japanese-日语)'],
    ['CB90f_1', 'Triple-Lens Camera', 'トリプルレンズカメラ']
  ]), { keyColumn: 0, sourceColumn: 1, firstDataRow: 1, headerRow: 0 });
});

test('unmatched copy uses the configured product name as a safe key prefix', () => {
  assert.equal(buildProductPrefix('H9c Dual'), 'goods.H9c_Dual_');
  assert.equal(buildProductPrefix('goods.Alarm-light'), 'goods.Alarm_light_');
});

test('i18n conversion keeps normal copy translatable', () => {
  assert.equal(isNonTranslatableText('Supports AES encryption', 'H9c Dual'), false);
  assert.equal(isNonTranslatableText('See everything in sharp detail.', 'H9c Dual'), false);
  assert.equal(isNonTranslatableText('2.8mm fixed lens', 'H9c Dual'), false);
  assert.equal(extractTranslatableText('See everything clearly.', 'H9c Dual'), 'See everything clearly.');
  assert.equal(extractTranslatableText('Ready!', 'H9c Dual'), 'Ready!');
});

test('i18n conversion leaves protected final words outside the language field', () => {
  const cases = new Map([
    ['Focal Length 2.8mm', 'Focal Length'],
    ['Minimum distance: 2 mm.', 'Minimum distance:'],
    ['Encryption AES', 'Encryption'],
    ['Protocol TLS 1.3', 'Protocol'],
    ['Operating temperature -20 °C', 'Operating temperature'],
    ['Meet H9c Dual.', 'Meet'],
    ['High-definition image.', 'High-definition image.']
  ]);
  cases.forEach((expected, input) => {
    assert.equal(extractTranslatableText(input, 'H9c Dual'), expected, input);
  });
});
