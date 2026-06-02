-- Trombose folder (761): normaliseer 1 anomaal positief record (2026-06-02).
-- REEDS TOEGEPAST OP LIVE via MCP.
-- 37/38 positieve records bewaren bedrag in raw_data->>'Bedrag_nieuw' en termijn in
-- 'Betaalfrequentie_nieuw' (mapping_config wijst daar correct naar). Record 5084129
-- (26-mei, "Machtiging per Maand") had die _nieuw-velden leeg en het bedrag in 'Bedrag'
-- (5,00) -> jaarwaarde EUR0 i.p.v. EUR60. We zetten _nieuw gelijk aan de siblings.
-- De structurele fallback (Bedrag_nieuw->Bedrag, Betaalfrequentie_nieuw->bc_result_naam)
-- in de annual-value-RPC + sync-normalisatie is een aparte, bredere wijziging (zie PR).
UPDATE call_records
SET raw_data = raw_data
  || jsonb_build_object('Bedrag_nieuw', raw_data->>'Bedrag')
  || jsonb_build_object('Betaalfrequentie_nieuw', 'Maandelijks')
WHERE basicall_record_id = 5084129
  AND project_id = (SELECT id FROM projects WHERE basicall_project_id = 761)
  AND COALESCE(raw_data->>'Bedrag_nieuw', '') = '';
