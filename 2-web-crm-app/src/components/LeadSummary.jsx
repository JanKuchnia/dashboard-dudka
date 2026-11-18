import { useState } from 'react';
import { Phone, MapPin, Star, ExternalLink, Copy, Check, Globe, History } from 'lucide-react';
import { WebsiteBadge } from './Badges';
import { formatPhone, telHref, mapsLink, prettyUrl, formatDateTime, classNames } from '../lib/format';

/** Nagłówek karty leada: nazwa, kategoria, ocena, telefon i przycisk Map */
export function LeadSummary({ lead, large = true }) {
  const [copied, setCopied] = useState(false);

  const copyPhone = async () => {
    try {
      await navigator.clipboard.writeText(formatPhone(lead.phone));
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* schowek niedostępny */
    }
  };

  const meta = [lead.category, lead.city].filter(Boolean).join(' · ');

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2">
        <WebsiteBadge status={lead.website_status} size="lg" />
        {lead.google_rating != null && (
          <span className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-1 text-xs font-semibold text-amber-800 ring-1 ring-amber-200 ring-inset">
            <Star className="size-3.5 fill-amber-400 text-amber-400" />
            {Number(lead.google_rating).toFixed(1).replace('.', ',')}
            {lead.google_reviews_count != null && (
              <span className="font-normal text-amber-700/80">({lead.google_reviews_count} opinii)</span>
            )}
          </span>
        )}
        {lead.call_count > 0 && (
          <span className="inline-flex items-center gap-1 rounded-md bg-zinc-100 px-2 py-1 text-xs font-medium text-zinc-600">
            <History className="size-3.5" />
            Dzwoniono {lead.call_count}× · {formatDateTime(lead.last_called_at)}
          </span>
        )}
      </div>

      <h2
        className={classNames(
          'mt-4 font-semibold tracking-tight text-zinc-900 text-balance',
          large ? 'text-2xl sm:text-3xl' : 'text-xl',
        )}
      >
        {lead.company_name}
      </h2>
      {meta && <p className="mt-1 text-sm font-medium text-zinc-500">{meta}</p>}
      {lead.address && (
        <p className="mt-2 flex items-center gap-1.5 text-sm text-zinc-500">
          <MapPin className="size-4 shrink-0 text-zinc-400" />
          {lead.address}
        </p>
      )}
      {lead.website_url && (
        <a
          href={lead.website_url}
          target="_blank"
          rel="noreferrer"
          className="mt-1.5 flex items-center gap-1.5 truncate text-sm text-indigo-600 hover:underline"
        >
          <Globe className="size-4 shrink-0 text-zinc-400" />
          <span className="truncate">{prettyUrl(lead.website_url)}</span>
        </a>
      )}

      <div className={classNames('mt-5 grid gap-2.5', large ? 'sm:grid-cols-2' : 'sm:grid-cols-2')}>
        {lead.phone ? (
          <div className="flex items-stretch overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
            <a
              href={telHref(lead.phone)}
              className="flex flex-1 items-center gap-3 px-4 py-3 transition hover:bg-zinc-50"
            >
              <span className="flex size-9 items-center justify-center rounded-lg bg-emerald-500 text-white shadow-sm shadow-emerald-500/30">
                <Phone className="size-4" />
              </span>
              <span>
                <span className="block text-[11px] font-medium uppercase tracking-wide text-zinc-400">Zadzwoń</span>
                <span className="block text-lg font-semibold tabular-nums tracking-tight text-zinc-900">
                  {formatPhone(lead.phone)}
                </span>
              </span>
            </a>
            <button
              onClick={copyPhone}
              className="border-l border-zinc-200 px-3 text-zinc-400 transition hover:bg-zinc-50 hover:text-zinc-700"
              title="Kopiuj numer"
              aria-label="Kopiuj numer"
            >
              {copied ? <Check className="size-4 text-emerald-600" /> : <Copy className="size-4" />}
            </button>
          </div>
        ) : (
          <div className="flex items-center rounded-xl border border-dashed border-zinc-300 px-4 py-3 text-sm text-zinc-500">
            Brak numeru telefonu
          </div>
        )}
        <a
          href={mapsLink(lead)}
          target="_blank"
          rel="noreferrer"
          className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white shadow-sm shadow-indigo-600/25 transition hover:bg-indigo-500 active:scale-[0.99]"
        >
          <MapPin className="size-4" />
          Otwórz wizytówkę w Maps
          <ExternalLink className="size-3.5 opacity-70" />
        </a>
      </div>
    </div>
  );
}
