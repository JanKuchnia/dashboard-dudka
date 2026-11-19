// Uruchom: npm test. Ta sama reguła jest w SQL (normalize_phone) i we wtyczce – zmieniaj je razem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePhone, noAnswerPatch } from './format.js';

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

test('noAnswerPatch: nowy lead wraca za 3 h, po 3. razie jest odłożony', () => {
  const now = new Date('2026-11-19T10:00:00Z');
  const p = noAnswerPatch({ status: 'NOWY' }, 0, null, now);
  assert.equal(p.status, 'NOWY');
  assert.equal(p.retry_at, '2026-11-19T13:00:00.000Z');
  assert.equal(noAnswerPatch({ status: 'NOWY' }, 1, null, now).status, 'NOWY');
  assert.deepEqual(noAnswerPatch({ status: 'NOWY' }, 2, null, now), { status: 'NIE_ODEBRAL', retry_at: null, follow_up_at: null });
});

test('noAnswerPatch: follow-up zostaje, data najwcześniej jutro', () => {
  const now = new Date(2026, 10, 19, 12);
  const lead = { status: 'DO_ZASTANOWIENIA' };
  assert.deepEqual(noAnswerPatch(lead, 5, '2026-11-18', now), { status: 'DO_ZASTANOWIENIA', retry_at: null, follow_up_at: '2026-11-20' });
  assert.equal(noAnswerPatch(lead, 0, null, now).follow_up_at, '2026-11-20');
  assert.equal(noAnswerPatch(lead, 0, '2026-11-26', now).follow_up_at, '2026-11-26');
});

test('reguły „nie odebrał” w SQL i w JS się zgadzają', () => {
  const sql = readFileSync(new URL('../../../1-database-supabase/schema.sql', import.meta.url), 'utf8');
  const now = new Date('2026-11-19T10:00:00Z');
  const hours = (noAnswerPatch({ status: 'NOWY' }, 0, null, now).retry_at && 3);
  assert.ok(sql.includes(`interval '${hours} hours'`));
  assert.ok(sql.includes(`outcome = 'NIE_ODEBRAL') >= 2`)); // 3. nieodebranie odkłada leada
  assert.equal(noAnswerPatch({ status: 'NOWY' }, 2, null, now).status, 'NIE_ODEBRAL');
  assert.equal(noAnswerPatch({ status: 'NOWY' }, 1, null, now).status, 'NOWY');
  assert.equal((sql.match(/interval '14 days'/g) || []).length, 2); // kolejka + licznik
});
