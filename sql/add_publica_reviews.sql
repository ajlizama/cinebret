-- Agregar columna publica a user_reviews
-- Reseñas existentes quedan como privadas (false)
ALTER TABLE user_reviews ADD COLUMN IF NOT EXISTS publica boolean NOT NULL DEFAULT false;

-- Actualizar política de lectura: público ve todas las públicas,
-- usuario autenticado también ve las privadas de quienes sigue y las propias
DROP POLICY IF EXISTS "user_reviews_select" ON user_reviews;
DROP POLICY IF EXISTS "reviews_select_policy" ON user_reviews;

CREATE POLICY "user_reviews_select" ON user_reviews FOR SELECT
USING (
  publica = true
  OR auth.uid() = user_id
  OR EXISTS (
    SELECT 1 FROM follows
    WHERE follower_id = auth.uid() AND following_id = user_reviews.user_id
  )
);
