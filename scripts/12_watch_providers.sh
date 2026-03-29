#!/bin/bash
# Fetch TMDB watch/providers for all CineBret movies (Chile region)
# Uses curl instead of Python (Python 3.14 has httpcore issues)

# Load from .env.local
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
if [ -f "$SCRIPT_DIR/../.env.local" ]; then
  export $(grep -E '^[A-Z_]+=' "$SCRIPT_DIR/../.env.local" | xargs)
fi

TMDB_API_KEY="${TMDB_API_KEY}"
SUPABASE_URL="${NEXT_PUBLIC_SUPABASE_URL}"
SUPABASE_KEY="${SUPABASE_SECRET_KEY}"
REGION="CL"

# Fetch all movies with tmdb_id from Supabase
echo "Fetching movies from Supabase..."
OFFSET=0
ALL_MOVIES=""
while true; do
  BATCH=$(curl -s "${SUPABASE_URL}/rest/v1/peliculas?select=id,tmdb_id&tmdb_id=not.is.null&order=id&offset=${OFFSET}&limit=1000" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}")

  COUNT=$(echo "$BATCH" | python3 -c "import sys,json; print(len(json.load(sys.stdin)))" 2>/dev/null || echo "0")

  if [ "$COUNT" = "0" ]; then
    break
  fi

  ALL_MOVIES="${ALL_MOVIES}${BATCH}"
  OFFSET=$((OFFSET + 1000))

  if [ "$COUNT" -lt 1000 ]; then
    break
  fi
done

# Parse movies into id,tmdb_id pairs
MOVIE_PAIRS=$(echo "$ALL_MOVIES" | python3 -c "
import sys, json
data = json.loads('[' + sys.stdin.read().replace('][', ',') + ']') if '][' in sys.stdin.read() else json.load(sys.stdin)
for m in data:
    print(f\"{m['id']},{m['tmdb_id']}\")
" 2>/dev/null)

# Alternative: use node to parse
MOVIE_PAIRS=$(echo "$ALL_MOVIES" | node -e "
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  let raw = chunks.join('');
  // Handle concatenated JSON arrays
  raw = raw.replace(/\]\[/g, ',');
  if (!raw.startsWith('[')) raw = '[' + raw;
  if (!raw.endsWith(']')) raw = raw + ']';
  try {
    const data = JSON.parse(raw);
    data.forEach(m => console.log(m.id + ',' + m.tmdb_id));
  } catch(e) {
    console.error('Parse error:', e.message);
  }
});
")

TOTAL=$(echo "$MOVIE_PAIRS" | wc -l | tr -d ' ')
echo "Found ${TOTAL} movies with tmdb_id"

# Check existing providers
EXISTING=$(curl -s "${SUPABASE_URL}/rest/v1/watch_providers?select=pelicula_id&limit=10000" \
  -H "apikey: ${SUPABASE_KEY}" \
  -H "Authorization: Bearer ${SUPABASE_KEY}" | node -e "
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const data = JSON.parse(chunks.join(''));
  const ids = [...new Set(data.map(r => r.pelicula_id))];
  ids.forEach(id => console.log(id));
});
")

EXISTING_COUNT=$(echo "$EXISTING" | grep -c . || echo "0")
echo "Already have providers for ${EXISTING_COUNT} movies"

# Provider ID to platform key mapping
# 8=Netflix, 337=Disney+, 384/1899=HBO Max, 119/9/10=Amazon, 350/2=Apple, 531=Paramount+, 11=MUBI
map_provider() {
  case $1 in
    8) echo "netflix" ;;
    337) echo "disney_plus" ;;
    384|1899) echo "hbo_max" ;;
    119|9|10) echo "amazon_prime" ;;
    350|2) echo "apple_tv" ;;
    531) echo "paramount_plus" ;;
    11) echo "mubi" ;;
    *) echo "" ;;
  esac
}

FETCHED=0
ERRORS=0
BATCH_JSON="["
BATCH_COUNT=0

echo "Fetching watch providers from TMDB..."

while IFS=',' read -r PEL_ID TMDB_ID; do
  [ -z "$PEL_ID" ] && continue

  # Skip if already have providers
  if echo "$EXISTING" | grep -q "$PEL_ID"; then
    continue
  fi

  # Fetch from TMDB
  PROVIDERS=$(curl -s "https://api.themoviedb.org/3/movie/${TMDB_ID}/watch/providers?api_key=${TMDB_API_KEY}" 2>/dev/null)

  # Extract Chile data
  CL_DATA=$(echo "$PROVIDERS" | node -e "
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  try {
    const data = JSON.parse(chunks.join(''));
    const cl = data.results?.CL;
    if (cl) console.log(JSON.stringify(cl));
    else console.log('null');
  } catch { console.log('null'); }
});
" 2>/dev/null)

  if [ "$CL_DATA" != "null" ] && [ -n "$CL_DATA" ]; then
    # Parse providers and build upsert rows
    ROWS=$(echo "$CL_DATA" | node -e "
const map = {8:'netflix',337:'disney_plus',384:'hbo_max',1899:'hbo_max',119:'amazon_prime',9:'amazon_prime',10:'amazon_prime',350:'apple_tv',2:'apple_tv',531:'paramount_plus',11:'mubi'};
const chunks = [];
process.stdin.on('data', d => chunks.push(d));
process.stdin.on('end', () => {
  const cl = JSON.parse(chunks.join(''));
  const link = cl.link || '';
  const rows = [];
  for (const type of ['flatrate','rent','buy']) {
    for (const p of (cl[type] || [])) {
      rows.push(JSON.stringify({
        pelicula_id: '${PEL_ID}',
        tmdb_id: ${TMDB_ID},
        provider_id: p.provider_id,
        provider_name: p.provider_name,
        provider_type: type,
        platform_key: map[p.provider_id] || null,
        logo_path: p.logo_path || '',
        tmdb_link: link
      }));
    }
  }
  if (rows.length > 0) console.log(rows.join('\\n'));
});
" 2>/dev/null)

    if [ -n "$ROWS" ]; then
      while IFS= read -r ROW; do
        if [ $BATCH_COUNT -gt 0 ]; then
          BATCH_JSON="${BATCH_JSON},"
        fi
        BATCH_JSON="${BATCH_JSON}${ROW}"
        BATCH_COUNT=$((BATCH_COUNT + 1))
      done <<< "$ROWS"
    fi
  fi

  FETCHED=$((FETCHED + 1))

  # Upsert in batches of 100
  if [ $BATCH_COUNT -ge 100 ]; then
    BATCH_JSON="${BATCH_JSON}]"
    HTTP_CODE=$(curl -s -o /dev/null -w "%{http_code}" \
      -X POST "${SUPABASE_URL}/rest/v1/watch_providers" \
      -H "apikey: ${SUPABASE_KEY}" \
      -H "Authorization: Bearer ${SUPABASE_KEY}" \
      -H "Content-Type: application/json" \
      -H "Prefer: resolution=merge-duplicates" \
      -d "$BATCH_JSON")

    if [ "$HTTP_CODE" = "201" ] || [ "$HTTP_CODE" = "200" ]; then
      echo "  Upserted ${BATCH_COUNT} rows (${FETCHED}/${TOTAL} movies) [HTTP ${HTTP_CODE}]"
    else
      echo "  ERROR upserting: HTTP ${HTTP_CODE} (${FETCHED}/${TOTAL})"
      ERRORS=$((ERRORS + 1))
    fi

    BATCH_JSON="["
    BATCH_COUNT=0
  fi

  # Rate limit: ~35 requests then pause
  if [ $((FETCHED % 35)) -eq 0 ]; then
    sleep 1
  fi

  # Progress
  if [ $((FETCHED % 100)) -eq 0 ]; then
    echo "  Progress: ${FETCHED}/${TOTAL} movies fetched..."
  fi

done <<< "$MOVIE_PAIRS"

# Final batch
if [ $BATCH_COUNT -gt 0 ]; then
  BATCH_JSON="${BATCH_JSON}]"
  curl -s -o /dev/null -w "" \
    -X POST "${SUPABASE_URL}/rest/v1/watch_providers" \
    -H "apikey: ${SUPABASE_KEY}" \
    -H "Authorization: Bearer ${SUPABASE_KEY}" \
    -H "Content-Type: application/json" \
    -H "Prefer: resolution=merge-duplicates" \
    -d "$BATCH_JSON"
  echo "  Upserted final ${BATCH_COUNT} rows"
fi

echo ""
echo "Done! Fetched ${FETCHED} movies, ${ERRORS} errors"
