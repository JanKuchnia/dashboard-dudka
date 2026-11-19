import { useCallback, useEffect, useRef, useState } from 'react';
import { PartyPopper, RefreshCw, Undo2, Keyboard, AlertTriangle, Radar, MessageSquare, MessageCircle, ScrollText, Target } from 'lucide-react';
import { api } from '../lib/api';
import { SALES_SCRIPTS, LEAD_STATUS, followUpMessage } from '../lib/constants';
import { smsHref, whatsappHref, classNames } from '../lib/format';
import { LeadSummary } from '../components/LeadSummary';
import { CallForm } from '../components/CallForm';
import { EmptyState, Spinner, Kbd } from '../components/ui';
import { useToast } from '../components/Toast';

function readPref(key, fallback) {
  try {
    const v = JSON.parse(localStorage.getItem(`lead-crm-${key}`));
    return v ?? fallback;
  } catch {
    return fallback;
  }
}
function writePref(key, value) {
  try {
    localStorage.setItem(`lead-crm-${key}`, JSON.stringify(value));
  } catch {
    /* brak localStorage – ustawienie tylko do odświeżenia */
  }
}

/** Tryb dzwonienia – jedna firma naraz, zapis i automatycznie następna */
export function PowerDialer({ stats, onDataChanged, onNavigate, dataVersion }) {
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionCalls, setSessionCalls] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const skipRef = useRef([]);
  // Filtry kolejki i dzienny cel – zapamiętane w tej przeglądarce
  const [queueFilter, setQueueFilter] = useState(() => readPref('dialer-filter', { city: '', category: '' }));
  const [goal, setGoal] = useState(() => readPref('dialer-goal', 50));
  const [cities, setCities] = useState([]);
  const [last, setLast] = useState(null); // { prev, outcome } – do „Cofnij” i wiadomości po rozmowie
  const [undoing, setUndoing] = useState(false);
  const filterRef = useRef(queueFilter);
  filterRef.current = queueFilter;

  useEffect(() => {
    api.fetchCities().then(setCities).catch(() => {});
  }, []);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const next = await api.claimNextLead(skipRef.current, filterRef.current);
      setLead(next);
    } catch (e) {
      setError(e.message);
      setLead(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadNext();
  }, [loadNext]);

  // Pusta kolejka, a w tle doszły nowe firmy (np. z wtyczki) → pobierz od razu
  const leadRef = useRef(null);
  leadRef.current = lead;
  useEffect(() => {
    if (dataVersion && !leadRef.current) loadNext();
  }, [dataVersion, loadNext]);

  const handleSaved = useCallback(
    (updated, outcome) => {
      setLast({ prev: leadRef.current, outcome });
      setSessionCalls((n) => n + 1);
      onDataChanged?.();
      loadNext();
    },
    [loadNext, onDataChanged],
  );

  const undo = async () => {
    if (!last || undoing) return;
    setUndoing(true);
    try {
      const { prev } = last;
      const restored = await api.undoCall(prev.id, {
        status: prev.status,
        notes: prev.notes ?? null,
        follow_up_at: prev.follow_up_at ?? null,
        retry_at: prev.retry_at ?? null,
        last_called_at: prev.last_called_at ?? null,
      });
      setLast(null);
      setSessionCalls((n) => Math.max(0, n - 1));
      setLead(restored);
      onDataChanged?.();
      toast({ type: 'info', title: 'Cofnięto zapis', description: prev.company_name, duration: 2000 });
    } catch (e) {
      toast({ type: 'error', title: 'Nie udało się cofnąć', description: e.message });
    } finally {
      setUndoing(false);
    }
  };

  const changeFilter = (patch) => {
    const next = { ...queueFilter, ...patch };
    setQueueFilter(next);
    writePref('dialer-filter', next);
    filterRef.current = next;
    loadNext();
  };
  const changeGoal = (v) => {
    const n = Math.max(1, Math.min(999, parseInt(v, 10) || 1));
    setGoal(n);
    writePref('dialer-goal', n);
  };

  const handleSkip = useCallback(() => {
    if (!lead) return;
    skipRef.current = [...skipRef.current, lead.id];
    setSkippedCount(skipRef.current.length);
    toast({ type: 'info', title: 'Pominięto', description: lead.company_name, duration: 1800 });
    loadNext();
  }, [lead, loadNext, toast]);

  const resetSkipped = () => {
    skipRef.current = [];
    setSkippedCount(0);
    loadNext();
  };

  const queue = stats?.queue_new;
  const done = stats?.calls_today ?? 0;
  const filtered = !!(queueFilter.city || queueFilter.category);
  const script = lead && SALES_SCRIPTS[lead.website_status];
  const message = last?.prev && followUpMessage(last.prev);

  return (
    <div className="mx-auto max-w-3xl">
      {/* Nagłówek */}
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Tryb dzwonienia</h1>
          <p className="mt-1 text-sm text-zinc-500">
            {queue != null && (
              <>
                W kolejce: <span className="font-semibold text-zinc-800 tabular-nums">{queue}</span>
                <span className="mx-2 text-zinc-300">•</span>
              </>
            )}
            W tej sesji: <span className="font-semibold text-zinc-800 tabular-nums">{sessionCalls}</span>
            {skippedCount > 0 && (
              <>
                <span className="mx-2 text-zinc-300">•</span>
                Pominięte: <span className="font-semibold text-zinc-800 tabular-nums">{skippedCount}</span>
              </>
            )}
          </p>
        </div>
        <div className="hidden items-center gap-1.5 text-xs text-zinc-400 md:flex">
          <Keyboard className="size-3.5" />
          <Kbd>1</Kbd>
          <Kbd>2</Kbd>
          <Kbd>3</Kbd>
          <Kbd>4</Kbd> wynik
          <span className="mx-1">·</span>
          <Kbd>Ctrl+Enter</Kbd> zapisz
          <span className="mx-1">·</span>
          <Kbd>S</Kbd> pomiń
        </div>
      </div>

      {/* Dzienny cel */}
      <div className="card mb-4 flex items-center gap-3 px-4 py-3">
        <Target className="size-4 shrink-0 text-indigo-600" />
        <div className="h-2 flex-1 overflow-hidden rounded-full bg-zinc-100">
          <div
            className={classNames('h-full rounded-full transition-all duration-500', done >= goal ? 'bg-emerald-500' : 'bg-indigo-500')}
            style={{ width: `${Math.min(100, (100 * done) / goal)}%` }}
          />
        </div>
        <span className="text-sm tabular-nums text-zinc-600">
          <span className="font-semibold text-zinc-900">{done}</span> /
        </span>
        <input
          type="number"
          min={1}
          value={goal}
          onChange={(e) => changeGoal(e.target.value)}
          className="w-16 rounded-md border border-zinc-200 px-2 py-1 text-sm tabular-nums"
          aria-label="Dzienny cel rozmów"
          title="Dzienny cel rozmów"
        />
      </div>

      {/* Filtry kolejki */}
      <div className="mb-4 flex flex-wrap items-center gap-2 text-sm">
        <span className="text-zinc-500">Dzwoń do:</span>
        <select value={queueFilter.city} onChange={(e) => changeFilter({ city: e.target.value })} className="input w-auto py-1.5" aria-label="Miasto">
          <option value="">wszystkie miasta</option>
          {cities.map((c) => (
            <option key={c} value={c}>
              {c}
            </option>
          ))}
        </select>
        <input
          defaultValue={queueFilter.category}
          onBlur={(e) => e.target.value !== queueFilter.category && changeFilter({ category: e.target.value })}
          onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
          placeholder="branża, np. fryzjer"
          className="input w-44 py-1.5"
          aria-label="Branża"
        />
        {filtered && (
          <button onClick={() => changeFilter({ city: '', category: '' })} className="btn-ghost py-1.5 text-xs">
            Wyczyść
          </button>
        )}
      </div>

      {/* Ostatnia rozmowa: cofnij albo wyślij wiadomość */}
      {last && (
        <div className="mb-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-50 px-4 py-2.5 text-sm">
          <span className="min-w-0 flex-1 truncate text-zinc-600">
            Ostatnio: <span className="font-medium text-zinc-900">{last.prev.company_name}</span> · {LEAD_STATUS[last.outcome]?.label}
          </span>
          {last.prev.phone && last.outcome !== 'NIE_ODEBRAL' && (
            <>
              <a href={smsHref(last.prev.phone, message)} className="btn-secondary py-1.5 text-xs">
                <MessageSquare className="size-3.5" />
                SMS
              </a>
              <a href={whatsappHref(last.prev.phone, message)} target="_blank" rel="noreferrer" className="btn-secondary py-1.5 text-xs">
                <MessageCircle className="size-3.5 text-emerald-600" />
                WhatsApp
              </a>
            </>
          )}
          <button onClick={undo} disabled={undoing} className="btn-secondary py-1.5 text-xs">
            {undoing ? <Spinner className="size-3.5" /> : <Undo2 className="size-3.5" />}
            Cofnij
          </button>
        </div>
      )}

      {/* Karta leada */}
      {loading && !lead ? (
        <div className="card flex min-h-96 items-center justify-center">
          <Spinner className="size-6 text-zinc-400" />
        </div>
      ) : error ? (
        <div className="card">
          <EmptyState
            icon={AlertTriangle}
            title="Nie udało się pobrać kolejnej firmy"
            description={error}
            action={
              <button onClick={loadNext} className="btn-primary">
                <RefreshCw className="size-4" />
                Spróbuj ponownie
              </button>
            }
          />
        </div>
      ) : !lead ? (
        <div className="card">
          <EmptyState
            icon={PartyPopper}
            title={skippedCount > 0 ? 'Koniec kolejki' : filtered ? 'Brak firm dla tych filtrów' : 'Kolejka jest pusta'}
            description={
              skippedCount > 0
                ? `Zostały tylko pominięte firmy (${skippedCount}). Możesz do nich wrócić.`
                : 'Nie ma firm do obdzwonienia. Pobierz prawdziwe firmy z okolicy w zakładce „Pozyskaj firmy”.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
                {skippedCount === 0 && (
                  <button onClick={() => onNavigate?.('finder')} className="btn-primary">
                    <Radar className="size-4" />
                    Pozyskaj firmy
                  </button>
                )}
                {skippedCount > 0 && (
                  <button onClick={resetSkipped} className="btn-primary">
                    <Undo2 className="size-4" />
                    Wróć do pominiętych
                  </button>
                )}
                <button onClick={loadNext} className="btn-secondary">
                  <RefreshCw className="size-4" />
                  Odśwież
                </button>
              </div>
            }
          />
        </div>
      ) : (
        <div key={lead.id} className={`card animate-card-in overflow-hidden ${loading ? 'opacity-60' : ''}`}>
          <div className="border-b border-zinc-100 bg-gradient-to-b from-zinc-50/80 to-white p-5 sm:p-8">
            <LeadSummary lead={lead} />
            {script && (
              <details className="mt-5 rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm">
                <summary className="flex cursor-pointer items-center gap-2 font-medium text-zinc-700">
                  <ScrollText className="size-4 text-zinc-400" />
                  Skrypt rozmowy
                </summary>
                <p className="mt-3 leading-relaxed text-zinc-800">{script.opener}</p>
                <dl className="mt-3 space-y-2">
                  {script.objections.map(([q, a]) => (
                    <div key={q}>
                      <dt className="font-medium text-zinc-900">„{q}”</dt>
                      <dd className="text-zinc-600">{a}</dd>
                    </div>
                  ))}
                </dl>
              </details>
            )}
          </div>
          <div className="p-5 sm:p-8">
            <CallForm key={lead.id} lead={lead} onSaved={handleSaved} onSkip={handleSkip} shortcuts />
          </div>
        </div>
      )}
    </div>
  );
}
