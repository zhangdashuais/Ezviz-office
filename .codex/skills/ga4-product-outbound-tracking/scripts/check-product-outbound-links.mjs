import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import vm from 'node:vm';

const skillDir = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const source = readFileSync(resolve(skillDir, 'assets/product-outbound-links.js'), 'utf8');
const links = [
  { id: '', dataset: { productId: 'C6N-G1-5MP' } },
  { id: '', dataset: { productId: 'HP4', placement: 'hero' } },
  { id: 'cta-C6N-G1-5MP', dataset: { productId: 'C6N-G1-5MP' } },
  { id: '', dataset: { productId: 'invalid name' } }
];
const errors = [];

vm.runInNewContext(source, {
  document: { querySelectorAll: () => links },
  console: { error: (...args) => errors.push(args) }
});

assert.deepEqual(links.map((link) => link.id), [
  'cta-C6N-G1-5MP',
  'cta-HP4-hero',
  'cta-C6N-G1-5MP',
  ''
]);
assert.equal(errors.length, 2);
console.log('product-outbound-links.js: OK');
