-- 20260416130000_mapping_issues_view.sql
-- View `mapping_issues`: per actief project detecteer mapping_config-problemen die
-- anders silent-€0 veroorzaken of inbound_service metrics leeg laten.
--
-- RLS: view erft rechten van de onderliggende tabellen (`projects`, `call_records`).
-- Daardoor is dit alleen leesbaar door admin/superadmin-rollen (zelfde policies).

CREATE OR REPLACE VIEW public.mapping_issues AS
WITH project_data AS (
  SELECT
    p.id AS project_id,
    p.name,
    p.basicall_project_id,
    p.project_type,
    p.mapping_config->>'amount_col' AS amount_col,
    p.mapping_config->>'freq_col' AS freq_col,
    COALESCE(p.mapping_config->'sale_results', '[]'::jsonb) AS sale_results,
    COALESCE(p.mapping_config->'handled_results', '[]'::jsonb) AS handled_results,
    COALESCE(p.mapping_config->'retention_results', '[]'::jsonb) AS retention_results,
    COALESCE(p.mapping_config->'lost_results', '[]'::jsonb) AS lost_results,
    (SELECT COUNT(*) FROM call_records cr WHERE cr.project_id = p.id) AS record_count
  FROM projects p
  WHERE p.is_active
),
sample_keys AS (
  SELECT
    pd.project_id,
    ARRAY(
      SELECT DISTINCT k
      FROM call_records cr,
           LATERAL jsonb_object_keys(cr.raw_data) k
      WHERE cr.project_id = pd.project_id
      LIMIT 200
    ) AS keys
  FROM project_data pd
  WHERE pd.record_count > 0
),
recent_results AS (
  SELECT pd.project_id,
    ARRAY(
      SELECT DISTINCT cr.resultaat
      FROM call_records cr
      WHERE cr.project_id = pd.project_id
        AND cr.synced_at > now() - interval '60 days'
    ) AS results
  FROM project_data pd
)
SELECT pd.project_id, pd.name, pd.basicall_project_id, pd.project_type,
       'amount_col_missing'::text AS issue_type,
       'Bedrag-veld "' || pd.amount_col || '" komt niet voor in de records van dit project.' AS issue_message
FROM project_data pd
LEFT JOIN sample_keys sk USING (project_id)
WHERE pd.record_count > 0
  AND pd.amount_col IS NOT NULL AND pd.amount_col <> ''
  AND NOT (COALESCE(sk.keys, ARRAY[]::text[]) @> ARRAY[pd.amount_col])

UNION ALL
SELECT pd.project_id, pd.name, pd.basicall_project_id, pd.project_type,
       'freq_col_missing',
       'Frequentie-veld "' || pd.freq_col || '" komt niet voor in de records van dit project.'
FROM project_data pd
LEFT JOIN sample_keys sk USING (project_id)
WHERE pd.record_count > 0
  AND pd.freq_col IS NOT NULL AND pd.freq_col <> ''
  AND NOT (COALESCE(sk.keys, ARRAY[]::text[]) @> ARRAY[pd.freq_col])

UNION ALL
SELECT pd.project_id, pd.name, pd.basicall_project_id, pd.project_type,
       'no_sale_hits',
       'Geen enkele resultaat-waarde uit sale_results komt voor in records van laatste 60 dagen.'
FROM project_data pd
LEFT JOIN recent_results rr USING (project_id)
WHERE pd.project_type = 'outbound'
  AND pd.record_count > 0
  AND jsonb_array_length(pd.sale_results) > 0
  AND NOT (COALESCE(rr.results, ARRAY[]::text[]) && ARRAY(SELECT jsonb_array_elements_text(pd.sale_results)))

UNION ALL
SELECT pd.project_id, pd.name, pd.basicall_project_id, pd.project_type,
       'inbound_service_no_handled',
       'inbound_service-project zonder handled_results — afgehandeld-ratio niet berekenbaar.'
FROM project_data pd
WHERE pd.project_type = 'inbound_service'
  AND pd.record_count > 0
  AND jsonb_array_length(pd.handled_results) = 0

UNION ALL
SELECT pd.project_id, pd.name, pd.basicall_project_id, pd.project_type,
       'inbound_no_results',
       'inbound-project zonder retention_results én lost_results — retentie niet berekenbaar.'
FROM project_data pd
WHERE pd.project_type = 'inbound'
  AND pd.record_count > 0
  AND jsonb_array_length(pd.retention_results) = 0
  AND jsonb_array_length(pd.lost_results) = 0
;

COMMENT ON VIEW public.mapping_issues IS
  'Per active project: detected mapping_config problems. Queried by Admin dashboard issues-widget. Permissions inherited from underlying tables (admin/superadmin only).';
