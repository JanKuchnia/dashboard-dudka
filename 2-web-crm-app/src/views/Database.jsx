import { useCallback, useEffect, useState } from 'react';
import {
  Search,
  Plus,
  Download,
  X,
  ChevronLeft,
  ChevronRight,
  ArrowUpDown,
  ArrowUp,
  ArrowDown,
  Star,
  Building2,
  AlertTriangle,
  Radar,
  Trash2,
  RotateCcw,
} from 'lucide-react';
import { api } from '../lib/api';
import { KpiBar } from '../components/KpiBar';
import { StatusBadge, WebsiteBadge, DealBadge } from '../components/Badges';
import { LeadDrawer } from '../components/LeadDrawer';
import { EmptyState, PageHeader, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { LEAD_STATUS, WEBSITE_STATUS, DEAL_STAGE, PAGE_SIZE } from '../lib/constants';
import { classNames, formatDate, formatDateTime, formatPhone, relativeDay, daysFromToday } from '../lib/format';

/** Opóźnia wartość (wyszukiwarka nie strzela zapytaniem po każdej literze) */
function useDebounced(value, ms = 300) {
  const [v, setV] = useState(value);
  useEffect(() => {
    const t = setTimeout(() => setV(value), ms);
    return () => clearTimeout(t);
  }, [value, ms]);
  return v;
}

const COLUMNS = [
  { id: 'company_name', label: 'Firma', sortable: true },
  { id: 'city', label: 'Miasto', sortable: true },
  { id: 'phone', label: 'Telefon' },
  { id: 'google_rating', label: 'Ocena', sortable: true },
  { id: 'website_status', label: 'WWW' },
  { id: 'status', label: 'Status', sortable: true },
  { id: 'follow_up_at', label: 'Follow-up', sortable: true },
  { id: 'last_called_at', label: 'Ostatni telefon', sortable: true },
];

/** Eksport do CSV (średnik + BOM, żeby polski Excel otworzył poprawnie) */
function downloadCsv(rows) {
  const headers = [
    ['company_name', 'Firma'],
    ['category', 'Kategoria'],
    ['city', 'Miasto'],
    ['address', 'Adres'],
    ['phone', 'Telefon'],
    ['google_rating', 'Ocena Google'],
    ['google_reviews_count', 'Liczba opinii'],
    ['website_status', 'Status WWW'],
    ['website_url', 'Obecna strona'],
    ['status', 'Status'],
    ['notes', 'Notatka'],
    ['follow_up_at', 'Follow-up'],
    ['last_called_at', 'Ostatni telefon'],
    ['call_count', 'Liczba telefonów'],
    ['maps_url', 'Link do Map'],
    ['created_at', 'Dodano'],
  ];
  const esc = (v) => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[";\n\r]/.test(s) ? `"${s}"` : s;
  };
  const lines = [
    headers.map((h) => h[1]).join(';'),
    ...rows.map((r) =>
      headers
        .map(([k]) => {
          if (k === 'status') return esc(LEAD_STATUS[r.status]?.label ?? r.status);
          if (k === 'website_status') return esc(WEBSITE_STATUS[r.website_status]?.label ?? r.website_status);
          return esc(r[k]);
        })
        .join(';'),
    ),
  ];
  const blob = new Blob(['﻿' + lines.join('\r\n')], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `leady-${new Date().toISOString().slice(0, 10)}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

export function Database({ stats, onDataChanged, onNavigate, dataVersion }) {
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [website, setWebsite] = useState('');
  const [city, setCity] = useState('');
  const [deal, setDeal] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [sort, setSort] = useState({ column: 'created_at', asc: false });
  const [page, setPage] = useState(0);
  const [data, setData] = useState({ rows: null, count: 0 });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [cities, setCities] = useState([]);
  const [drawer, setDrawer] = useState({ open: false, lead: null });
  const [exporting, setExporting] = useState(false);

  const debouncedSearch = useDebounced(search);
  const filters = { search: debouncedSearch, status, website, city, deal, sort };
  const hasFilters = !!(search || status || website || city || deal);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await api.fetchLeads({ ...filters, page, pageSize: PAGE_SIZE });
      setData(res);
    } catch (e) {
      setError(e.message);
      setData({ rows: [], count: 0 });
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch, status, website, city, deal, sort, page]);

  useEffect(() => {
    load();
  }, [load, dataVersion]);

  // Zaznaczenie dotyczy tylko widocznej strony
  useEffect(() => {
    setSelected(new Set());
    setConfirmBulkDelete(false);
  }, [debouncedSearch, status, website, city, deal, sort, page]);

  useEffect(() => {
    api.fetchCities().then(setCities).catch(() => {});
  }, []);

  // Zmiana filtra → wracamy na pierwszą stronę
  useEffect(() => {
    setPage(0);
  }, [debouncedSearch, status, website, city, deal, sort]);

  const toggleOne = (id) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const allOnPage = !!data.rows?.length && data.rows.every((l) => selected.has(l.id));
  const toggleAll = () => setSelected(allOnPage ? new Set() : new Set(data.rows.map((l) => l.id)));

  const runBulk = async (label, fn) => {
    const ids = [...selected];
    setBulkBusy(true);
    try {
      await fn(ids);
      toast({ type: 'success', title: label, description: `${ids.length} firm` });
      setSelected(new Set());
      setConfirmBulkDelete(false);
      afterChange();
    } catch (e) {
      toast({ type: 'error', title: 'Nie udało się', description: e.message });
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkStatus = (value) => value && runBulk(`Zmieniono status: ${LEAD_STATUS[value].label}`, (ids) => api.bulkUpdate(ids, { status: value }));
  const bulkRequeue = () =>
    runBulk('Wróciły do kolejki', (ids) =>
      api.bulkUpdate(ids, { status: 'NOWY', retry_at: null, follow_up_at: null }),
    );
  const bulkDelete = () => {
    if (!confirmBulkDelete) return setConfirmBulkDelete(true);
    return runBulk('Usunięto', (ids) => api.bulkDelete(ids));
  };

  const afterChange = () => {
    load();
    onDataChanged?.();
    api.fetchCities().then(setCities).catch(() => {});
  };

  const toggleSort = (column) => {
    setSort((s) => (s.column === column ? { column, asc: !s.asc } : { column, asc: column === 'company_name' || column === 'city' }));
  };

  const clearFilters = () => {
    setSearch('');
    setStatus('');
    setWebsite('');
    setCity('');
    setDeal('');
  };

  const exportCsv = async () => {
    setExporting(true);
    try {
      const rows = await api.fetchAllLeads(filters);
      downloadCsv(rows);
      toast({ type: 'success', title: 'Wyeksportowano CSV', description: `${rows.length} firm` });
    } catch (e) {
      toast({ type: 'error', title: 'Eksport nie powiódł się', description: e.message });
    } finally {
      setExporting(false);
    }
  };

  const from = data.count === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, data.count);
  const lastPage = Math.max(0, Math.ceil(data.count / PAGE_SIZE) - 1);

  return (
    <div>
      <PageHeader
        title="Baza i statystyki"
        description="Wszystkie firmy w jednym miejscu"
        actions={
          <>
            <button onClick={exportCsv} disabled={exporting} className="btn-secondary">
              {exporting ? <Spinner className="size-4" /> : <Download className="size-4" />}
              Eksport CSV
            </button>
            <button onClick={() => setDrawer({ open: true, lead: null })} className="btn-primary">
              <Plus className="size-4" />
              Dodaj firmę
            </button>
          </>
        }
      />

      <KpiBar stats={stats} />

      {/* Filtry */}
      <div className="mt-8 flex flex-col gap-2 xl:flex-row xl:items-center">
        <div className="relative flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
          <input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Szukaj po nazwie, mieście, kategorii, telefonie lub notatce…"
            className="input pl-9"
          />
        </div>
        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 xl:flex">
          <select value={status} onChange={(e) => setStatus(e.target.value)} className="input xl:w-44">
            <option value="">Status: wszystkie</option>
            {Object.entries(LEAD_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select value={website} onChange={(e) => setWebsite(e.target.value)} className="input xl:w-40">
            <option value="">WWW: wszystkie</option>
            {Object.entries(WEBSITE_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
          <select value={city} onChange={(e) => setCity(e.target.value)} className="input xl:w-40">
            <option value="">Miasto: wszystkie</option>
            {cities.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
          <select value={deal} onChange={(e) => setDeal(e.target.value)} className="input xl:w-44">
            <option value="">Sprzedaż: wszystkie</option>
            {Object.entries(DEAL_STAGE).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </div>
        {hasFilters && (
          <button onClick={clearFilters} className="btn-ghost shrink-0">
            <X className="size-4" />
            Wyczyść
          </button>
        )}
      </div>

      {/* Akcje dla zaznaczonych */}
      {selected.size > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-2 rounded-xl border border-zinc-200 bg-zinc-900 px-4 py-2.5 text-sm text-white">
          <span className="font-medium tabular-nums">Zaznaczone: {selected.size}</span>
          <select
            value=""
            onChange={(e) => bulkStatus(e.target.value)}
            disabled={bulkBusy}
            className="rounded-lg bg-white/10 px-2 py-1.5 text-sm text-white"
            aria-label="Zmień status zaznaczonych"
          >
            <option value="">Zmień status…</option>
            {Object.entries(LEAD_STATUS).map(([k, v]) => (
              <option key={k} value={k} className="text-zinc-900">
                {v.label}
              </option>
            ))}
          </select>
          <button onClick={bulkRequeue} disabled={bulkBusy} className="inline-flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 hover:bg-white/20">
            <RotateCcw className="size-4" />
            Do kolejki
          </button>
          <button
            onClick={bulkDelete}
            disabled={bulkBusy}
            className={classNames('inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5', confirmBulkDelete ? 'bg-rose-600 hover:bg-rose-500' : 'bg-white/10 hover:bg-white/20')}
          >
            <Trash2 className="size-4" />
            {confirmBulkDelete ? `Na pewno usunąć ${selected.size}?` : 'Usuń'}
          </button>
          {bulkBusy && <Spinner className="size-4 text-white" />}
          <button onClick={() => setSelected(new Set())} className="ml-auto text-white/70 hover:text-white">
            Odznacz
          </button>
        </div>
      )}

      {/* Tabela / lista */}
      <div className="card mt-4 overflow-hidden">
        {error ? (
          <EmptyState icon={AlertTriangle} title="Nie udało się wczytać bazy" description={error} />
        ) : data.rows === null ? (
          <div className="flex justify-center py-20">
            <Spinner className="size-6" />
          </div>
        ) : data.rows.length === 0 ? (
          <EmptyState
            icon={Building2}
            title={hasFilters ? 'Brak wyników' : 'Baza jest pusta'}
            description={
              hasFilters
                ? 'Zmień filtry albo wyszukiwaną frazę.'
                : 'Pobierz prawdziwe firmy z okolicy albo dodaj firmę ręcznie przyciskiem „Dodaj firmę”.'
            }
            action={
              !hasFilters && (
                <button onClick={() => onNavigate?.('finder')} className="btn-primary">
                  <Radar className="size-4" />
                  Pozyskaj firmy
                </button>
              )
            }
          />
        ) : (
          <div className={classNames('transition-opacity', loading && 'opacity-50')}>
            {/* Komputer – tabela */}
            <div className="scroll-thin hidden overflow-x-auto md:block">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 bg-zinc-50/60 text-left">
                    <th className="w-10 px-4 py-3">
                      <input type="checkbox" checked={allOnPage} onChange={toggleAll} aria-label="Zaznacz wszystkie na stronie" className="size-4 accent-zinc-900" />
                    </th>
                    {COLUMNS.map((c) => {
                      const active = sort.column === c.id;
                      const Icon = active ? (sort.asc ? ArrowUp : ArrowDown) : ArrowUpDown;
                      return (
                        <th key={c.id} className="whitespace-nowrap px-4 py-3 text-xs font-medium text-zinc-500">
                          {c.sortable ? (
                            <button
                              onClick={() => toggleSort(c.id)}
                              className={classNames(
                                'inline-flex items-center gap-1 hover:text-zinc-900',
                                active && 'text-zinc-900',
                              )}
                            >
                              {c.label}
                              <Icon className={classNames('size-3', !active && 'opacity-40')} />
                            </button>
                          ) : (
                            c.label
                          )}
                        </th>
                      );
                    })}
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100">
                  {data.rows.map((l, i) => {
                    const fu = daysFromToday(l.follow_up_at);
                    return (
                      <tr
                        key={l.id}
                        onClick={() => setDrawer({ open: true, lead: l })}
                        style={{ '--i': i }}
                        className={classNames('stagger-in cursor-pointer transition hover:bg-zinc-50', selected.has(l.id) && 'bg-indigo-50/50')}
                      >
                        <td className="px-4 py-3" onClick={(e) => e.stopPropagation()}>
                          <input
                            type="checkbox"
                            checked={selected.has(l.id)}
                            onChange={() => toggleOne(l.id)}
                            aria-label={`Zaznacz ${l.company_name}`}
                            className="size-4 accent-zinc-900"
                          />
                        </td>
                        <td className="max-w-72 px-4 py-3">
                          <div className="truncate font-medium text-zinc-900">{l.company_name}</div>
                          {l.category && <div className="truncate text-xs text-zinc-500">{l.category}</div>}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-600">{l.city || '—'}</td>
                        <td className="whitespace-nowrap px-4 py-3 tabular-nums text-zinc-700">
                          {l.phone ? formatPhone(l.phone) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3">
                          {l.google_rating != null ? (
                            <span className="inline-flex items-center gap-1 text-zinc-700">
                              <Star className="size-3.5 fill-amber-400 text-amber-400" />
                              {Number(l.google_rating).toFixed(1).replace('.', ',')}
                              <span className="text-xs text-zinc-400">({l.google_reviews_count ?? 0})</span>
                            </span>
                          ) : (
                            '—'
                          )}
                        </td>
                        <td className="px-4 py-3">
                          <WebsiteBadge status={l.website_status} />
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex flex-col items-start gap-1">
                            <StatusBadge status={l.status} />
                            <DealBadge stage={l.deal_stage} value={l.deal_value} />
                          </div>
                        </td>
                        <td
                          className={classNames(
                            'whitespace-nowrap px-4 py-3',
                            fu !== null && fu < 0 && 'font-medium text-rose-600',
                            fu === 0 && 'font-semibold text-amber-700',
                            (fu === null || fu > 0) && 'text-zinc-600',
                          )}
                        >
                          {l.follow_up_at ? (fu <= 1 && fu >= -1 ? relativeDay(l.follow_up_at) : formatDate(l.follow_up_at)) : '—'}
                        </td>
                        <td className="whitespace-nowrap px-4 py-3 text-zinc-500">{formatDateTime(l.last_called_at)}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Telefon – karty */}
            <ul className="divide-y divide-zinc-100 md:hidden">
              {data.rows.map((l, i) => (
                <li key={l.id} style={{ '--i': i }} className="stagger-in">
                  <button onClick={() => setDrawer({ open: true, lead: l })} className="w-full px-4 py-3.5 text-left">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="truncate font-medium text-zinc-900">{l.company_name}</div>
                        <div className="truncate text-xs text-zinc-500">
                          {[l.category, l.city].filter(Boolean).join(' · ')}
                        </div>
                      </div>
                      <StatusBadge status={l.status} />
                    </div>
                    <div className="mt-2 flex items-center gap-2 text-xs text-zinc-500">
                      <WebsiteBadge status={l.website_status} />
                      {l.phone && <span className="tabular-nums">{formatPhone(l.phone)}</span>}
                      {l.follow_up_at && <span>· {relativeDay(l.follow_up_at)}</span>}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Paginacja */}
        {data.count > 0 && (
          <div className="flex items-center justify-between border-t border-zinc-100 px-4 py-3 text-sm">
            <span className="text-zinc-500">
              Pokazano <span className="font-medium text-zinc-900 tabular-nums">{from}–{to}</span> z{' '}
              <span className="font-medium text-zinc-900 tabular-nums">{data.count}</span>
            </span>
            <div className="flex gap-1">
              <button
                onClick={() => setPage((p) => Math.max(0, p - 1))}
                disabled={page === 0}
                className="btn-secondary px-2.5"
                aria-label="Poprzednia strona"
              >
                <ChevronLeft className="size-4" />
              </button>
              <button
                onClick={() => setPage((p) => Math.min(lastPage, p + 1))}
                disabled={page >= lastPage}
                className="btn-secondary px-2.5"
                aria-label="Następna strona"
              >
                <ChevronRight className="size-4" />
              </button>
            </div>
          </div>
        )}
      </div>

      <LeadDrawer
        open={drawer.open}
        lead={drawer.lead}
        onClose={() => setDrawer({ open: false, lead: null })}
        onChanged={afterChange}
      />
    </div>
  );
}
