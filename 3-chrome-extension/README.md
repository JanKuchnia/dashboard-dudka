# Wtyczka Chrome – Lead Scanner

Skanuje wyniki wyszukiwania w Mapach Google, wyróżnia firmy bez strony WWW (albo tylko z FB, IG lub Booksy), ostrzega o firmach, które już są w CRM, i wysyła wybrane firmy do bazy jednym kliknięciem.

## Instalacja (1 minuta)
1. Otwórz w Chrome adres `chrome://extensions`.
2. W prawym górnym rogu włącz **Tryb dewelopera**.
3. Kliknij **Załaduj rozpakowane** i wskaż folder `3-chrome-extension`.
4. Przypnij wtyczkę: ikona puzzla 🧩 → pinezka przy „Lead Scanner”.

## Pierwsze uruchomienie
1. Kliknij ikonę wtyczki.
2. Wpisz **Project URL** i **klucz publishable/anon** z Supabase. Opcjonalnie dodaj adres swojego panelu CRM.
3. Zaloguj się tym samym kontem co w panelu CRM.

## Jak używać
1. Kliknij **Otwórz Mapy Google** i wyszukaj np. `fryzjer Kraków`.
2. Na liście wyników każda firma dostaje plakietkę:
   - 🔴 **BRAK WWW**, 🔵 **TYLKO FB**, 🟣 **TYLKO IG**, 🟢 **TYLKO BOOKSY**, 🟪 **INNE SOCIAL**: te firmy są podświetlone na czerwono, bo to dobre leady,
   - ⚫ **W BAZIE**: firma już jest w CRM (sprawdzane po identyfikatorze miejsca i numerze telefonu),
   - szare **MA WWW**: firma ma własną stronę.
3. W panelu w prawym dolnym rogu kliknij **Zaznacz bez WWW**, a potem **Wyślij do CRM**. Możesz też zaznaczać firmy pojedynczo checkboxem.
4. Przewijaj listę w dół. Mapy doładowują kolejne wyniki, a wtyczka skanuje je automatycznie.
5. Gdy otworzysz wizytówkę konkretnej firmy, w panelu pojawi się przycisk **Dodaj tę firmę do CRM**. Wizytówka zawsze ma pełny numer telefonu i adres.

> **Wskazówka:** lista wyników w Mapach nie zawsze pokazuje numer telefonu. Jeśli go brakuje, otwórz wizytówkę i dodaj firmę z panelu albo uzupełnij numer później w CRM.

## Gdy coś nie działa
- **Brak panelu na Mapach:** odśwież stronę (F5). Po aktualizacji wtyczki zawsze odśwież otwarte karty Map.
- **„Sesja wygasła”:** kliknij ikonę wtyczki i zaloguj się ponownie.
- **Google zmienił wygląd Map:** wtyczka korzysta z elementów strony Google, które czasem się zmieniają. Jeśli plakietki przestaną się pojawiać, trzeba poprawić selektory w `content.js` (funkcje `parseCard` i `parseDetail`).
