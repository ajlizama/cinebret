-- =============================================
-- TEMPORADAS Y EPISODIOS
-- =============================================

CREATE TABLE IF NOT EXISTS temporadas (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  serie_id UUID REFERENCES series(id) ON DELETE CASCADE,
  tmdb_id INT,
  numero INT NOT NULL,
  nombre TEXT,
  sinopsis TEXT,
  poster_path TEXT,
  fecha_estreno DATE,
  num_episodios INT,
  nota_tmdb DECIMAL(3,1),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(serie_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_temporadas_serie ON temporadas(serie_id);

ALTER TABLE temporadas ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_temporadas" ON temporadas FOR SELECT USING (true);

-- =============================================

CREATE TABLE IF NOT EXISTS episodios (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  temporada_id UUID REFERENCES temporadas(id) ON DELETE CASCADE,
  serie_id UUID REFERENCES series(id) ON DELETE CASCADE,
  numero INT NOT NULL,
  nombre TEXT,
  sinopsis TEXT,
  still_path TEXT,
  fecha_estreno DATE,
  runtime INT,
  nota_tmdb DECIMAL(3,1),
  created_at TIMESTAMPTZ DEFAULT now(),
  UNIQUE(temporada_id, numero)
);

CREATE INDEX IF NOT EXISTS idx_episodios_temporada ON episodios(temporada_id);
CREATE INDEX IF NOT EXISTS idx_episodios_serie ON episodios(serie_id);

ALTER TABLE episodios ENABLE ROW LEVEL SECURITY;
CREATE POLICY "public_read_episodios" ON episodios FOR SELECT USING (true);
