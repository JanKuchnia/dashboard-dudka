# Panel CRM / Power Dialer

React + Vite + Tailwind CSS. Działa na komputerze i telefonie, można go też zainstalować jako aplikację (PWA).

## Uruchomienie lokalne

Potrzebujesz **Node.js w wersji LTS** (https://nodejs.org).

**Najprościej:** kliknij dwukrotnie `uruchom-crm.bat` w głównym folderze projektu.

**Albo ręcznie w terminalu:**
```bash
cd 2-web-crm-app
npm install
npm run dev
```
Panel otworzy się pod adresem **http://localhost:5173**.

### Tryb demo i prawdziwa baza
- **Bez pliku `.env`** panel działa w **trybie demo**: przykładowe firmy są zapisywane tylko w Twojej przeglądarce. Możesz w nim przetestować wszystkie funkcje.
- **Z prawdziwą bazą:** skopiuj `.env.example` jako `.env` i wpisz `VITE_SUPABASE_URL` oraz `VITE_SUPABASE_ANON_KEY` (instrukcja: `1-database-supabase/README.md`). Potem zrestartuj `npm run dev`. Pojawi się ekran logowania.

## Funkcje
- **Tryb dzwonienia:** jedna firma naraz, klikalny numer, przycisk do wizytówki w Mapach, notatka, follow-up i 3 przyciski wyniku rozmowy.
  - Skróty klawiszowe: `1`, `2`, `3` wybierają wynik, `Ctrl+Enter` zapisuje i ładuje następną firmę, `S` pomija.
  - Dwie osoby dzwoniące jednocześnie nie dostaną tej samej firmy (blokada na 15 minut).
- **Follow-upy:** firmy „Do zastanowienia” w grupach Zaległe, Dzisiaj, Nadchodzące i Bez daty, z przyciskiem „Zadzwoń teraz”.
- **Baza i statystyki:** KPI, wyszukiwarka, filtry, sortowanie, edycja, historia rozmów, ręczne dodawanie i eksport do CSV (pod Excela).

## Wrzucenie na hosting (prywatna strona firmy)

### Vercel (zalecane)
1. Wypchnij projekt na GitHuba.
2. Na https://vercel.com kliknij **Add New → Project** i wybierz repozytorium.
3. **Root Directory:** `2-web-crm-app`. Framework wykryje się sam (Vite).
4. W **Environment Variables** dodaj `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY` i opcjonalnie `VITE_APP_NAME`.
5. Kliknij **Deploy**. Dostaniesz adres typu `twoja-nazwa.vercel.app`.

### Netlify
1. **Add new site → Import an existing project** i wybierz repozytorium z GitHuba.
2. **Base directory:** `2-web-crm-app`. Build i publish ustawią się same z `netlify.toml`.
3. W **Site configuration → Environment variables** dodaj te same zmienne.
4. Kliknij **Deploy**.

> Po każdej zmianie zmiennych środowiskowych trzeba zrobić ponowny deploy, bo Vite wkleja je do kodu podczas budowania.

### Czy strona jest prywatna?
Tak. Bez logowania nikt nie zobaczy danych: chroni je RLS w Supabase, a konta zakładasz ręcznie w panelu Supabase (rejestracja jest wyłączona). Strona ma też blokadę indeksowania w Google (`noindex` i `robots.txt`).

## Instalacja jako aplikacja
- **Komputer (Chrome / Edge):** po otwarciu panelu kliknij ikonę „Zainstaluj” na pasku adresu.
- **Android (Chrome):** menu ⋮ → **Dodaj do ekranu głównego** / **Zainstaluj aplikację**.
- **iPhone (Safari):** przycisk Udostępnij → **Do ekranu początkowego**.

Instalacja działa na hostingu (https). Lokalnie na `localhost` też, ale tylko po `npm run build && npm run preview`.
