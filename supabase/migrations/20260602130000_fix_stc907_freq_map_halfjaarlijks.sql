-- STC WB 6 maanden (907): freq_map mist 'halfjaarlijks'. REEDS TOEGEPAST OP LIVE via MCP.
-- 907 leidt frequentie af uit de resultaatnaam (freq_col=bc_result_naam); "Halfjaarlijks"
-- viel via substring op key "jaarlijks" -> multiplier x1 i.p.v. x2. Week 22: 2 halfjaarlijkse
-- machtigingen (EUR87,50) telden x1 -> jaarwaarde EUR1033,50 i.p.v. EUR1121,00.
-- Exacte key "halfjaarlijks" (priority 0) wint nu van de substring-match. Conform frontend
-- statsHelpers (halfjaar -> x2) zodat dashboard-KPI == rapportage-matrix.
UPDATE projects
SET mapping_config = jsonb_set(
  mapping_config, '{freq_map}',
  (mapping_config->'freq_map') || '{"halfjaarlijks":2,"half jaar":2,"per half jaar":2}'::jsonb
)
WHERE basicall_project_id = 907;
