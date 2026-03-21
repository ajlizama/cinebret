-- Tabla para comentarios en listas (watchlist/vistas) de otros usuarios
-- Solo entre seguidores mutuos

CREATE TABLE lista_comentarios (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  from_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  to_user_id UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  pelicula_id UUID NOT NULL REFERENCES peliculas(id) ON DELETE CASCADE,
  lista_tipo TEXT NOT NULL CHECK (lista_tipo IN ('watchlist', 'vistas')),
  texto TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE lista_comentarios ENABLE ROW LEVEL SECURITY;

-- Autor o destinatario pueden leer
CREATE POLICY "read_comments" ON lista_comentarios
  FOR SELECT USING (auth.uid() = from_user_id OR auth.uid() = to_user_id);

-- Solo el autor puede insertar
CREATE POLICY "insert_comment" ON lista_comentarios
  FOR INSERT WITH CHECK (auth.uid() = from_user_id);

-- Solo el autor puede borrar su comentario
CREATE POLICY "delete_own_comment" ON lista_comentarios
  FOR DELETE USING (auth.uid() = from_user_id);


-- Agregar columna meta a notifications para guardar redirect y contexto extra
ALTER TABLE notifications ADD COLUMN IF NOT EXISTS meta JSONB;
