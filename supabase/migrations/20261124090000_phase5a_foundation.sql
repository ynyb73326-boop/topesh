-- Phase 5A — TOPESH Work Diary database foundation
-- UI remains on mock localStorage; this migration only defines schema, guards, RLS, and RPCs.

-- ---------------------------------------------------------------------------
-- Extensions
-- ---------------------------------------------------------------------------
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "citext";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------
CREATE TYPE public.app_role AS ENUM ('manager', 'team_leader');
CREATE TYPE public.diary_status AS ENUM ('pending', 'submitted', 'cancelled');

-- ---------------------------------------------------------------------------
-- Catalog / org tables
-- ---------------------------------------------------------------------------
CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT companies_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX companies_name_unique_ci ON public.companies (lower(btrim(name)));

CREATE TABLE public.customers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  -- Nullable until Excel/company links are explicitly confirmed (Phase 5B+).
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT customers_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX customers_name_unique_ci ON public.customers (lower(btrim(name)));
CREATE INDEX customers_company_id_idx ON public.customers (company_id);

CREATE TABLE public.sites (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT sites_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX sites_customer_name_unique_ci
  ON public.sites (customer_id, lower(btrim(name)));
CREATE INDEX sites_customer_id_idx ON public.sites (customer_id);

-- Dual-role people: one human may have multiple profiles (manager + team_leader)
-- sharing the same person_id. Later both rows may share one auth_user_id.
-- Do not invent identity numbers for managers; do not invent company_id links.
CREATE TABLE public.profiles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  person_id uuid NOT NULL DEFAULT gen_random_uuid(),
  auth_user_id uuid NULL,
  full_name text NOT NULL,
  identity_number text NULL,
  phone text NULL,
  email citext NULL,
  company_id uuid REFERENCES public.companies (id) ON DELETE SET NULL,
  role public.app_role NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT profiles_full_name_not_blank CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT profiles_identity_digits_only CHECK (
    identity_number IS NULL OR identity_number ~ '^[0-9]+$'
  ),
  CONSTRAINT profiles_email_not_blank CHECK (email IS NULL OR length(btrim(email::text)) > 0)
);

CREATE UNIQUE INDEX profiles_identity_number_unique
  ON public.profiles (identity_number)
  WHERE identity_number IS NOT NULL;

CREATE UNIQUE INDEX profiles_email_unique
  ON public.profiles (email)
  WHERE email IS NOT NULL;

CREATE UNIQUE INDEX profiles_auth_user_role_unique
  ON public.profiles (auth_user_id, role)
  WHERE auth_user_id IS NOT NULL;

CREATE UNIQUE INDEX profiles_person_role_unique
  ON public.profiles (person_id, role);

CREATE INDEX profiles_company_id_idx ON public.profiles (company_id);
CREATE INDEX profiles_role_idx ON public.profiles (role);
CREATE INDEX profiles_person_id_idx ON public.profiles (person_id);

CREATE TABLE public.technicians (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  full_name text NOT NULL,
  phone text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT technicians_full_name_not_blank CHECK (length(btrim(full_name)) > 0),
  CONSTRAINT technicians_phone_not_blank CHECK (length(btrim(phone)) > 0)
);

CREATE UNIQUE INDEX technicians_name_phone_unique_ci
  ON public.technicians (lower(btrim(full_name)), btrim(phone));

-- Product "Domain" maps to systems (אזעקה / מצלמות / גילוי אש / כריזה).
CREATE TABLE public.systems (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT systems_name_not_blank CHECK (length(btrim(name)) > 0)
);

CREATE UNIQUE INDEX systems_name_unique_ci ON public.systems (lower(btrim(name)));

CREATE TABLE public.components (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  system_id uuid NOT NULL REFERENCES public.systems (id) ON DELETE RESTRICT,
  name text NOT NULL,
  unit text NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT components_name_not_blank CHECK (length(btrim(name)) > 0),
  CONSTRAINT components_unit_not_blank CHECK (length(btrim(unit)) > 0)
);

CREATE UNIQUE INDEX components_system_name_unique_ci
  ON public.components (system_id, lower(btrim(name)));
CREATE INDEX components_system_id_idx ON public.components (system_id);

CREATE TABLE public.checkbox_definitions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  label text NOT NULL,
  sort_order integer NOT NULL,
  is_active boolean NOT NULL DEFAULT true,
  CONSTRAINT checkbox_definitions_label_not_blank CHECK (length(btrim(label)) > 0)
);

CREATE UNIQUE INDEX checkbox_definitions_sort_order_unique
  ON public.checkbox_definitions (sort_order);
CREATE UNIQUE INDEX checkbox_definitions_label_unique_ci
  ON public.checkbox_definitions (lower(btrim(label)));

-- ---------------------------------------------------------------------------
-- Work diaries
-- ---------------------------------------------------------------------------
CREATE TABLE public.work_diaries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_leader_id uuid NOT NULL REFERENCES public.profiles (id) ON DELETE RESTRICT,
  work_date date NOT NULL,
  company_id uuid NOT NULL REFERENCES public.companies (id) ON DELETE RESTRICT,
  customer_id uuid NOT NULL REFERENCES public.customers (id) ON DELETE RESTRICT,
  site_id uuid NOT NULL REFERENCES public.sites (id) ON DELETE RESTRICT,
  sub_site_name text NOT NULL DEFAULT '',
  project_name text NOT NULL DEFAULT '',
  work_order_number text NOT NULL,
  accompanying_technician_id uuid REFERENCES public.technicians (id) ON DELETE SET NULL,
  status public.diary_status NOT NULL DEFAULT 'pending',
  notes text NOT NULL DEFAULT '',
  site_manager_name text NULL,
  site_manager_signature_data_url text NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  submitted_at timestamptz NULL,
  cancelled_at timestamptz NULL,
  duplicated_from_id uuid REFERENCES public.work_diaries (id) ON DELETE SET NULL,
  -- Application flag for UX mapping; clients cannot toggle it (trigger-enforced).
  -- Preferred signature flow keeps status = submitted and uses RPC only.
  signature_capture_only boolean NOT NULL DEFAULT false,
  CONSTRAINT work_diaries_work_order_not_blank CHECK (length(btrim(work_order_number)) > 0),
  CONSTRAINT work_diaries_work_order_length CHECK (char_length(work_order_number) <= 40),
  CONSTRAINT work_diaries_submitted_requires_timestamp CHECK (
    (status = 'submitted' AND submitted_at IS NOT NULL)
    OR (status <> 'submitted')
  ),
  CONSTRAINT work_diaries_cancelled_requires_timestamp CHECK (
    (status = 'cancelled' AND cancelled_at IS NOT NULL)
    OR (status <> 'cancelled')
  )
);

CREATE INDEX work_diaries_team_leader_id_idx ON public.work_diaries (team_leader_id);
CREATE INDEX work_diaries_work_date_idx ON public.work_diaries (work_date);
CREATE INDEX work_diaries_status_idx ON public.work_diaries (status);
CREATE INDEX work_diaries_site_id_idx ON public.work_diaries (site_id);
CREATE INDEX work_diaries_company_id_idx ON public.work_diaries (company_id);
CREATE INDEX work_diaries_customer_id_idx ON public.work_diaries (customer_id);

CREATE TABLE public.work_diary_workers (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id uuid NOT NULL REFERENCES public.work_diaries (id) ON DELETE CASCADE,
  full_name text NOT NULL,
  sort_order integer NOT NULL DEFAULT 0,
  CONSTRAINT work_diary_workers_full_name_not_blank CHECK (length(btrim(full_name)) > 0)
);

CREATE INDEX work_diary_workers_diary_id_idx ON public.work_diary_workers (diary_id);

CREATE TABLE public.work_diary_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id uuid NOT NULL REFERENCES public.work_diaries (id) ON DELETE CASCADE,
  component_id uuid NOT NULL REFERENCES public.components (id) ON DELETE RESTRICT,
  quantity numeric NOT NULL,
  CONSTRAINT work_diary_items_quantity_non_negative CHECK (quantity >= 0),
  CONSTRAINT work_diary_items_diary_component_unique UNIQUE (diary_id, component_id)
);

CREATE INDEX work_diary_items_diary_id_idx ON public.work_diary_items (diary_id);
CREATE INDEX work_diary_items_component_id_idx ON public.work_diary_items (component_id);

CREATE TABLE public.work_diary_checkbox_selections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  diary_id uuid NOT NULL REFERENCES public.work_diaries (id) ON DELETE CASCADE,
  checkbox_id uuid NOT NULL REFERENCES public.checkbox_definitions (id) ON DELETE RESTRICT,
  checked boolean NOT NULL DEFAULT false,
  CONSTRAINT work_diary_checkbox_selections_unique UNIQUE (diary_id, checkbox_id)
);

CREATE INDEX work_diary_checkbox_selections_diary_id_idx
  ON public.work_diary_checkbox_selections (diary_id);

-- ---------------------------------------------------------------------------
-- Leader-safe projection (no work_order_number / company_id / customer_id)
-- ---------------------------------------------------------------------------
CREATE OR REPLACE VIEW public.work_diaries_for_leader
WITH (security_invoker = true) AS
SELECT
  id,
  team_leader_id,
  work_date,
  site_id,
  sub_site_name,
  project_name,
  accompanying_technician_id,
  status,
  notes,
  site_manager_name,
  site_manager_signature_data_url,
  created_at,
  submitted_at,
  cancelled_at,
  duplicated_from_id,
  signature_capture_only
FROM public.work_diaries;

COMMENT ON VIEW public.work_diaries_for_leader IS
  'Team-leader safe diary projection. Intentionally omits work_order_number, company_id, and customer_id.';

-- ---------------------------------------------------------------------------
-- Mutation helpers / guards
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.app_mutation_mode()
RETURNS text
LANGUAGE sql
STABLE
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(nullif(current_setting('app.mutation_mode', true), ''), 'none');
$$;

CREATE OR REPLACE FUNCTION public.app_require_service_or_authenticated()
RETURNS void
LANGUAGE plpgsql
STABLE
SET search_path = pg_catalog, public
AS $$
BEGIN
  -- Phase 5A: no end-user Auth yet. Allow postgres/service_role bootstrapping only.
  -- When auth.uid() is present (Phase 5E), callers must still pass role checks in each RPC.
  IF auth.uid() IS NOT NULL THEN
    RETURN;
  END IF;

  IF current_user IN ('postgres', 'supabase_admin', 'service_role')
     OR session_user IN ('postgres', 'supabase_admin') THEN
    RETURN;
  END IF;

  RAISE EXCEPTION 'not authorized'
    USING ERRCODE = '42501';
END;
$$;

CREATE OR REPLACE FUNCTION public.app_current_profile_ids()
RETURNS uuid[]
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
  SELECT coalesce(array_agg(p.id), ARRAY[]::uuid[])
  FROM public.profiles p
  WHERE p.auth_user_id = auth.uid()
    AND p.is_active;
$$;

CREATE OR REPLACE FUNCTION public.work_diaries_enforce_imutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  mode text := public.app_mutation_mode();
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.status <> 'pending' THEN
      RAISE EXCEPTION 'only pending diaries may be deleted'
        USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    -- Clients must not toggle control flags or timestamps except via RPCs.
    IF mode = 'none' THEN
      IF NEW.signature_capture_only IS DISTINCT FROM OLD.signature_capture_only
         OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
         OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
         OR NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'status and control fields are RPC-managed only'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF mode = 'submit' THEN
      RETURN NEW;
    END IF;

    IF mode = 'cancel' THEN
      RETURN NEW;
    END IF;

    IF mode = 'signature_update' THEN
      IF OLD.status <> 'submitted' THEN
        RAISE EXCEPTION 'signature update requires a submitted diary'
          USING ERRCODE = 'P0001';
      END IF;
      IF NEW.status IS DISTINCT FROM OLD.status
         OR NEW.team_leader_id IS DISTINCT FROM OLD.team_leader_id
         OR NEW.work_date IS DISTINCT FROM OLD.work_date
         OR NEW.company_id IS DISTINCT FROM OLD.company_id
         OR NEW.customer_id IS DISTINCT FROM OLD.customer_id
         OR NEW.site_id IS DISTINCT FROM OLD.site_id
         OR NEW.sub_site_name IS DISTINCT FROM OLD.sub_site_name
         OR NEW.project_name IS DISTINCT FROM OLD.project_name
         OR NEW.work_order_number IS DISTINCT FROM OLD.work_order_number
         OR NEW.accompanying_technician_id IS DISTINCT FROM OLD.accompanying_technician_id
         OR NEW.notes IS DISTINCT FROM OLD.notes
         OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
         OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
         OR NEW.duplicated_from_id IS DISTINCT FROM OLD.duplicated_from_id
         OR NEW.signature_capture_only IS DISTINCT FROM OLD.signature_capture_only
         OR NEW.created_at IS DISTINCT FROM OLD.created_at THEN
        RAISE EXCEPTION 'signature update may only change signature fields'
          USING ERRCODE = 'P0001';
      END IF;
      RETURN NEW;
    END IF;

    -- Ordinary updates: pending only; never rewrite submitted/cancelled content.
    IF OLD.status <> 'pending' OR NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'submitted or cancelled diaries are immutable'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

CREATE TRIGGER work_diaries_imutability
  BEFORE UPDATE OR DELETE ON public.work_diaries
  FOR EACH ROW
  EXECUTE FUNCTION public.work_diaries_enforce_imutability();

CREATE OR REPLACE FUNCTION public.work_diary_children_enforce_imutability()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  parent_status public.diary_status;
  diary uuid;
BEGIN
  diary := CASE WHEN TG_OP = 'DELETE' THEN OLD.diary_id ELSE NEW.diary_id END;

  SELECT d.status INTO parent_status
  FROM public.work_diaries d
  WHERE d.id = diary
  FOR UPDATE;

  IF parent_status IS NULL THEN
    RAISE EXCEPTION 'diary not found'
      USING ERRCODE = 'P0001';
  END IF;

  IF parent_status <> 'pending' THEN
    RAISE EXCEPTION 'cannot modify children of a non-pending diary'
      USING ERRCODE = 'P0001';
  END IF;

  IF TG_OP = 'DELETE' THEN
    RETURN OLD;
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_diary_workers_imutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_diary_workers
  FOR EACH ROW
  EXECUTE FUNCTION public.work_diary_children_enforce_imutability();

CREATE TRIGGER work_diary_items_imutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_diary_items
  FOR EACH ROW
  EXECUTE FUNCTION public.work_diary_children_enforce_imutability();

CREATE TRIGGER work_diary_checkbox_selections_imutability
  BEFORE INSERT OR UPDATE OR DELETE ON public.work_diary_checkbox_selections
  FOR EACH ROW
  EXECUTE FUNCTION public.work_diary_children_enforce_imutability();

-- Team leader assignment must use a team_leader profile.
CREATE OR REPLACE FUNCTION public.work_diaries_enforce_leader_role()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = pg_catalog, public
AS $$
DECLARE
  leader_role public.app_role;
BEGIN
  SELECT p.role INTO leader_role
  FROM public.profiles p
  WHERE p.id = NEW.team_leader_id;

  IF leader_role IS DISTINCT FROM 'team_leader' THEN
    RAISE EXCEPTION 'team_leader_id must reference a team_leader profile'
      USING ERRCODE = 'P0001';
  END IF;
  RETURN NEW;
END;
$$;

CREATE TRIGGER work_diaries_leader_role
  BEFORE INSERT OR UPDATE OF team_leader_id ON public.work_diaries
  FOR EACH ROW
  EXECUTE FUNCTION public.work_diaries_enforce_leader_role();

-- ---------------------------------------------------------------------------
-- Secure RPCs
-- ---------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.submit_work_diary(p_diary_id uuid)
RETURNS public.work_diaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row public.work_diaries;
  caller_profiles uuid[];
BEGIN
  PERFORM public.app_require_service_or_authenticated();

  SELECT * INTO row
  FROM public.work_diaries d
  WHERE d.id = p_diary_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'diary not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    caller_profiles := public.app_current_profile_ids();
    IF NOT (row.team_leader_id = ANY (caller_profiles)) THEN
      -- Managers (Phase 5E) may also submit via manager RPC; for now require ownership
      -- or service role. Allow manager profiles once Auth exists:
      IF NOT EXISTS (
        SELECT 1
        FROM public.profiles p
        WHERE p.id = ANY (caller_profiles)
          AND p.role = 'manager'
          AND p.is_active
      ) THEN
        RAISE EXCEPTION 'not authorized to submit this diary'
          USING ERRCODE = '42501';
      END IF;
    END IF;
  END IF;

  IF row.status <> 'pending' THEN
    RAISE EXCEPTION 'only pending diaries can be submitted'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.mutation_mode', 'submit', true);

  UPDATE public.work_diaries d
  SET
    status = 'submitted',
    submitted_at = now(),
    signature_capture_only = false,
    cancelled_at = NULL
  WHERE d.id = p_diary_id
  RETURNING * INTO row;

  PERFORM set_config('app.mutation_mode', 'none', true);
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.update_work_diary_signature(
  p_diary_id uuid,
  p_site_manager_name text,
  p_site_manager_signature_data_url text
)
RETURNS public.work_diaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row public.work_diaries;
  caller_profiles uuid[];
BEGIN
  PERFORM public.app_require_service_or_authenticated();

  SELECT * INTO row
  FROM public.work_diaries d
  WHERE d.id = p_diary_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'diary not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    caller_profiles := public.app_current_profile_ids();
    IF NOT (row.team_leader_id = ANY (caller_profiles))
       AND NOT EXISTS (
         SELECT 1 FROM public.profiles p
         WHERE p.id = ANY (caller_profiles) AND p.role = 'manager' AND p.is_active
       ) THEN
      RAISE EXCEPTION 'not authorized to update signature'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF row.status <> 'submitted' THEN
    RAISE EXCEPTION 'signature update requires a submitted diary'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.mutation_mode', 'signature_update', true);

  UPDATE public.work_diaries d
  SET
    site_manager_name = nullif(btrim(p_site_manager_name), ''),
    site_manager_signature_data_url = nullif(btrim(p_site_manager_signature_data_url), '')
  WHERE d.id = p_diary_id
  RETURNING * INTO row;

  PERFORM set_config('app.mutation_mode', 'none', true);
  RETURN row;
END;
$$;

CREATE OR REPLACE FUNCTION public.cancel_work_diary(p_diary_id uuid)
RETURNS public.work_diaries
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public
AS $$
DECLARE
  row public.work_diaries;
  caller_profiles uuid[];
BEGIN
  PERFORM public.app_require_service_or_authenticated();

  SELECT * INTO row
  FROM public.work_diaries d
  WHERE d.id = p_diary_id
  FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'diary not found'
      USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    caller_profiles := public.app_current_profile_ids();
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = ANY (caller_profiles) AND p.role = 'manager' AND p.is_active
    ) THEN
      RAISE EXCEPTION 'not authorized to cancel diary'
        USING ERRCODE = '42501';
    END IF;
  END IF;

  IF row.status = 'cancelled' THEN
    RAISE EXCEPTION 'diary already cancelled'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.mutation_mode', 'cancel', true);

  UPDATE public.work_diaries d
  SET
    status = 'cancelled',
    cancelled_at = now(),
    signature_capture_only = false
  WHERE d.id = p_diary_id
  RETURNING * INTO row;

  PERFORM set_config('app.mutation_mode', 'none', true);
  RETURN row;
END;
$$;

-- ---------------------------------------------------------------------------
-- RLS foundations — deny by default for anon/authenticated
-- ---------------------------------------------------------------------------
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sites ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.technicians ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.systems ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.components ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.checkbox_definitions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_diaries ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_diary_workers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_diary_items ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.work_diary_checkbox_selections ENABLE ROW LEVEL SECURITY;

-- Explicit deny policies for documentation; absence of allow policies already blocks.
CREATE POLICY companies_no_anon ON public.companies
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY customers_no_anon ON public.customers
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY sites_no_anon ON public.sites
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY profiles_no_anon ON public.profiles
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY technicians_no_anon ON public.technicians
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY systems_no_anon ON public.systems
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY components_no_anon ON public.components
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY checkbox_definitions_no_anon ON public.checkbox_definitions
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY work_diaries_no_anon ON public.work_diaries
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY work_diary_workers_no_anon ON public.work_diary_workers
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY work_diary_items_no_anon ON public.work_diary_items
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

CREATE POLICY work_diary_checkbox_selections_no_anon ON public.work_diary_checkbox_selections
  AS RESTRICTIVE FOR ALL TO anon, authenticated
  USING (false) WITH CHECK (false);

-- ---------------------------------------------------------------------------
-- Privileges — revoke PUBLIC / client roles; service_role retains access
-- ---------------------------------------------------------------------------
REVOKE ALL ON TABLE public.companies FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.customers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.sites FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.profiles FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.technicians FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.systems FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.components FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.checkbox_definitions FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_diaries FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_diary_workers FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_diary_items FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_diary_checkbox_selections FROM PUBLIC, anon, authenticated;
REVOKE ALL ON TABLE public.work_diaries_for_leader FROM PUBLIC, anon, authenticated;

GRANT ALL ON TABLE public.companies TO service_role;
GRANT ALL ON TABLE public.customers TO service_role;
GRANT ALL ON TABLE public.sites TO service_role;
GRANT ALL ON TABLE public.profiles TO service_role;
GRANT ALL ON TABLE public.technicians TO service_role;
GRANT ALL ON TABLE public.systems TO service_role;
GRANT ALL ON TABLE public.components TO service_role;
GRANT ALL ON TABLE public.checkbox_definitions TO service_role;
GRANT ALL ON TABLE public.work_diaries TO service_role;
GRANT ALL ON TABLE public.work_diary_workers TO service_role;
GRANT ALL ON TABLE public.work_diary_items TO service_role;
GRANT ALL ON TABLE public.work_diary_checkbox_selections TO service_role;
GRANT SELECT ON TABLE public.work_diaries_for_leader TO service_role;

REVOKE ALL ON FUNCTION public.submit_work_diary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.update_work_diary_signature(uuid, text, text) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.cancel_work_diary(uuid) FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_mutation_mode() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_require_service_or_authenticated() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.app_current_profile_ids() FROM PUBLIC;

GRANT EXECUTE ON FUNCTION public.submit_work_diary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.update_work_diary_signature(uuid, text, text) TO service_role;
GRANT EXECUTE ON FUNCTION public.cancel_work_diary(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.app_current_profile_ids() TO service_role;

-- authenticated/anon intentionally have NO EXECUTE on workflow RPCs in Phase 5A.
