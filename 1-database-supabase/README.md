# Baza danych – Supabase (konfiguracja w 3 minuty)

## 1. Załóż projekt (ok. 1 min)
1. Wejdź na **https://supabase.com** → **Start your project** → zaloguj się przez GitHuba.
2. Kliknij **New project**:
   - **Name:** `crm-cold-calling`
   - **Database Password:** kliknij *Generate* i zapisz hasło w bezpiecznym miejscu.
   - **Region:** `Central EU (Frankfurt)`, czyli serwery najbliżej Polski.
   - Plan **Free**.
3. Kliknij **Create new project** i poczekaj ok. 1 minuty, aż projekt się uruchomi.

## 2. Wklej schemat bazy (ok. 30 s)
1. W menu po lewej wybierz **SQL Editor** → **New query**.
2. Skopiuj całą zawartość pliku `schema.sql`, wklej ją i kliknij **Run** (lub `Ctrl + Enter`).
3. Powinien pojawić się komunikat **„Success. No rows returned”**.
4. *(Opcjonalnie)* W nowym zapytaniu wklej i uruchom `seed.sql`. Dostaniesz 5 firm testowych do sprawdzenia Power Dialera.

Sprawdź w **Table Editor**, czy są tabele `leads` i `call_logs`.

## 3. Utwórz konto dla siebie i zespołu (ok. 30 s)
Dane są chronione przez RLS, więc dostęp mają tylko zalogowani użytkownicy.
1. **Authentication** → **Users** → **Add user** → **Create new user**.
2. Wpisz e-mail i hasło i zaznacz **Auto Confirm User**.
3. Dodaj jej e-mail do listy zespołu: **SQL Editor** → `insert into public.team_members (email) values ('jan@firma.pl');` (małymi literami). Bez tego konto nic nie zobaczy.
4. Powtórz dla każdej osoby, która będzie dzwonić.
5. **Ważne:** **Authentication** → **Sign In / Providers** → wyłącz **Allow new users to sign up**. Dzięki temu nikt obcy nie założy sobie konta.

> Przy pierwszym uruchomieniu `schema.sql` wpisuje do `team_members` wszystkie istniejące konta. Sprawdź tę tabelę w **Table Editor** i usuń adresy, których nie znasz.

## 4. Skopiuj klucze API (ok. 30 s)
Kliknij przycisk **Connect** na górze projektu albo wejdź w **Project Settings → API Keys** i **Data API**:

| Co | Gdzie | Zmienna w `.env` |
|---|---|---|
| **Project URL** (`https://xxxx.supabase.co`) | Connect / Data API | `VITE_SUPABASE_URL` |
| **Publishable key** (`sb_publishable_...`) lub starszy **anon key** (`eyJ...`) | API Keys | `VITE_SUPABASE_ANON_KEY` |
| **Secret / service_role key** | API Keys | **nigdzie w panelu ani we wtyczce!** Użyjemy go dopiero w Etapie 4 po stronie serwera. |

> Klucz publishable/anon może trafić do przeglądarki i wtyczki, bo bez zalogowania nic nie odczyta.
> Klucz **secret/service_role** omija zabezpieczenia, więc nigdy nie wrzucaj go do kodu frontendu ani na GitHuba.

---

## Co jest w bazie

| Element | Do czego służy |
|---|---|
| `leads` | Firmy z Map Google: dane, status strony WWW, status rozmowy, notatka, follow-up |
| `call_logs` | Historia każdej rozmowy, na jej podstawie liczone są KPI „dzisiaj” |
| `log_call()` | RPC dla przycisku „Zapisz i następny”: aktualizuje leada i dopisuje historię |
| `get_dashboard_stats()` | RPC z KPI: obdzwonione dzisiaj, zainteresowani, skuteczność % |
| `find_duplicates()` | RPC dla wtyczki: które firmy z Map już są w bazie (po `place_id` lub telefonie) |
| `v_google_contacts_queue` | Leady „Chcą” i „Do zastanowienia” czekające na dodanie do Kontaktów Google (Etap 4) |
| `v_sheets_export` | Płaski widok z polskimi nagłówkami do Google Sheets (Etap 4) |
| `v_cities` | Lista miast do filtra w panelu |
| `team_members` | E-maile osób z dostępem do danych (bez wpisu konto nic nie widzi) |

**Statusy leada:** `NOWY` → `CHCA` / `DO_ZASTANOWIENIA` / `NIE_CHCA`
**Status strony:** `BRAK_WWW`, `TYLKO_FB`, `TYLKO_IG`, `TYLKO_BOOKSY`, `INNE_SOCIAL`, `MA_WWW`
