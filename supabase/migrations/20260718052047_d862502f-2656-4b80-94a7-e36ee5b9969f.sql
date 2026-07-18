-- Drop any existing SELECT policies on system_alerts and replace with strict owner-only
DO $$
DECLARE pol RECORD;
BEGIN
  FOR pol IN
    SELECT policyname FROM pg_policies WHERE schemaname='public' AND tablename='system_alerts' AND cmd='SELECT'
  LOOP
    EXECUTE format('DROP POLICY IF EXISTS %I ON public.system_alerts', pol.policyname);
  END LOOP;
END $$;

CREATE POLICY "Users read their own alerts"
ON public.system_alerts
FOR SELECT
TO authenticated
USING (auth.uid() = user_id);