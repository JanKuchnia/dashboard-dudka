// Funkcje pomocnicze do formatowania dat, telefonów i linków

/** Dzisiejsza data w formacie RRRR-MM-DD (lokalna strefa czasowa) */
export function todayISO() {
  return toISODate(new Date());
}

export function toISODate(date) {
  const d = new Date(date);
  const local = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 10);
}

/** Dodaje n dni do daty RRRR-MM-DD */
export function addDays(iso, n) {
  const [y, m, d] = iso.split('-').map(Number);
  const date = new Date(y, m - 1, d + n);
  return toISODate(date);
}

/** Liczba dni między dzisiaj a datą (ujemna = przeszłość) */
export function daysFromToday(iso) {
  if (!iso) return null;
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  const target = new Date(y, m - 1, d);
  const now = new Date();
  const today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  return Math.round((target - today) / 86400000);
}

/** "Dzisiaj", "Jutro", "Za 3 dni", "2 dni temu" */
export function relativeDay(iso) {
  const diff = daysFromToday(iso);
  if (diff === null) return '';
  if (diff === 0) return 'Dzisiaj';
  if (diff === 1) return 'Jutro';
  if (diff === -1) return 'Wczoraj';
  if (diff > 1) return `Za ${diff} dni`;
  return `${Math.abs(diff)} dni temu`;
}

export function formatDate(iso) {
  if (!iso) return '—';
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pl-PL', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  });
}

export function formatDateTime(ts) {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('pl-PL', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

export function shortMonth(iso) {
  const [y, m, d] = iso.slice(0, 10).split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('pl-PL', { month: 'short' }).replace('.', '');
}

export function dayOfMonth(iso) {
  return Number(iso.slice(8, 10));
}

/** Same cyfry, bez prefiksu +48 */
export function normalizePhone(phone) {
  if (!phone) return '';
  let d = String(phone).replace(/\D/g, '');
  if (d.startsWith('0048')) d = d.slice(4);
  else if (d.startsWith('48') && d.length === 11) d = d.slice(2);
  return d;
}

/** "512345678" → "512 345 678" */
export function formatPhone(phone) {
  if (!phone) return '';
  const d = normalizePhone(phone);
  if (d.length === 9) return `${d.slice(0, 3)} ${d.slice(3, 6)} ${d.slice(6)}`;
  return phone;
}

/** Link tel: z prefiksem kraju */
export function telHref(phone) {
  const d = normalizePhone(phone);
  if (!d) return undefined;
  return d.length === 9 ? `tel:+48${d}` : `tel:${d}`;
}

/** Link sms: z gotową treścią */
export function smsHref(phone, text) {
  const t = telHref(phone);
  return t && `sms:${t.slice(4)}?body=${encodeURIComponent(text)}`;
}

/** Link do WhatsAppa z gotową treścią (numer z prefiksem kraju, bez +) */
export function whatsappHref(phone, text) {
  const d = normalizePhone(phone);
  if (!d) return undefined;
  return `https://wa.me/${d.length === 9 ? `48${d}` : d}?text=${encodeURIComponent(text)}`;
}

/** Link do wizytówki w Mapach Google (lub wyszukiwanie po nazwie i mieście) */
export function mapsLink(lead) {
  if (lead?.maps_url) return lead.maps_url;
  const q = [lead?.company_name, lead?.address, lead?.city].filter(Boolean).join(' ');
  return `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(q)}`;
}

/** "https://www.facebook.com/abc" → "facebook.com/abc" */
export function prettyUrl(url) {
  if (!url) return '';
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

export function classNames(...args) {
  return args.filter(Boolean).join(' ');
}

/**
 * Zmiany leada po wyniku „Nie odebrał” (tryb lokalny). Ta sama reguła jest
 * w SQL (log_call) – zmieniaj je razem.
 * misses = ile razy wcześniej już nie odebrał.
 */
export function noAnswerPatch(lead, misses, followUpAt, now = new Date()) {
  if (lead.status === 'NOWY') {
    return misses >= 2
      ? { status: 'NIE_ODEBRAL', retry_at: null, follow_up_at: followUpAt || null }
      : { status: 'NOWY', retry_at: new Date(now.getTime() + 3 * 3600e3).toISOString(), follow_up_at: followUpAt || null };
  }
  if (lead.status === 'NIE_ODEBRAL') return { status: 'NIE_ODEBRAL', retry_at: null, follow_up_at: followUpAt || null };
  const tomorrow = addDays(toISODate(now), 1);
  return { status: lead.status, retry_at: null, follow_up_at: followUpAt && followUpAt > tomorrow ? followUpAt : tomorrow };
}

/**
 * Kolejność kolejki: najpierw firmy bez własnej strony, potem z większą liczbą opinii,
 * potem najstarsze. Ta sama kolejność jest w claim_next_lead w SQL – zmieniaj je razem.
 */
export function queueOrder(a, b) {
  const hot = (l) => (l.website_status === 'MA_WWW' ? 0 : 1);
  return (
    hot(b) - hot(a) ||
    (b.google_reviews_count ?? 0) - (a.google_reviews_count ?? 0) ||
    String(a.created_at).localeCompare(String(b.created_at))
  );
}

/** Kwota w złotych: 12500 → "12 500 zł" */
export function formatPLN(v) {
  return `${Number(v || 0).toLocaleString('pl-PL', { maximumFractionDigits: 0 })} zł`;
}

/**
 * Zlicza rozmowy do strony „Statystyki”.
 * rows = [{ created_at, outcome, email }] → po osobie, po dniu i po godzinie.
 * Odebrane = wszystko poza „Nie odebrał”, skuteczność = Chcą / odebrane.
 */
export function summarizeCalls(rows) {
  const bump = (map, key) => {
    const s = map.get(key) ?? { key, calls: 0, answered: 0, won: 0 };
    s.calls++;
    map.set(key, s);
    return s;
  };
  const byUser = new Map();
  const byDay = new Map();
  const byHour = new Map();
  for (const r of rows) {
    const d = new Date(r.created_at);
    const answered = r.outcome !== 'NIE_ODEBRAL';
    const won = r.outcome === 'CHCA';
    for (const s of [bump(byUser, r.email || '—'), bump(byDay, toISODate(d)), bump(byHour, d.getHours())]) {
      if (answered) s.answered++;
      if (won) s.won++;
    }
  }
  const list = (m) => [...m.values()];
  return {
    byUser: list(byUser).sort((a, b) => b.calls - a.calls),
    byDay: list(byDay).sort((a, b) => a.key.localeCompare(b.key)),
    byHour: list(byHour).sort((a, b) => a.key - b.key),
  };
}
