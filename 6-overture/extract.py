#!/usr/bin/env python3
"""Miesięczny import firm z Overture Maps (Polska) do tabeli `places` w Supabase.

Env (te same co site-worker): SUPABASE_URL SUPABASE_ANON_KEY SUPABASE_EMAIL SUPABASE_PASSWORD
Użycie:  extract.py [--dry-run] [--limit N] [--release 2026-11-18.0]
  --dry-run  zapisuje rows.jsonl i wypisuje statystyki, nic nie wysyła do Supabase
  --limit N  tylko N pierwszych wierszy (test); bez czyszczenia starych wydań
"""
import argparse, collections, json, os, sys, time, urllib.error, urllib.request

import duckdb

MIN_CONFIDENCE = 0.7
BATCH = 1000

# Kategoria Overture -> id branży z CRM (osm.js CATEGORIES). Spoza listy = pomijane.
MAP = {
    'fryzjer': ['barber', 'hair_salon', 'hair_stylist'],
    'kosmetyczka': ['beauty_salon', 'nail_salon', 'personal_or_beauty_service', 'laser_hair_removal', 'hair_removal'],
    'mechanik': ['automotive_repair', 'automotive_service', 'auto_body_shop', 'auto_electrical_repair', 'auto_glass_service', 'auto_restoration_service'],
    'wulkanizacja': ['tire_dealer_and_repair', 'tire_shop'],
    'myjnia': ['car_wash', 'auto_detailing'],
    'hydraulik': ['plumbing', 'hvac_service'],
    'elektryk': ['electrician'],
    'budowlanka': ['contractor', 'building_contractor', 'roofing', 'carpenter', 'builder', 'masonry_concrete', 'masonry_contractor',
                   'flooring_contractor', 'painting', 'windows_installation', 'paving_contractor', 'altering_and_remodeling_contractor', 'stone_and_masonry'],
    'fastfood': ['pizza_restaurant', 'fast_food_restaurant', 'burger_restaurant', 'doner_kebab_restaurant', 'hot_dog_restaurant',
                 'chicken_wings_restaurant', 'pizza_delivery_service'],
    'kawiarnia': ['coffee_shop', 'cafe'],
    'piekarnia': ['bakery'],
    'kwiaciarnia': ['florist'],
    'weterynarz': ['veterinarian'],
    'dentysta': ['dentist', 'general_dentistry', 'pediatric_dentistry', 'cosmetic_dentistry'],
    'fizjo': ['massage_therapy', 'physical_therapy', 'physiotherapy'],
    'silownia': ['gym', 'sport_or_fitness_facility', 'fitness_trainer'],
    'szkolajazdy': ['driving_school'],
    'fotograf': ['event_photography_service', 'session_photography_service', 'photographer'],
    'krawiec': ['tailor', 'shoe_repair'],
    'slusarz': ['key_and_locksmith'],
    'pralnia': ['laundry_service', 'dry_cleaning'],
    'optyk': ['optician', 'optometrist', 'eyewear_and_optician'],
    'zoologiczny': ['pet_store', 'pet_groomer', 'aquatic_pet_store', 'animal_or_pet_service', 'reptile_store', 'pet_boarding', 'pet_sitting'],
    'nocleg': ['bed_and_breakfast', 'hostel', 'guest_house'],
    'meble': ['furniture_store', 'furniture_manufacturer', 'furniture_repair', 'furniture_assembly'],
}
# Każda inna kuchnia (polish_restaurant, sushi_restaurant…) to restauracja
RESTAURANT_SUFFIX = ('restauracja', '%\\_restaurant')


def latest_release():
    with urllib.request.urlopen('https://stac.overturemaps.org/catalog.json', timeout=30) as r:
        return json.load(r)['latest']


def query(release, limit):
    con = duckdb.connect()
    con.execute("INSTALL httpfs; LOAD httpfs; SET s3_region='us-west-2';")
    con.execute('CREATE TABLE cmap(t VARCHAR, c VARCHAR)')
    con.executemany('INSERT INTO cmap VALUES (?, ?)', [(t, c) for c, ts in MAP.items() for t in ts])
    sql = f"""
    SELECT id, names.primary AS name, COALESCE(m.c, 'restauracja') AS category, taxonomy.primary AS taxonomy,
           phones[1] AS phone, websites[1] AS website, socials[1] AS social,
           addresses[1].freeform AS address, addresses[1].locality AS city,
           bbox.ymin AS lat, bbox.xmin AS lon, confidence::FLOAT AS confidence, '{release}' AS release
    FROM read_parquet('s3://overturemaps-us-west-2/release/{release}/theme=places/type=place/*', hive_partitioning=1) p
    LEFT JOIN cmap m ON m.t = taxonomy.primary
    WHERE addresses[1].country = 'PL' AND confidence >= {MIN_CONFIDENCE}
      AND names.primary IS NOT NULL AND len(phones) > 0
      AND (m.c IS NOT NULL OR taxonomy.primary LIKE '{RESTAURANT_SUFFIX[1]}' ESCAPE '\\')
    {f'LIMIT {limit}' if limit else ''}
    """
    return con.execute(sql)


class Supabase:
    def __init__(self):
        self.url = os.environ['SUPABASE_URL'].rstrip('/')
        self.key = os.environ['SUPABASE_ANON_KEY']
        self.login()

    def _post(self, path, body, headers):
        req = urllib.request.Request(self.url + path, data=json.dumps(body).encode(), headers={'apikey': self.key, 'Content-Type': 'application/json', **headers})
        with urllib.request.urlopen(req, timeout=120) as r:
            return json.load(r)

    def login(self):
        d = self._post('/auth/v1/token?grant_type=password', {'email': os.environ['SUPABASE_EMAIL'], 'password': os.environ['SUPABASE_PASSWORD']}, {})
        self.token = d['access_token']

    def rpc(self, name, body):
        for attempt in (1, 2):
            try:
                return self._post(f'/rest/v1/rpc/{name}', body, {'Authorization': f'Bearer {self.token}'})
            except urllib.error.HTTPError as e:
                if e.code == 401 and attempt == 1:  # token wygasł (ważny ok. 1 h)
                    self.login()
                    continue
                sys.exit(f'{name}: HTTP {e.code}: {e.read().decode()[:300]}')


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--dry-run', action='store_true')
    ap.add_argument('--limit', type=int)
    ap.add_argument('--release')
    a = ap.parse_args()
    release = a.release or latest_release()
    print(f'Wydanie Overture: {release}', flush=True)

    cur = query(release, a.limit)
    cols = [d[0] for d in cur.description]
    db = None if a.dry_run else Supabase()
    out = open('rows.jsonl', 'w') if a.dry_run else None
    total, per_cat, t0 = 0, collections.Counter(), time.time()
    while True:
        rows = cur.fetchmany(BATCH)
        if not rows:
            break
        batch = [dict(zip(cols, r)) for r in rows]
        per_cat.update(r['category'] for r in batch)
        if db:
            db.rpc('upsert_places', {'p_rows': batch})
        else:
            out.writelines(json.dumps(r, ensure_ascii=False) + '\n' for r in batch)
        total += len(batch)
        print(f'{total} wierszy ({time.time() - t0:.0f}s)', flush=True)
    if db and not a.limit:
        print('Usunięto ze starszych wydań:', db.rpc('prune_places', {'p_release': release}))
    print(f'Gotowe: {total} wierszy', dict(per_cat.most_common()))


if __name__ == '__main__':
    main()
