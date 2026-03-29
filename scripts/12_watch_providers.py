"""
Fetch TMDB watch/providers for all movies in CineBret (Chile region).
Stores provider data + JustWatch deep link in the 'watch_providers' table.

Usage: python scripts/12_watch_providers.py
"""

import os
import time
import json
import urllib.request
import urllib.error

# Config
TMDB_API_KEY = "8719f94b3bcb11052c5c509fe9fd62f6"
SUPABASE_URL = "https://gidiwfpkmzhmqpevuogz.supabase.co"
SUPABASE_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImdpZGl3ZnBrbXpobXFwZXZ1b2d6Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mzg1NDA3MCwiZXhwIjoyMDg5NDMwMDcwfQ.28Upeigg8LEiopzUc_ul_d2KHyyx1VvIyjy4IdXOK3k"
REGION = "CL"

# TMDB provider_id -> our platform key mapping
PROVIDER_MAP = {
    8: "netflix",
    337: "disney_plus",
    384: "hbo_max",
    1899: "hbo_max",  # HBO Max alternate ID
    119: "amazon_prime",
    9: "amazon_prime",  # Amazon alternate
    10: "amazon_prime",  # Amazon Video
    350: "apple_tv",
    2: "apple_tv",  # Apple iTunes
    531: "paramount_plus",
    11: "mubi",
}

HEADERS_SUPA = {
    "apikey": SUPABASE_KEY,
    "Authorization": f"Bearer {SUPABASE_KEY}",
    "Content-Type": "application/json",
    "Prefer": "resolution=merge-duplicates",
}


def supabase_get(table, params=""):
    url = f"{SUPABASE_URL}/rest/v1/{table}?{params}"
    req = urllib.request.Request(url, headers={
        "apikey": SUPABASE_KEY,
        "Authorization": f"Bearer {SUPABASE_KEY}",
    })
    with urllib.request.urlopen(req) as resp:
        return json.loads(resp.read())


def supabase_upsert(table, rows):
    url = f"{SUPABASE_URL}/rest/v1/{table}"
    data = json.dumps(rows).encode()
    req = urllib.request.Request(url, data=data, headers=HEADERS_SUPA, method="POST")
    with urllib.request.urlopen(req) as resp:
        return resp.status


def tmdb_watch_providers(tmdb_id):
    url = f"https://api.themoviedb.org/3/movie/{tmdb_id}/watch/providers?api_key={TMDB_API_KEY}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req) as resp:
            data = json.loads(resp.read())
            return data.get("results", {}).get(REGION, {})
    except urllib.error.HTTPError:
        return {}


def main():
    # Fetch all movies with tmdb_id
    print("Fetching movies from Supabase...")
    all_movies = []
    offset = 0
    while True:
        batch = supabase_get("peliculas", f"select=id,tmdb_id&tmdb_id=not.is.null&order=id&offset={offset}&limit=1000")
        if not batch:
            break
        all_movies.extend(batch)
        offset += len(batch)
        if len(batch) < 1000:
            break

    print(f"Found {len(all_movies)} movies with tmdb_id")

    # Check which already have providers
    existing = set()
    offset = 0
    while True:
        batch = supabase_get("watch_providers", f"select=pelicula_id&offset={offset}&limit=1000")
        if not batch:
            break
        existing.update(row["pelicula_id"] for row in batch)
        offset += len(batch)
        if len(batch) < 1000:
            break

    to_fetch = [m for m in all_movies if m["id"] not in existing]
    print(f"Already have providers for {len(existing)} movies, fetching {len(to_fetch)} new...")

    batch_rows = []
    fetched = 0
    errors = 0

    for movie in to_fetch:
        try:
            providers = tmdb_watch_providers(movie["tmdb_id"])
            if not providers:
                fetched += 1
                continue

            tmdb_link = providers.get("link", "")

            # Process flatrate (subscription), rent, buy
            for provider_type in ["flatrate", "rent", "buy"]:
                for p in providers.get(provider_type, []):
                    pid = p.get("provider_id")
                    platform = PROVIDER_MAP.get(pid)
                    batch_rows.append({
                        "pelicula_id": movie["id"],
                        "tmdb_id": movie["tmdb_id"],
                        "provider_id": pid,
                        "provider_name": p.get("provider_name", ""),
                        "provider_type": provider_type,
                        "platform_key": platform,
                        "logo_path": p.get("logo_path", ""),
                        "tmdb_link": tmdb_link,
                    })

            fetched += 1

            # Upsert in batches of 200
            if len(batch_rows) >= 200:
                supabase_upsert("watch_providers", batch_rows)
                print(f"  Upserted {len(batch_rows)} rows ({fetched}/{len(to_fetch)} movies)")
                batch_rows = []

            # Rate limit: TMDB allows ~40 req/10s
            if fetched % 35 == 0:
                time.sleep(1)

        except Exception as e:
            errors += 1
            print(f"  Error for {movie['tmdb_id']}: {e}")
            if errors > 20:
                print("Too many errors, stopping")
                break

    # Final batch
    if batch_rows:
        supabase_upsert("watch_providers", batch_rows)
        print(f"  Upserted final {len(batch_rows)} rows")

    print(f"\nDone! Fetched {fetched} movies, {errors} errors")


if __name__ == "__main__":
    main()
