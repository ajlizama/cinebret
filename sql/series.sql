-- =============================================
-- SERIES: tablas principales para TV shows
-- Espeja la estructura de peliculas + enriquecimiento
-- =============================================

-- 1. Tabla principal de series
CREATE TABLE IF NOT EXISTS series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  tmdb_id INT UNIQUE,
  titulo TEXT NOT NULL,
  titulo_ingles TEXT,
  anio_inicio INT,                    -- first_air_date year
  anio_fin INT,                       -- last_air_date year (NULL if still airing)
  nota_imdb DECIMAL(3,1),             -- vote_average from TMDB
  num_temporadas INT,
  num_episodios INT,
  estado TEXT,                        -- 'Returning Series', 'Ended', 'Canceled', 'In Production'
  categoria TEXT,                     -- CineBret custom category
  poster_path TEXT,
  backdrop_path TEXT,
  logo_path TEXT,
  youtube_trailer_key TEXT,
  imdb_id TEXT,
  episode_runtime INT,               -- average episode runtime in minutes
  certification TEXT,                 -- content rating (TV-MA, TV-14, etc.)
  tagline TEXT,
  networks TEXT[],                    -- ['Netflix', 'HBO'] — where it originally airs
  origin_country TEXT[],              -- ['US', 'KR']
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_series_tmdb ON series(tmdb_id);
CREATE INDEX IF NOT EXISTS idx_series_nota ON series(nota_imdb DESC NULLS LAST);
CREATE INDEX IF NOT EXISTS idx_series_categoria ON series(categoria);

-- RLS: public read
ALTER TABLE series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_series" ON series FOR SELECT USING (true);

-- =============================================
-- 2. Enriquecimiento de series
-- =============================================

CREATE TABLE IF NOT EXISTS enriquecimiento_series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  serie_id UUID REFERENCES series(id) ON DELETE CASCADE,
  sinopsis_chilensis TEXT,
  director TEXT,                      -- created by / showrunner
  actores TEXT[],                     -- top 5 actors
  compositor TEXT,
  generos TEXT[],
  keywords TEXT[],
  cast_json JSONB,                    -- [{name, character, profile_path}]
  similar_ids INT[],                  -- tmdb_ids of similar series
  review_autor TEXT,
  es_review_autor BOOLEAN DEFAULT false,
  sello_bret BOOLEAN DEFAULT false,
  video_clip_url TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(serie_id)
);

-- Index
CREATE INDEX IF NOT EXISTS idx_enr_series_serie ON enriquecimiento_series(serie_id);

-- RLS: public read
ALTER TABLE enriquecimiento_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_enr_series" ON enriquecimiento_series FOR SELECT USING (true);

-- =============================================
-- 3. Watch providers para series
-- =============================================

CREATE TABLE IF NOT EXISTS watch_providers_series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  serie_id UUID REFERENCES series(id) ON DELETE CASCADE,
  tmdb_id INT,
  provider_id INT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('flatrate', 'rent', 'buy')),
  platform_key TEXT,
  logo_path TEXT,
  tmdb_link TEXT,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(serie_id, provider_id, provider_type)
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_wp_series_serie ON watch_providers_series(serie_id);
CREATE INDEX IF NOT EXISTS idx_wp_series_platform ON watch_providers_series(platform_key);

-- RLS: public read
ALTER TABLE watch_providers_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_wp_series" ON watch_providers_series FOR SELECT USING (true);

-- =============================================
-- 4. Interacciones de usuario con series
-- =============================================

CREATE TABLE IF NOT EXISTS user_series (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  serie_id UUID REFERENCES series(id) ON DELETE CASCADE,
  visto BOOLEAN DEFAULT false,
  rating DECIMAL(3,1),
  watchlist BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(user_id, serie_id)
);

CREATE INDEX IF NOT EXISTS idx_user_series_user ON user_series(user_id);
CREATE INDEX IF NOT EXISTS idx_user_series_serie ON user_series(serie_id);

ALTER TABLE user_series ENABLE ROW LEVEL SECURITY;
CREATE POLICY "users_own_series" ON user_series FOR ALL USING (auth.uid() = user_id);
