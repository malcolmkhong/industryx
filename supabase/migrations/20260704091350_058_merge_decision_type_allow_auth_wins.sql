ALTER TABLE public.merge_receipts
  DROP CONSTRAINT IF EXISTS merge_receipts_decision_type_check;

ALTER TABLE public.merge_receipts
  ADD CONSTRAINT merge_receipts_decision_type_check
  CHECK (
    decision_type = ANY (ARRAY[
      'KEEP_GUEST',
      'KEEP_GOOGLE',
      'CANCEL',
      'AUTH_WINS',
      'keep_google',
      'keep_guest'
    ])
  );
