import { useState } from 'react';
import { Eye, EyeOff, LogIn, PhoneCall } from 'lucide-react';
import { api } from '../lib/api';
import { APP_NAME } from '../lib/constants';
import { Spinner } from '../components/ui';

/** Ekran logowania (konta zakłada administrator w panelu Supabase) */
export function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [show, setShow] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await api.signIn(email.trim(), password);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  };

  return (
    <div className="relative flex min-h-dvh items-center justify-center overflow-hidden px-4">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(60rem_30rem_at_50%_-10%,rgba(99,102,241,0.12),transparent)]" />
      <div className="relative w-full max-w-sm animate-pop-in">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-500/30">
            <PhoneCall className="size-6" />
          </div>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Zaloguj się do {APP_NAME}</h1>
          <p className="mt-1.5 text-sm text-zinc-500">Panel do cold callingu i pozyskiwania leadów</p>
        </div>

        <form onSubmit={submit} className="card space-y-4 p-6">
          <div>
            <label htmlFor="email" className="label">
              E-mail
            </label>
            <input
              id="email"
              type="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input"
              placeholder="ty@firma.pl"
            />
          </div>
          <div>
            <label htmlFor="password" className="label">
              Hasło
            </label>
            <div className="relative">
              <input
                id="password"
                type={show ? 'text' : 'password'}
                autoComplete="current-password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
          </div>

          {error && (
            <p className="rounded-lg bg-rose-50 px-3 py-2 text-sm text-rose-700 ring-1 ring-rose-200 ring-inset">{error}</p>
          )}

          <button type="submit" disabled={loading} className="btn-primary h-11 w-full">
            {loading ? <Spinner className="size-4 text-white" /> : <LogIn className="size-4" />}
            Zaloguj się
          </button>
        </form>

        <p className="mt-6 text-center text-xs text-zinc-400">
          Nie masz konta? Poproś administratora o dodanie Cię w Supabase.
        </p>
      </div>
    </div>
  );
}
