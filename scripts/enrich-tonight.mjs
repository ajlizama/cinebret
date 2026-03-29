/**
 * Re-enrich 10 movies added tonight.
 * Fetches credits + keywords from TMDB, updates enriquecimiento in Supabase.
 */

import { readFileSync } from "fs";
import { resolve } from "path";

// Load .env.local
const envPath = resolve(import.meta.dirname, "../.env.local");
const envVars = Object.fromEntries(
  readFileSync(envPath, "utf-8")
    .split("\n")
    .filter((l) => l.includes("="))
    .map((l) => {
      const i = l.indexOf("=");
      return [l.slice(0, i).trim(), l.slice(i + 1).trim()];
    })
);

const TMDB_KEY = envVars.TMDB_API_KEY;
const SUPA_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPA_KEY = envVars.SUPABASE_SECRET_KEY;

const MOVIES = [
  { id: "98a598c1-7c8f-4d7d-b77b-483dc849060b", tmdb: 687163, title: "Project Hail Mary" },
  { id: "1dcbc2c8-fe45-4f32-b1f0-5f4b016d0fe3", tmdb: 1115544, title: "Mike & Nick" },
  { id: "4e8daba3-9b60-46d4-8718-83be08376132", tmdb: 1327819, title: "Hoppers" },
  { id: "51d0142d-d089-4a38-bbe3-54ac1f49e7e3", tmdb: 999136, title: "Do Not Enter" },
  { id: "6604fdc4-023c-4239-8bc0-c3d655877a72", tmdb: 1314786, title: "Zeta" },
  { id: "a0d5c7f1-1a5e-4744-b8a1-f8022a4b2263", tmdb: 1292695, title: "They Will Kill You" },
  { id: "d4ff5d15-4d4a-431e-a2c7-b284a18a53c6", tmdb: 1276704, title: "53 domingos" },
  { id: "1d6df441-c775-4c96-88cb-bda956913b1e", tmdb: 1159831, title: "The Bride!" },
  { id: "c84219e5-8ec7-41db-886a-2432191ff45a", tmdb: 1633264, title: "Louis Theroux" },
  { id: "4e65572d-8ad9-4d78-9bbd-a85fe509d171", tmdb: 1119449, title: "Good Luck Have Fun Don't Die" },
];

async function tmdbFetch(path) {
  const url = `https://api.themoviedb.org/3${path}?api_key=${TMDB_KEY}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`TMDB ${res.status} for ${path}`);
  return res.json();
}

// First, fetch current enriquecimiento rows to see what's missing
async function fetchCurrentRows() {
  // We need to match by pelicula_id which may be partial UUIDs — fetch all and filter
  const url = `${SUPA_URL}/rest/v1/enriquecimiento?select=pelicula_id,director,actores,compositor,cast_json,keywords`;
  const res = await fetch(url, {
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
    },
  });
  if (!res.ok) throw new Error(`Supabase fetch failed: ${res.status}`);
  const rows = await res.json();
  return rows;
}

async function supabaseUpdate(peliculaId, data) {
  const url = `${SUPA_URL}/rest/v1/enriquecimiento?pelicula_id=eq.${peliculaId}`;
  const res = await fetch(url, {
    method: "PATCH",
    headers: {
      apikey: SUPA_KEY,
      Authorization: `Bearer ${SUPA_KEY}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Supabase PATCH ${res.status}: ${text}`);
  }
}

async function processMovie(movie) {
  console.log(`\n--- ${movie.title} (tmdb:${movie.tmdb}) ---`);

  const [credits, kw] = await Promise.all([
    tmdbFetch(`/movie/${movie.tmdb}/credits`),
    tmdbFetch(`/movie/${movie.tmdb}/keywords`),
  ]);

  // Director(s)
  const directors = credits.crew
    .filter((c) => c.job === "Director")
    .map((c) => c.name);
  const director = directors.join(", ") || null;

  // Compositor
  const composers = credits.crew
    .filter((c) => c.job === "Original Music Composer")
    .map((c) => c.name);
  const compositor = composers.join(", ") || null;

  // Actores (top 5)
  const topCast = credits.cast.slice(0, 5);
  const actores = topCast.map((c) => c.name).join(", ") || null;

  // cast_json (top 15)
  const cast_json = credits.cast.slice(0, 15).map((c) => ({
    name: c.name,
    character: c.character,
    profile_path: c.profile_path,
  }));

  // Keywords
  const keywords = (kw.keywords || []).map((k) => k.name);

  console.log(`  director: ${director}`);
  console.log(`  compositor: ${compositor}`);
  console.log(`  actores: ${actores}`);
  console.log(`  cast_json: ${cast_json.length} entries`);
  console.log(`  keywords: ${keywords.length} → ${keywords.slice(0, 5).join(", ")}${keywords.length > 5 ? "..." : ""}`);

  // Build update payload
  const update = {};
  // Always update these fields for the 10 movies tonight
  if (director) update.director = director;
  if (compositor) update.compositor = compositor;
  if (actores) update.actores = actores;
  update.cast_json = cast_json;
  update.keywords = keywords;

  await supabaseUpdate(movie.id, update);
  console.log(`  ✓ Updated in Supabase`);

  return { title: movie.title, director, compositor, actores, castCount: cast_json.length, keywordsCount: keywords.length };
}

async function main() {
  console.log("=== Enrichment script for 10 movies ===\n");

  // Check current state
  const allRows = await fetchCurrentRows();
  console.log("Current state check:");
  for (const movie of MOVIES) {
    const row = allRows.find((r) => r.pelicula_id?.startsWith(movie.id.slice(0, 8)));
    if (row) {
      const missing = [];
      if (!row.cast_json) missing.push("cast_json");
      if (!row.keywords || (Array.isArray(row.keywords) && row.keywords.length === 0)) missing.push("keywords");
      if (!row.compositor || row.compositor === "Unknown") missing.push("compositor");
      console.log(`  ${movie.title}: ${missing.length ? "MISSING: " + missing.join(", ") : "has data (will re-enrich anyway)"}`);
    } else {
      console.log(`  ${movie.title}: NO enriquecimiento row found`);
    }
  }

  // Process all movies
  const results = [];
  for (const movie of MOVIES) {
    try {
      const r = await processMovie(movie);
      results.push(r);
    } catch (err) {
      console.error(`  ✗ Error: ${err.message}`);
      results.push({ title: movie.title, error: err.message });
    }
  }

  console.log("\n=== Summary ===");
  for (const r of results) {
    if (r.error) {
      console.log(`  ✗ ${r.title}: ${r.error}`);
    } else {
      console.log(`  ✓ ${r.title}: dir=${r.director}, comp=${r.compositor}, cast=${r.castCount}, kw=${r.keywordsCount}`);
    }
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
