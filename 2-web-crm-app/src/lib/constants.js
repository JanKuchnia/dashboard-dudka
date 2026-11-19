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
