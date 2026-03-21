-- Tabla de preferencias de perfil para el sistema de recomendaciones
CREATE TABLE perfil_preferencias (
  user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  birth_year INT,
  fav_movies UUID[] DEFAULT '{}',
  generos_preferidos TEXT[] DEFAULT '{}',
  mood_ranking TEXT[] DEFAULT '{}',
  peso_critica FLOAT DEFAULT 0.5,
  peso_seguidores FLOAT DEFAULT 0.5,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE perfil_preferencias ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_preferences" ON perfil_preferencias
  FOR ALL
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "read_preferences" ON perfil_preferencias
  FOR SELECT
  USING (true);
