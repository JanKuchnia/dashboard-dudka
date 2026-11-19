// TRYB LOKALNY – działa bez serwera, dane zapisywane w localStorage tej przeglądarki.
// Ma dokładnie ten sam interfejs co API Supabase w api.js.
import { normalizePhone, todayISO, noAnswerPatch } from './format';

const STORAGE_KEY = 'lead-crm-local-v1';
const OLD_DEMO_KEY = 'lead-crm-demo-v1';
export const CHANGE_EVENT = 'lead-crm-changed';

const uuid = () =>
  globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random().toString(16).slice(2)}`;

// Usuwamy stare przykładowe dane z wcześniejszego trybu demo
try {
  localStorage.removeItem(OLD_DEMO_KEY);
} catch {
  /* brak dostępu do localStorage */
}

let memory = { leads: [], logs: [] }; // zapas, gdy localStorage jest niedostępny

/** Zawsze czytamy świeże dane – inna karta (albo wtyczka) mogła je zmienić */
function getDb() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const db = JSON.parse(raw);
      return { leads: db.leads || [], logs: db.logs || [] };
    }
    return { leads: [], logs: [] };
  } catch {
    return memory;
  }
}

function save(db) {
  memory = db;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(db));
  } catch {
    /* tylko pamięć */
  }
  window.dispatchEvent(new CustomEvent(CHANGE_EVENT));
}

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
    const hay = [lead.company_name, lead.city, lead.category, lead.notes, lead.address]
      .filter(Boolean)
      .join(' ')
      .toLowerCase();
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

function buildLead(data, source) {
  const ts = new Date().toISOString();
  return {
    status: 'NOWY',
    website_status: 'BRAK_WWW',
    notes: null,
    follow_up_at: null,
    last_called_at: null,
    ...data,
    call_count: 0,
    id: uuid(),
    created_at: ts,
    updated_at: ts,
    phone_normalized: normalizePhone(data.phone) || null,
    source,
  };
}

export const localApi = {
  async getSession() {
    return { user: { email: 'Ten komputer' } };
  },
  onAuthChange() {
    return () => {};
  },
  async signIn() {
    return { user: { email: 'Ten komputer' } };
  },
  async signOut() {},
  async resetPassword() {},
  async updatePassword() {},

  // --- Power Dialer ---
  async claimNextLead(skipIds = []) {
    return (
      getDb()
        .leads.filter(
          (l) => l.status === 'NOWY' && !skipIds.includes(l.id) && (!l.retry_at || l.retry_at <= new Date().toISOString()),
        )
        .sort((a, b) => a.created_at.localeCompare(b.created_at))[0] ?? null
    );
  },
  async countQueue() {
    return getDb().leads.filter((l) => l.status === 'NOWY').length;
  },
  async logCall(leadId, outcome, notes, followUpAt) {
    const db = getDb();
    const lead = db.leads.find((l) => l.id === leadId);
    if (!lead) throw new Error('Nie znaleziono firmy – mogła zostać usunięta.');
    const ts = new Date().toISOString();
    const misses = db.logs.filter((g) => g.lead_id === leadId && g.outcome === 'NIE_ODEBRAL').length;
    Object.assign(lead, {
      status: outcome,
      notes: notes?.trim() || null,
      follow_up_at: followUpAt || null,
      retry_at: null,
      ...(outcome === 'NIE_ODEBRAL' ? noAnswerPatch(lead, misses, followUpAt) : {}),
      last_called_at: ts,
      call_count: (lead.call_count || 0) + 1,
      updated_at: ts,
    });
    db.logs.push({
      id: uuid(),
      lead_id: leadId,
      created_at: ts,
      outcome,
      notes: notes?.trim() || null,
      follow_up_at: lead.follow_up_at,
    });
    save(db);
    return { ...lead };
  },

  // --- Follow-upy ---
  async fetchFollowUps() {
    return getDb()
      .leads.filter((l) => l.status === 'DO_ZASTANOWIENIA')
      .sort(compare('follow_up_at', true));
  },

  // --- Baza ---
  async fetchLeads({ search, status, website, city, sort, page = 0, pageSize = 50 }) {
    const col = sort?.column || 'created_at';
    const all = getDb()
      .leads.filter((l) => matches(l, { search, status, website, city }))
      .sort(compare(col, !!sort?.asc));
    return { rows: all.slice(page * pageSize, page * pageSize + pageSize), count: all.length };
  },
  async fetchAllLeads(filters) {
    const { rows } = await localApi.fetchLeads({ ...filters, page: 0, pageSize: 1e9 });
    return rows;
  },
  async fetchCities() {
    return [...new Set(getDb().leads.map((l) => l.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  },
  async createLead(data) {
    const db = getDb();
    const row = buildLead(data, 'manual');
    db.leads.push(row);
    save(db);
    return { ...row };
  },
  async updateLead(id, patch) {
    const db = getDb();
    const lead = db.leads.find((l) => l.id === id);
    if (!lead) throw new Error('Nie znaleziono firmy.');
    Object.assign(lead, patch, {
      updated_at: new Date().toISOString(),
      phone_normalized: normalizePhone(patch.phone ?? lead.phone) || null,
    });
    save(db);
    return { ...lead };
  },
  async deleteLead(id) {
    const db = getDb();
    db.leads = db.leads.filter((l) => l.id !== id);
    db.logs = db.logs.filter((g) => g.lead_id !== id);
    save(db);
  },
  async fetchCallLogs(leadId) {
    return getDb()
      .logs.filter((g) => g.lead_id === leadId)
      .sort((a, b) => b.created_at.localeCompare(a.created_at));
  },

  // --- Import (Pozyskaj firmy / wtyczka) ---
  /** Zwraca klucze firm, które już są w bazie – do oznaczania duplikatów */
  async getExistingKeys() {
    const { leads } = getDb();
    return {
      placeIds: new Set(leads.map((l) => l.maps_place_id).filter(Boolean)),
      phones: new Set(leads.map((l) => l.phone_normalized).filter(Boolean)),
    };
  },
  /** Dodaje firmy, pomijając te, które już są (po ID miejsca lub telefonie) */
  async importLeads(items, source = 'import') {
    const db = getDb();
    const placeIds = new Set(db.leads.map((l) => l.maps_place_id).filter(Boolean));
    const phones = new Set(db.leads.map((l) => l.phone_normalized).filter(Boolean));
    const inserted = [];
    for (const item of items) {
      const lead = buildLead(item, source);
      if (lead.maps_place_id && placeIds.has(lead.maps_place_id)) continue;
      if (lead.phone_normalized && phones.has(lead.phone_normalized)) continue;
      if (lead.maps_place_id) placeIds.add(lead.maps_place_id);
      if (lead.phone_normalized) phones.add(lead.phone_normalized);
      db.leads.push(lead);
      inserted.push(lead);
    }
    if (inserted.length) save(db);
    return { inserted, skipped: items.length - inserted.length };
  },

  // --- Statystyki ---
  async getStats() {
    const { leads, logs } = getDb();
    const start = startOfTodayMs();
    const today = logs.filter((g) => new Date(g.created_at).getTime() >= start);
    const todayLeads = new Set(today.map((g) => g.lead_id));
    const todayAnswered = new Set(today.filter((g) => g.outcome !== 'NIE_ODEBRAL').map((g) => g.lead_id));
    const todayInterested = new Set(today.filter((g) => g.outcome === 'CHCA').map((g) => g.lead_id));
    const called = leads.filter((l) => l.status !== 'NOWY' && l.status !== 'NIE_ODEBRAL');
    const interested = leads.filter((l) => l.status === 'CHCA').length;
    const pct = (a, b) => (b === 0 ? 0 : Math.round((1000 * a) / b) / 10);
    const t = todayISO();
    return {
      calls_today: todayLeads.size,
      interested_today: todayInterested.size,
      success_rate_today: pct(todayInterested.size, todayAnswered.size),
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
