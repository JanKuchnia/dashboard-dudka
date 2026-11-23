import { useEffect, useState } from 'react';
import { Trash2, Save, Phone, MapPin, MessageSquareText, Copy, PencilLine } from 'lucide-react';
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
  site_preview_url: '',
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
  const [brief, setBrief] = useState('');
  const [changes, setChanges] = useState(null);

  useEffect(() => {
    if (!open) return;
    const initial = { ...EMPTY };
    if (lead) for (const k of FIELDS) initial[k] = lead[k] ?? '';
    setForm(initial);
    setConfirmDelete(false);
    setBrief('');
    setLogs(null);
    setChanges(null);
    if (lead?.site_preview_url) {
      api
        .fetchChangeRequests(lead.id)
        .then(setChanges)
        .catch(() => setChanges([]));
    }
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
      // Ręcznie wklejony link do strony = strona gotowa (nie ruszamy zleceń w toku)
      if (payload.site_preview_url && !['ZLECONA', 'W_TOKU'].includes(lead?.site_status)) payload.site_status = 'GOTOWA';
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

  const requestSite = async () => {
    setSaving(true);
    try {
      await api.updateLead(lead.id, {
        deal_stage: form.deal_stage,
        site_status: 'ZLECONA',
        site_brief: brief.trim() || null,
        site_requested_at: new Date().toISOString(),
      });
      toast({ type: 'success', title: 'Zlecono stronę', description: 'Demo pojawi się tu, gdy będzie gotowe' });
      onChanged?.();
      onClose();
    } catch (e) {
      toast({ type: 'error', title: 'Nie udało się zlecić', description: e.message });
    } finally {
      setSaving(false);
    }
  };

  let editLink = null;
  if (lead?.site_preview_url && lead.edit_token) {
    try {
      const u = new URL(lead.site_preview_url);
      u.searchParams.set('edit', lead.edit_token);
      editLink = u.href;
    } catch {
      /* zły link w bazie – bez przycisku */
    }
  }
  const widgetTag = `<script src="${location.origin}/client-edit.js" data-url="${import.meta.env.VITE_SUPABASE_URL}" data-key="${import.meta.env.VITE_SUPABASE_ANON_KEY}" defer></script>`;
  const copy = async (text, title) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ type: 'success', title });
    } catch {
      toast({ type: 'error', title: 'Nie udało się skopiować', description: text });
    }
  };

  const toggleChange = async (c) => {
    const status = c.status === 'NOWA' ? 'ZROBIONA' : 'NOWA';
    try {
      await api.setChangeRequestStatus(c.id, status);
      setChanges((list) => list.map((x) => (x.id === c.id ? { ...x, status } : x)));
    } catch (e) {
      toast({ type: 'error', title: 'Nie udało się zapisać', description: e.message });
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
        <Field label="Link do gotowej strony (demo)" className="col-span-2">
          <input className="input" value={form.site_preview_url} onChange={set('site_preview_url')} placeholder="https://… (strona zrobiona ręcznie)" />
        </Field>
        <Field label="Notatka" className="col-span-2">
          <textarea className="input resize-y" rows={4} value={form.notes} onChange={set('notes')} />
        </Field>
      </div>

      {!isNew && (form.deal_stage === 'OFERTA' || form.deal_stage === 'WYGRANA') && lead.site_status !== 'GOTOWA' && (
        <div className="mt-8">
          <h3 className="mb-3 text-sm font-semibold text-zinc-900">Demo strony</h3>
          {lead.site_status === 'ZLECONA' || lead.site_status === 'W_TOKU' ? (
            <p className="text-sm text-zinc-500">
              {lead.site_status === 'ZLECONA' ? 'Czeka w kolejce na generator…' : 'Generator buduje stronę…'}
            </p>
          ) : (
            <>
              {lead.site_status === 'BLAD' && (
                <p className="mb-2 text-sm text-red-600">Poprzednia próba nie wyszła: {lead.site_error || 'nieznany błąd'}</p>
              )}
              <textarea
                className="input resize-y"
                rows={2}
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                placeholder="Co klient chce (opcjonalnie): podstrony, kolory, link do logo"
              />
              <button type="button" className="btn-primary mt-2" disabled={saving} onClick={requestSite}>
                Zrób stronę
              </button>
            </>
          )}
        </div>
      )}
      {!isNew && lead.site_status === 'GOTOWA' && (
        <div className="mt-8 text-sm">
          <h3 className="mb-3 font-semibold text-zinc-900">Demo strony</h3>
          <a className="text-blue-600 underline" href={lead.site_preview_url} target="_blank" rel="noreferrer">Demo</a>
          {lead.site_repo_url && (
            <>
              {' · '}
              <a className="text-blue-600 underline" href={lead.site_repo_url} target="_blank" rel="noreferrer">Repo</a>
            </>
          )}
          {editLink && (
            <div className="mt-3 flex flex-wrap gap-2">
              <button type="button" className="btn-secondary" onClick={() => copy(editLink, 'Skopiowano link dla klienta')}>
                <Copy className="size-4" />
                Kopiuj link do poprawek dla klienta
              </button>
              {!lead.site_repo_url && (
                <button type="button" className="btn-secondary" onClick={() => copy(widgetTag, 'Skopiowano kod – wklej go przed </head>')}>
                  <Copy className="size-4" />
                  Kopiuj kod widżetu
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {!isNew && lead.site_preview_url && (
        <div className="mt-8">
          <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <PencilLine className="size-4 text-zinc-400" />
            Poprawki od klienta
          </h3>
          {changes === null ? (
            <Spinner />
          ) : changes.length === 0 ? (
            <p className="text-sm text-zinc-500">Klient jeszcze nic nie zgłosił.</p>
          ) : (
            <ul className="space-y-3">
              {changes.map((c) => (
                <li key={c.id} className={`rounded-lg border border-zinc-200 p-3 ${c.status === 'ZROBIONA' ? 'opacity-60' : ''}`}>
                  <div className="mb-2 flex items-center justify-between gap-2 text-xs text-zinc-500">
                    <span>
                      {formatDateTime(c.created_at)} · {c.item_count} {c.item_count === 1 ? 'zmiana' : 'zmian'}
                    </span>
                    <label className="flex items-center gap-1.5">
                      <input type="checkbox" checked={c.status === 'ZROBIONA'} onChange={() => toggleChange(c)} />
                      Zrobione
                    </label>
                  </div>
                  <pre className="max-h-64 overflow-auto whitespace-pre-wrap text-xs text-zinc-700">{c.markdown}</pre>
                  {c.fileUrls?.length > 0 && (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {c.fileUrls.map((u) => (
                        <a key={u} href={u} target="_blank" rel="noreferrer">
                          <img src={u} alt="Zdjęcie od klienta" className="size-16 rounded object-cover" />
                        </a>
                      ))}
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}

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
