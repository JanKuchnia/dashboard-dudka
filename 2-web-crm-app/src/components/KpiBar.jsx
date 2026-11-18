import { PhoneCall, ThumbsUp, Percent, Inbox, CalendarClock } from 'lucide-react';
import { classNames } from '../lib/format';

function Kpi({ icon: Icon, label, value, sub, accent }) {
  return (
    <div className="card flex flex-col gap-3 p-4">
      <div className="flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <span className={classNames('flex size-7 items-center justify-center rounded-lg', accent)}>
          <Icon className="size-4" />
        </span>
      </div>
      <div>
        <div className="text-2xl font-semibold tabular-nums tracking-tight text-zinc-900">{value}</div>
        {sub && <div className="mt-0.5 text-xs text-zinc-500">{sub}</div>}
      </div>
    </div>
  );
}

/** Górny pasek KPI w widoku Baza i statystyki */
export function KpiBar({ stats }) {
  const s = stats ?? {};
  const v = (x) => (stats ? x ?? 0 : '–');
  return (
    <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
      <Kpi
        icon={PhoneCall}
        label="Obdzwonione dzisiaj"
        value={v(s.calls_today)}
        sub={stats ? `Łącznie: ${s.called_total ?? 0}` : ''}
        accent="bg-indigo-50 text-indigo-600"
      />
      <Kpi
        icon={ThumbsUp}
        label="Zainteresowani"
        value={v(s.interested_total)}
        sub={stats ? `Dzisiaj: ${s.interested_today ?? 0}` : ''}
        accent="bg-emerald-50 text-emerald-600"
      />
      <Kpi
        icon={Percent}
        label="Skuteczność"
        value={stats ? `${s.success_rate ?? 0}%` : '–'}
        sub={stats ? `Dzisiaj: ${s.success_rate_today ?? 0}%` : ''}
        accent="bg-violet-50 text-violet-600"
      />
      <Kpi
        icon={Inbox}
        label="W kolejce"
        value={v(s.queue_new)}
        sub="Status: Nowy"
        accent="bg-sky-50 text-sky-600"
      />
      <Kpi
        icon={CalendarClock}
        label="Follow-upy na dziś"
        value={v(s.followups_due)}
        sub={stats ? `Wszystkie: ${s.thinking_total ?? 0}` : ''}
        accent="bg-amber-50 text-amber-600"
      />
    </div>
  );
}
