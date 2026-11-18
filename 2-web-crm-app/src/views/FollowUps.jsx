import { useCallback, useEffect, useMemo, useState } from 'react';
import { CalendarCheck2, Phone, PhoneCall, RefreshCw, AlertTriangle } from 'lucide-react';
import { api } from '../lib/api';
import { WebsiteBadge } from '../components/Badges';
import { LeadSummary } from '../components/LeadSummary';
import { CallForm } from '../components/CallForm';
import { LeadDrawer } from '../components/LeadDrawer';
import { EmptyState, Modal, PageHeader, Spinner } from '../components/ui';
import {
  classNames,
  dayOfMonth,
  daysFromToday,
  formatPhone,
  relativeDay,
  shortMonth,
  telHref,
} from '../lib/format';

const GROUPS = [
  {
    id: 'overdue',
    title: 'Zaległe',
    hint: 'Termin minął – zadzwoń jak najszybciej',
    header: 'text-rose-700',
    pill: 'bg-rose-600 text-white',
    row: 'border-rose-200',
  },
  {
    id: 'today',
    title: 'Dzisiaj',
    hint: 'Rozmowy zaplanowane na dziś',
    header: 'text-amber-800',
    pill: 'bg-amber-500 text-white',
    row: 'border-amber-300 ring-4 ring-amber-100',
  },
  {
    id: 'upcoming',
    title: 'Nadchodzące',
    hint: '',
    header: 'text-zinc-700',
    pill: 'bg-zinc-100 text-zinc-700',
    row: 'border-zinc-200/80',
  },
  {
    id: 'nodate',
    title: 'Bez daty',
    hint: 'Ustaw termin kolejnego kontaktu',
    header: 'text-zinc-500',
    pill: 'bg-zinc-100 text-zinc-400',
    row: 'border-zinc-200/80',
  },
];

function groupOf(lead) {
  const d = daysFromToday(lead.follow_up_at);
  if (d === null) return 'nodate';
  if (d < 0) return 'overdue';
  if (d === 0) return 'today';
  return 'upcoming';
}

/** Lista firm „Do zastanowienia” posortowana po dacie kontaktu */
export function FollowUps({ onDataChanged, dataVersion }) {
  const [leads, setLeads] = useState(null);
  const [error, setError] = useState('');
  const [calling, setCalling] = useState(null);
  const [editing, setEditing] = useState(null);

  const load = useCallback(async () => {
    setError('');
    try {
      setLeads(await api.fetchFollowUps());
    } catch (e) {
      setError(e.message);
      setLeads([]);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  const grouped = useMemo(() => {
    const g = { overdue: [], today: [], upcoming: [], nodate: [] };
    for (const l of leads ?? []) g[groupOf(l)].push(l);
    return g;
  }, [leads]);

  const afterChange = () => {
    load();
    onDataChanged?.();
  };

  const dueCount = grouped.overdue.length + grouped.today.length;

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        title="Follow-upy"
        description={
          leads
            ? `${leads.length} firm do zastanowienia · ${dueCount} do oddzwonienia dzisiaj`
            : 'Firmy ze statusem „Do zastanowienia”'
        }
        actions={
          <button onClick={load} className="btn-secondary">
            <RefreshCw className="size-4" />
            Odśwież
          </button>
        }
      />

      {leads === null ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : error ? (
        <div className="card">
          <EmptyState icon={AlertTriangle} title="Nie udało się wczytać listy" description={error} />
        </div>
      ) : leads.length === 0 ? (
        <div className="card">
          <EmptyState
            icon={CalendarCheck2}
            title="Brak follow-upów"
            description="Firmy oznaczone jako „Do zastanowienia” pojawią się tutaj, posortowane według daty kontaktu."
          />
        </div>
      ) : (
        <div className="space-y-8">
          {GROUPS.map((group) => {
            const items = grouped[group.id];
            if (!items.length) return null;
            return (
              <section key={group.id}>
                <div className="mb-3 flex items-baseline gap-2">
                  <h2 className={classNames('text-sm font-semibold uppercase tracking-wide', group.header)}>
                    {group.title}
                  </h2>
                  <span className="text-sm font-medium tabular-nums text-zinc-400">{items.length}</span>
                  {group.hint && <span className="hidden text-xs text-zinc-400 sm:inline">· {group.hint}</span>}
                </div>
                <ul className="space-y-2.5">
                  {items.map((lead) => (
                    <li
                      key={lead.id}
                      className={classNames(
                        'flex animate-fade-in items-stretch gap-4 rounded-2xl border bg-white p-3.5 shadow-xs transition hover:shadow-md sm:p-4',
                        group.row,
                      )}
                    >
                      {/* Data */}
                      <div
                        className={classNames(
                          'flex w-14 shrink-0 flex-col items-center justify-center rounded-xl text-center',
                          group.pill,
                        )}
                      >
                        {lead.follow_up_at ? (
                          <>
                            <span className="text-xl font-bold leading-none tabular-nums">{dayOfMonth(lead.follow_up_at)}</span>
                            <span className="mt-1 text-[10px] font-semibold uppercase">{shortMonth(lead.follow_up_at)}</span>
                          </>
                        ) : (
                          <span className="text-lg">—</span>
                        )}
                      </div>

                      {/* Treść */}
                      <button onClick={() => setEditing(lead)} className="min-w-0 flex-1 text-left">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="truncate font-semibold text-zinc-900">{lead.company_name}</span>
                          <WebsiteBadge status={lead.website_status} />
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {[lead.category, lead.city].filter(Boolean).join(' · ')}
                          {lead.follow_up_at && (
                            <span className="font-medium text-zinc-700"> · {relativeDay(lead.follow_up_at)}</span>
                          )}
                        </p>
                        {lead.notes && <p className="mt-1.5 line-clamp-2 text-sm text-zinc-600">{lead.notes}</p>}
                      </button>

                      {/* Akcje */}
                      <div className="flex shrink-0 flex-col justify-center gap-2 sm:flex-row sm:items-center">
                        {lead.phone && (
                          <a
                            href={telHref(lead.phone)}
                            className="btn-secondary hidden tabular-nums md:inline-flex"
                            title="Zadzwoń"
                          >
                            <Phone className="size-4 text-emerald-600" />
                            {formatPhone(lead.phone)}
                          </a>
                        )}
                        <button onClick={() => setCalling(lead)} className="btn-primary">
                          <PhoneCall className="size-4" />
                          <span className="hidden sm:inline">Zadzwoń teraz</span>
                        </button>
                      </div>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </div>
      )}

      <Modal open={!!calling} onClose={() => setCalling(null)} title="Rozmowa – follow-up" wide>
        {calling && (
          <div className="space-y-6">
            <LeadSummary lead={calling} large={false} />
            <div className="border-t border-zinc-100 pt-6">
              <CallForm
                key={calling.id}
                lead={calling}
                submitLabel="Zapisz rozmowę"
                onSaved={() => {
                  setCalling(null);
                  afterChange();
                }}
              />
            </div>
          </div>
        )}
      </Modal>

      <LeadDrawer open={!!editing} lead={editing} onClose={() => setEditing(null)} onChanged={afterChange} />
    </div>
  );
}
