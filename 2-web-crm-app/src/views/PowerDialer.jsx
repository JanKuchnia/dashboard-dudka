import { useCallback, useEffect, useRef, useState } from 'react';
import { PartyPopper, RefreshCw, Undo2, Keyboard, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { LeadSummary } from '../components/LeadSummary';
import { CallForm } from '../components/CallForm';
import { EmptyState, Spinner, Kbd } from '../components/ui';
import { useToast } from '../components/Toast';

/** Tryb dzwonienia – jedna firma naraz, zapis i automatycznie następna */
export function PowerDialer({ stats, onDataChanged }) {
  const toast = useToast();
  const [lead, setLead] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [sessionCalls, setSessionCalls] = useState(0);
  const [skippedCount, setSkippedCount] = useState(0);
  const skipRef = useRef([]);

  const loadNext = useCallback(async () => {
    setLoading(true);
    setError('');
    window.scrollTo({ top: 0, behavior: 'smooth' });
    try {
      const next = await api.claimNextLead(skipRef.current);
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

  const handleSaved = useCallback(() => {
    setSessionCalls((n) => n + 1);
    onDataChanged?.();
    loadNext();
  }, [loadNext, onDataChanged]);

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
          <Kbd>3</Kbd> wynik
          <span className="mx-1">·</span>
          <Kbd>Ctrl+Enter</Kbd> zapisz
          <span className="mx-1">·</span>
          <Kbd>S</Kbd> pomiń
        </div>
      </div>

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
            title={skippedCount > 0 ? 'Koniec kolejki' : 'Kolejka jest pusta 🎉'}
            description={
              skippedCount > 0
                ? `Zostały tylko pominięte firmy (${skippedCount}). Możesz do nich wrócić.`
                : 'Wszystkie firmy zostały obdzwonione. Dodaj nowe przez wtyczkę Chrome albo ręcznie w zakładce Baza.'
            }
            action={
              <div className="flex flex-wrap justify-center gap-2">
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
          </div>
          <div className="p-5 sm:p-8">
            <CallForm key={lead.id} lead={lead} onSaved={handleSaved} onSkip={handleSkip} shortcuts />
          </div>
        </div>
      )}
    </div>
  );
}
