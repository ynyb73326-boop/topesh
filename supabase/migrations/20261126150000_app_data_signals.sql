-- Live UI invalidation: authenticated clients listen via Realtime;
-- service_role bumps the singleton after successful mutations.

CREATE TABLE public.app_data_signals (
  id smallint PRIMARY KEY DEFAULT 1 CHECK (id = 1),
  revision bigint NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

INSERT INTO public.app_data_signals (id, revision)
VALUES (1, 0)
ON CONFLICT (id) DO NOTHING;

CREATE OR REPLACE FUNCTION public.bump_app_data_signal()
RETURNS void
LANGUAGE sql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  INSERT INTO public.app_data_signals (id, revision, updated_at)
  VALUES (1, 1, now())
  ON CONFLICT (id) DO UPDATE
  SET
    revision = public.app_data_signals.revision + 1,
    updated_at = now();
$$;

REVOKE ALL ON FUNCTION public.bump_app_data_signal() FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.bump_app_data_signal() TO service_role;

ALTER TABLE public.app_data_signals ENABLE ROW LEVEL SECURITY;

CREATE POLICY app_data_signals_deny_anon ON public.app_data_signals
  AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY app_data_signals_select_authenticated ON public.app_data_signals
  FOR SELECT TO authenticated
  USING (true);

REVOKE ALL ON TABLE public.app_data_signals FROM PUBLIC, anon, authenticated;
GRANT SELECT ON TABLE public.app_data_signals TO authenticated;
GRANT ALL ON TABLE public.app_data_signals TO service_role;

DO $$
BEGIN
  ALTER PUBLICATION supabase_realtime ADD TABLE public.app_data_signals;
EXCEPTION
  WHEN duplicate_object THEN
    NULL;
END $$;
