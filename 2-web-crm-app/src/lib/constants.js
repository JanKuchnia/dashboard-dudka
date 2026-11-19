import { ThumbsUp, Hourglass, ThumbsDown, PhoneMissed } from 'lucide-react';

// Statusy leada – etykiety i kolory używane w całej aplikacji
export const LEAD_STATUS = {
  NOWY: {
    label: 'Nowy',
    dot: 'bg-sky-500',
    badge: 'bg-sky-50 text-sky-700 ring-sky-600/20',
  },
  CHCA: {
    label: 'Chcą',
    dot: 'bg-emerald-500',
    badge: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20',
  },
  DO_ZASTANOWIENIA: {
    label: 'Do zastanowienia',
    dot: 'bg-amber-500',
    badge: 'bg-amber-50 text-amber-800 ring-amber-600/25',
  },
  NIE_CHCA: {
    label: 'Nie chcą',
    dot: 'bg-rose-500',
    badge: 'bg-rose-50 text-rose-700 ring-rose-600/20',
  },
  NIE_ODEBRAL: {
    label: 'Nie odbiera',
    dot: 'bg-zinc-400',
    badge: 'bg-zinc-100 text-zinc-600 ring-zinc-500/20',
  },
};

// Wyniki rozmowy – 4 duże przyciski w Power Dialerze
export const OUTCOMES = [
  {
    value: 'CHCA',
    label: 'Chcą',
    icon: ThumbsUp,
    key: '1',
    idle: 'border-emerald-200 bg-emerald-50/60 text-emerald-800 hover:border-emerald-300 hover:bg-emerald-50',
    active: 'border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-600/25',
  },
  {
    value: 'DO_ZASTANOWIENIA',
    label: 'Do zastanowienia',
    icon: Hourglass,
    key: '2',
    idle: 'border-amber-200 bg-amber-50/60 text-amber-900 hover:border-amber-300 hover:bg-amber-50',
    active: 'border-amber-500 bg-amber-400 text-amber-950 shadow-lg shadow-amber-500/25',
  },
  {
    value: 'NIE_CHCA',
    label: 'Nie chcą',
    icon: ThumbsDown,
    key: '3',
    idle: 'border-rose-200 bg-rose-50/60 text-rose-800 hover:border-rose-300 hover:bg-rose-50',
    active: 'border-rose-600 bg-rose-600 text-white shadow-lg shadow-rose-600/25',
  },
  {
    // Nowy lead wraca do kolejki za 3 h (po 3. razie: „Nie odbiera”), follow-up przesuwa się na jutro
    value: 'NIE_ODEBRAL',
    label: 'Nie odebrał',
    icon: PhoneMissed,
    key: '4',
    idle: 'border-zinc-200 bg-zinc-50/60 text-zinc-700 hover:border-zinc-300 hover:bg-zinc-100',
    active: 'border-zinc-700 bg-zinc-700 text-white shadow-lg shadow-zinc-700/25',
  },
];

// Status strony internetowej – plakietki
export const WEBSITE_STATUS = {
  BRAK_WWW: { label: 'BRAK WWW', badge: 'bg-rose-600 text-white', hot: true },
  TYLKO_FB: { label: 'TYLKO FB', badge: 'bg-blue-600 text-white', hot: true },
  TYLKO_IG: { label: 'TYLKO IG', badge: 'bg-fuchsia-600 text-white', hot: true },
  TYLKO_BOOKSY: { label: 'TYLKO BOOKSY', badge: 'bg-teal-600 text-white', hot: true },
  INNE_SOCIAL: { label: 'INNE SOCIAL', badge: 'bg-violet-600 text-white', hot: true },
  MA_WWW: { label: 'MA WWW', badge: 'bg-zinc-200 text-zinc-700', hot: false },
};

export const APP_NAME = import.meta.env.VITE_APP_NAME || 'Lead CRM';

export const PAGE_SIZE = 50;

// Etapy sprzedaży po „Chcą”
export const DEAL_STAGE = {
  SPOTKANIE: { label: 'Spotkanie', badge: 'bg-sky-50 text-sky-700 ring-sky-600/20' },
  OFERTA: { label: 'Oferta wysłana', badge: 'bg-violet-50 text-violet-700 ring-violet-600/20' },
  WYGRANA: { label: 'Wygrana', badge: 'bg-emerald-600 text-white ring-emerald-700' },
  PRZEGRANA: { label: 'Przegrana', badge: 'bg-zinc-100 text-zinc-500 ring-zinc-500/20' },
};

// Skrypt rozmowy w Power Dialerze – dopasowany do statusu strony. Zmieniaj śmiało.
const OBJECTIONS = [
  ['Nie mam czasu', 'Rozumiem, zajmie to 2 minuty. Mogę wysłać SMS-a z przykładem i oddzwonić, kiedy będzie Panu/Pani wygodnie?'],
  ['To za drogo', 'Strona zwraca się, gdy przyniesie kilku nowych klientów. Mogę przygotować wycenę dopasowaną do budżetu.'],
  ['Mam już Facebooka', 'Facebook jest super, ale klienci szukają w Google. Strona sprawia, że to Państwa znajdą, a nie konkurencję.'],
  ['Nie potrzebuję', 'Rozumiem. Mogę zapytać, skąd dziś przychodzą do Państwa nowi klienci?'],
];
const opener = (hook) =>
  `Dzień dobry, dzwonię w sprawie Państwa wizytówki w Google. ${hook} Robimy proste strony dla lokalnych firm. Czy mogę zająć minutę?`;
export const SALES_SCRIPTS = {
  BRAK_WWW: { opener: opener('Zauważyłem, że firma ma świetne opinie, ale nie ma strony internetowej.'), objections: OBJECTIONS },
  TYLKO_FB: { opener: opener('Widzę, że prowadzą Państwo Facebooka, ale z Google klienci nie trafiają na żadną stronę.'), objections: OBJECTIONS },
  TYLKO_IG: { opener: opener('Widzę ładny profil na Instagramie, ale w Google nie ma strony, na którą klient może wejść.'), objections: OBJECTIONS },
  TYLKO_BOOKSY: { opener: opener('Widzę, że rezerwacje idą przez Booksy. Własna strona dałaby Państwu klientów bez prowizji.'), objections: OBJECTIONS },
  INNE_SOCIAL: { opener: opener('Wizytówka prowadzi do profilu społecznościowego, a nie do własnej strony.'), objections: OBJECTIONS },
  MA_WWW: { opener: opener('Przejrzałem Państwa stronę i mam kilka pomysłów, jak mogłaby przynosić więcej zapytań.'), objections: OBJECTIONS },
};

/** Wiadomość po rozmowie (SMS / WhatsApp) */
export const followUpMessage = (lead) =>
  `Dzień dobry, dziękuję za rozmowę! Zgodnie z ustaleniami przesyłam kontakt w sprawie strony internetowej dla ${lead.company_name}. W razie pytań proszę pisać lub dzwonić. Pozdrawiam`;
