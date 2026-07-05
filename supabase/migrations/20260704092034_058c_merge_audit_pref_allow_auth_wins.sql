ALTER TABLE public.merge_audit_log
  DROP CONSTRAINT IF EXISTS merge_audit_log_preference_check;

ALTER TABLE public.merge_audit_log
  ADD CONSTRAINT merge_audit_log_preference_check
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
