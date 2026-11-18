import { useEffect, useMemo, useState } from 'react';
import { Search, MapPin, Phone, Globe, Plus, Check, Radar, AlertTriangle, ExternalLink, Info } from 'lucide-react';
import { api } from '../lib/api';
import { CATEGORIES, geocode, searchBusinesses, toLeadRecord } from '../lib/osm';
import { WEBSITE_STATUS } from '../lib/constants';
import { WebsiteBadge } from '../components/Badges';
import { EmptyState, PageHeader, Spinner } from '../components/ui';
import { useToast } from '../components/Toast';
import { classNames, formatPhone, prettyUrl } from '../lib/format';

const RADII = [1, 2, 5, 10, 20, 30];
const PREFS_KEY = 'lead-crm-finder';

function loadPrefs() {
  try {
    return JSON.parse(localStorage.getItem(PREFS_KEY)) || {};
  } catch {
    return {};
  }
}

function formatDistance(m) {
  if (m >= 1e8) return '';
  return m < 1000 ? `${Math.round(m)} m` : `${(m / 1000).toFixed(1).replace('.', ',')} km`;
}

/** Pobieranie prawdziwych firm z okolicy (OpenStreetMap) */
export function Finder({ onDataChanged, onNavigate }) {
  const toast = useToast();
  const prefs = useMemo(loadPrefs, []);
  const [place, setPlace] = useState(prefs.place ?? '');
  const [radius, setRadius] = useState(prefs.radius ?? 5);
  const [cats, setCats] = useState(prefs.cats ?? ['fryzjer', 'kosmetyczka', 'mechanik']);
  const [onlyHot, setOnlyHot] = useState(prefs.onlyHot ?? true);
  const [onlyPhone, setOnlyPhone] = useState(prefs.onlyPhone ?? true);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState('');
  const [error, setError] = useState('');
  const [center, setCenter] = useState(null);
  const [results, setResults] = useState(null);
  const [existing, setExisting] = useState({ placeIds: new Set(), phones: new Set() });
  const [selected, setSelected] = useState(new Set());
  const [importing, setImporting] = useState(false);

  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ place, radius, cats, onlyHot, onlyPhone }));
    } catch {
      /* ignorujemy */
    }
  }, [place, radius, cats, onlyHot, onlyPhone]);

  const isDup = (r) =>
    existing.placeIds.has(r.maps_place_id) || (r.phone_normalized && existing.phones.has(r.phone_normalized));

  const visible = useMemo(() => {
    if (!results) return [];
    return results.filter((r) => {
      if (onlyHot && !WEBSITE_STATUS[r.website_status].hot) return false;
      if (onlyPhone && !r.phone) return false;
      return true;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, onlyHot, onlyPhone]);

  const selectable = visible.filter((r) => !isDup(r));
  const counts = useMemo(() => {
    const all = results ?? [];
    return {
      total: all.length,
      hot: all.filter((r) => WEBSITE_STATUS[r.website_status].hot).length,
      withPhone: all.filter((r) => r.phone).length,
    };
  }, [results]);

  const toggleCat = (id) => setCats((c) => (c.includes(id) ? c.filter((x) => x !== id) : [...c, id]));

  const search = async (e) => {
    e?.preventDefault();
    if (!place.trim()) {
      setError('Wpisz miasto albo adres.');
      return;
    }
    setLoading(true);
    setError('');
    setSelected(new Set());
    try {
      setProgress('Szukam miejsca na mapie…');
      const geo = await geocode(place.trim());
      setCenter(geo);
      const [found, keys] = await Promise.all([
        searchBusinesses({
          lat: geo.lat,
          lon: geo.lon,
          radius: radius * 1000,
          categoryIds: cats,
          fallbackCity: geo.city,
          onProgress: setProgress,
        }),
        api.getExistingKeys(),
      ]);
      setExisting(keys);
      setResults(found);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const toggle = (key) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(key)) n.delete(key);
      else n.add(key);
      return n;
    });

  const selectAll = () => setSelected(new Set(selectable.map((r) => r.key)));

  const importSelected = async () => {
    const chosen = results.filter((r) => selected.has(r.key));
    if (!chosen.length) return;
    setImporting(true);
    try {
      const { inserted, skipped } = await api.importLeads(chosen.map(toLeadRecord), 'openstreetmap');
      setExisting(await api.getExistingKeys());
      setSelected(new Set());
      onDataChanged?.();
      toast({
        type: 'success',
        title: `Dodano ${inserted.length} firm do kolejki`,
        description: skipped ? `${skipped} już było w bazie.` : 'Możesz zaczynać dzwonić.',
      });
    } catch (err) {
      toast({ type: 'error', title: 'Nie udało się dodać firm', description: err.message });
    } finally {
      setImporting(false);
    }
  };

  return (
    <div>
      <PageHeader
        title="Pozyskaj firmy"
        description="Prawdziwe firmy z Twojej okolicy (dane z OpenStreetMap) – wybierz i dodaj do kolejki dzwonienia"
      />

      {/* Formularz */}
      <form onSubmit={search} className="card space-y-5 p-5 sm:p-6">
        <div className="grid gap-3 sm:grid-cols-[1fr_auto_auto]">
          <div>
            <label htmlFor="place" className="label">
              Miasto lub adres
            </label>
            <div className="relative">
              <MapPin className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                id="place"
                value={place}
                onChange={(e) => setPlace(e.target.value)}
                placeholder="np. Kraków, Wieliczka, ul. Długa 1 Kraków"
                className="input pl-9"
              />
            </div>
          </div>
          <div>
            <label htmlFor="radius" className="label">
              Promień
            </label>
            <select id="radius" value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="input">
              {RADII.map((r) => (
                <option key={r} value={r}>
                  {r} km
                </option>
              ))}
            </select>
          </div>
          <div className="flex items-end">
            <button type="submit" disabled={loading} className="btn-primary h-[38px] w-full px-5 sm:w-auto">
              {loading ? <Spinner className="size-4 text-white" /> : <Search className="size-4" />}
              Szukaj firm
            </button>
          </div>
        </div>

        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="label mb-0">Branże ({cats.length})</span>
            <div className="flex gap-3 text-xs font-medium">
              <button type="button" onClick={() => setCats(CATEGORIES.map((c) => c.id))} className="text-indigo-600 hover:underline">
                Zaznacz wszystkie
              </button>
              <button type="button" onClick={() => setCats([])} className="text-zinc-500 hover:underline">
                Wyczyść
              </button>
            </div>
          </div>
          <div className="flex flex-wrap gap-2">
            {CATEGORIES.map((c) => {
              const active = cats.includes(c.id);
              return (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleCat(c.id)}
                  className={classNames(
                    'rounded-full border px-3 py-1.5 text-xs font-medium transition',
                    active
                      ? 'border-zinc-900 bg-zinc-900 text-white'
                      : 'border-zinc-200 bg-white text-zinc-600 hover:border-zinc-300 hover:text-zinc-900',
                  )}
                >
                  {c.label}
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-100 pt-4 text-sm text-zinc-700">
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={onlyHot} onChange={(e) => setOnlyHot(e.target.checked)} className="size-4 accent-zinc-900" />
            Tylko bez własnej strony (BRAK WWW, FB, IG…)
          </label>
          <label className="flex cursor-pointer items-center gap-2">
            <input type="checkbox" checked={onlyPhone} onChange={(e) => setOnlyPhone(e.target.checked)} className="size-4 accent-zinc-900" />
            Tylko z numerem telefonu
          </label>
        </div>
      </form>

      {/* Wyniki */}
      <div className="mt-6">
        {error ? (
          <div className="card">
            <EmptyState icon={AlertTriangle} title="Nie udało się pobrać firm" description={error} />
          </div>
        ) : loading ? (
          <div className="card flex flex-col items-center justify-center gap-3 py-16 text-sm text-zinc-500">
            <Spinner className="size-6" />
            <span>{progress || 'Szukam firm w okolicy…'}</span>
            <span className="text-xs text-zinc-400">To może potrwać do kilkudziesięciu sekund.</span>
          </div>
        ) : results === null ? (
          <div className="card">
            <EmptyState
              icon={Radar}
              title="Wpisz miasto i kliknij „Szukaj firm”"
              description="Pokażę prawdziwe firmy z wybranych branż w podanym promieniu, z telefonem i informacją, czy mają stronę."
            />
          </div>
        ) : (
          <>
            <div className="mb-3 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
              <p className="text-sm text-zinc-600">
                {center && <span className="font-medium text-zinc-900">{center.label}</span>}
                {' · '}znaleziono <b className="tabular-nums">{counts.total}</b>, bez strony{' '}
                <b className="tabular-nums text-rose-600">{counts.hot}</b>, z telefonem{' '}
                <b className="tabular-nums">{counts.withPhone}</b> · pokazano <b className="tabular-nums">{visible.length}</b>
              </p>
              <div className="flex gap-2">
                <button onClick={selectAll} disabled={!selectable.length} className="btn-secondary">
                  Zaznacz wszystkie ({selectable.length})
                </button>
                <button onClick={importSelected} disabled={!selected.size || importing} className="btn-primary">
                  {importing ? <Spinner className="size-4 text-white" /> : <Plus className="size-4" />}
                  Dodaj do kolejki ({selected.size})
                </button>
              </div>
            </div>

            {visible.length === 0 ? (
              <div className="card">
                <EmptyState
                  icon={Search}
                  title="Brak firm spełniających filtry"
                  description="Zwiększ promień, dodaj branże albo odznacz „Tylko z numerem telefonu”."
                />
              </div>
            ) : (
              <ul className="card divide-y divide-zinc-100 overflow-hidden">
                {visible.map((r) => {
                  const dup = isDup(r);
                  const checked = selected.has(r.key);
                  return (
                    <li
                      key={r.key}
                      onClick={() => !dup && toggle(r.key)}
                      className={classNames(
                        'flex items-start gap-3 px-4 py-3.5 transition sm:items-center',
                        dup ? 'bg-zinc-50/80' : 'cursor-pointer hover:bg-zinc-50',
                        checked && 'bg-indigo-50/60 hover:bg-indigo-50',
                      )}
                    >
                      <span
                        className={classNames(
                          'mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-md border transition sm:mt-0',
                          dup
                            ? 'border-zinc-200 bg-zinc-100'
                            : checked
                              ? 'border-indigo-600 bg-indigo-600 text-white'
                              : 'border-zinc-300 bg-white',
                        )}
                      >
                        {(checked || dup) && <Check className={classNames('size-3.5', dup && 'text-zinc-400')} />}
                      </span>

                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className={classNames('font-medium', dup ? 'text-zinc-500' : 'text-zinc-900')}>
                            {r.company_name}
                          </span>
                          <WebsiteBadge status={r.website_status} />
                          {dup && (
                            <span className="rounded-md bg-zinc-800 px-1.5 py-0.5 text-[10px] font-bold text-white">W BAZIE</span>
                          )}
                        </div>
                        <p className="mt-0.5 truncate text-xs text-zinc-500">
                          {[r.category, r.address, r.city].filter(Boolean).join(' · ')}
                          {formatDistance(r.distance) && ` · ${formatDistance(r.distance)}`}
                        </p>
                        {r.website_url && (
                          <p className="mt-0.5 flex items-center gap-1 truncate text-xs text-zinc-400">
                            <Globe className="size-3" />
                            {prettyUrl(r.website_url)}
                          </p>
                        )}
                      </div>

                      <div className="flex shrink-0 flex-col items-end gap-1.5 sm:flex-row sm:items-center sm:gap-3">
                        {r.phone ? (
                          <span className="flex items-center gap-1.5 text-sm font-medium tabular-nums text-zinc-800">
                            <Phone className="size-3.5 text-emerald-600" />
                            {formatPhone(r.phone)}
                          </span>
                        ) : (
                          <span className="text-xs text-zinc-400">brak telefonu</span>
                        )}
                        <a
                          href={r.maps_url}
                          target="_blank"
                          rel="noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="btn-ghost px-2 py-1 text-xs"
                          title="Sprawdź w Mapach Google"
                        >
                          <ExternalLink className="size-3.5" />
                          Maps
                        </a>
                      </div>
                    </li>
                  );
                })}
              </ul>
            )}

            <p className="mt-4 flex items-start gap-2 text-xs text-zinc-500">
              <Info className="mt-0.5 size-3.5 shrink-0" />
              Dane pochodzą z OpenStreetMap – nie każda firma ma tam wpisany telefon lub stronę. Przed telefonem warto
              kliknąć „Maps”, żeby sprawdzić wizytówkę w Google. Po dodaniu firm przejdź do{' '}
              <button onClick={() => onNavigate?.('dialer')} className="font-medium text-indigo-600 hover:underline">
                Trybu dzwonienia
              </button>
              .
            </p>
          </>
        )}
      </div>
    </div>
  );
}
