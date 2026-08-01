-- Enforce one active authenticated association for a device/user pair.
--
-- Operational prerequisite: the approved cleanup has already superseded the
-- duplicate legacy rows in staging. This migration intentionally performs no
-- data repair and does not touch game-state payloads.
CREATE UNIQUE INDEX IF NOT EXISTS uq_device_bindings_active_authenticated_pair
  ON public.device_bindings (device_id, user_id)
  WHERE binding_type = 'authenticated_association'
    AND status = 'active';
