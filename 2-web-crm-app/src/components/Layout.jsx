import { PhoneCall, CalendarClock, LayoutDashboard, LogOut, HardDrive, Radar } from 'lucide-react';
import { APP_NAME } from '../lib/constants';
import { classNames } from '../lib/format';

export const NAV = [
  { id: 'dialer', label: 'Tryb dzwonienia', short: 'Dzwonienie', icon: PhoneCall },
  { id: 'followups', label: 'Follow-upy', short: 'Follow-upy', icon: CalendarClock },
  { id: 'baza', label: 'Baza i statystyki', short: 'Baza', icon: LayoutDashboard },
  { id: 'finder', label: 'Pozyskaj firmy', short: 'Pozyskaj', icon: Radar },
];

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="flex size-8 items-center justify-center rounded-lg bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm shadow-indigo-500/30">
        <PhoneCall className="size-4" />
      </div>
      <span className="text-[15px] font-semibold tracking-tight text-zinc-900">{APP_NAME}</span>
    </div>
  );
}

function badgeFor(id, stats) {
  if (!stats) return null;
  if (id === 'dialer') return stats.queue_new ? { value: stats.queue_new, cls: 'bg-zinc-100 text-zinc-600' } : null;
  if (id === 'followups')
    return stats.followups_due ? { value: stats.followups_due, cls: 'bg-amber-100 text-amber-800' } : null;
  return null;
}

/** Główny układ: boczne menu (komputer) i dolny pasek (telefon) */
export function Layout({ view, onNavigate, stats, user, local, onSignOut, children }) {
  return (
    <div className="min-h-dvh lg:pl-64">
      {/* Boczne menu – komputer */}
      <aside className="fixed inset-y-0 left-0 z-30 hidden w-64 flex-col border-r border-zinc-200/80 bg-white/80 backdrop-blur lg:flex">
        <div className="flex h-16 items-center px-5">
          <Logo />
        </div>
        <nav className="flex-1 space-y-1 px-3 py-2">
          {NAV.map((item) => {
            const Icon = item.icon;
            const active = view === item.id;
            const badge = badgeFor(item.id, stats);
            return (
              <button
                key={item.id}
                onClick={() => onNavigate(item.id)}
                className={classNames(
                  'flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition',
                  active ? 'bg-zinc-900 text-white shadow-sm' : 'text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900',
                )}
              >
                <Icon className="size-4" />
                <span className="flex-1 text-left">{item.label}</span>
                {badge && (
                  <span
                    className={classNames(
                      'rounded-full px-2 py-0.5 text-[11px] font-semibold tabular-nums',
                      active ? 'bg-white/15 text-white' : badge.cls,
                    )}
                  >
                    {badge.value}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        {stats && (
          <div className="mx-3 mb-3 rounded-xl border border-zinc-200 bg-zinc-50 p-3">
            <p className="text-[11px] font-medium uppercase tracking-wide text-zinc-400">Dzisiaj</p>
            <div className="mt-1.5 flex items-baseline gap-1.5">
              <span className="text-2xl font-semibold tabular-nums text-zinc-900">{stats.calls_today}</span>
              <span className="text-sm text-zinc-500">rozmów</span>
            </div>
            <p className="mt-0.5 text-xs text-zinc-500">
              <span className="font-semibold text-emerald-600">{stats.interested_today}</span> zainteresowanych
            </p>
          </div>
        )}

        <div className="border-t border-zinc-200/80 p-3">
          {local ? (
            <div className="flex items-start gap-2.5 rounded-lg px-2 py-1.5 text-xs text-zinc-500">
              <HardDrive className="mt-0.5 size-4 shrink-0 text-zinc-400" />
              <span>
                <span className="block font-medium text-zinc-700">Tryb lokalny</span>
                Dane zapisane w tej przeglądarce
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2 px-2">
              <div className="flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-200 text-xs font-semibold uppercase text-zinc-700">
                {user?.email?.[0] ?? '?'}
              </div>
              <span className="min-w-0 flex-1 truncate text-xs text-zinc-600">{user?.email}</span>
              <button onClick={onSignOut} className="btn-ghost p-2" title="Wyloguj" aria-label="Wyloguj">
                <LogOut className="size-4" />
              </button>
            </div>
          )}
        </div>
      </aside>

      {/* Górny pasek – telefon */}
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-zinc-200/80 bg-white/85 px-4 backdrop-blur lg:hidden">
        <Logo />
        {!local && (
          <button onClick={onSignOut} className="btn-ghost p-2" aria-label="Wyloguj">
            <LogOut className="size-4" />
          </button>
        )}
      </header>

      <main key={view} className="mx-auto w-full max-w-7xl animate-view-in px-4 pb-28 pt-6 sm:px-6 lg:px-10 lg:pb-12 lg:pt-10">{children}</main>

      {/* Dolny pasek nawigacji – telefon */}
      <nav className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t border-zinc-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden">
        {NAV.map((item) => {
          const Icon = item.icon;
          const active = view === item.id;
          const badge = badgeFor(item.id, stats);
          return (
            <button
              key={item.id}
              onClick={() => onNavigate(item.id)}
              className={classNames(
                'relative flex flex-col items-center gap-1 py-2.5 text-[11px] font-medium transition',
                active ? 'text-zinc-900' : 'text-zinc-400',
              )}
            >
              <Icon className="size-5" />
              {item.short}
              {badge && item.id === 'followups' && (
                <span className="absolute right-1/2 top-1.5 translate-x-5 rounded-full bg-amber-500 px-1.5 text-[10px] font-bold text-white">
                  {badge.value}
                </span>
              )}
              {active && <span className="absolute inset-x-8 top-0 h-0.5 rounded-full bg-zinc-900" />}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
