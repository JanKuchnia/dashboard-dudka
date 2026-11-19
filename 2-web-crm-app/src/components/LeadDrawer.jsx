import { useEffect, useState } from 'react';
import { Trash2, Save, Phone, MapPin, MessageSquareText } from 'lucide-react';
import { Drawer, Spinner } from './ui';
import { StatusBadge } from './Badges';
import { useToast } from './Toast';
import { api } from '../lib/api';
import { LEAD_STATUS, WEBSITE_STATUS, DEAL_STAGE } from '../lib/constants';
import { formatDateTime, formatDate, telHref, mapsLink } from '../lib/format';

const EMPTY = {
  company_name: '',
  category: '',
  city: '',
  address: '',
  phone: '',
  google_rating: '',
  google_reviews_count: '',
  maps_url: '',
  website_url: '',
  website_status: 'BRAK_WWW',
  status: 'NOWY',
  follow_up_at: '',
  notes: '',
  deal_stage: '',
  deal_value: '',
};

const FIELDS = Object.keys(EMPTY);

/** Zamienia puste pola na null i liczby na liczby przed zapisem */
function toPayload(form) {
  const out = {};
  for (const k of FIELDS) {
    const v = typeof form[k] === 'string' ? form[k].trim() : form[k];
    out[k] = v === '' || v === undefined ? null : v;
  }
  if (out.google_rating != null) out.google_rating = Number(String(out.google_rating).replace(',', '.'));
  if (out.google_reviews_count != null) out.google_reviews_count = parseInt(out.google_reviews_count, 10);
  if (out.deal_value != null) out.deal_value = Number(String(out.deal_value).replace(/\s/g, '').replace(',', '.'));
  return out;
}

function Field({ label, children, className }) {
  return (
    <label className={className}>
      <span className="label">{label}</span>
      {children}
    </label>
  );
}

/**
 * Panel edycji / dodawania firmy.
 * lead = null → tryb dodawania nowej firmy.
 */
export function LeadDrawer({ open, lead, onClose, onChanged }) {
  const toast = useToast();
  const isNew = !lead?.id;
  const [form, setForm] = useState(EMPTY);
  const [saving, setSaving] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [logs, setLogs] = useState(null);

  useEffect(() => {
    if (!open) return;
    const initial = { ...EMPTY };
    if (lead) for (const k of FIELDS) initial[k] = lead[k] ?? '';
    setForm(initial);
    setConfirmDelete(false);
    setLogs(null);
    if (lead?.id) {
      api
        .fetchCallLogs(lead.id)
        .then(setLogs)
        .catch(() => setLogs([]));
    }
  }, [open, lead]);

  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const save = async () => {
    if (!form.company_name.trim()) {
      toast({ type: 'error', title: 'Podaj nazwę firmy' });
      return;
    }
    const rating = form.google_rating === '' ? null : Number(String(form.google_rating).replace(',', '.'));
    if (rating != null && (Number.isNaN(rating) || rating < 0 || rating > 5)) {
      toast({ type: 'error', title: 'Ocena Google musi być liczbą od 0 do 5' });
      return;
    }
    const value = form.deal_value === '' ? null : Number(String(form.deal_value).replace(/\s/g, '').replace(',', '.'));
    if (value != null && (Number.isNaN(value) || value < 0)) {
      toast({ type: 'error', title: 'Wartość umowy musi być liczbą (zł)' });
      return;
    }
    setSaving(true);
    try {
      const payload = toPayload(form);
      const saved = isNew ? await api.createLead(payload) : await api.updateLead(lead.id, payload);
      toast({ type: 'success', title: isNew ? 'Dodano firmę' : 'Zapisano zmiany', description: saved.company_name });
      onChanged?.();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: 'Nie udało się zapisać', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!confirmDelete) {
      setConfirmDelete(true);
      return;
    }
    setSaving(true);
    try {
      await api.deleteLead(lead.id);
      toast({ type: 'success', title: 'Usunięto firmę', description: lead.company_name });
      onChanged?.();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: 'Nie udało się usunąć', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Drawer
      open={open}
      onClose={onClose}
      title={isNew ? 'Dodaj firmę' : lead.company_name}
      subtitle={isNew ? 'Ręczne dodanie leada do bazy' : [lead.category, lead.city].filter(Boolean).join(' · ')}
      footer={
        <div className="flex items-center justify-between gap-2">
          {!isNew ? (
            <button
              onClick={remove}
              disabled={saving}
              className={confirmDelete ? 'btn-danger' : 'btn-ghost text-rose-600 hover:bg-rose-50 hover:text-rose-700'}
            >
              <Trash2 className="size-4" />
              {confirmDelete ? 'Na pewno usunąć?' : 'Usuń'}
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <button onClick={onClose} className="btn-secondary">
              Anuluj
            </button>
            <button onClick={save} disabled={saving} className="btn-primary">
              {saving ? <Spinner className="size-4 text-white" /> : <Save className="size-4" />}
              {isNew ? 'Dodaj' : 'Zapisz'}
            </button>
          </div>
        </div>
      }
    >
      {!isNew && (
        <div className="mb-6 flex flex-wrap gap-2">
          {lead.phone && (
            <a href={telHref(lead.phone)} className="btn-secondary">
              <Phone className="size-4 text-emerald-600" />
              Zadzwoń
            </a>
          )}
          <a href={mapsLink(lead)} target="_blank" rel="noreferrer" className="btn-secondary">
            <MapPin className="size-4 text-indigo-600" />
            Otwórz w Maps
          </a>
        </div>
      )}

      <div className="grid grid-cols-2 gap-4">
        <Field label="Nazwa firmy *" className="col-span-2">
          <input className="input" value={form.company_name} onChange={set('company_name')} autoFocus={isNew} />
        </Field>
        <Field label="Kategoria">
          <input className="input" value={form.category} onChange={set('category')} placeholder="np. Fryzjer" />
        </Field>
        <Field label="Miasto">
          <input className="input" value={form.city} onChange={set('city')} />
        </Field>
        <Field label="Adres" className="col-span-2">
          <input className="input" value={form.address} onChange={set('address')} />
        </Field>
        <Field label="Telefon">
          <input className="input" type="tel" value={form.phone} onChange={set('phone')} />
        </Field>
        <div className="grid grid-cols-2 gap-2">
          <Field label="Ocena">
            <input className="input" inputMode="decimal" value={form.google_rating} onChange={set('google_rating')} placeholder="4,8" />
          </Field>
          <Field label="Opinie">
            <input className="input" inputMode="numeric" value={form.google_reviews_count} onChange={set('google_reviews_count')} />
          </Field>
        </div>
        <Field label="Status strony">
          <select className="input" value={form.website_status} onChange={set('website_status')}>
            {Object.entries(WEBSITE_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status leada">
          <select className="input" value={form.status} onChange={set('status')}>
            {Object.entries(LEAD_STATUS).map(([k, v]) => (
              <option key={k} value={k}>
                {v.label}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Obecna strona / profil" className="col-span-2">
          <input className="input" value={form.website_url} onChange={set('website_url')} placeholder="https://facebook.com/…" />
        </Field>
        <Field label="Link do wizytówki w Mapach" className="col-span-2">
          <input className="input" value={form.maps_url} onChange={set('maps_url')} placeholder="https://www.google.com/maps/place/…" />
        </Field>
        <Field label="Follow-up">
          <input className="input" type="date" value={form.follow_up_at ?? ''} onChange={set('follow_up_at')} />
        </Field>
        <div />
        {(form.status === 'CHCA' || form.deal_stage) && (
          <>
            <Field label="Etap sprzedaży">
              <select className="input" value={form.deal_stage} onChange={set('deal_stage')}>
                <option value="">— jeszcze nic —</option>
                {Object.entries(DEAL_STAGE).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Wartość umowy (zł)">
              <input className="input" inputMode="decimal" value={form.deal_value} onChange={set('deal_value')} placeholder="np. 2500" />
            </Field>
          </>
        )}
        <Field label="Notatka" className="col-span-2">
          <textarea className="input resize-y" rows={4} value={form.notes} onChange={set('notes')} />
        </Field>
      </div>

      {!isNew && (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <MessageSquareText className="size-4 text-zinc-400" />
            Historia rozmów
          </h3>
          {logs === null ? (
            <Spinner />
          ) : logs.length === 0 ? (
            <p className="text-sm text-zinc-500">Jeszcze nie dzwoniono do tej firmy.</p>
          ) : (
            <ol className="relative space-y-4 border-l border-zinc-200 pl-5">
              {logs.map((g) => (
                <li key={g.id} className="relative">
                  <span className={`absolute -left-[25px] top-1.5 size-2.5 rounded-full ring-4 ring-white ${LEAD_STATUS[g.outcome]?.dot}`} />
                  <div className="flex flex-wrap items-center gap-2">
                    <StatusBadge status={g.outcome} />
                    <span className="text-xs text-zinc-500">{formatDateTime(g.created_at)}</span>
                    {g.follow_up_at && <span className="text-xs text-zinc-500">· follow-up {formatDate(g.follow_up_at)}</span>}
                  </div>
                  {g.notes && <p className="mt-1.5 whitespace-pre-line text-sm text-zinc-700">{g.notes}</p>}
                </li>
              ))}
            </ol>
          )}
        </div>
      )}
    </Drawer>
  );
}
