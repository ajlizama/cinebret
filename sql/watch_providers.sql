-- Watch providers table: stores TMDB watch/providers data for Chile
-- Enables deep links to streaming platforms

CREATE TABLE IF NOT EXISTS watch_providers (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  pelicula_id UUID REFERENCES peliculas(id) ON DELETE CASCADE,
  tmdb_id INT,
  provider_id INT NOT NULL,
  provider_name TEXT NOT NULL,
  provider_type TEXT NOT NULL CHECK (provider_type IN ('flatrate', 'rent', 'buy')),
  platform_key TEXT, -- maps to our platform keys: netflix, disney_plus, etc.
  logo_path TEXT,
  tmdb_link TEXT, -- JustWatch redirect link
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(pelicula_id, provider_id, provider_type)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_watch_providers_pelicula ON watch_providers(pelicula_id);
CREATE INDEX IF NOT EXISTS idx_watch_providers_platform ON watch_providers(platform_key);

-- RLS: public read
ALTER TABLE watch_providers ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_watch_providers" ON watch_providers FOR SELECT USING (true);

-- =============================================
-- User platforms: stores which platforms each user has subscribed to
-- =============================================

-- Add column to existing perfil_preferencias table
ALTER TABLE perfil_preferencias
ADD COLUMN IF NOT EXISTS plataformas_usuario TEXT[] DEFAULT '{}';

-- This stores an array like: {'netflix', 'disney_plus', 'mubi'}
-- Used to filter catalog and recommendations to only show content
-- the user can actually watch right now.
