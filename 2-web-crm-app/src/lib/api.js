// Jedno wspólne API dla całej aplikacji.
// Z prawdziwymi kluczami w .env rozmawia z Supabase, bez nich działa lokalnie (dane w przeglądarce).
import { supabase, isLocal } from './supabase';
import { localApi } from './localApi';
import { normalizePhone } from './format';

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
    // Widok z unikalnymi miastami – czytanie wszystkich leadów ucinał limit 1000 wierszy Supabase
    const rows = unwrap(await supabase.from('v_cities').select('city'));
    return rows.map((r) => r.city).sort((a, b) => a.localeCompare(b, 'pl'));
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

  // --- Import (Pozyskaj firmy) ---
  /** Które z podanych firm już są w bazie – pytamy tylko o nie (RPC), nie pobieramy całej bazy */
  async getExistingKeys(items = []) {
    const rows = unwrap(
      await supabase.rpc('find_duplicates', {
        p_place_ids: items.map((i) => i.maps_place_id).filter(Boolean),
        p_phones: items.map((i) => i.phone).filter(Boolean),
      }),
    );
    return {
      placeIds: new Set(rows.map((r) => r.maps_place_id).filter(Boolean)),
      phones: new Set(rows.map((r) => r.phone_normalized).filter(Boolean)),
    };
  },
  async importLeads(items, source = 'import') {
    const { placeIds, phones } = await supabaseApi.getExistingKeys(items);
    // Pomijamy firmy z bazy i powtórki w tej samej paczce (te same zasady co tryb lokalny)
    const fresh = items.filter((i) => {
      const p = normalizePhone(i.phone);
      if (i.maps_place_id && placeIds.has(i.maps_place_id)) return false;
      if (p && phones.has(p)) return false;
      if (i.maps_place_id) placeIds.add(i.maps_place_id);
      if (p) phones.add(p);
      return true;
    });
    if (!fresh.length) return { inserted: [], skipped: items.length };
    const inserted = unwrap(
      await supabase
        .from('leads')
        .upsert(
          fresh.map((i) => ({ ...i, source })),
          { onConflict: 'maps_place_id', ignoreDuplicates: true },
        )
        .select(),
    );
    return { inserted, skipped: items.length - inserted.length };
  },

  // --- Statystyki ---
  async getStats() {
    return unwrap(await supabase.rpc('get_dashboard_stats'));
  },
};

export const api = isLocal ? localApi : supabaseApi;
export { isLocal };
