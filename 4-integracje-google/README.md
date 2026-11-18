# Integracje Google: Kontakty + Sheets

Jeden skrypt Google Apps Script podpięty do arkusza Google:
- **Kontakty Google:** leady „Chcą” i „Do zastanowienia” trafiają do Twoich Kontaktów z etykietą **Agencja - Leady**. Kontakt zawiera nazwę firmy, numer telefonu i notatkę z rozmowy.
- **Google Sheets:** zakładka **Leady** to podgląd całej bazy, odświeżany automatycznie.

## Instalacja (ok. 5 minut)
1. Utwórz nowy arkusz na https://sheets.google.com (np. „CRM – podgląd”).
2. W arkuszu wybierz **Rozszerzenia → Apps Script**.
3. Usuń zawartość pliku `Kod.gs` i wklej cały plik `Code.gs`.
4. Włącz plik manifestu: ⚙ **Ustawienia projektu** → zaznacz **„Pokaż plik manifestu appsscript.json w edytorze”**. Wróć do edytora i zastąp zawartość `appsscript.json` plikiem z tego folderu. To włącza People API, czyli dostęp do Kontaktów.
5. W ⚙ **Ustawieniach projektu → Właściwości skryptu** dodaj:

   | Właściwość | Wartość |
   |---|---|
   | `SUPABASE_URL` | `https://xxxx.supabase.co` |
   | `SUPABASE_SERVICE_KEY` | klucz **secret** (`sb_secret_…`) lub **service_role** z Supabase → API Keys |
   | `WEBHOOK_SECRET` | dowolne długie hasło (potrzebne tylko do webhooka) |

6. W edytorze wybierz u góry funkcję **`instaluj`** i kliknij **▶ Uruchom**. Zaakceptuj uprawnienia: dostęp do Kontaktów, do arkusza i do połączeń zewnętrznych.
   Jeśli zobaczysz komunikat „Aplikacja niezweryfikowana”, kliknij **Zaawansowane → Przejdź do projektu**. To Twój własny skrypt.

Gotowe. Od teraz:
- co **5 minut** nowe leady „Chcą” i „Do zastanowienia” trafiają do Kontaktów,
- co **15 minut** odświeża się zakładka **Leady**,
- w arkuszu pojawia się menu **CRM**, z którego możesz odświeżyć dane ręcznie.

> 🔒 Klucz secret/service_role jest zapisany tylko w Twoim prywatnym projekcie Apps Script. Nigdy nie wklejaj go do panelu CRM ani do wtyczki.

## Opcjonalnie: kontakt od razu po rozmowie (webhook)
Domyślnie kontakt pojawia się w ciągu 5 minut. Jeśli chcesz, żeby trafiał do Kontaktów od razu:
1. W Apps Script kliknij **Wdróż → Nowe wdrożenie → Aplikacja internetowa**. Ustaw *Wykonaj jako: Ja* oraz *Dostęp: Każdy*, a potem kliknij **Wdróż** i skopiuj adres URL.
2. W Supabase wejdź w **Database → Webhooks → Create a new hook**:
   - Table: `leads`, Events: **Update**,
   - Type: **HTTP Request**, Method: **POST**,
   - URL: `ADRES_Z_PUNKTU_1?secret=TWOJE_WEBHOOK_SECRET`.
3. Zapisz. Teraz kliknięcie „Chcą” albo „Do zastanowienia” w Power Dialerze od razu tworzy kontakt.

## Ważne
- Każda firma jest dodawana do Kontaktów **raz**: po dodaniu dostaje znacznik `google_contact_synced_at`. Żeby dodać ją ponownie, wyczyść to pole w Supabase.
- Arkusz służy **tylko do podglądu**. Zmiany wprowadzone w nim nie wracają do CRM i zostaną nadpisane przy kolejnej synchronizacji.
