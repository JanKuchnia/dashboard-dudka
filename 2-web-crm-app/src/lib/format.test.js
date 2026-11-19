// Uruchom: npm test. Ta sama reguła jest w SQL (normalize_phone) i we wtyczce – zmieniaj je razem.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { normalizePhone, noAnswerPatch, queueOrder, summarizeCalls } from './format.js';

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

test('queueOrder: bez strony i z dużą liczbą opinii najpierw, potem najstarsze', () => {
  const leads = [
    { id: 'www', website_status: 'MA_WWW', google_reviews_count: 500, created_at: '2026-01-01' },
    { id: 'old', website_status: 'BRAK_WWW', google_reviews_count: 10, created_at: '2026-01-01' },
    { id: 'busy', website_status: 'TYLKO_FB', google_reviews_count: 200, created_at: '2026-02-01' },
    { id: 'new', website_status: 'BRAK_WWW', google_reviews_count: 10, created_at: '2026-03-01' },
  ];
  assert.deepEqual(leads.sort(queueOrder).map((l) => l.id), ['busy', 'old', 'new', 'www']);
  const sql = readFileSync(new URL('../../../1-database-supabase/schema.sql', import.meta.url), 'utf8');
  assert.ok(sql.includes(`order by (l.website_status <> 'MA_WWW') desc,`));
});

test('summarizeCalls liczy rozmowy, odebrane i „Chcą” po osobie, dniu i godzinie', () => {
  const s = summarizeCalls([
    { created_at: new Date(2026, 10, 18, 9, 5).toISOString(), outcome: 'CHCA', email: 'a@x.pl' },
    { created_at: new Date(2026, 10, 18, 9, 40).toISOString(), outcome: 'NIE_ODEBRAL', email: 'a@x.pl' },
    { created_at: new Date(2026, 10, 19, 14, 0).toISOString(), outcome: 'NIE_CHCA', email: 'b@x.pl' },
  ]);
  assert.deepEqual(s.byUser[0], { key: 'a@x.pl', calls: 2, answered: 1, won: 1 });
  assert.deepEqual(s.byDay.map((d) => [d.key, d.calls]), [['2026-11-18', 2], ['2026-11-19', 1]]);
  assert.deepEqual(s.byHour.map((h) => [h.key, h.answered]), [[9, 1], [14, 1]]);
});
