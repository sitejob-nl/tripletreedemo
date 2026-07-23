-- get_project_annual_value matchte uitsluitend sale_results met EXACte gelijkheid.
-- Voor inbound-retentieprojecten is "behouden" echter retention_results ∪
-- partial_success_results met SUBSTRING-match (categorizeInboundResult/matchesAny in
-- statsHelpers.ts). Gevolg: KPI-kaart "Behouden Waarde" toonde €0,00 waar de matrix
-- €300,00 telde (QA-rapport 23-07-2026, punt A2 — Hersenstichting inbound wk30).
-- NB: de matrix-€300 was zelf óók fout (hardcoded ×12-fallback die de freq_map
-- negeerde); de client-fix zit in recordValue.ts/InboundReportMatrix.tsx. Beide paden
-- komen nu uit op bedrag × freq_map (€25 voor Ntermijn "J" = jaarlijks).
-- In-place herschrijving zodat de bedrag×freq-berekening gegarandeerd identiek blijft;
-- alleen het match-predicaat krijgt een inbound-tak.
-- Toegepast op live via MCP apply_migration op 23-07-2026 (annual_value_inbound_behouden_waarde).
DO $do$
DECLARE
  src text;
BEGIN
  SELECT pg_get_functiondef(p.oid) INTO src
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public' AND p.proname = 'get_project_annual_value';

  -- Idempotent: als de inbound-tak er al in zit, niets doen.
  IF position('v_substring_patterns' IN src) > 0 THEN
    RETURN;
  END IF;

  IF position($f$v_flat text;$f$ IN src) = 0 THEN RAISE EXCEPTION 'decl-anker niet gevonden'; END IF;
  src := replace(src, $f$v_flat text;$f$, $f$v_flat text;
  v_project_type text;
  v_substring_patterns text[];$f$);

  IF position($f$SELECT mapping_config INTO v_mapping FROM projects WHERE id = p_project_id;
  IF v_mapping IS NULL THEN RETURN 0; END IF;$f$ IN src) = 0 THEN RAISE EXCEPTION 'mapping-load-anker niet gevonden'; END IF;
  src := replace(src, $f$SELECT mapping_config INTO v_mapping FROM projects WHERE id = p_project_id;
  IF v_mapping IS NULL THEN RETURN 0; END IF;$f$, $f$SELECT mapping_config, project_type::text INTO v_mapping, v_project_type FROM projects WHERE id = p_project_id;
  IF v_mapping IS NULL THEN RETURN 0; END IF;

  -- Inbound (retentie): behouden waarde telt retention_results ∪ partial_success_results
  -- met SUBSTRING-match — mirror van categorizeInboundResult/matchesAny (statsHelpers.ts).
  IF v_project_type = 'inbound' THEN
    SELECT ARRAY(
      SELECT DISTINCT LOWER(TRIM(e.val)) FROM (
        SELECT jsonb_array_elements_text(COALESCE(v_mapping->'retention_results', '[]'::jsonb)) AS val
        UNION ALL
        SELECT jsonb_array_elements_text(COALESCE(v_mapping->'partial_success_results', '[]'::jsonb))
      ) e WHERE TRIM(e.val) <> ''
    ) INTO v_substring_patterns;
    IF v_substring_patterns IS NULL OR array_length(v_substring_patterns, 1) IS NULL THEN
      RETURN 0;
    END IF;
  END IF;$f$);

  IF position($f$WHERE cr.project_id = p_project_id
      AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x)$f$ IN src) = 0 THEN RAISE EXCEPTION 'flat-predicaat niet gevonden'; END IF;
  src := replace(src, $f$WHERE cr.project_id = p_project_id
      AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x)$f$, $f$WHERE cr.project_id = p_project_id
      AND (
        (v_project_type = 'inbound' AND EXISTS (
          SELECT 1 FROM unnest(v_substring_patterns) pat
          WHERE position(pat IN LOWER(TRIM(cr.resultaat))) > 0
        ))
        OR (v_project_type IS DISTINCT FROM 'inbound'
            AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x))
      )$f$);

  IF position($f$WHERE cr.project_id = p_project_id
    AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x)$f$ IN src) = 0 THEN RAISE EXCEPTION 'hoofd-predicaat niet gevonden'; END IF;
  src := replace(src, $f$WHERE cr.project_id = p_project_id
    AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x)$f$, $f$WHERE cr.project_id = p_project_id
    AND (
      (v_project_type = 'inbound' AND EXISTS (
        SELECT 1 FROM unnest(v_substring_patterns) pat
        WHERE position(pat IN LOWER(TRIM(cr.resultaat))) > 0
      ))
      OR (v_project_type IS DISTINCT FROM 'inbound'
          AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x))
    )$f$);

  EXECUTE src;
END
$do$;
