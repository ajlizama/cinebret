-- Enviar notificación de personalización a todos los usuarios que aún no completaron su perfil de preferencias
-- Ejecutar una sola vez en Supabase Dashboard > SQL Editor

INSERT INTO notifications (user_id, type, from_user_id, read, created_at)
SELECT
  p.user_id,
  'personalizar',
  NULL,
  false,
  NOW()
FROM profiles p
WHERE NOT EXISTS (
  SELECT 1 FROM perfil_preferencias pp WHERE pp.user_id = p.user_id
);
