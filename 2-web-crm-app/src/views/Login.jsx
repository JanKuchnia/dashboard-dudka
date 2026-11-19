import { useState } from 'react';
import {
  ArrowLeft,
  CalendarClock,
  Eye,
  EyeOff,
  KeyRound,
  LogIn,
  MailCheck,
  PhoneCall,
  Radar,
  Send,
  Zap,
} from 'lucide-react';
import { api } from '../lib/api';
import { APP_NAME } from '../lib/constants';
import { Spinner } from '../components/ui';

const FEATURES = [
  { icon: Zap, title: 'Tryb dzwonienia', text: 'Jedna firma naraz, wynik jednym klawiszem.' },
  { icon: CalendarClock, title: 'Follow-upy', text: 'Nikt, kto „się zastanawia”, nie ucieka.' },
  { icon: Radar, title: 'Pozyskiwanie firm', text: 'Firmy bez strony z Twojej okolicy.' },
];

function PasswordInput({ id, value, onChange, autoComplete }) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        id={id}
        type={show ? 'text' : 'password'}
        autoComplete={autoComplete}
        required
        minLength={autoComplete === 'new-password' ? 8 : undefined}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input pr-10"
      />
      <button
        type="button"
        onClick={() => setShow((s) => !s)}
        className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1.5 text-zinc-400 hover:text-zinc-700"
        aria-label={show ? 'Ukryj hasło' : 'Pokaż hasło'}
      >
        {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
      </button>
    </div>
  );
}

/**
 * Ekran logowania (konta zakłada administrator w panelu Supabase).
 * mode: 'signin' | 'reset' (wysyłka linku) | 'new-password' (po kliknięciu linku z maila)
 */
export function Login({ initialMode = 'signin', onPasswordSet }) {
  const [mode, setMode] = useState(initialMode);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [sent, setSent] = useState(false);

  const switchMode = (m) => {
    setMode(m);
    setError('');
    setSent(false);
  };

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      if (mode === 'signin') await api.signIn(email.trim(), password);
      if (mode === 'reset') {
        await api.resetPassword(email.trim());
        setSent(true);
      }
      if (mode === 'new-password') {
        await api.updatePassword(password);
        onPasswordSet?.();
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  const heading = {
    signin: ['Zaloguj się', 'Witaj z powrotem – kolejka czeka.'],
    reset: ['Nie pamiętasz hasła?', 'Wyślemy Ci link do ustawienia nowego.'],
    'new-password': ['Ustaw nowe hasło', 'Minimum 8 znaków.'],
  }[mode];

  return (
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      {/* Lewa kolumna – tylko desktop */}
      <aside className="relative hidden overflow-hidden bg-zinc-950 p-12 text-white lg:flex lg:flex-col lg:justify-between">
        <div className="pointer-events-none absolute -left-32 -top-32 size-[32rem] rounded-full bg-indigo-600/30 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-40 right-0 size-[28rem] rounded-full bg-violet-600/20 blur-3xl" />

        <div className="relative flex animate-fade-in items-center gap-3">
          <div className="flex size-10 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 shadow-lg shadow-indigo-500/30">
            <PhoneCall className="size-5" />
          </div>
          <span className="text-lg font-semibold tracking-tight">{APP_NAME}</span>
        </div>

        <div className="relative max-w-md">
          <h2 className="animate-view-in text-4xl font-semibold leading-tight tracking-tight">
            Więcej rozmów.
            <br />
            <span className="text-zinc-400">Mniej klikania.</span>
          </h2>
          <ul className="mt-10 space-y-5">
            {FEATURES.map((f, i) => (
              <li key={f.title} style={{ '--i': i + 3 }} className="stagger-in flex gap-4">
                <span className="flex size-10 flex-none items-center justify-center rounded-xl bg-white/10 ring-1 ring-white/10">
                  <f.icon className="size-5 text-indigo-300" />
                </span>
                <div>
                  <p className="font-medium">{f.title}</p>
                  <p className="text-sm text-zinc-400">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-xs text-zinc-500">Dostęp tylko dla zespołu.</p>
      </aside>

      {/* Formularz */}
      <main className="relative flex items-center justify-center overflow-hidden px-4 py-12">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgba(99,102,241,0.10),transparent)] lg:hidden" />
        <div key={mode} className="relative w-full max-w-sm animate-pop-in">
          <div className="mb-8 lg:hidden">
            <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
              <PhoneCall className="size-6" />
            </div>
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{heading[0]}</h1>
          <p className="mt-1.5 text-sm text-zinc-500">{heading[1]}</p>

          {sent ? (
            <div className="mt-8 flex animate-pop-in gap-3 rounded-xl bg-emerald-50 p-4 text-sm text-emerald-800 ring-1 ring-emerald-200 ring-inset">
              <MailCheck className="size-5 flex-none" />
              <p>
                Jeśli konto <strong>{email.trim()}</strong> istnieje, link już leci na skrzynkę. Sprawdź też spam.
              </p>
            </div>
          ) : (
            <form onSubmit={submit} className="mt-8 space-y-4">
              {mode !== 'new-password' && (
                <div>
                  <label htmlFor="email" className="label">
                    E-mail
                  </label>
                  <input
                    id="email"
                    type="email"
                    autoComplete="email"
                    required
                    autoFocus
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="input"
                    placeholder="ty@firma.pl"
                  />
                </div>
              )}
              {mode !== 'reset' && (
                <div>
                  <div className="mb-1.5 flex items-center justify-between">
                    <label htmlFor="password" className="label mb-0">
                      {mode === 'new-password' ? 'Nowe hasło' : 'Hasło'}
                    </label>
                    {mode === 'signin' && (
                      <button
                        type="button"
                        onClick={() => switchMode('reset')}
                        className="text-xs font-medium text-indigo-600 hover:text-indigo-800"
                      >
                        Nie pamiętasz?
                      </button>
                    )}
                  </div>
                  <PasswordInput
                    id="password"
                    value={password}
                    onChange={setPassword}
                    autoComplete={mode === 'new-password' ? 'new-password' : 'current-password'}
                  />
                </div>
              )}

              {error && (
                <p
                  role="alert"
                  className="animate-pop-in rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset"
                >
                  {error}
                </p>
              )}

              <button type="submit" disabled={loading} className="btn-primary h-11 w-full">
                {loading ? (
                  <Spinner className="size-4 text-white" />
                ) : mode === 'signin' ? (
                  <LogIn className="size-4" />
                ) : mode === 'reset' ? (
                  <Send className="size-4" />
                ) : (
                  <KeyRound className="size-4" />
                )}
                {{ signin: 'Zaloguj się', reset: 'Wyślij link', 'new-password': 'Zapisz hasło' }[mode]}
              </button>
            </form>
          )}

          {mode === 'reset' ? (
            <button
              type="button"
              onClick={() => switchMode('signin')}
              className="mt-6 inline-flex items-center gap-1.5 text-sm font-medium text-zinc-500 hover:text-zinc-900"
            >
              <ArrowLeft className="size-4" />
              Wróć do logowania
            </button>
          ) : (
            mode === 'signin' && (
              <p className="mt-6 text-xs text-zinc-400">
                Nie masz konta? Poproś administratora o dodanie Cię do zespołu.
              </p>
            )
          )}
        </div>
      </main>
    </div>
  );
}
