import { useCallback, useEffect, useRef, useState } from 'react';
import { ArrowRight, CalendarDays, SkipForward } from 'lucide-react';
import { OUTCOMES, LEAD_STATUS } from '../lib/constants';
import { api } from '../lib/api';
import { addDays, todayISO, relativeDay, classNames } from '../lib/format';
import { useToast } from './Toast';
import { Kbd, Spinner } from './ui';

const QUICK_DATES = [
  { label: 'Jutro', days: 1 },
  { label: 'Za 3 dni', days: 3 },
  { label: 'Za tydzień', days: 7 },
  { label: 'Za 2 tyg.', days: 14 },
];

/**
 * Formularz wyniku rozmowy: notatka, follow-up, 3 przyciski i zapis.
 * Używany w Power Dialerze i w oknie „Zadzwoń” na liście follow-upów.
 * Rodzic powinien nadać mu key={lead.id}, żeby stan resetował się dla nowego leada.
 */
export function CallForm({ lead, onSaved, onSkip, submitLabel = 'Zapisz i następny', shortcuts = false }) {
  const toast = useToast();
  const [outcome, setOutcome] = useState(null);
  const [notes, setNotes] = useState(lead.notes ?? '');
  const [followUp, setFollowUp] = useState(lead.follow_up_at ?? '');
  const [saving, setSaving] = useState(false);
  const savingRef = useRef(false);

  const chooseOutcome = useCallback(
    (value) => {
      setOutcome(value);
      // "Do zastanowienia" bez daty → domyślnie za 3 dni
      if (value === 'DO_ZASTANOWIENIA' && !followUp) setFollowUp(addDays(todayISO(), 3));
    },
    [followUp],
  );

  const save = useCallback(async () => {
    if (!outcome || savingRef.current) return;
    savingRef.current = true;
    setSaving(true);
    try {
      const updated = await api.logCall(lead.id, outcome, notes, followUp || null);
      toast({
        type: 'success',
        title: `Zapisano: ${LEAD_STATUS[outcome].label}`,
        description: lead.company_name,
        duration: 2200,
      });
      onSaved?.(updated, outcome);
    } catch (e) {
      toast({ type: 'error', title: 'Nie udało się zapisać', description: e.message });
      savingRef.current = false;
      setSaving(false);
    }
  }, [outcome, notes, followUp, lead, onSaved, toast]);

  // Skróty klawiszowe: 1/2/3 = wynik, Ctrl+Enter = zapisz, S = pomiń
  useEffect(() => {
    if (!shortcuts) return undefined;
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
        e.preventDefault();
        save();
        return;
      }
      const tag = e.target?.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT' || e.target?.isContentEditable) return;
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const o = OUTCOMES.find((x) => x.key === e.key);
      if (o) {
        e.preventDefault();
        chooseOutcome(o.value);
      } else if ((e.key === 's' || e.key === 'S') && onSkip) {
        e.preventDefault();
        onSkip();
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [shortcuts, save, chooseOutcome, onSkip]);

  return (
    <div className="space-y-5">
      {/* Notatka */}
      <div>
        <label htmlFor="call-notes" className="label">
          Notatka z rozmowy
        </label>
        <textarea
          id="call-notes"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Z kim rozmawiałeś, czego potrzebują, kiedy oddzwonić…"
          className="input resize-y leading-relaxed"
        />
      </div>

      {/* Follow-up */}
      <div>
        <label htmlFor="call-followup" className="label">
          Kolejny kontakt (follow-up)
        </label>
        <div className="flex flex-wrap items-center gap-2">
          <div className="relative">
            <CalendarDays className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
            <input
              id="call-followup"
              type="date"
              value={followUp}
              min={todayISO()}
              onChange={(e) => setFollowUp(e.target.value)}
              className="input w-auto pl-9"
            />
          </div>
          {QUICK_DATES.map((q) => {
            const value = addDays(todayISO(), q.days);
            return (
              <button
                key={q.days}
                type="button"
                onClick={() => setFollowUp(value)}
                className={classNames(
                  'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                  followUp === value
                    ? 'border-zinc-900 bg-zinc-900 text-white'
                    : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900',
                )}
              >
                {q.label}
              </button>
            );
          })}
          {followUp && (
            <button
              type="button"
              onClick={() => setFollowUp('')}
              className="text-xs font-medium text-zinc-400 hover:text-zinc-700"
            >
              Wyczyść
            </button>
          )}
        </div>
        {followUp && <p className="mt-1.5 text-xs text-zinc-500">{relativeDay(followUp)}</p>}
      </div>

      {/* Wynik rozmowy */}
      <div>
        <span className="label">Wynik rozmowy</span>
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          {OUTCOMES.map((o) => {
            const active = outcome === o.value;
            return (
              <button
                key={o.value}
                type="button"
                onClick={() => chooseOutcome(o.value)}
                aria-pressed={active}
                className={classNames(
                  'relative flex min-h-20 flex-col items-center justify-center gap-1 rounded-xl border-2 px-2 py-3 text-center text-sm font-semibold transition duration-150 active:scale-[0.97] sm:min-h-24 sm:text-base',
                  active ? o.active : o.idle,
                )}
              >
                <span className="text-xl sm:text-2xl" aria-hidden>
                  {o.emoji}
                </span>
                <span className="leading-tight">{o.label}</span>
                {shortcuts && (
                  <span className="absolute right-2 top-2 hidden sm:block">
                    <Kbd>{o.key}</Kbd>
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </div>

      {/* Akcje */}
      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:items-center sm:justify-between">
        {onSkip ? (
          <button type="button" onClick={onSkip} className="btn-ghost">
            <SkipForward className="size-4" />
            Pomiń
            {shortcuts && (
              <span className="hidden sm:inline-flex">
                <Kbd>S</Kbd>
              </span>
            )}
          </button>
        ) : (
          <span />
        )}
        <button
          type="button"
          onClick={save}
          disabled={!outcome || saving}
          className="btn-primary h-12 px-6 text-base sm:min-w-64"
        >
          {saving ? <Spinner className="size-4 text-white" /> : null}
          {submitLabel}
          {!saving && <ArrowRight className="size-4" />}
          {shortcuts && (
            <span className="ml-1 hidden rounded bg-white/15 px-1.5 py-0.5 text-[10px] font-medium sm:inline">
              Ctrl+Enter
            </span>
          )}
        </button>
      </div>
      {!outcome && <p className="-mt-2 text-right text-xs text-zinc-400">Wybierz wynik rozmowy, aby zapisać.</p>}
    </div>
  );
}
