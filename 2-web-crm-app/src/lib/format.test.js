// Uruchom: npm test. Ta sama reguła jest w SQL (normalize_phone) i we wtyczce – zmieniaj je razem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { normalizePhone } from './format.js';

test('normalizePhone daje ten sam klucz dla różnych zapisów numeru', () => {
  assert.equal(normalizePhone('+48 512-345-678'), '512345678');
  assert.equal(normalizePhone('0048 512 345 678'), '512345678');
  assert.equal(normalizePhone('48512345678'), '512345678');
  assert.equal(normalizePhone('512 345 678'), '512345678');
  assert.equal(normalizePhone('(22) 123 45 67'), '221234567');
});

test('normalizePhone nie obcina numerów zagranicznych ani krótkich', () => {
  assert.equal(normalizePhone('+49 30 1234567'), '49301234567');
  assert.equal(normalizePhone('4812345'), '4812345');
  assert.equal(normalizePhone(''), '');
  assert.equal(normalizePhone(null), '');
});
