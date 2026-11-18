import { useCallback, useEffect, useState } from 'react';
import { api, isDemo } from './lib/api';
import { Layout, NAV } from './components/Layout';
import { FullScreenLoader } from './components/ui';
import { Login } from './views/Login';
import { PowerDialer } from './views/PowerDialer';
import { FollowUps } from './views/FollowUps';
import { Database } from './views/Database';
import { APP_NAME } from './lib/constants';

const VIEW_IDS = NAV.map((n) => n.id);

/** Prosta nawigacja przez #/widok – działa na każdym hostingu bez konfiguracji */
function useHashView() {
  const read = () => {
    const id = window.location.hash.replace(/^#\/?/, '');
    return VIEW_IDS.includes(id) ? id : 'dialer';
  };
  const [view, setView] = useState(read);
  useEffect(() => {
    const onChange = () => setView(read());
    window.addEventListener('hashchange', onChange);
    return () => window.removeEventListener('hashchange', onChange);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const navigate = (id) => {
    window.location.hash = `/${id}`;
    window.scrollTo({ top: 0 });
  };
  return [view, navigate];
}

export default function App() {
  const [session, setSession] = useState(undefined); // undefined = sprawdzanie sesji
  const [stats, setStats] = useState(null);
  const [view, navigate] = useHashView();

  // Sesja logowania
  useEffect(() => {
    let mounted = true;
    api
      .getSession()
      .then((s) => mounted && setSession(s ?? null))
      .catch(() => mounted && setSession(null));
    const unsubscribe = api.onAuthChange((s) => setSession(s ?? null));
    return () => {
      mounted = false;
      unsubscribe();
    };
  }, []);

  // Statystyki (KPI, liczniki w menu)
  const refreshStats = useCallback(async () => {
    try {
      setStats(await api.getStats());
    } catch {
      /* statystyki są pomocnicze – błąd nie blokuje pracy */
    }
  }, []);

  useEffect(() => {
    if (!session) return undefined;
    refreshStats();
    const t = setInterval(refreshStats, 60_000);
    return () => clearInterval(t);
  }, [session, refreshStats]);

  // Tytuł karty przeglądarki
  useEffect(() => {
    const label = NAV.find((n) => n.id === view)?.label;
    document.title = label ? `${label} · ${APP_NAME}` : APP_NAME;
  }, [view]);

  const signOut = async () => {
    if (isDemo && !window.confirm('Zresetować dane demo do stanu początkowego?')) return;
    await api.signOut();
  };

  if (session === undefined) return <FullScreenLoader />;
  if (!session) return <Login />;

  return (
    <Layout
      view={view}
      onNavigate={navigate}
      stats={stats}
      user={session.user}
      demo={isDemo}
      onSignOut={signOut}
    >
      {view === 'dialer' && <PowerDialer stats={stats} onDataChanged={refreshStats} />}
      {view === 'followups' && <FollowUps onDataChanged={refreshStats} />}
      {view === 'baza' && <Database stats={stats} onDataChanged={refreshStats} />}
    </Layout>
  );
}
