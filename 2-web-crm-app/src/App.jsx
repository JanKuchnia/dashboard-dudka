import { useCallback, useEffect, useState } from 'react';
import { api, isLocal } from './lib/api';
import { supabase } from './lib/supabase';
import { CHANGE_EVENT } from './lib/localApi';
import { Layout, NAV } from './components/Layout';
import { FullScreenLoader } from './components/ui';
import { Login } from './views/Login';
import { PowerDialer } from './views/PowerDialer';
import { FollowUps } from './views/FollowUps';
import { Database } from './views/Database';
import { Finder } from './views/Finder';
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
  const [recovery, setRecovery] = useState(false); // wejście z linku „ustaw nowe hasło”
  const [stats, setStats] = useState(null);
  const [dataVersion, setDataVersion] = useState(0);
  const [view, navigate] = useHashView();

  // Sesja logowania
  useEffect(() => {
    let mounted = true;
    api
      .getSession()
      .then((s) => mounted && setSession(s ?? null))
      .catch(() => mounted && setSession(null));
    const unsubscribe = api.onAuthChange((s, event) => {
      setSession(s ?? null);
      if (event === 'PASSWORD_RECOVERY') setRecovery(true);
    });
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

  // Tryb lokalny: dane zmienione w innej karcie (albo przez wtyczkę) → odświeżamy widoki
  useEffect(() => {
    if (!isLocal) return undefined;
    const onChange = () => {
      setDataVersion((v) => v + 1);
      refreshStats();
    };
    const onStorage = (e) => {
      if (e.key === 'lead-crm-local-v1') onChange();
    };
    window.addEventListener(CHANGE_EVENT, onChange);
    window.addEventListener('storage', onStorage);
    return () => {
      window.removeEventListener(CHANGE_EVENT, onChange);
      window.removeEventListener('storage', onStorage);
    };
  }, [refreshStats]);

  // Supabase: nowe firmy z wtyczki (i zmiany kolegów) pojawiają się bez odświeżania strony
  useEffect(() => {
    if (isLocal || !session) return undefined;
    const channel = supabase
      .channel('leads-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'leads' }, () => {
        setDataVersion((v) => v + 1);
        refreshStats();
      })
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [session, refreshStats]);

  // Tytuł karty przeglądarki
  useEffect(() => {
    const label = NAV.find((n) => n.id === view)?.label;
    document.title = label ? `${label} · ${APP_NAME}` : APP_NAME;
  }, [view]);

  if (session === undefined) return <FullScreenLoader />;
  if (recovery) return <Login initialMode="new-password" onPasswordSet={() => setRecovery(false)} />;
  if (!session) return <Login />;

  return (
    <Layout
      view={view}
      onNavigate={navigate}
      stats={stats}
      user={session.user}
      local={isLocal}
      onSignOut={() => api.signOut()}
    >
      {view === 'dialer' && (
        <PowerDialer stats={stats} onDataChanged={refreshStats} onNavigate={navigate} dataVersion={dataVersion} />
      )}
      {view === 'followups' && <FollowUps onDataChanged={refreshStats} dataVersion={dataVersion} />}
      {view === 'baza' && (
        <Database stats={stats} onDataChanged={refreshStats} onNavigate={navigate} dataVersion={dataVersion} />
      )}
      {view === 'finder' && <Finder onDataChanged={refreshStats} onNavigate={navigate} />}
    </Layout>
  );
}
