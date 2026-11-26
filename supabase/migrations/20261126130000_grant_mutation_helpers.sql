-- Triggers on work_diaries call app_mutation_mode() as the invoking role.
-- Phase 5A revoked PUBLIC execute but never granted service_role, so every
-- ordinary diary UPDATE (notes / signature fields) failed with 42501 and
-- leader draft/submit appeared as a generic "invalid quantities" error.

GRANT EXECUTE ON FUNCTION public.app_mutation_mode() TO service_role;
GRANT EXECUTE ON FUNCTION public.app_require_service_or_authenticated() TO service_role;
