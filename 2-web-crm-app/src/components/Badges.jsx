import { LEAD_STATUS, WEBSITE_STATUS } from '../lib/constants';
import { classNames } from '../lib/format';

/** Plakietka statusu leada (Nowy / Chcą / Do zastanowienia / Nie chcą) */
export function StatusBadge({ status, className }) {
  const s = LEAD_STATUS[status] ?? LEAD_STATUS.NOWY;
  return (
    <span
      className={classNames(
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset',
        s.badge,
        className,
      )}
    >
      <span className={classNames('size-1.5 rounded-full', s.dot)} />
      {s.label}
    </span>
  );
}

/** Plakietka statusu strony WWW (BRAK WWW / TYLKO FB ...) */
export function WebsiteBadge({ status, size = 'sm', className }) {
  const w = WEBSITE_STATUS[status] ?? WEBSITE_STATUS.BRAK_WWW;
  return (
    <span
      className={classNames(
        'inline-flex items-center whitespace-nowrap rounded-md font-bold tracking-wide',
        size === 'lg' ? 'px-2.5 py-1 text-xs' : 'px-1.5 py-0.5 text-[10px]',
        w.badge,
        className,
      )}
    >
      {w.label}
    </span>
  );
}
