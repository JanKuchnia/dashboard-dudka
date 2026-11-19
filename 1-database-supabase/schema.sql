-- =====================================================================
--  CRM COLD CALLING – SCHEMAT BAZY DANYCH (Supabase / PostgreSQL)
--  Plik: 1-database-supabase/schema.sql
--
--  Jak użyć: Supabase → SQL Editor → New query → wklej cały plik → Run.
--  Skrypt jest idempotentny – można go bezpiecznie uruchomić ponownie
--  (np. po aktualizacji), nie usunie żadnych danych.
--
--  Model bezpieczeństwa:
--    • Dostęp do danych mają WYŁĄCZNIE zalogowani użytkownicy, których
--      e-mail jest w tabeli team_members. Klucz anon/publishable ani samo
--      założenie konta NIE dają dostępu do leadów.
--    • Wszyscy członkowie zespołu widzą i edytują wspólną bazę.
--    • Skrypty integracji (Google Sheets / Kontakty Google) w Etapie 4
--      będą używać klucza service_role, który omija RLS – trzymamy go
--      tylko po stronie serwera (Apps Script / Edge Function).
-- =====================================================================


-- ---------------------------------------------------------------------
-- 0. ROZSZERZENIA
-- ---------------------------------------------------------------------
-- pg_trgm – szybkie wyszukiwanie po fragmencie nazwy firmy (ILIKE '%...%')
create extension if not exists pg_trgm with schema extensions;


-- ---------------------------------------------------------------------
-- 1. FUNKCJA POMOCNICZA: normalizacja numeru telefonu
--    "+48 512-345-678" → "512345678"  (do wykrywania duplikatów)
-- ---------------------------------------------------------------------
create or replace function public.normalize_phone(p text)
returns text
language sql
immutable
set search_path = ''
as $$
  select nullif(
    case
      when d like '0048%'                   then substr(d, 5)
      when d like '48%' and length(d) = 11  then substr(d, 3)
      else d
    end,
    ''
  )
  from (select regexp_replace(coalesce(p, ''), '\D', '', 'g') as d) as s;
$$;


-- ---------------------------------------------------------------------
-- 2. TABELA: leads – firmy do obdzwonienia
-- ---------------------------------------------------------------------
create table if not exists public.leads (
  id                        uuid primary key default gen_random_uuid(),
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  -- Dane firmy (z Map Google)
  company_name              text not null check (length(trim(company_name)) > 0),
  category                  text,                       -- np. "Fryzjer", "Mechanik"
  city                      text,
  address                   text,
  phone                     text,                       -- numer w oryginalnym formacie
  phone_normalized          text,                       -- uzupełniany automatycznie (trigger)
  google_rating             numeric(2,1) check (google_rating between 0 and 5),
  google_reviews_count      integer check (google_reviews_count >= 0),
  maps_url                  text,                       -- link do wizytówki w Mapach
  maps_place_id             text,                       -- unikalny identyfikator miejsca
  website_url               text,                       -- obecna "strona" (np. link do FB)

  -- Status strony internetowej (plakietka w Power Dialerze)
  website_status            text not null default 'BRAK_WWW'
    check (website_status in (
      'BRAK_WWW',       -- brak jakiejkolwiek strony
      'TYLKO_FB',       -- tylko Facebook
      'TYLKO_IG',       -- tylko Instagram
      'TYLKO_BOOKSY',   -- tylko Booksy / podobne systemy rezerwacji
      'INNE_SOCIAL',    -- Linktree, TikTok, Google Sites itp.
      'MA_WWW'          -- ma własną stronę
    )),

  -- Lejek sprzedażowy
  status                    text not null default 'NOWY'
    check (status in (
      'NOWY',               -- czeka w kolejce Power Dialera
      'CHCA',               -- 🟢 Chcą
      'DO_ZASTANOWIENIA',   -- 🟡 Do zastanowienia (follow-up)
      'NIE_CHCA',           -- 🔴 Nie chcą
      'NIE_ODEBRAL'         -- ⚪ 3× nie odebrał – odłożony, poza kolejką
    )),
  notes                     text,                       -- notatka z ostatniej rozmowy
  follow_up_at              date,                       -- data kolejnego kontaktu
  last_called_at            timestamptz,
  call_count                integer not null default 0,

  -- Metadane
  source                    text not null default 'chrome_extension',
  created_by                uuid default auth.uid() references auth.users (id) on delete set null,

  -- Integracja z Kontaktami Google (Etap 4)
  google_contact_id         text,
  google_contact_synced_at  timestamptz,

  -- Jedno miejsce z Map = jeden lead (NULL-e nie kolidują ze sobą).
  -- Zwykły UNIQUE (nie częściowy), żeby działał upsert przez REST API
  -- (?on_conflict=maps_place_id).
  constraint leads_maps_place_id_key unique (maps_place_id)
);

-- Blokada leada w Power Dialerze – dwie osoby nie dostaną tej samej firmy
-- (blokada wygasa po 15 minutach). "add column if not exists" pozwala
-- dograć te kolumny do już istniejącej bazy.
alter table public.leads add column if not exists claimed_by uuid references auth.users (id) on delete set null;
alter table public.leads add column if not exists claimed_at timestamptz;
-- „Nie odebrał” – lead wraca do kolejki dopiero po tym czasie
alter table public.leads add column if not exists retry_at timestamptz;
-- Co dalej po „Chcą”: spotkanie → oferta → wygrana / przegrana, z wartością w PLN
alter table public.leads add column if not exists deal_stage text
  check (deal_stage in ('SPOTKANIE', 'OFERTA', 'WYGRANA', 'PRZEGRANA'));
alter table public.leads add column if not exists deal_value numeric(12,2) check (deal_value >= 0);

-- Nowe statusy dla baz założonych wcześniej (CHECK w create table się nie zaktualizuje)
alter table public.leads drop constraint if exists leads_status_check;
alter table public.leads add constraint leads_status_check
  check (status in ('NOWY', 'CHCA', 'DO_ZASTANOWIENIA', 'NIE_CHCA', 'NIE_ODEBRAL'));

comment on table  public.leads                 is 'Firmy (leady) do cold callingu.';
comment on column public.leads.status          is 'NOWY | CHCA | DO_ZASTANOWIENIA | NIE_CHCA | NIE_ODEBRAL';
comment on column public.leads.website_status  is 'BRAK_WWW | TYLKO_FB | TYLKO_IG | TYLKO_BOOKSY | INNE_SOCIAL | MA_WWW';


-- ---------------------------------------------------------------------
-- 3. TABELA: call_logs – historia rozmów (do statystyk KPI)
-- ---------------------------------------------------------------------
create table if not exists public.call_logs (
  id            bigint generated always as identity primary key,
  lead_id       uuid not null references public.leads (id) on delete cascade,
  created_at    timestamptz not null default now(),
  outcome       text not null check (outcome in ('CHCA', 'DO_ZASTANOWIENIA', 'NIE_CHCA', 'NIE_ODEBRAL')),
  notes         text,
  follow_up_at  date,
  user_id       uuid default auth.uid() references auth.users (id) on delete set null
);

alter table public.call_logs drop constraint if exists call_logs_outcome_check;
alter table public.call_logs add constraint call_logs_outcome_check
  check (outcome in ('CHCA', 'DO_ZASTANOWIENIA', 'NIE_CHCA', 'NIE_ODEBRAL'));

comment on table public.call_logs is 'Każde kliknięcie „Zapisz i następny” = jeden wpis.';


-- ---------------------------------------------------------------------
-- 4. INDEKSY
-- ---------------------------------------------------------------------
-- Kolejka Power Dialera: status = 'NOWY' sortowane po dacie dodania
create index if not exists leads_status_created_idx   on public.leads (status, created_at);
-- Lista follow-upów: status = 'DO_ZASTANOWIENIA' sortowane po dacie kontaktu
create index if not exists leads_status_followup_idx  on public.leads (status, follow_up_at);
-- Wykrywanie duplikatów po numerze telefonu
create index if not exists leads_phone_normalized_idx on public.leads (phone_normalized);
-- Filtry w tabeli bazy
create index if not exists leads_city_idx             on public.leads (city);
create index if not exists leads_category_idx         on public.leads (category);
-- Wyszukiwarka po nazwie firmy (ILIKE '%fraza%')
create index if not exists leads_company_name_trgm_idx
  on public.leads using gin (company_name extensions.gin_trgm_ops);

-- Statystyki "dzisiaj" i historia rozmów danego leada
create index if not exists call_logs_created_idx on public.call_logs (created_at);
create index if not exists call_logs_lead_idx    on public.call_logs (lead_id, created_at desc);


-- ---------------------------------------------------------------------
-- 5. TRIGGER: normalizacja telefonu, przycięcie nazwy, updated_at
-- ---------------------------------------------------------------------
create or replace function public.leads_before_write()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.company_name     := trim(new.company_name);
  new.phone_normalized := public.normalize_phone(new.phone);
  if tg_op = 'UPDATE' then
    new.updated_at := now();
  end if;
  return new;
end;
$$;

drop trigger if exists leads_before_write on public.leads;
create trigger leads_before_write
  before insert or update on public.leads
  for each row execute function public.leads_before_write();


-- ---------------------------------------------------------------------
-- 6. FUNKCJE RPC (wywoływane z panelu i wtyczki przez supabase.rpc())
-- ---------------------------------------------------------------------

-- 6a. Zapis rozmowy – przycisk „Zapisz i następny”.
--     Atomowo: aktualizuje leada + dopisuje wpis do historii.
create or replace function public.log_call(
  p_lead_id      uuid,
  p_outcome      text,
  p_notes        text default null,
  p_follow_up_at date default null
)
returns public.leads
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_lead   public.leads;
  v_status text := p_outcome;
  v_follow date := p_follow_up_at;
  v_retry  timestamptz;
  v_today  date := (now() at time zone 'Europe/Warsaw')::date;
begin
  if p_outcome not in ('CHCA', 'DO_ZASTANOWIENIA', 'NIE_CHCA', 'NIE_ODEBRAL') then
    raise exception 'Nieprawidłowy wynik rozmowy: %', p_outcome;
  end if;

  -- „Nie odebrał”: nowy lead wraca do kolejki za 3 h, po 3. razie zostaje odłożony.
  -- Lead z follow-upu zachowuje status, a kontakt przesuwa się najwcześniej na jutro.
  -- Ta sama reguła jest w localApi.js (tryb lokalny) – zmieniaj je razem.
  if p_outcome = 'NIE_ODEBRAL' then
    select status into v_status from public.leads where id = p_lead_id;
    if v_status = 'NOWY' then
      if (select count(*) from public.call_logs
           where lead_id = p_lead_id and outcome = 'NIE_ODEBRAL') >= 2 then
        v_status := 'NIE_ODEBRAL';
      else
        v_retry := now() + interval '3 hours';
      end if;
    elsif v_status <> 'NIE_ODEBRAL' then
      v_follow := greatest(coalesce(p_follow_up_at, v_today + 1), v_today + 1);
    end if;
  end if;

  update public.leads
     set status         = coalesce(v_status, status),
         notes          = nullif(trim(p_notes), ''),
         follow_up_at   = v_follow,
         retry_at       = v_retry,
         last_called_at = now(),
         call_count     = call_count + 1,
         claimed_by     = null,
         claimed_at     = null
   where id = p_lead_id
  returning * into v_lead;

  if not found then
    raise exception 'Nie znaleziono leada o id %', p_lead_id;
  end if;

  insert into public.call_logs (lead_id, outcome, notes, follow_up_at)
  values (p_lead_id, p_outcome, nullif(trim(p_notes), ''), p_follow_up_at);

  return v_lead;
end;
$$;

-- 6a'. Następny lead z kolejki dla Power Dialera.
--      Pobiera najstarszego leada "NOWY", którego nikt inny teraz nie obsługuje,
--      i blokuje go dla bieżącego użytkownika na 15 minut.
--      p_skip – lista id pominiętych w tej sesji (przycisk „Pomiń”).
-- Stara wersja miała tylko p_skip – usuwamy ją, żeby nie było dwóch funkcji o tej nazwie
drop function if exists public.claim_next_lead(uuid[]);
create or replace function public.claim_next_lead(
  p_skip     uuid[] default '{}',
  p_city     text   default null,   -- tylko to miasto
  p_category text   default null    -- fragment kategorii, np. „fryz”
)
returns setof public.leads
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_id uuid;
begin
  -- Pominięte firmy oddajemy reszcie zespołu od razu, a nie po 15 minutach
  update public.leads
     set claimed_by = null,
         claimed_at = null
   where id = any (coalesce(p_skip, '{}'))
     and claimed_by = auth.uid();

  select l.id
    into v_id
    from public.leads l
   where (l.status = 'NOWY'
          -- „Nie odbiera” wraca do kolejki po 14 dniach (to samo w localApi.js)
          or (l.status = 'NIE_ODEBRAL' and l.last_called_at <= now() - interval '14 days'))
     and (l.retry_at is null or l.retry_at <= now())
     and l.id <> all (coalesce(p_skip, '{}'))
     and (p_city is null or l.city = p_city)
     and (p_category is null or l.category ilike '%' || p_category || '%')
     and (
           l.claimed_at is null
        or l.claimed_at < now() - interval '15 minutes'
        or l.claimed_by = auth.uid()
     )
   -- Najpierw firmy bez strony z dużą liczbą opinii (ruchliwy biznes bez WWW).
   -- Ta sama kolejność jest w queueOrder w format.js – zmieniaj je razem.
   order by (l.website_status <> 'MA_WWW') desc,
            coalesce(l.google_reviews_count, 0) desc,
            l.created_at, l.id
   limit 1
   for update skip locked;

  if v_id is null then
    return;
  end if;

  return query
    update public.leads
       set claimed_by = auth.uid(),
           claimed_at = now()
     where id = v_id
    returning *;
end;
$$;

-- 6b. Statystyki KPI do górnego paska (strefa czasowa: Polska).
create or replace function public.get_dashboard_stats(p_tz text default 'Europe/Warsaw')
returns json
language sql
stable
security invoker
set search_path = ''
as $$
  with
  day_start as (
    select (date_trunc('day', now() at time zone p_tz) at time zone p_tz) as ts
  ),
  today as (
    select c.*
      from public.call_logs c, day_start d
     where c.created_at >= d.ts
  ),
  called as (
    select status from public.leads where status not in ('NOWY', 'NIE_ODEBRAL')
  )
  select json_build_object(
    -- liczba różnych firm obdzwonionych dzisiaj
    'calls_today',       (select count(distinct lead_id) from today),
    -- dzisiejsze rozmowy zakończone „Chcą”
    'interested_today',  (select count(distinct lead_id) from today where outcome = 'CHCA'),
    -- skuteczność dzisiaj w % (tylko rozmowy, w których ktoś odebrał)
    'success_rate_today',(select case when count(distinct lead_id) = 0 then 0
                                      else round(100.0 * count(distinct lead_id) filter (where outcome = 'CHCA')
                                                 / count(distinct lead_id), 1) end
                            from today where outcome <> 'NIE_ODEBRAL'),
    -- łącznie w bazie
    'interested_total',  (select count(*) from public.leads where status = 'CHCA'),
    'thinking_total',    (select count(*) from public.leads where status = 'DO_ZASTANOWIENIA'),
    'rejected_total',    (select count(*) from public.leads where status = 'NIE_CHCA'),
    'queue_new',         (select count(*) from public.leads
                           where status = 'NOWY'
                              or (status = 'NIE_ODEBRAL' and last_called_at <= now() - interval '14 days')),
    'called_total',      (select count(*) from called),
    -- skuteczność łączna w % (Chcą / wszystkie obdzwonione)
    'success_rate',      (select case when count(*) = 0 then 0
                                      else round(100.0 * count(*) filter (where status = 'CHCA') / count(*), 1) end
                            from called),
    -- follow-upy zaplanowane na dziś lub zaległe
    'followups_due',     (select count(*) from public.leads
                           where status in ('DO_ZASTANOWIENIA', 'CHCA')
                             and follow_up_at <= (now() at time zone p_tz)::date),
    -- sprzedaż po „Chcą”
    'won_count',         (select count(*) from public.leads where deal_stage = 'WYGRANA'),
    'won_value',         (select coalesce(sum(deal_value), 0) from public.leads where deal_stage = 'WYGRANA'),
    'pipeline_value',    (select coalesce(sum(deal_value), 0) from public.leads where deal_stage in ('SPOTKANIE', 'OFERTA'))
  );
$$;

-- 6c. Wykrywanie duplikatów – wtyczka wysyła listę place_id i telefonów
--     z bieżących wyników Map, a dostaje te, które już są w bazie.
create or replace function public.find_duplicates(
  p_place_ids text[] default '{}',
  p_phones    text[] default '{}'
)
returns table (
  id               uuid,
  company_name     text,
  status           text,
  maps_place_id    text,
  phone_normalized text
)
language sql
stable
security invoker
set search_path = ''
as $$
  select l.id, l.company_name, l.status, l.maps_place_id, l.phone_normalized
    from public.leads l
   where l.maps_place_id = any (coalesce(p_place_ids, '{}'))
      or l.phone_normalized = any (
           select public.normalize_phone(x) from unnest(coalesce(p_phones, '{}')) as x
         );
$$;


-- 6d. Cofnięcie ostatniego zapisu w Power Dialerze (kliknięty zły wynik).
--     Usuwa ostatni wpis bieżącego użytkownika (max 15 min) i przywraca leada
--     do stanu sprzed rozmowy (p_prev = lead przed zapisem).
--     security definer, bo zespół nie ma prawa usuwać historii bezpośrednio.
create or replace function public.undo_call(p_lead_id uuid, p_prev jsonb)
returns public.leads
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_log  bigint;
  v_lead public.leads;
begin
  if not public.is_team_member() then
    raise exception 'Brak uprawnień';
  end if;

  select id into v_log
    from public.call_logs
   where lead_id = p_lead_id
     and user_id = auth.uid()
     and created_at > now() - interval '15 minutes'
   order by created_at desc
   limit 1;
  if v_log is null then
    raise exception 'Nie ma czego cofnąć (minęło ponad 15 minut).';
  end if;

  delete from public.call_logs where id = v_log;

  update public.leads
     set status         = coalesce(p_prev ->> 'status', status),
         notes          = p_prev ->> 'notes',
         follow_up_at   = (p_prev ->> 'follow_up_at')::date,
         retry_at       = (p_prev ->> 'retry_at')::timestamptz,
         last_called_at = (p_prev ->> 'last_called_at')::timestamptz,
         call_count     = greatest(call_count - 1, 0)
   where id = p_lead_id
  returning * into v_lead;
  return v_lead;
end;
$$;

-- 6e. Historia rozmów z e-mailem osoby dzwoniącej – do strony „Statystyki”.
--     security definer, bo e-maile są w auth.users.
create or replace function public.call_feed(p_since timestamptz)
returns table (created_at timestamptz, outcome text, lead_id uuid, email text)
language sql
stable
security definer
set search_path = ''
as $$
  select c.created_at, c.outcome, c.lead_id, u.email::text
    from public.call_logs c
    left join auth.users u on u.id = c.user_id
   where c.created_at >= p_since
     and public.is_team_member()
   order by c.created_at;
$$;


-- ---------------------------------------------------------------------
-- 7. WIDOKI POD INTEGRACJE (Etap 4)
--    security_invoker = true → widoki respektują RLS wywołującego.
-- ---------------------------------------------------------------------

-- 7a. Kolejka do utworzenia w Kontaktach Google:
--     „Chcą” lub „Do zastanowienia”, z telefonem, jeszcze niezsynchronizowane.
create or replace view public.v_google_contacts_queue
with (security_invoker = true) as
select id,
       company_name,
       phone,
       city,
       category,
       status,
       notes,
       maps_url,
       updated_at
  from public.leads
 where status in ('CHCA', 'DO_ZASTANOWIENIA')
   and phone is not null
   and google_contact_synced_at is null;

-- 7b. Płaski podgląd do Google Sheets (polskie nagłówki kolumn).
create or replace view public.v_sheets_export
with (security_invoker = true) as
select id                          as "ID",
       created_at                  as "Dodano",
       company_name                as "Firma",
       category                    as "Kategoria",
       city                        as "Miasto",
       address                     as "Adres",
       phone                       as "Telefon",
       google_rating               as "Ocena Google",
       google_reviews_count        as "Liczba opinii",
       website_status              as "Status WWW",
       website_url                 as "Obecna strona",
       status                      as "Status",
       notes                       as "Notatka",
       follow_up_at                as "Follow-up",
       last_called_at              as "Ostatni telefon",
       call_count                  as "Liczba telefonów",
       maps_url                    as "Link do Map"
  from public.leads
 order by created_at desc;

-- 7c. Lista miast do filtra w panelu (bez pobierania wszystkich leadów).
create or replace view public.v_cities
with (security_invoker = true) as
select distinct city
  from public.leads
 where city is not null and city <> '';


-- ---------------------------------------------------------------------
-- 8. ROW LEVEL SECURITY (RLS)
-- ---------------------------------------------------------------------

-- 8a. Lista członków zespołu. Samo konto w Supabase nie wystarcza –
--     e-mail musi być na tej liście. Dzięki temu nawet przy włączonej
--     rejestracji obca osoba nic nie odczyta ani nie usunie.
--     Dodanie osoby: insert into public.team_members (email) values ('jan@firma.pl');
create table if not exists public.team_members (
  email      text primary key check (email = lower(email)),
  created_at timestamptz not null default now()
);
alter table public.team_members enable row level security;
revoke all on public.team_members from anon, authenticated;

-- Tylko gdy lista jest pusta (pierwsze uruchomienie): wpisujemy obecnych
-- użytkowników, żeby nikt z zespołu nie stracił dostępu. Sprawdź tę listę
-- w Table Editor i usuń obce adresy!
insert into public.team_members (email)
select lower(email) from auth.users
 where email is not null
   and not exists (select 1 from public.team_members)
on conflict do nothing;

create or replace function public.is_team_member()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.team_members
     where email = lower(auth.jwt() ->> 'email')
  );
$$;
revoke execute on function public.is_team_member() from public, anon;
grant  execute on function public.is_team_member() to authenticated;

alter table public.leads     enable row level security;
alter table public.call_logs enable row level security;

-- leads: pełny dostęp dla zespołu
drop policy if exists "Zespół – odczyt leadów"     on public.leads;
drop policy if exists "Zespół – dodawanie leadów"  on public.leads;
drop policy if exists "Zespół – edycja leadów"     on public.leads;
drop policy if exists "Zespół – usuwanie leadów"   on public.leads;

create policy "Zespół – odczyt leadów"    on public.leads for select to authenticated using ((select public.is_team_member()));
create policy "Zespół – dodawanie leadów" on public.leads for insert to authenticated with check ((select public.is_team_member()));
create policy "Zespół – edycja leadów"    on public.leads for update to authenticated using ((select public.is_team_member())) with check ((select public.is_team_member()));
create policy "Zespół – usuwanie leadów"  on public.leads for delete to authenticated using ((select public.is_team_member()));

-- call_logs: odczyt + dopisywanie (historii się nie edytuje)
drop policy if exists "Zespół – odczyt historii"  on public.call_logs;
drop policy if exists "Zespół – zapis historii"   on public.call_logs;

create policy "Zespół – odczyt historii" on public.call_logs for select to authenticated using ((select public.is_team_member()));
create policy "Zespół – zapis historii"  on public.call_logs for insert to authenticated with check ((select public.is_team_member()));


-- ---------------------------------------------------------------------
-- 9. UPRAWNIENIA (GRANT / REVOKE)
--    Anonim (bez logowania) nie ma dostępu do niczego.
-- ---------------------------------------------------------------------
revoke all on public.leads, public.call_logs                          from anon;
revoke all on public.v_google_contacts_queue, public.v_sheets_export, public.v_cities from anon;

grant select, insert, update, delete on public.leads                  to authenticated;
grant select, insert                 on public.call_logs              to authenticated;
grant select on public.v_google_contacts_queue, public.v_sheets_export, public.v_cities to authenticated;

revoke execute on function public.normalize_phone(text)                    from public, anon;
revoke execute on function public.log_call(uuid, text, text, date)         from public, anon;
revoke execute on function public.claim_next_lead(uuid[], text, text)      from public, anon;
grant  execute on function public.claim_next_lead(uuid[], text, text)      to authenticated, service_role;
revoke execute on function public.undo_call(uuid, jsonb)                   from public, anon;
grant  execute on function public.undo_call(uuid, jsonb)                   to authenticated;
revoke execute on function public.call_feed(timestamptz)                   from public, anon;
grant  execute on function public.call_feed(timestamptz)                   to authenticated;
revoke execute on function public.get_dashboard_stats(text)                from public, anon;
revoke execute on function public.find_duplicates(text[], text[])          from public, anon;

grant execute on function public.normalize_phone(text)                     to authenticated, service_role;
grant execute on function public.log_call(uuid, text, text, date)          to authenticated, service_role;
grant execute on function public.get_dashboard_stats(text)                 to authenticated, service_role;
grant execute on function public.find_duplicates(text[], text[])           to authenticated, service_role;

-- 9. REALTIME – aplikacja dostaje zmiany w `leads` na żywo (nowe firmy z wtyczki).
do $$
begin
  alter publication supabase_realtime add table public.leads;
exception when duplicate_object then null;
end $$;

-- =====================================================================
--  KONIEC. Po uruchomieniu powinien pojawić się komunikat
--  „Success. No rows returned”.
-- =====================================================================
