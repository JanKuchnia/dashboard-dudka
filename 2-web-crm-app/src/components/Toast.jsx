import { createContext, useCallback, useContext, useRef, useState } from 'react';
import { CheckCircle2, AlertTriangle, Info, X } from 'lucide-react';

const ToastContext = createContext(() => {});

const ICONS = {
  success: <CheckCircle2 className="size-5 text-emerald-500" />,
  error: <AlertTriangle className="size-5 text-rose-500" />,
  info: <Info className="size-5 text-indigo-500" />,
};

/** Powiadomienia w prawym dolnym rogu */
export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const idRef = useRef(0);

  const dismiss = useCallback((id) => {
    setToasts((t) => t.filter((x) => x.id !== id));
  }, []);

  const toast = useCallback(
    ({ type = 'success', title, description, duration = 3500 }) => {
      const id = ++idRef.current;
      setToasts((t) => [...t.slice(-3), { id, type, title, description }]);
      setTimeout(() => dismiss(id), type === 'error' ? 6000 : duration);
    },
    [dismiss],
  );

  return (
    <ToastContext.Provider value={toast}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-20 z-[100] flex flex-col items-center gap-2 px-4 lg:bottom-6 lg:items-end lg:px-6">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="status"
            className="pointer-events-auto flex w-full max-w-sm animate-pop-in items-start gap-3 rounded-xl border border-zinc-200 bg-white p-3.5 shadow-xl shadow-zinc-900/10"
          >
            <div className="mt-0.5 shrink-0">{ICONS[t.type]}</div>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-zinc-900">{t.title}</p>
              {t.description && <p className="mt-0.5 text-sm text-zinc-500">{t.description}</p>}
            </div>
            <button
              onClick={() => dismiss(t.id)}
              className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Zamknij powiadomienie"
            >
              <X className="size-4" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
