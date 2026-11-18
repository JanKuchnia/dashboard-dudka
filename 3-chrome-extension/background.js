// =====================================================================
//  Lead Scanner – service worker (tło wtyczki)
//  Cała komunikacja z Supabase przechodzi tędy: logowanie, odświeżanie
//  sesji, sprawdzanie duplikatów i zapis leadów.
// =====================================================================

const STORE_KEYS = ['supabaseUrl', 'supabaseKey', 'crmUrl', 'session'];

async function getStore() {
  return chrome.storage.local.get(STORE_KEYS);
}

function cleanUrl(url) {
  return (url || '').trim().replace(/\/+$/, '');
}

/** Tłumaczy błędy na polski */
function friendlyError(status, body) {
  const msg = (body && (body.msg || body.message || body.error_description || body.error)) || '';
  if (/Invalid login credentials/i.test(msg)) return 'Nieprawidłowy e-mail lub hasło.';
  if (/Email not confirmed/i.test(msg)) return 'Adres e-mail nie został potwierdzony.';
  if (status === 401 || /JWT/i.test(msg)) return 'Sesja wygasła – zaloguj się ponownie we wtyczce.';
  if (status === 403 || /permission|row-level/i.test(msg)) return 'Brak uprawnień – zaloguj się ponownie.';
  if (/Could not find the function/i.test(msg)) return 'Brak funkcji w bazie – uruchom ponownie schema.sql.';
  return msg || `Błąd serwera (${status}).`;
}

async function authRequest(grantType, payload) {
  const { supabaseUrl, supabaseKey } = await getStore();
  if (!supabaseUrl || !supabaseKey) throw new Error('Najpierw uzupełnij ustawienia Supabase we wtyczce.');
  let res;
  try {
    res = await fetch(`${cleanUrl(supabaseUrl)}/auth/v1/token?grant_type=${grantType}`, {
      method: 'POST',
      headers: { apikey: supabaseKey, 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
  } catch {
    throw new Error('Brak połączenia z Supabase. Sprawdź adres URL i internet.');
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(friendlyError(res.status, body));
  const session = {
    access_token: body.access_token,
    refresh_token: body.refresh_token,
    expires_at: body.expires_at || Math.floor(Date.now() / 1000) + (body.expires_in || 3600),
    email: body.user?.email || '',
  };
  await chrome.storage.local.set({ session });
  return session;
}

async function login(email, password) {
  return authRequest('password', { email, password });
}

async function logout() {
  await chrome.storage.local.remove('session');
}

/** Zwraca ważny token – w razie potrzeby odświeża sesję */
async function getAccessToken() {
  const { session } = await getStore();
  if (!session?.access_token) throw new Error('Nie jesteś zalogowany – kliknij ikonę wtyczki i zaloguj się.');
  const now = Math.floor(Date.now() / 1000);
  if (session.expires_at - 60 > now) return session.access_token;
  try {
    const fresh = await authRequest('refresh_token', { refresh_token: session.refresh_token });
    return fresh.access_token;
  } catch {
    await logout();
    throw new Error('Sesja wygasła – zaloguj się ponownie we wtyczce.');
  }
}

/** Zapytanie do REST API Supabase (PostgREST) */
async function rest(path, { method = 'GET', body, prefer } = {}) {
  const { supabaseUrl, supabaseKey } = await getStore();
  const token = await getAccessToken();
  const headers = {
    apikey: supabaseKey,
    Authorization: `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
  if (prefer) headers.Prefer = prefer;
  let res;
  try {
    res = await fetch(`${cleanUrl(supabaseUrl)}/rest/v1/${path}`, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new Error('Brak połączenia z Supabase.');
  }
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;
  if (!res.ok) throw new Error(friendlyError(res.status, data));
  return data;
}

// --- Obsługa wiadomości z popupu i ze strony Map ---
const handlers = {
  async status() {
    const { supabaseUrl, supabaseKey, crmUrl, session } = await getStore();
    return {
      configured: !!(supabaseUrl && supabaseKey),
      loggedIn: !!session?.access_token,
      email: session?.email || '',
      supabaseUrl: supabaseUrl || '',
      supabaseKey: supabaseKey || '',
      crmUrl: crmUrl || '',
    };
  },

  async saveConfig({ supabaseUrl, supabaseKey, crmUrl }) {
    const url = cleanUrl(supabaseUrl);
    if (!/^https:\/\/.+/.test(url)) throw new Error('Adres Supabase musi zaczynać się od https://');
    if (!supabaseKey?.trim()) throw new Error('Podaj klucz publishable / anon.');
    await chrome.storage.local.set({
      supabaseUrl: url,
      supabaseKey: supabaseKey.trim(),
      crmUrl: cleanUrl(crmUrl),
    });
    return true;
  },

  async login({ email, password }) {
    const s = await login(email.trim(), password);
    return { email: s.email };
  },

  async logout() {
    await logout();
    return true;
  },

  /** Które z podanych firm już są w bazie (po place_id lub telefonie) */
  async checkDuplicates({ placeIds = [], phones = [] }) {
    if (!placeIds.length && !phones.length) return [];
    return rest('rpc/find_duplicates', {
      method: 'POST',
      body: { p_place_ids: placeIds, p_phones: phones },
    });
  },

  /** Zapis leadów – istniejące (ten sam maps_place_id) są pomijane */
  async saveLeads({ leads }) {
    if (!leads?.length) return { inserted: [] };
    const inserted = await rest('leads?on_conflict=maps_place_id&select=id,company_name,maps_place_id,phone_normalized,status', {
      method: 'POST',
      body: leads,
      prefer: 'resolution=ignore-duplicates,return=representation',
    });
    return { inserted: inserted || [] };
  },

  async stats() {
    return rest('rpc/get_dashboard_stats', { method: 'POST', body: {} });
  },
};

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  const fn = handlers[msg?.type];
  if (!fn) return false;
  fn(msg.payload || {})
    .then((data) => sendResponse({ ok: true, data }))
    .catch((e) => sendResponse({ ok: false, error: e.message || String(e) }));
  return true; // odpowiedź asynchroniczna
});
