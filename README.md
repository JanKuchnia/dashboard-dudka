# Lead CRM: ekosystem do cold callingu

System do pozyskiwania leadów dla agencji, która robi strony internetowe dla lokalnych firm.

| Folder | Co to jest | Instrukcja |
|---|---|---|
| `1-database-supabase/` | Baza danych (Supabase / PostgreSQL) | [README](1-database-supabase/README.md) |
| `2-web-crm-app/` | Panel CRM / Power Dialer (React + Vite + Tailwind, PWA) | [README](2-web-crm-app/README.md) |
| `3-chrome-extension/` | Wtyczka Chrome do skanowania Map Google | [README](3-chrome-extension/README.md) |
| `4-integracje-google/` | Automatyczne Kontakty Google + podgląd w Google Sheets | [README](4-integracje-google/README.md) |

## Szybki start
1. **Baza:** załóż projekt w Supabase i uruchom `1-database-supabase/schema.sql`.
2. **Panel:** zainstaluj Node.js LTS i kliknij dwukrotnie `uruchom-crm.bat`. Bez kluczy w `.env` panel działa w trybie demo.
3. **Klucze:** skopiuj `2-web-crm-app/.env.example` jako `2-web-crm-app/.env` i wpisz dane z Supabase.
4. **Wtyczka:** wejdź w `chrome://extensions`, kliknij **Załaduj rozpakowane** i wskaż folder `3-chrome-extension`.
5. **Google:** wklej `4-integracje-google/Code.gs` do Apps Script w arkuszu Google.
6. **Hosting:** Vercel lub Netlify z katalogiem głównym `2-web-crm-app` (szczegóły w README panelu).

## Przepływ pracy
```
Mapy Google ──(wtyczka)──► Supabase ◄──► Panel CRM (Power Dialer)
                                  │
                                  ├──► Kontakty Google („Chcą” / „Do zastanowienia”)
                                  └──► Google Sheets (podgląd)
```
