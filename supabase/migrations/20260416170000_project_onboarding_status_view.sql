-- project_onboarding_status: per actief project de 6 onboarding-checkpoints als boolean.
-- Bedoeld om admin te helpen bij self-service onboarding van nieuwe projecten
-- (Amazone kinderen + Omroep MAX zijn de eerste echte cases — zie handover).
--
-- Checkpoints:
--   has_token         - project_secrets.basicall_token is gevuld
--   has_mapping       - amount_col EN freq_col ingevuld EN minstens 1 sale_result
--   has_records       - call_records voor dit project bestaan
--   has_batch         - minstens 1 batch gekoppeld (optioneel voor voorraad-KPI)
--   has_customer      - minstens 1 klant gekoppeld via customer_projects
--   has_recent_sync   - sync_logs met status=success in afgelopen 48u
--
-- is_incomplete = TRUE zodra een van de eerste 3 (kritieke) checkpoints faalt.
-- has_batch + has_customer + has_recent_sync zijn "nice-to-have" — niet in is_incomplete meegenomen.

CREATE OR REPLACE VIEW public.project_onboarding_status AS
SELECT
  p.id AS project_id,
  p.name,
  p.basicall_project_id,
  p.project_type,
  p.is_active,
  EXISTS (
    SELECT 1 FROM public.project_secrets ps
    WHERE ps.project_id = p.id
      AND ps.basicall_token IS NOT NULL
      AND length(ps.basicall_token) > 0
  ) AS has_token,
  (
    p.mapping_config IS NOT NULL
    AND coalesce(p.mapping_config->>'amount_col', '') <> ''
    AND coalesce(p.mapping_config->>'freq_col', '') <> ''
    AND jsonb_typeof(p.mapping_config->'sale_results') = 'array'
    AND jsonb_array_length(p.mapping_config->'sale_results') > 0
  ) AS has_mapping,
  EXISTS (
    SELECT 1 FROM public.call_records cr WHERE cr.project_id = p.id LIMIT 1
  ) AS has_records,
  EXISTS (
    SELECT 1 FROM public.batches b WHERE b.project_id = p.id LIMIT 1
  ) AS has_batch,
  EXISTS (
    SELECT 1 FROM public.customer_projects cp WHERE cp.project_id = p.id LIMIT 1
  ) AS has_customer,
  EXISTS (
    SELECT 1 FROM public.sync_logs sl
    WHERE sl.project_id = p.id
      AND sl.status = 'success'
      AND sl.completed_at > now() - interval '48 hours'
    LIMIT 1
  ) AS has_recent_sync,
  (
    -- Kritieke checkpoints: alle 3 moeten waar zijn voor een werkend project
    NOT EXISTS (
      SELECT 1 FROM public.project_secrets ps
      WHERE ps.project_id = p.id
        AND ps.basicall_token IS NOT NULL
        AND length(ps.basicall_token) > 0
    )
    OR NOT (
      p.mapping_config IS NOT NULL
      AND coalesce(p.mapping_config->>'amount_col', '') <> ''
      AND coalesce(p.mapping_config->>'freq_col', '') <> ''
      AND jsonb_typeof(p.mapping_config->'sale_results') = 'array'
      AND jsonb_array_length(p.mapping_config->'sale_results') > 0
    )
    OR NOT EXISTS (
      SELECT 1 FROM public.call_records cr WHERE cr.project_id = p.id LIMIT 1
    )
  ) AS is_incomplete
FROM public.projects p
WHERE p.is_active = TRUE;

-- RLS is niet van toepassing op views, maar onderliggende tables hebben admin/superadmin-only policies
-- voor project_secrets/sync_logs. Reguliere users krijgen via de join een leeg resultaat.
-- Als we willen dat alleen admins deze view lezen, zetten we een SELECT grant:
REVOKE ALL ON public.project_onboarding_status FROM PUBLIC;
GRANT SELECT ON public.project_onboarding_status TO authenticated;

COMMENT ON VIEW public.project_onboarding_status IS
  'Per actief project de onboarding-checkpoints (has_token, has_mapping, has_records, has_batch, has_customer, has_recent_sync). is_incomplete=true als een van de 3 kritieke checkpoints faalt. Gebruikt door admin-dashboard onboarding-widget.';
