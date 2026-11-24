-- Phase 5E helper: allow authenticated users to read their own profile row.
-- Keeps anonymous access denied. Paste into Supabase SQL Editor after 5A.

DROP POLICY IF EXISTS profiles_no_anon ON public.profiles;

CREATE POLICY profiles_deny_anon ON public.profiles
  AS RESTRICTIVE FOR ALL TO anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY profiles_select_own ON public.profiles
  FOR SELECT TO authenticated
  USING (auth_user_id = auth.uid());

GRANT SELECT ON TABLE public.profiles TO authenticated;
