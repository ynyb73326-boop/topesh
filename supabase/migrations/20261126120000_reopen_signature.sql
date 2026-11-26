-- Allow manager to reopen a submitted diary for signature-only capture
-- (matches existing app UX: pending + signature_capture_only).

CREATE OR REPLACE FUNCTION public.reopen_work_diary_for_signature(p_diary_id uuid)
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
    RAISE EXCEPTION 'diary not found' USING ERRCODE = 'P0002';
  END IF;

  IF auth.uid() IS NOT NULL THEN
    caller_profiles := public.app_current_profile_ids();
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles p
      WHERE p.id = ANY (caller_profiles) AND p.role = 'manager' AND p.is_active
    ) THEN
      RAISE EXCEPTION 'not authorized' USING ERRCODE = '42501';
    END IF;
  END IF;

  IF row.status <> 'submitted' THEN
    RAISE EXCEPTION 'only submitted diaries can be reopened for signature'
      USING ERRCODE = 'P0001';
  END IF;

  PERFORM set_config('app.mutation_mode', 'reopen_signature', true);

  UPDATE public.work_diaries d
  SET
    status = 'pending',
    submitted_at = NULL,
    signature_capture_only = true,
    cancelled_at = NULL
  WHERE d.id = p_diary_id
  RETURNING * INTO row;

  PERFORM set_config('app.mutation_mode', 'none', true);
  RETURN row;
END;
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
      RAISE EXCEPTION 'only pending diaries may be deleted' USING ERRCODE = 'P0001';
    END IF;
    RETURN OLD;
  END IF;

  IF TG_OP = 'UPDATE' THEN
    IF mode = 'none' THEN
      IF NEW.signature_capture_only IS DISTINCT FROM OLD.signature_capture_only
         OR NEW.submitted_at IS DISTINCT FROM OLD.submitted_at
         OR NEW.cancelled_at IS DISTINCT FROM OLD.cancelled_at
         OR NEW.status IS DISTINCT FROM OLD.status THEN
        RAISE EXCEPTION 'status and control fields are RPC-managed only'
          USING ERRCODE = 'P0001';
      END IF;
    END IF;

    IF mode IN ('submit', 'cancel', 'reopen_signature', 'signature_update') THEN
      RETURN NEW;
    END IF;

    IF OLD.status <> 'pending' OR NEW.status <> 'pending' THEN
      RAISE EXCEPTION 'submitted or cancelled diaries are immutable'
        USING ERRCODE = 'P0001';
    END IF;

    RETURN NEW;
  END IF;

  RETURN NEW;
END;
$$;

REVOKE ALL ON FUNCTION public.reopen_work_diary_for_signature(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.reopen_work_diary_for_signature(uuid) TO service_role;
