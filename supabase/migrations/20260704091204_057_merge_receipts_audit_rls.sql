-- Migration 057: fix merge_receipts + merge_audit_log RLS policies
DROP POLICY IF EXISTS "Service role full access" ON public.merge_receipts;
CREATE POLICY "Service role full access on merge_receipts"
  ON public.merge_receipts
  FOR ALL
  USING (auth.role() = 'service_role')
  WITH CHECK (auth.role() = 'service_role');

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE schemaname = 'public'
      AND tablename = 'merge_audit_log'
      AND policyname = 'Service role full access on merge_audit_log'
  ) THEN
    CREATE POLICY "Service role full access on merge_audit_log"
      ON public.merge_audit_log
      FOR ALL
      USING (auth.role() = 'service_role')
      WITH CHECK (auth.role() = 'service_role');
  END IF;
END $$;
