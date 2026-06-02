-- Fix Amazone kinderen (924) mapping_config (2026-06-02). REEDS TOEGEPAST OP LIVE via MCP.
-- Bug: nieuw project nooit ingericht. sale_results=[Sale,Donateur,Toezegging] matchte
-- 0 records; positieven heten "Maandelijks"/"Jaarlijks" (= resultaat = bc_result_naam).
-- amount_col=termijnbedrag en freq_col=frequentie zijn bij ALLE records leeg; het bedrag
-- staat in raw_data->>'Bedrag' en de termijn in bc_result_naam. Modelproject: 907.
-- Oude waarden (rollback): amount_col='termijnbedrag', freq_col='frequentie',
--   sale_results=["Sale","Donateur","Toezegging"]
-- Effect (geverifieerd): week 22-2026 van 0 positief/EUR0 naar 8 positief/EUR560.
UPDATE projects
SET mapping_config = mapping_config || jsonb_build_object(
  'amount_col', 'Bedrag',
  'freq_col',   'bc_result_naam',
  'sale_results', '["Sale","Donateur","Toezegging","Maandelijks","Jaarlijks","Per kwartaal","Halfjaarlijks","Eenmalig"]'::jsonb
)
WHERE basicall_project_id = 924;
