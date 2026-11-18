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
