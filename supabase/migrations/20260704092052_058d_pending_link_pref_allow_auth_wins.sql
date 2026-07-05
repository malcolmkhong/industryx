ALTER TABLE public.pending_link_operations
  DROP CONSTRAINT IF EXISTS pending_link_operations_preference_check;

ALTER TABLE public.pending_link_operations
  ADD CONSTRAINT pending_link_operations_preference_check
  CHECK (
    preference IS NULL OR preference = ANY (ARRAY[
      'keep_guest',
      'keep_google',
      'auth_wins',
      'auth_loses',
      'KEEP_GUEST',
      'KEEP_GOOGLE',
      'AUTH_WINS',
      'AUTH_LOSES'
    ])
  );
