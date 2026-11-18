// Jedno wspólne API dla całej aplikacji.
// Z prawdziwymi kluczami w .env rozmawia z Supabase, bez nich używa trybu demo.
import { supabase, isDemo } from './supabase';
import { demoApi } from './demoApi';

/** Tłumaczy błędy Supabase na zrozumiałe komunikaty po polsku */
export function translateError(error) {
  const msg = error?.message || String(error || 'Nieznany błąd');
  if (/Invalid login credentials/i.test(msg)) return 'Nieprawidłowy e-mail lub hasło.';
  if (/Email not confirmed/i.test(msg)) return 'Adres e-mail nie został potwierdzony.';
  if (/Failed to fetch|NetworkError|Load failed/i.test(msg)) return 'Brak połączenia z serwerem. Sprawdź internet.';
  if (/JWT expired|invalid JWT|refresh token/i.test(msg)) return 'Sesja wygasła – zaloguj się ponownie.';
  if (/leads_maps_place_id_key|duplicate key/i.test(msg)) return 'Ta firma już jest w bazie.';
  if (/permission denied|row-level security/i.test(msg)) return 'Brak uprawnień – zaloguj się ponownie.';
  if (/Could not find the function/i.test(msg))
    return 'Brak funkcji w bazie – uruchom ponownie plik schema.sql w Supabase.';
  return msg;
}

function unwrap({ data, error }) {
  if (error) throw new Error(translateError(error));
  return data;
}

/** Usuwa znaki, które psują składnię filtra PostgREST */
function sanitizeSearch(s) {
  return s.replace(/[%,()*\\]/g, ' ').trim();
}

const supabaseApi = {
  // --- Logowanie ---
  async getSession() {
    const { data } = await supabase.auth.getSession();
    return data.session;
  },
  onAuthChange(callback) {
    const { data } = supabase.auth.onAuthStateChange((_event, session) => callback(session));
    return () => data.subscription.unsubscribe();
  },
  async signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });
    if (error) throw new Error(translateError(error));
    return data.session;
  },
  async signOut() {
    await supabase.auth.signOut();
  },

  // --- Power Dialer ---
  async claimNextLead(skipIds = []) {
    const rows = unwrap(await supabase.rpc('claim_next_lead', { p_skip: skipIds }));
    return rows?.[0] ?? null;
  },
  async countQueue() {
    const { count, error } = await supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('status', 'NOWY');
    if (error) throw new Error(translateError(error));
    return count ?? 0;
  },
  async logCall(leadId, outcome, notes, followUpAt) {
    return unwrap(
      await supabase.rpc('log_call', {
        p_lead_id: leadId,
        p_outcome: outcome,
        p_notes: notes || null,
        p_follow_up_at: followUpAt || null,
      }),
    );
  },

  // --- Follow-upy ---
  async fetchFollowUps() {
    return unwrap(
      await supabase
        .from('leads')
        .select('*')
        .eq('status', 'DO_ZASTANOWIENIA')
        .order('follow_up_at', { ascending: true, nullsFirst: false })
        .limit(1000),
    );
  },

  // --- Baza ---
  async fetchLeads({ search, status, website, city, sort, page = 0, pageSize = 50 }) {
    let q = supabase.from('leads').select('*', { count: 'exact' });
    if (status) q = q.eq('status', status);
    if (website) q = q.eq('website_status', website);
    if (city) q = q.eq('city', city);
    const s = sanitizeSearch(search || '');
    if (s) {
      const parts = [
        `company_name.ilike.*${s}*`,
        `city.ilike.*${s}*`,
        `category.ilike.*${s}*`,
        `notes.ilike.*${s}*`,
      ];
      const digits = s.replace(/\D/g, '');
      if (digits.length >= 3) parts.push(`phone_normalized.ilike.*${digits}*`);
      q = q.or(parts.join(','));
    }
    const col = sort?.column || 'created_at';
    q = q.order(col, { ascending: !!sort?.asc, nullsFirst: false });
    if (col !== 'created_at') q = q.order('created_at', { ascending: false });
    q = q.range(page * pageSize, page * pageSize + pageSize - 1);
    const { data, error, count } = await q;
    if (error) throw new Error(translateError(error));
    return { rows: data, count: count ?? 0 };
  },
  async fetchAllLeads(filters) {
    // Do eksportu CSV – pobiera wszystko partiami po 1000
    const all = [];
    for (let page = 0; page < 50; page++) {
      const { rows } = await supabaseApi.fetchLeads({ ...filters, page, pageSize: 1000 });
      all.push(...rows);
      if (rows.length < 1000) break;
    }
    return all;
  },
  async fetchCities() {
    const rows = unwrap(await supabase.from('leads').select('city').not('city', 'is', null).limit(10000));
    return [...new Set(rows.map((r) => r.city).filter(Boolean))].sort((a, b) => a.localeCompare(b, 'pl'));
  },
  async createLead(lead) {
    return unwrap(await supabase.from('leads').insert({ ...lead, source: 'manual' }).select().single());
  },
  async updateLead(id, patch) {
    return unwrap(await supabase.from('leads').update(patch).eq('id', id).select().single());
  },
  async deleteLead(id) {
    unwrap(await supabase.from('leads').delete().eq('id', id));
  },
  async fetchCallLogs(leadId) {
    return unwrap(
      await supabase
        .from('call_logs')
        .select('*')
        .eq('lead_id', leadId)
        .order('created_at', { ascending: false })
        .limit(50),
    );
  },

  // --- Statystyki ---
  async getStats() {
    return unwrap(await supabase.rpc('get_dashboard_stats'));
  },
};

export const api = isDemo ? demoApi : supabaseApi;
export { isDemo };
