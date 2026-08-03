const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isNonTranslatableText,
  extractTranslatableText
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

test('i18n conversion keeps normal copy translatable', () => {
  assert.equal(isNonTranslatableText('Supports AES encryption', 'H9c Dual'), false);
  assert.equal(isNonTranslatableText('See everything in sharp detail.', 'H9c Dual'), false);
  assert.equal(isNonTranslatableText('2.8mm fixed lens', 'H9c Dual'), false);
});

test('i18n conversion leaves protected final words outside the language field', () => {
  const cases = new Map([
    ['Focal Length 2.8mm', 'Focal Length'],
    ['Minimum distance: 2 mm.', 'Minimum distance'],
    ['Encryption AES', 'Encryption'],
    ['Protocol TLS 1.3', 'Protocol'],
    ['Operating temperature -20 °C', 'Operating temperature'],
    ['Meet H9c Dual.', 'Meet'],
    ['High-definition image.', 'High-definition image']
  ]);
  cases.forEach((expected, input) => {
    assert.equal(extractTranslatableText(input, 'H9c Dual'), expected, input);
  });
});
