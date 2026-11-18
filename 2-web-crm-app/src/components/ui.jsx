import { useEffect } from 'react';
import { Loader2, X } from 'lucide-react';
import { classNames } from '../lib/format';

export function Spinner({ className }) {
  return <Loader2 className={classNames('animate-spin', className ?? 'size-5 text-zinc-400')} />;
}

export function FullScreenLoader({ label = 'Ładowanie…' }) {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-3 text-sm text-zinc-500">
      <Spinner className="size-6 text-zinc-400" />
      {label}
    </div>
  );
}

/** Zamyka okno klawiszem Esc */
export function useEscape(onClose, active = true) {
  useEffect(() => {
    if (!active) return undefined;
    const handler = (e) => e.key === 'Escape' && onClose();
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose, active]);
}

/** Okno modalne wyśrodkowane na ekranie */
export function Modal({ open, onClose, title, children, wide }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
      <div className="absolute inset-0 animate-fade-in bg-zinc-950/40 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className={classNames(
          'relative flex max-h-[92dvh] w-full animate-pop-in flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl',
          wide ? 'sm:max-w-2xl' : 'sm:max-w-lg',
        )}
      >
        <div className="flex items-center justify-between border-b border-zinc-100 px-5 py-3.5">
          <h2 className="text-base font-semibold text-zinc-900">{title}</h2>
          <button onClick={onClose} className="btn-ghost -mr-2 p-1.5" aria-label="Zamknij">
            <X className="size-5" />
          </button>
        </div>
        <div className="scroll-thin overflow-y-auto p-5">{children}</div>
      </div>
    </div>
  );
}

/** Panel wysuwany z prawej strony */
export function Drawer({ open, onClose, title, subtitle, children, footer }) {
  useEscape(onClose, open);
  if (!open) return null;
  return (
    <div className="fixed inset-0 z-50">
      <div className="absolute inset-0 animate-fade-in bg-zinc-950/30 backdrop-blur-[2px]" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        className="absolute inset-y-0 right-0 flex w-full max-w-xl animate-slide-in flex-col bg-white shadow-2xl"
      >
        <div className="flex items-start justify-between gap-4 border-b border-zinc-100 px-6 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-semibold text-zinc-900">{title}</h2>
            {subtitle && <p className="mt-0.5 truncate text-sm text-zinc-500">{subtitle}</p>}
          </div>
          <button onClick={onClose} className="btn-ghost -mr-2 shrink-0 p-1.5" aria-label="Zamknij">
            <X className="size-5" />
          </button>
        </div>
        <div className="scroll-thin flex-1 overflow-y-auto px-6 py-5">{children}</div>
        {footer && <div className="border-t border-zinc-100 bg-zinc-50/60 px-6 py-3.5">{footer}</div>}
      </div>
    </div>
  );
}

export function EmptyState({ icon: Icon, title, description, action }) {
  return (
    <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
      {Icon && (
        <div className="mb-4 flex size-12 items-center justify-center rounded-2xl bg-zinc-100 text-zinc-500">
          <Icon className="size-6" />
        </div>
      )}
      <h3 className="text-base font-semibold text-zinc-900">{title}</h3>
      {description && <p className="mt-1 max-w-sm text-sm text-zinc-500">{description}</p>}
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

export function Kbd({ children }) {
  return (
    <kbd className="inline-flex min-w-5 items-center justify-center rounded border border-zinc-200 bg-white px-1 font-sans text-[10px] font-medium text-zinc-500 shadow-[0_1px_0_rgba(0,0,0,0.06)]">
      {children}
    </kbd>
  );
}

export function PageHeader({ title, description, actions }) {
  return (
    <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">{title}</h1>
        {description && <p className="mt-1 text-sm text-zinc-500">{description}</p>}
      </div>
      {actions && <div className="flex flex-wrap items-center gap-2">{actions}</div>}
    </div>
  );
}
