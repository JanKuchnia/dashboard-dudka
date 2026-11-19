import { useEffect, useState } from 'react';
import { AlertTriangle, BarChart3 } from 'lucide-react';
import { api } from '../lib/api';
import { EmptyState, PageHeader, Spinner } from '../components/ui';
import { summarizeCalls, formatDate, classNames } from '../lib/format';

const RANGES = [7, 30, 90];
const pct = (a, b) => (b ? Math.round((100 * a) / b) : 0);

/** Poziomy pasek z liczbą – bez biblioteki wykresów */
function Bar({ value, max, className = 'bg-indigo-500' }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-zinc-100">
      <div className={classNames('h-full rounded-full', className)} style={{ width: `${max ? (100 * value) / max : 0}%` }} />
    </div>
  );
}

function Section({ title, description, children }) {
  return (
    <section className="card p-5">
      <h2 className="text-sm font-semibold text-zinc-900">{title}</h2>
      {description && <p className="mt-0.5 text-xs text-zinc-500">{description}</p>}
      <div className="mt-4">{children}</div>
    </section>
  );
}

/** Statystyki rozmów: kto dzwoni, jak zmienia się skuteczność i kiedy ludzie odbierają */
export function Stats({ dataVersion }) {
  const [days, setDays] = useState(30);
  const [data, setData] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    let alive = true;
    setError('');
    const since = new Date(Date.now() - days * 864e5).toISOString();
    api
      .fetchCallFeed(since)
      .then((rows) => alive && setData(summarizeCalls(rows)))
      .catch((e) => alive && setError(e.message));
    return () => {
      alive = false;
    };
  }, [days, dataVersion]);

  const maxDay = Math.max(1, ...(data?.byDay.map((d) => d.calls) ?? []));
  const maxUser = Math.max(1, ...(data?.byUser.map((d) => d.calls) ?? []));

  return (
    <div>
      <PageHeader
        title="Statystyki"
        description="Rozmowy z historii połączeń"
        actions={
          <div className="flex rounded-lg border border-zinc-200 bg-white p-0.5 text-sm">
            {RANGES.map((r) => (
              <button
                key={r}
                onClick={() => setDays(r)}
                className={classNames('rounded-md px-3 py-1.5 font-medium', days === r ? 'bg-zinc-900 text-white' : 'text-zinc-600 hover:text-zinc-900')}
              >
                {r} dni
              </button>
            ))}
          </div>
        }
      />

      {error ? (
        <div className="card">
          <EmptyState icon={AlertTriangle} title="Nie udało się wczytać statystyk" description={error} />
        </div>
      ) : !data ? (
        <div className="flex justify-center py-20">
          <Spinner className="size-6" />
        </div>
      ) : data.byDay.length === 0 ? (
        <div className="card">
          <EmptyState icon={BarChart3} title="Brak rozmów w tym okresie" description="Statystyki pojawią się po pierwszych zapisanych rozmowach." />
        </div>
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          <Section title="Kto dzwoni" description="Rozmowy, odebrane i „Chcą” na osobę">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-xs text-zinc-500">
                  <th className="pb-2 font-medium">Osoba</th>
                  <th className="pb-2 pl-3 text-right font-medium">Rozmowy</th>
                  <th className="pb-2 pl-3 text-right font-medium">Dziennie</th>
                  <th className="pb-2 pl-3 text-right font-medium">Chcą</th>
                  <th className="pb-2 pl-3 text-right font-medium">Skuteczność</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-zinc-100">
                {data.byUser.map((u) => (
                  <tr key={u.key}>
                    <td className="max-w-40 py-2">
                      <div className="truncate text-zinc-900">{u.key}</div>
                      <Bar value={u.calls} max={maxUser} />
                    </td>
                    <td className="py-2 text-right tabular-nums">{u.calls}</td>
                    <td className="py-2 text-right tabular-nums text-zinc-500">{(u.calls / data.byDay.length).toFixed(1).replace('.', ',')}</td>
                    <td className="py-2 text-right tabular-nums text-emerald-700">{u.won}</td>
                    <td className="py-2 text-right tabular-nums">{pct(u.won, u.answered)}%</td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs text-zinc-400">„Dziennie” liczone na dni, w których ktokolwiek dzwonił.</p>
          </Section>

          <Section title="Kiedy ludzie odbierają" description="Odsetek odebranych połączeń wg godziny">
            <ul className="space-y-1.5">
              {data.byHour.map((h) => (
                <li key={h.key} className="grid grid-cols-[3rem_1fr_6rem] items-center gap-3 text-sm">
                  <span className="tabular-nums text-zinc-500">{String(h.key).padStart(2, '0')}:00</span>
                  <Bar value={h.answered} max={h.calls} className="bg-emerald-500" />
                  <span className="text-right tabular-nums text-zinc-700">
                    {pct(h.answered, h.calls)}% <span className="text-xs text-zinc-400">z {h.calls}</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>

          <Section title="Dzień po dniu" description="Liczba rozmów i skuteczność (Chcą / odebrane)">
            <ul className="space-y-1.5">
              {[...data.byDay].reverse().map((d) => (
                <li key={d.key} className="grid grid-cols-[6rem_1fr_7rem] items-center gap-3 text-sm">
                  <span className="text-zinc-500">{formatDate(d.key)}</span>
                  <Bar value={d.calls} max={maxDay} />
                  <span className="text-right tabular-nums text-zinc-700">
                    {d.calls} · <span className="text-emerald-700">{pct(d.won, d.answered)}%</span>
                  </span>
                </li>
              ))}
            </ul>
          </Section>
        </div>
      )}
    </div>
  );
}
