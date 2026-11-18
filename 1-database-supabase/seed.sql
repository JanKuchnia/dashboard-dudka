-- =====================================================================
--  DANE TESTOWE (OPCJONALNE)
--  Plik: 1-database-supabase/seed.sql
--
--  Uruchom PO schema.sql, jeśli chcesz od razu przetestować Power Dialer
--  w Etapie 2. Rekordy mają maps_place_id z prefiksem "TEST_", więc
--  ponowne uruchomienie nie tworzy duplikatów.
--  Usunięcie danych testowych:
--    delete from public.leads where maps_place_id like 'TEST\_%';
-- =====================================================================

insert into public.leads
  (company_name, category, city, address, phone, google_rating, google_reviews_count,
   maps_url, maps_place_id, website_url, website_status, source)
values
  ('Salon Fryzjerski Bella', 'Fryzjer', 'Kraków', 'ul. Długa 12', '+48 512 345 678', 4.8, 127,
   'https://www.google.com/maps/search/?api=1&query=Salon+Fryzjerski+Bella+Krak%C3%B3w',
   'TEST_001', 'https://facebook.com/salonbella', 'TYLKO_FB', 'seed'),

  ('Auto-Serwis Kowalski', 'Mechanik samochodowy', 'Kraków', 'ul. Zakopiańska 105', '600 111 222', 4.6, 89,
   'https://www.google.com/maps/search/?api=1&query=Auto-Serwis+Kowalski+Krak%C3%B3w',
   'TEST_002', null, 'BRAK_WWW', 'seed'),

  ('Barber Shop Brzytwa', 'Barber', 'Wieliczka', 'Rynek Górny 3', '+48 733 444 555', 4.9, 312,
   'https://www.google.com/maps/search/?api=1&query=Barber+Shop+Brzytwa+Wieliczka',
   'TEST_003', 'https://booksy.com/pl-pl/brzytwa', 'TYLKO_BOOKSY', 'seed'),

  ('Pizzeria Da Mario', 'Pizzeria', 'Skawina', 'ul. Krakowska 7', '12 276 00 00', 4.3, 54,
   'https://www.google.com/maps/search/?api=1&query=Pizzeria+Da+Mario+Skawina',
   'TEST_004', 'https://instagram.com/damario.skawina', 'TYLKO_IG', 'seed'),

  ('Gabinet Kosmetyczny Aura', 'Kosmetyczka', 'Kraków', 'ul. Wielicka 44', '0048 501 999 888', 5.0, 41,
   'https://www.google.com/maps/search/?api=1&query=Gabinet+Kosmetyczny+Aura+Krak%C3%B3w',
   'TEST_005', null, 'BRAK_WWW', 'seed')
on conflict (maps_place_id) do nothing;
