// Enrich 10 recently added movies with TMDB data -> Supabase
import { readFileSync } from 'fs'
import { join, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
try {
  const envFile = readFileSync(join(__dirname, '..', '.env.local'), 'utf-8')
  for (const line of envFile.split('\n')) {
    const match = line.match(/^([A-Z_]+)=(.+)$/)
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2]
  }
} catch {}

const TMDB_KEY = process.env.TMDB_API_KEY || '';
const TMDB_BASE = 'https://api.themoviedb.org/3';
const SUPA_URL = (process.env.NEXT_PUBLIC_SUPABASE_URL || '') + '/rest/v1';
const SUPA_KEY = process.env.SUPABASE_SECRET_KEY || '';

const MOVIES = [
  { id: '98a598c1-7c8f-4d7d-b77b-483dc849060b', tmdb: 687163, title: 'Project Hail Mary' },
  { id: '1dcbc2c8-fe45-4f32-b1f0-5f4b016d0fe3', tmdb: 1115544, title: 'Mike & Nick & Nick & Alice' },
  { id: '4e8daba3-9b60-46d4-8718-83be08376132', tmdb: 1327819, title: 'Hoppers' },
  { id: '51d0142d-d089-4a38-bbe3-54ac1f49e7e3', tmdb: 999136, title: 'Do Not Enter' },
  { id: '6604fdc4-023c-4239-8bc0-c3d655877a72', tmdb: 1314786, title: 'Zeta' },
  { id: 'a0d5c7f1-1a5e-4744-b8a1-f8022a4b2263', tmdb: 1292695, title: 'They Will Kill You' },
  { id: 'd4ff5d15-4d4a-431e-a2c7-b284a18a53c6', tmdb: 1276704, title: '53 domingos' },
  { id: '1d6df441-c775-4c96-88cb-bda956913b1e', tmdb: 1159831, title: 'The Bride!' },
  { id: 'c84219e5-8ec7-41db-886a-2432191ff45a', tmdb: 1633264, title: 'Louis Theroux' },
  { id: '4e65572d-8ad9-4d78-9bbd-a85fe509d171', tmdb: 1119449, title: 'Good Luck Have Fun Don\'t Die' },
];

async function tmdbFetch(path) {
  const url = `${TMDB_BASE}${path}${path.includes('?') ? '&' : '?'}api_key=${TMDB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${path} -> ${res.status}`);
  return res.json();
}

async function supabasePatch(table, id, data) {
  const url = `${SUPA_URL}/${table}?id=eq.${id}`;
  const res = await fetch(url, {
    method: 'PATCH',
    headers: {
      'apikey': SUPA_KEY,
      'Authorization': `Bearer ${SUPA_KEY}`,
      'Content-Type': 'application/json',
      'Prefer': 'return=minimal',
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Supabase PATCH ${table} ${id} -> ${res.status}: ${txt}`);
  }
}

// Check if enriquecimiento row exists, create if not
async function ensureEnriquecimiento(id) {
  const url = `${SUPA_URL}/enriquecimiento?id=eq.${id}&select=id`;
  const res = await fetch(url, {
    headers: { 'apikey': SUPA_KEY, 'Authorization': `Bearer ${SUPA_KEY}` },
  });
  const rows = await res.json();
  if (rows.length === 0) {
    const createRes = await fetch(`${SUPA_URL}/enriquecimiento`, {
      method: 'POST',
      headers: {
        'apikey': SUPA_KEY,
        'Authorization': `Bearer ${SUPA_KEY}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ id }),
    });
    if (!createRes.ok) {
      const txt = await createRes.text();
      throw new Error(`Create enriquecimiento ${id} -> ${createRes.status}: ${txt}`);
    }
    console.log(`  Created enriquecimiento row`);
  }
}

function getCertification(releaseDates) {
  const results = releaseDates?.results || [];
  // Try CL first, then US
  for (const country of ['CL', 'US']) {
    const entry = results.find(r => r.iso_3166_1 === country);
    if (entry) {
      for (const rd of entry.release_dates) {
        if (rd.certification) return rd.certification;
      }
    }
  }
  return null;
}

async function enrichMovie(movie) {
  console.log(`\n--- ${movie.title} (tmdb:${movie.tmdb}) ---`);

  // Fetch all TMDB endpoints in parallel
  const [detailsEs, detailsEn, credits, keywords, images, videos, releaseDates] = await Promise.all([
    tmdbFetch(`/movie/${movie.tmdb}?language=es-CL`),
    tmdbFetch(`/movie/${movie.tmdb}?language=en-US`),
    tmdbFetch(`/movie/${movie.tmdb}/credits?language=en-US`),
    tmdbFetch(`/movie/${movie.tmdb}/keywords`),
    tmdbFetch(`/movie/${movie.tmdb}/images?include_image_language=en,null`),
    tmdbFetch(`/movie/${movie.tmdb}/videos?language=en-US`),
    tmdbFetch(`/movie/${movie.tmdb}/release_dates`),
  ]);

  // --- peliculas table ---
  const backdrop = detailsEs.backdrop_path || null;
  const logos = (images.logos || []);
  const logoPath = logos.length > 0 ? logos[0].file_path : null;

  const trailerVideos = (videos.results || []).filter(v => v.type === 'Trailer' && v.site === 'YouTube');
  const trailerKey = trailerVideos.length > 0 ? trailerVideos[0].key : null;

  const certification = getCertification(releaseDates);
  const collectionName = detailsEs.belongs_to_collection?.name || null;

  const peliculasData = {};
  if (backdrop) peliculasData.backdrop_path = backdrop;
  if (logoPath) peliculasData.logo_path = logoPath;
  if (trailerKey) peliculasData.youtube_trailer_key = trailerKey;
  if (certification) peliculasData.certification = certification;
  if (collectionName) peliculasData.collection_name = collectionName;

  console.log(`  peliculas: backdrop=${backdrop ? 'yes' : 'no'}, logo=${logoPath ? 'yes' : 'no'}, trailer=${trailerKey || 'none'}, cert=${certification || 'none'}, collection=${collectionName || 'none'}`);

  if (Object.keys(peliculasData).length > 0) {
    await supabasePatch('peliculas', movie.id, peliculasData);
    console.log(`  -> peliculas updated`);
  }

  // --- enriquecimiento table ---
  await ensureEnriquecimiento(movie.id);

  const crew = credits.crew || [];
  const cast = credits.cast || [];

  const directors = crew.filter(c => c.job === 'Director').map(c => c.name);
  const actores = cast.slice(0, 5).map(c => c.name);
  const compositores = crew.filter(c => c.job === 'Original Music Composer').map(c => c.name);
  const castJson = cast.slice(0, 15).map(c => ({
    name: c.name,
    character: c.character,
    profile_path: c.profile_path,
  }));
  const kws = (keywords.keywords || []).map(k => k.name);
  const generos = (detailsEs.genres || []).map(g => g.name);

  const enriqData = {
    director: directors.join(', ') || null,
    actores: actores,
    compositor: compositores.join(', ') || null,
    cast_json: castJson,
    keywords: kws,
    generos: generos,
  };

  console.log(`  enriquecimiento: director=${directors.join(', ') || 'none'}, actores=${actores.length}, compositor=${compositores.join(', ') || 'none'}, keywords=${kws.length}, generos=${generos.length}`);

  await supabasePatch('enriquecimiento', movie.id, enriqData);
  console.log(`  -> enriquecimiento updated`);
}

async function main() {
  console.log(`Enriching ${MOVIES.length} movies...`);
  let ok = 0, fail = 0;

  for (const movie of MOVIES) {
    try {
      await enrichMovie(movie);
      ok++;
    } catch (err) {
      console.error(`  ERROR: ${err.message}`);
      fail++;
    }
  }

  console.log(`\nDone: ${ok} succeeded, ${fail} failed`);
}

main();
