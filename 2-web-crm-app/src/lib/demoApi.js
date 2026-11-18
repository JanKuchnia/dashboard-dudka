// TRYB DEMO – działa bez Supabase, dane zapisywane w localStorage przeglądarki.
// Ma dokładnie ten sam interfejs co prawdziwe API w api.js.
import { normalizePhone, todayISO, addDays } from './format';

const STORAGE_KEY = 'lead-crm-demo-v1';
const wait = (ms = 180) => new Promise((r) => setTimeout(r, ms));
const uuid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

function seed() {
  const now = Date.now();
  const base = [
    ['Salon Fryzjerski Bella', 'Fryzjer', 'Kraków', 'ul. Długa 12', '+48 512 345 678', 4.8, 127, 'https://facebook.com/salonbella', 'TYLKO_FB'],
    ['Auto-Serwis Kowalski', 'Mechanik samochodowy', 'Kraków', 'ul. Zakopiańska 105', '600 111 222', 4.6, 89, null, 'BRAK_WWW'],
    ['Barber Shop Brzytwa', 'Barber', 'Wieliczka', 'Rynek Górny 3', '+48 733 444 555', 4.9, 312, 'https://booksy.com/pl-pl/brzytwa', 'TYLKO_BOOKSY'],
    ['Pizzeria Da Mario', 'Pizzeria', 'Skawina', 'ul. Krakowska 7', '12 276 00 00', 4.3, 54, 'https://instagram.com/damario.skawina', 'TYLKO_IG'],
    ['Gabinet Kosmetyczny Aura', 'Kosmetyczka', 'Kraków', 'ul. Wielicka 44', '501 999 888', 5.0, 41, null, 'BRAK_WWW'],
    ['Hydraulik 24h Nowak', 'Hydraulik', 'Kraków', 'ul. Kalwaryjska 18', '698 123 456', 4.7, 203, null, 'BRAK_WWW'],
    ['Kwiaciarnia Pod Różą', 'Kwiaciarnia', 'Niepołomice', 'ul. Bocheńska 2', '604 555 321', 4.9, 76, 'https://facebook.com/podroza', 'TYLKO_FB'],
    ['Studio Paznokci Glam', 'Stylizacja paznokci', 'Kraków', 'os. Centrum C 5', '730 222 909', 4.8, 158, 'https://booksy.com/pl-pl/glam', 'TYLKO_BOOKSY'],
    ['Dekarz Mróz', 'Dekarz', 'Myślenice', 'ul. Słowackiego 40', '511 400 600', 4.5, 18, null, 'BRAK_WWW'],
    ['Weterynarz Łapka', 'Weterynarz', 'Wieliczka', 'ul. Narutowicza 9', '12 278 11 22', 4.6, 95, 'https://lapka-wet.pl', 'MA_WWW'],
    ['Pracownia Krawiecka Igła', 'Krawiec', 'Kraków', 'ul. Grzegórzecka 21', '507 808 909', 4.9, 64, null, 'BRAK_WWW'],
    ['Szkoła Jazdy Start', 'Szkoła jazdy', 'Skawina', 'ul. Piłsudskiego 3', '606 707 808', 4.4, 112, 'https://linktr.ee/szkolastart', 'INNE_SOCIAL'],
  ];
  const leads = base.map((b, i) => ({
    id: uuid(),
    created_at: new Date(now - (base.length - i) * 3600_000).toISOString(),
    updated_at: new Date(now - (base.length - i) * 3600_000).toISOString(),
    company_name: b[0],
    category: b[1],
    city: b[2],
    address: b[3],
    phone: b[4],
    phone_normalized: normalizePhone(b[4]),
    google_rating: b[5],
    google_reviews_count: b[6],
    maps_url: null,
    maps_place_id: `DEMO_${i + 1}`,
    website_url: b[7],
    website_status: b[8],
    status: 'NOWY',
    notes: null,
    follow_up_at: null,
    last_called_at: null,
    call_count: 0,
    source: 'demo',
  }));

  // Kilka przykładowych follow-upów i historii, żeby widoki nie były puste
  const logs = [];
  const mark = (idx, status, notes, follow, daysAgo = 2) => {
    const l = leads[idx];
    const ts = new Date(now - daysAgo * 86400_000).toISOString();
    Object.assign(l, { status, notes, follow_up_at: follow, last_called_at: ts, call_count: 1 });
    logs.push({ id: logs.length + 1, lead_id: l.id, created_at: ts, outcome: status, notes, follow_up_at: follow });
  };
  mark(5, 'DO_ZASTANOWIENIA', 'Właściciel prosi o telefon po 16:00. Zainteresowany prostą stroną z formularzem.', addDays(todayISO(), -1), 3);
  mark(6, 'DO_ZASTANOWIENIA', 'Ma FB, myśli o stronie z galerią bukietów. Oddzwonić.', todayISO(), 2);
  mark(9, 'NIE_CHCA', 'Mają stronę i są zadowoleni.', null, 1);
  mark(10, 'DO_ZASTANOWIENIA', 'Wysłać przykładowe realizacje na maila.', addDays(todayISO(), 4), 1);
  mark(11, 'CHCA', 'Umówione spotkanie w czwartek 10:00. Chcą stronę + Google Ads.', null, 0);
  return { leads, logs };
}

function load() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) return JSON.parse(raw);
  } catch {
    /* brak dostępu do localStorage – zaczynamy od nowa */
  }
  const fresh = seed();
  save(fresh);
  return fresh;
}

function save(db) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* ignorujemy – tryb demo działa wtedy tylko w pamięci */
  }
}

let db = null;
const getDb = () => (db ??= load());
const persist = () => save(getDb());

function startOfTodayMs() {
  const n = new Date();
  return new Date(n.getFullYear(), n.getMonth(), n.getDate()).getTime();
}

function matches(lead, { search, status, website, city }) {
  if (status && lead.status !== status) return false;
  if (website && lead.website_status !== website) return false;
  if (city && lead.city !== city) return false;
  if (search) {
    const s = search.toLowerCase().trim();
    const digits = s.replace(/\D/g, '');
    const hay = [lead.company_name, lead.city, lead.category, lead.notes].filter(Boolean).join(' ').toLowerCase();
    const phoneHit = digits.length >= 3 && (lead.phone_normalized || '').includes(digits);
    if (!hay.includes(s) && !phoneHit) return false;
  }
  return true;
}

function compare(col, asc) {
  return (a, b) => {
    const va = a[col];
    const vb = b[col];
    if (va == null && vb == null) return 0;
    if (va == null) return 1;
    if (vb == null) return -1;
    const r = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'pl');
    return asc ? r : -r;
  };
}

export const demoApi = {
  async getSession() {
    return { user: { email: 'demo@lokalnie' } };
  },
  onAuthChange() {
    return () => {};
  },
  async signIn() {
    return { user: { email: 'demo@lokalnie' } };
  },
  async signOut() {
    localStorage.removeItem(STORAGE_KEY);
    db = null;
    window.location.reload();
  },

  async claimNextLead(skipIds = []) {
    await wait();
    return (
      getDb()
        .leads.filter((l) => l.status === 'NOWY' && !skipIds.includes(l.id))
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null
    );
  },
  async countQueue() {
    return getDb().leads.filter((l) => l.status === 'NOWY').length;
  },
  async logCall(leadId, outcome, notes, followUpAt) {
    await wait(250);
    const d = getDb();
    const lead = d.leads.find((l) => l.id === leadId);
    if (!lead) throw new Error('Nie znaleziono leada.');
    const ts = new Date().toISOString();
    Object.assign(lead, {
      status: outcome,
      notes: notes?.trim() || null,
      follow_up_at: followUpAt || null,
      last_called_at: ts,
      call_count: (lead.call_count || 0) + 1,
      updated_at: ts,
    });
    d.logs.push({
      id: d.logs.length + 1,
      lead_id: leadId,
      created_at: ts,
      outcome,
      notes: notes?.trim() || null,
      follow_up_at: followUpAt || null,
    });
    persist();
    return { ...lead };
  },

  async fetchFollowUps() {
    await wait();
    return getDb()
      .leads.filter((l) => l.status === 'DO_ZASTANOWIENIA')
      .sort(compare('follow_up_at', true))
      .map((l) => ({ ...l }));
  },

  async fetchLeads({ search, status, website, city, sort, page = 0, pageSize = 50 }) {
    await wait();
    const col = sort?.column || 'created_at';
    const all = getDb()
      .leads.filter((l) => matches(l, { search, status, website, city }))
      .sort(compare(col, !!sort?.asc));
    return {
      rows: all.slice(page * pageSize, page * pageSize + pageSize).map((l) => ({ ...l })),
      count: all.length,
    };
  },
  async fetchAllLeads(filters) {
    const { rows } = await demoApi.fetchLeads({ ...filters, page: 0, pageSize: 100000 });
    return rows;
  },
  async fetchCities() {
    return [...new Set(getDb().leads.map((l) => l.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  },
  async createLead(lead) {
    await wait();
    const ts = new Date().toISOString();
    const row = {
      status: 'NOWY',
      website_status: 'BRAK_WWW',
      call_count: 0,
      ...lead,
      id: uuid(),
      created_at: ts,
      updated_at: ts,
      phone_normalized: normalizePhone(lead.phone),
      source: 'manual',
    };
    getDb().leads.push(row);
    persist();
    return { ...row };
  },
  async updateLead(id, patch) {
    await wait();
    const lead = getDb().leads.find((l) => l.id === id);
    if (!lead) throw new Error('Nie znaleziono leada.');
    Object.assign(lead, patch, {
      updated_at: new Date().toISOString(),
      phone_normalized: normalizePhone(patch.phone ?? lead.phone),
    });
    persist();
    return { ...lead };
  },
  async deleteLead(id) {
    await wait();
    const d = getDb();
    d.leads = d.leads.filter((l) => l.id !== id);
    d.logs = d.logs.filter((g) => g.lead_id !== id);
    persist();
  },
  async fetchCallLogs(leadId) {
    await wait(100);
    return getDb()
      .logs.filter((g) => g.lead_id === leadId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  async getStats() {
    await wait(100);
    const { leads, logs } = getDb();
    const start = startOfTodayMs();
    const today = logs.filter((g) => new Date(g.created_at).getTime() >= start);
    const todayLeads = new Set(today.map((g) => g.lead_id));
    const todayInterested = new Set(today.filter((g) => g.outcome === 'CHCA').map((g) => g.lead_id));
    const called = leads.filter((l) => l.status !== 'NOWY');
    const interested = leads.filter((l) => l.status === 'CHCA').length;
    const pct = (a, b) => (b === 0 ? 0 : Math.round((1000 * a) / b) / 10);
    const t = todayISO();
    return {
      calls_today: todayLeads.size,
      interested_today: todayInterested.size,
      success_rate_today: pct(todayInterested.size, todayLeads.size),
      interested_total: interested,
      thinking_total: leads.filter((l) => l.status === 'DO_ZASTANOWIENIA').length,
      rejected_total: leads.filter((l) => l.status === 'NIE_CHCA').length,
      queue_new: leads.filter((l) => l.status === 'NOWY').length,
      called_total: called.length,
      success_rate: pct(interested, called.length),
      followups_due: leads.filter(
        (l) => l.status === 'DO_ZASTANOWIENIA' && l.follow_up_at && l.follow_up_at <= t,
      ).length,
    };
  },
};
