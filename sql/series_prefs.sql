-- Add series preference columns to perfil_preferencias
ALTER TABLE perfil_preferencias
ADD COLUMN IF NOT EXISTS series_fav TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS series_generos TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS series_mood_ranking TEXT[] DEFAULT '{}',
ADD COLUMN IF NOT EXISTS series_peso_critica DECIMAL DEFAULT 0.5,
ADD COLUMN IF NOT EXISTS series_peso_seguidores DECIMAL DEFAULT 0.5;
