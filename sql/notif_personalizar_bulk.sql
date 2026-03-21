-- Enviar notificación de personalización a usuarios sin preferencias y sin notificación previa
-- Seguro ejecutar múltiples veces: no duplica si ya tienen notificación o ya completaron

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
)
AND NOT EXISTS (
  SELECT 1 FROM notifications n WHERE n.user_id = p.user_id AND n.type = 'personalizar'
);
