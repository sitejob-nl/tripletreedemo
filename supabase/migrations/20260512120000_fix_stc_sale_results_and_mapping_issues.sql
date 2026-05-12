-- Fix: STC-projecten (904, 905, 907) misten "Eenmalig", "Per kwartaal" en
-- "Halfjaarlijks" in mapping_config.sale_results. Daardoor telden records met
-- die resultaat-waarden niet mee in jaarwaarde-KPI's, ondanks dat freq_map ze
-- al kende. Eigenaar Triple Tree meldde dit op 2026-05-12 voor STC WB 6
-- maanden week 19.
--
-- Tweede deel: mapping_issues view krijgt een nieuw issue-type
-- 'unmapped_sale_candidate' dat resultaten met een frequentie-trefwoord in
-- de naam (eenmalig/kwartaal/halfjaar/maandelijks/jaarlijks/...) detecteert
-- die niet in sale_results staan. Voorkomt herhaling van dit type gat.

-- 1. Voeg ontbrekende frequenties toe aan sale_results voor STC 904/905/907.
-- Idempotent via UNION + jsonb_agg(DISTINCT ...).
UPDATE projects
SET mapping_config = jsonb_set(
  mapping_config,
  '{sale_results}',
  (
    SELECT jsonb_agg(DISTINCT v)
    FROM (
      SELECT jsonb_array_elements_text(mapping_config->'sale_results') AS v
      UNION
      SELECT unnest(ARRAY['Eenmalig', 'Per kwartaal', 'Halfjaarlijks'])
    ) merged
  )
)
WHERE basicall_project_id IN (904, 905, 907);

-- 2. Mapping_issues view: voeg 'unmapped_sale_candidate' toe.
-- Strikte heuristiek: alleen flaggen als de resultaat-naam zelf een
-- frequentie-trefwoord bevat. Voorkomt false positives bij storno/winback-
-- projecten waar elk record een termijnbedrag draagt (bestaande donor-base).
CREATE OR REPLACE VIEW mapping_issues AS
 WITH project_data AS (
         SELECT p.id AS project_id,
            p.name,
            p.basicall_project_id,
            p.project_type,
            (p.mapping_config ->> 'amount_col'::text) AS amount_col,
            (p.mapping_config ->> 'freq_col'::text) AS freq_col,
            COALESCE((p.mapping_config -> 'sale_results'::text), '[]'::jsonb) AS sale_results,
            COALESCE((p.mapping_config -> 'handled_results'::text), '[]'::jsonb) AS handled_results,
            COALESCE((p.mapping_config -> 'retention_results'::text), '[]'::jsonb) AS retention_results,
            COALESCE((p.mapping_config -> 'lost_results'::text), '[]'::jsonb) AS lost_results,
            ( SELECT count(*) AS count
                   FROM call_records cr
                  WHERE (cr.project_id = p.id)) AS record_count
           FROM projects p
          WHERE p.is_active
        ), sample_keys AS (
         SELECT pd.project_id,
            ARRAY( SELECT DISTINCT k.k
                   FROM call_records cr,
                    LATERAL jsonb_object_keys(cr.raw_data) k(k)
                  WHERE (cr.project_id = pd.project_id)
                 LIMIT 200) AS keys
           FROM project_data pd
          WHERE (pd.record_count > 0)
        ), recent_results AS (
         SELECT pd.project_id,
            ARRAY( SELECT DISTINCT cr.resultaat
                   FROM call_records cr
                  WHERE ((cr.project_id = pd.project_id) AND (cr.synced_at > (now() - '60 days'::interval)))) AS results
           FROM project_data pd
        )
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'amount_col_missing'::text AS issue_type,
    (('Bedrag-veld "'::text || pd.amount_col) || '" komt niet voor in de records van dit project.'::text) AS issue_message
   FROM (project_data pd
     LEFT JOIN sample_keys sk USING (project_id))
  WHERE ((pd.record_count > 0) AND (pd.amount_col IS NOT NULL) AND (pd.amount_col <> ''::text) AND (NOT (COALESCE(sk.keys, ARRAY[]::text[]) @> ARRAY[pd.amount_col])))
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'freq_col_missing'::text AS issue_type,
    (('Frequentie-veld "'::text || pd.freq_col) || '" komt niet voor in de records van dit project.'::text) AS issue_message
   FROM (project_data pd
     LEFT JOIN sample_keys sk USING (project_id))
  WHERE ((pd.record_count > 0) AND (pd.freq_col IS NOT NULL) AND (pd.freq_col <> ''::text) AND (NOT (COALESCE(sk.keys, ARRAY[]::text[]) @> ARRAY[pd.freq_col])))
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'no_sale_hits'::text AS issue_type,
    'Geen enkele resultaat-waarde uit sale_results komt voor in records van laatste 60 dagen.'::text AS issue_message
   FROM (project_data pd
     LEFT JOIN recent_results rr USING (project_id))
  WHERE ((pd.project_type = 'outbound'::text) AND (pd.record_count > 0) AND (jsonb_array_length(pd.sale_results) > 0) AND (NOT (COALESCE(rr.results, ARRAY[]::text[]) && ARRAY( SELECT jsonb_array_elements_text(pd.sale_results) AS jsonb_array_elements_text))))
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'inbound_service_no_handled'::text AS issue_type,
    'inbound_service-project zonder handled_results — afgehandeld-ratio niet berekenbaar.'::text AS issue_message
   FROM project_data pd
  WHERE ((pd.project_type = 'inbound_service'::text) AND (pd.record_count > 0) AND (jsonb_array_length(pd.handled_results) = 0))
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'inbound_no_results'::text AS issue_type,
    'inbound-project zonder retention_results en lost_results — retentie niet berekenbaar.'::text AS issue_message
   FROM project_data pd
  WHERE ((pd.project_type = 'inbound'::text) AND (pd.record_count > 0) AND (jsonb_array_length(pd.retention_results) = 0) AND (jsonb_array_length(pd.lost_results) = 0))
UNION ALL
 SELECT pd.project_id,
    pd.name,
    pd.basicall_project_id,
    pd.project_type,
    'unmapped_sale_candidate'::text AS issue_type,
    format('Resultaat "%s" lijkt een frequentie (%s record(s) laatste 60 dagen) maar staat niet in sale_results.', cr.resultaat, count(*)) AS issue_message
   FROM project_data pd
     JOIN call_records cr ON cr.project_id = pd.project_id
  WHERE pd.project_type = 'outbound'
    AND cr.synced_at > (now() - INTERVAL '60 days')
    AND cr.resultaat IS NOT NULL
    AND cr.resultaat <> ''
    AND cr.resultaat ~* '(eenmalig|kwartaal|halfjaar|maandelijks|jaarlijks|tweemaal|tweemaandelijks|per maand|per jaar)'
    AND NOT EXISTS (
      SELECT 1 FROM jsonb_array_elements_text(pd.sale_results) sr
      WHERE sr = cr.resultaat
    )
  GROUP BY pd.project_id, pd.name, pd.basicall_project_id, pd.project_type, cr.resultaat;
