-- Dicht het cross-tenant metadata-lek in twee admin-views.
--
-- project_onboarding_status en mapping_issues zijn SECURITY DEFINER views die GESELECT konden
-- worden door anon + authenticated, zonder enige tenant-filter — elke client (ook met de publieke
-- anon-key) kon metadata van ALLE actieve projecten lezen: projectnamen, basicall_project_id,
-- project_type, onboarding-status en resultaat-codes. Het zijn admin-onboarding-tools, dus we
-- gaten ze op has_role(admin/superadmin) en trekken de anon-grant in.
--
-- NB: ze blijven bewust SECURITY DEFINER. project_onboarding_status leest project_secrets
-- (default-deny, alleen service_role) voor de has_token-vlag; security_invoker=on zou die kolom
-- voor iedereen leegmaken. De Supabase 0010-lint blijft deze views daarom flaggen, maar het
-- cross-tenant-gat is dicht door de rol-gate + anon-revoke.
--
-- Geverifieerd na toepassen (2026-06-01):
--   * zonder auth-context: 0 rijen (was 23 / 18)
--   * als ingelogde admin: 23 / 18 rijen (admin-UI ongewijzigd)
--   * SELECT op beide views ingetrokken bij anon

CREATE OR REPLACE VIEW public.project_onboarding_status AS
 SELECT p.id AS project_id,
    p.name,
    p.basicall_project_id,
    p.project_type,
    p.is_active,
    (EXISTS ( SELECT 1
           FROM project_secrets ps
          WHERE ps.project_id = p.id AND ps.basicall_token IS NOT NULL AND length(ps.basicall_token) > 0)) AS has_token,
    p.mapping_config IS NOT NULL
      AND COALESCE(p.mapping_config ->> 'amount_col'::text, ''::text) <> ''::text
      AND COALESCE(p.mapping_config ->> 'freq_col'::text, ''::text) <> ''::text
      AND jsonb_typeof(p.mapping_config -> 'sale_results'::text) = 'array'::text
      AND jsonb_array_length(p.mapping_config -> 'sale_results'::text) > 0 AS has_mapping,
    (EXISTS ( SELECT 1
           FROM call_records cr
          WHERE cr.project_id = p.id
         LIMIT 1)) AS has_records,
    (EXISTS ( SELECT 1
           FROM batches b
          WHERE b.project_id = p.id
         LIMIT 1)) AS has_batch,
    (EXISTS ( SELECT 1
           FROM customer_projects cp
          WHERE cp.project_id = p.id
         LIMIT 1)) AS has_customer,
    (EXISTS ( SELECT 1
           FROM sync_logs sl
          WHERE sl.project_id = p.id AND sl.status = 'success'::text AND sl.completed_at > (now() - '48:00:00'::interval)
         LIMIT 1)) AS has_recent_sync,
    NOT (EXISTS ( SELECT 1
           FROM project_secrets ps
          WHERE ps.project_id = p.id AND ps.basicall_token IS NOT NULL AND length(ps.basicall_token) > 0))
      OR NOT (p.mapping_config IS NOT NULL
          AND COALESCE(p.mapping_config ->> 'amount_col'::text, ''::text) <> ''::text
          AND COALESCE(p.mapping_config ->> 'freq_col'::text, ''::text) <> ''::text
          AND jsonb_typeof(p.mapping_config -> 'sale_results'::text) = 'array'::text
          AND jsonb_array_length(p.mapping_config -> 'sale_results'::text) > 0)
      OR NOT (EXISTS ( SELECT 1
           FROM call_records cr
          WHERE cr.project_id = p.id
         LIMIT 1)) AS is_incomplete
   FROM projects p
  WHERE p.is_active = true
    AND (has_role((SELECT auth.uid()), 'admin'::app_role)
         OR has_role((SELECT auth.uid()), 'superadmin'::app_role));

CREATE OR REPLACE VIEW public.mapping_issues AS
 WITH project_data AS (
         SELECT p.id AS project_id,
            p.name,
            p.basicall_project_id,
            p.project_type,
            p.mapping_config ->> 'amount_col'::text AS amount_col,
            p.mapping_config ->> 'freq_col'::text AS freq_col,
            COALESCE(p.mapping_config -> 'sale_results'::text, '[]'::jsonb) AS sale_results,
            COALESCE(p.mapping_config -> 'handled_results'::text, '[]'::jsonb) AS handled_results,
            COALESCE(p.mapping_config -> 'retention_results'::text, '[]'::jsonb) AS retention_results,
            COALESCE(p.mapping_config -> 'lost_results'::text, '[]'::jsonb) AS lost_results,
            ( SELECT count(*) AS count
                   FROM call_records cr
                  WHERE cr.project_id = p.id) AS record_count
           FROM projects p
          WHERE p.is_active
            AND (has_role((SELECT auth.uid()), 'admin'::app_role)
                 OR has_role((SELECT auth.uid()), 'superadmin'::app_role))
        ), sample_keys AS (
         SELECT pd.project_id,
            ARRAY( SELECT DISTINCT k.k
                   FROM call_records cr,
                    LATERAL jsonb_object_keys(cr.raw_data) k(k)
                  WHERE cr.project_id = pd.project_id
                 LIMIT 200) AS keys
           FROM project_data pd
          WHERE pd.record_count > 0
        ), recent_results AS (
         SELECT pd.project_id,
            ARRAY( SELECT DISTINCT cr.resultaat
                   FROM call_records cr
                  WHERE cr.project_id = pd.project_id AND cr.synced_at > (now() - '60 days'::interval)) AS results
           FROM project_data pd
        )
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'amount_col_missing'::text AS issue_type,
    ('Bedrag-veld "'::text || pd.amount_col) || '" komt niet voor in de records van dit project.'::text AS issue_message
   FROM project_data pd
     LEFT JOIN sample_keys sk USING (project_id)
  WHERE pd.record_count > 0 AND pd.amount_col IS NOT NULL AND pd.amount_col <> ''::text AND NOT COALESCE(sk.keys, ARRAY[]::text[]) @> ARRAY[pd.amount_col]
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'freq_col_missing'::text AS issue_type,
    ('Frequentie-veld "'::text || pd.freq_col) || '" komt niet voor in de records van dit project.'::text AS issue_message
   FROM project_data pd
     LEFT JOIN sample_keys sk USING (project_id)
  WHERE pd.record_count > 0 AND pd.freq_col IS NOT NULL AND pd.freq_col <> ''::text AND NOT COALESCE(sk.keys, ARRAY[]::text[]) @> ARRAY[pd.freq_col]
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'no_sale_hits'::text AS issue_type,
    'Geen enkele resultaat-waarde uit sale_results komt voor in records van laatste 60 dagen.'::text AS issue_message
   FROM project_data pd
     LEFT JOIN recent_results rr USING (project_id)
  WHERE pd.project_type = 'outbound'::text AND pd.record_count > 0 AND jsonb_array_length(pd.sale_results) > 0 AND NOT COALESCE(rr.results, ARRAY[]::text[]) && (ARRAY( SELECT jsonb_array_elements_text(pd.sale_results) AS jsonb_array_elements_text))
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'inbound_service_no_handled'::text AS issue_type,
    'inbound_service-project zonder handled_results — afgehandeld-ratio niet berekenbaar.'::text AS issue_message
   FROM project_data pd
  WHERE pd.project_type = 'inbound_service'::text AND pd.record_count > 0 AND jsonb_array_length(pd.handled_results) = 0
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'inbound_no_results'::text AS issue_type,
    'inbound-project zonder retention_results en lost_results — retentie niet berekenbaar.'::text AS issue_message
   FROM project_data pd
  WHERE pd.project_type = 'inbound'::text AND pd.record_count > 0 AND jsonb_array_length(pd.retention_results) = 0 AND jsonb_array_length(pd.lost_results) = 0
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'unmapped_sale_candidate'::text AS issue_type,
    format('Resultaat "%s" lijkt een frequentie (%s record(s) laatste 60 dagen) maar staat niet in sale_results.'::text, cr.resultaat, count(*)) AS issue_message
   FROM project_data pd
     JOIN call_records cr ON cr.project_id = pd.project_id
  WHERE pd.project_type = 'outbound'::text AND cr.synced_at > (now() - '60 days'::interval) AND cr.resultaat IS NOT NULL AND cr.resultaat <> ''::text AND cr.resultaat ~* '(eenmalig|kwartaal|halfjaar|maandelijks|jaarlijks|tweemaal|tweemaandelijks|per maand|per jaar)'::text AND NOT (EXISTS ( SELECT 1
           FROM jsonb_array_elements_text(pd.sale_results) sr(value)
          WHERE sr.value = cr.resultaat))
  GROUP BY pd.project_id, pd.name, pd.basicall_project_id, pd.project_type, cr.resultaat;

REVOKE SELECT ON public.project_onboarding_status FROM anon;
REVOKE SELECT ON public.mapping_issues FROM anon;
