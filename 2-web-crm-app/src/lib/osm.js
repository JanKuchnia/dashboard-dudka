// Wyszukiwanie prawdziwych firm z OpenStreetMap (darmowe, bez klucza API).
//  • Nominatim – zamienia nazwę miasta / adres na współrzędne,
//  • Overpass  – zwraca firmy danej branży w promieniu od tego punktu.
import { normalizePhone } from './format';

// Branże: etykieta → filtry tagów OpenStreetMap (Overpass) i frazy wyszukiwania (Nominatim – zapas)
export const CATEGORIES = [
  { id: 'fryzjer', label: 'Fryzjer / Barber', filters: ['["shop"="hairdresser"]'], phrases: ['hairdresser'] },
  { id: 'kosmetyczka', label: 'Kosmetyczka / Paznokcie', filters: ['["shop"="beauty"]', '["shop"="cosmetics"]'], phrases: ['beauty shop'] },
  { id: 'mechanik', label: 'Mechanik', filters: ['["shop"="car_repair"]', '["craft"="car_repair"]'], phrases: ['car repair'] },
  { id: 'wulkanizacja', label: 'Wulkanizacja / Opony', filters: ['["shop"="tyres"]'], phrases: ['tyres'] },
  { id: 'myjnia', label: 'Myjnia', filters: ['["amenity"="car_wash"]'], phrases: ['car wash'] },
  { id: 'hydraulik', label: 'Hydraulik', filters: ['["craft"="plumber"]', '["craft"="hvac"]'], phrases: ['plumber'] },
  { id: 'elektryk', label: 'Elektryk', filters: ['["craft"="electrician"]'], phrases: ['electrician'] },
  {
    id: 'budowlanka',
    label: 'Budowlanka / Remonty',
    filters: ['["craft"~"^(builder|roofer|carpenter|tiler|painter|plasterer|window_construction|stonemason)$"]'],
    phrases: ['builder', 'roofer', 'carpenter'],
  },
  { id: 'restauracja', label: 'Restauracja', filters: ['["amenity"="restaurant"]'], phrases: ['restaurant'] },
  { id: 'fastfood', label: 'Pizzeria / Fast food', filters: ['["amenity"="fast_food"]'], phrases: ['fast food'] },
  { id: 'kawiarnia', label: 'Kawiarnia / Cukiernia', filters: ['["amenity"="cafe"]', '["shop"~"^(pastry|confectionery)$"]'], phrases: ['cafe', 'confectionery'] },
  { id: 'piekarnia', label: 'Piekarnia', filters: ['["shop"="bakery"]'], phrases: ['bakery'] },
  { id: 'kwiaciarnia', label: 'Kwiaciarnia', filters: ['["shop"="florist"]'], phrases: ['florist'] },
  { id: 'weterynarz', label: 'Weterynarz', filters: ['["amenity"="veterinary"]'], phrases: ['veterinary'] },
  { id: 'dentysta', label: 'Dentysta', filters: ['["amenity"="dentist"]', '["healthcare"="dentist"]'], phrases: ['dentist'] },
  { id: 'fizjo', label: 'Fizjoterapia / Masaż', filters: ['["healthcare"="physiotherapist"]', '["shop"="massage"]'], phrases: ['physiotherapist', 'massage'] },
  { id: 'silownia', label: 'Siłownia / Fitness', filters: ['["leisure"="fitness_centre"]', '["leisure"="sports_centre"]'], phrases: ['fitness centre'] },
  { id: 'szkolajazdy', label: 'Szkoła jazdy', filters: ['["amenity"="driving_school"]'], phrases: ['driving school'] },
  { id: 'fotograf', label: 'Fotograf', filters: ['["craft"="photographer"]', '["shop"="photo"]'], phrases: ['photographer'] },
  { id: 'krawiec', label: 'Krawiec / Szewc', filters: ['["craft"~"^(tailor|shoemaker)$"]', '["shop"="tailor"]'], phrases: ['tailor', 'shoemaker'] },
  { id: 'slusarz', label: 'Ślusarz / Klucze', filters: ['["craft"="locksmith"]', '["shop"="locksmith"]'], phrases: ['locksmith'] },
  { id: 'pralnia', label: 'Pralnia', filters: ['["shop"~"^(laundry|dry_cleaning)$"]'], phrases: ['laundry', 'dry cleaning'] },
  { id: 'optyk', label: 'Optyk', filters: ['["shop"="optician"]'], phrases: ['optician'] },
  { id: 'zoologiczny', label: 'Sklep zoologiczny / Groomer', filters: ['["shop"="pet"]', '["shop"="pet_grooming"]'], phrases: ['pet shop'] },
  { id: 'nocleg', label: 'Noclegi / Pensjonat', filters: ['["tourism"~"^(guest_house|hostel|apartment|chalet)$"]'], phrases: ['guest house', 'hostel'] },
  { id: 'meble', label: 'Meble / Stolarz', filters: ['["shop"="furniture"]', '["craft"="joiner"]'], phrases: ['furniture shop'] },
];

const OVERPASS_ENDPOINTS = [
  'https://overpass-api.de/api/interpreter',
  'https://overpass.private.coffee/api/interpreter',
];
const OVERPASS_TIMEOUT_MS = 25000;

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function fetchWithTimeout(url, options = {}, ms = 15000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  try {
    return await fetch(url, { ...options, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

/** Miasto / adres → współrzędne */
export async function geocode(query) {
  const url = `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=pl&accept-language=pl&q=${encodeURIComponent(
    query,
  )}`;
  let res;
  try {
    res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 15000);
  } catch {
    throw new Error('Brak połączenia z wyszukiwarką miejsc. Sprawdź internet.');
  }
  if (!res.ok) throw new Error(`Wyszukiwarka miejsc nie odpowiada (${res.status}). Spróbuj za chwilę.`);
  const data = await res.json();
  if (!data.length) throw new Error(`Nie znaleziono miejsca „${query}”. Wpisz np. „Kraków” albo „Wieliczka, Rynek”.`);
  const p = data[0];
  return {
    lat: Number(p.lat),
    lon: Number(p.lon),
    label: p.display_name.split(',').slice(0, 3).join(','),
    city: p.name || query,
  };
}

/**
 * Pobiera firmy z wybranych branż w promieniu (metry).
 * Najpierw Overpass (pełne dane), a gdy jego serwery są przeciążone – Nominatim.
 */
export async function searchBusinesses({ lat, lon, radius, categoryIds, fallbackCity, onProgress }) {
  const cats = CATEGORIES.filter((c) => categoryIds.includes(c.id));
  if (!cats.length) throw new Error('Wybierz co najmniej jedną branżę.');

  let found;
  try {
    onProgress?.('Pobieram firmy z OpenStreetMap…');
    found = await searchOverpass({ lat, lon, radius, cats, fallbackCity });
  } catch {
    onProgress?.('Główny serwer map jest przeciążony – szukam przez zapasowe źródło…');
    found = await searchNominatim({ lat, lon, radius, cats, fallbackCity, onProgress });
  }
  found.sort((a, b) => a.distance - b.distance);
  return found;
}

async function searchOverpass({ lat, lon, radius, cats, fallbackCity }) {
  const parts = cats
    .flatMap((c) => c.filters)
    .map((f) => `nwr${f}["name"](around:${Math.round(radius)},${lat},${lon});`)
    .join('\n');
  const query = `[out:json][timeout:25];\n(\n${parts}\n);\nout center tags 1500;`;

  // Pytamy wszystkie serwery naraz i bierzemy pierwszą poprawną odpowiedź
  const attempt = async (endpoint) => {
    const res = await fetchWithTimeout(
      endpoint,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
        body: `data=${encodeURIComponent(query)}`,
      },
      OVERPASS_TIMEOUT_MS,
    );
    if (!res.ok) throw new Error(`Overpass ${res.status}`);
    const data = await res.json();
    if (!Array.isArray(data.elements)) throw new Error('Overpass: zła odpowiedź');
    return data;
  };
  const data = await Promise.any(OVERPASS_ENDPOINTS.map(attempt));

  const results = [];
  const seen = new Set();
  for (const el of data.elements) {
    const t = el.tags || {};
    const key = `osm:${el.type}/${el.id}`;
    if (!t.name || seen.has(key)) continue;
    seen.add(key);
    const category = cats.find((c) => c.filters.some((f) => matchesFilter(t, f)));
    results.push(toLead(t, {}, key, category?.label ?? '', el.lat ?? el.center?.lat, el.lon ?? el.center?.lon, lat, lon, fallbackCity));
  }
  return results;
}

/** Zapas: Nominatim (max 40 wyników na zapytanie, stronicujemy; limit 1 zapytanie/s) */
async function searchNominatim({ lat, lon, radius, cats, fallbackCity, onProgress }) {
  const dLat = radius / 111320;
  const dLon = radius / (111320 * Math.cos((lat * Math.PI) / 180));
  const viewbox = [lon - dLon, lat + dLat, lon + dLon, lat - dLat].map((n) => n.toFixed(5)).join(',');
  const MAX_PAGES = 3;

  const results = [];
  const seen = new Set();
  const jobs = cats.flatMap((c) => c.phrases.map((p) => ({ cat: c, phrase: p })));
  let failures = 0;

  for (let j = 0; j < jobs.length; j++) {
    const { cat, phrase } = jobs[j];
    onProgress?.(`Szukam: ${cat.label} (${j + 1}/${jobs.length})…`);
    const exclude = [];
    for (let page = 0; page < MAX_PAGES; page++) {
      const url =
        `https://nominatim.openstreetmap.org/search?format=jsonv2&limit=40&extratags=1&addressdetails=1` +
        `&accept-language=pl&bounded=1&viewbox=${viewbox}&q=${encodeURIComponent(phrase)}` +
        (exclude.length ? `&exclude_place_ids=${exclude.join(',')}` : '');
      let data;
      try {
        const res = await fetchWithTimeout(url, { headers: { Accept: 'application/json' } }, 15000);
        if (!res.ok) throw new Error(String(res.status));
        data = await res.json();
      } catch {
        failures++;
        break;
      }
      for (const p of data) {
        exclude.push(p.place_id);
        const key = `osm:${p.osm_type}/${p.osm_id}`;
        if (!p.name || seen.has(key)) continue;
        seen.add(key);
        const lead = toLead(p.extratags || {}, p.address || {}, key, cat.label, Number(p.lat), Number(p.lon), lat, lon, fallbackCity, p.name);
        if (lead.distance <= radius * 1.05) results.push(lead);
      }
      await sleep(1100); // zasady Nominatim: maks. 1 zapytanie na sekundę
      if (data.length < 40) break;
    }
  }
  if (!results.length && failures) {
    throw new Error('Serwery map są teraz przeciążone. Spróbuj ponownie za minutę.');
  }
  return results;
}

/** Proste sprawdzenie, do której branży pasuje element (do etykiety) */
function matchesFilter(tags, filter) {
  const m = filter.match(/\["([^"]+)"(=|~)"([^"]+)"\]/);
  if (!m) return false;
  const [, k, op, v] = m;
  if (tags[k] == null) return false;
  return op === '=' ? tags[k] === v : new RegExp(v).test(tags[k]);
}

function firstValue(v) {
  return v ? String(v).split(';')[0].trim() : '';
}

/** Klasyfikacja strony WWW (te same zasady co we wtyczce) */
export function classifyWebsite(url) {
  if (!url) return 'BRAK_WWW';
  const u = url.toLowerCase();
  if (/facebook\.com|fb\.com|fb\.me/.test(u)) return 'TYLKO_FB';
  if (/instagram\.com|instagr\.am/.test(u)) return 'TYLKO_IG';
  if (/booksy\.|moment\.pl|versum\.|fresha\.|treatwell\.|znanylekarz\./.test(u)) return 'TYLKO_BOOKSY';
  if (/linktr\.ee|tiktok\.com|sites\.google|business\.site|olx\.pl|allegro\.pl|oferteo|fixly/.test(u)) return 'INNE_SOCIAL';
  return 'MA_WWW';
}

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/**
 * t     – tagi OSM (Overpass: tags, Nominatim: extratags)
 * addr  – adres z Nominatim (addressdetails); dla Overpass pusty – adres jest w tagach addr:*
 */
function toLead(t, addr, key, categoryLabel, lat, lon, cLat, cLon, fallbackCity, nameOverride) {
  const phone = firstValue(t.phone || t['contact:phone'] || t['contact:mobile'] || t.mobile);
  const website = firstValue(t.website || t['contact:website'] || t.url);
  const facebook = firstValue(t['contact:facebook'] || t.facebook);
  const instagram = firstValue(t['contact:instagram'] || t.instagram);

  let websiteUrl = website;
  let websiteStatus = classifyWebsite(website);
  if (!website && facebook) {
    websiteUrl = facebook.startsWith('http') ? facebook : `https://facebook.com/${facebook}`;
    websiteStatus = 'TYLKO_FB';
  } else if (!website && instagram) {
    websiteUrl = instagram.startsWith('http') ? instagram : `https://instagram.com/${instagram}`;
    websiteStatus = 'TYLKO_IG';
  }

  const name = nameOverride || t.name;
  const street = [
    t['addr:street'] || t['addr:place'] || addr.road || addr.pedestrian || addr.square,
    t['addr:housenumber'] || addr.house_number,
  ]
    .filter(Boolean)
    .join(' ');
  const city =
    t['addr:city'] || t['addr:town'] || t['addr:village'] || addr.city || addr.town || addr.village || fallbackCity || '';
  const mapsQuery = [name, street, city].filter(Boolean).join(' ');

  return {
    key,
    company_name: name,
    category: categoryLabel.split(' / ')[0],
    city: city || null,
    address: street || null,
    phone: phone || null,
    phone_normalized: normalizePhone(phone) || null,
    website_url: websiteUrl || null,
    website_status: websiteStatus,
    maps_url: `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(mapsQuery)}`,
    maps_place_id: key,
    google_rating: null,
    google_reviews_count: null,
    distance: lat != null && lon != null ? distanceMeters(cLat, cLon, lat, lon) : 1e9,
  };
}

/** Pola zapisywane do bazy (bez pomocniczych) */
export function toLeadRecord(r) {
  return {
    company_name: r.company_name,
    category: r.category,
    city: r.city,
    address: r.address,
    phone: r.phone,
    website_url: r.website_url,
    website_status: r.website_status,
    maps_url: r.maps_url,
    maps_place_id: r.maps_place_id,
    google_rating: null,
    google_reviews_count: null,
  };
}
