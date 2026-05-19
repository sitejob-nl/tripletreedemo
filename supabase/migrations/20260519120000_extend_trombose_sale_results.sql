-- Fix: Trombosestichting folder (761) miste "Machtiging per Kwartaal" en
-- "Machtiging per Jaar" in mapping_config.sale_results. Daardoor telden 2 van
-- de 4 sale-resultaten in week 20 (2026-05-11..17) niet mee in de positief-
-- count en jaarwaarde. Eigenaar Triple Tree meldde dit op 2026-05-19 (week 20,
-- "3 positief, dashboard 2").
--
-- Voegen tegelijk de eerder voor STC 904/905/907 gehanteerde frequentie-codes
-- toe, zodat Trombose 761 ook records met "Eenmalig", "Halfjaarlijks" en
-- "Per kwartaal" telt zodra die binnenkomen.
--
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
      SELECT unnest(ARRAY[
        'Machtiging per Kwartaal',
        'Machtiging per Jaar',
        'Eenmalig',
        'Per kwartaal',
        'Halfjaarlijks',
        'Per half jaar'
      ])
    ) merged
  )
)
WHERE basicall_project_id = 761;
