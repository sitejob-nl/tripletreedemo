-- Systeembrede halfjaarlijks-fix. REEDS TOEGEPAST OP LIVE via MCP.
-- Projecten met 'Halfjaarlijks'/'Per half jaar' in sale_results maar zonder halfjaar-key in
-- freq_map konden halfjaarlijkse machtigingen x1 i.p.v. x2 tellen wanneer de frequentie uit
-- de resultaatnaam komt (freq_col=bc_result_naam). Defensief rechtgetrokken; inert voor
-- projecten die het numerieke 'frequentie'-veld lezen (die telden al correct x2) en voor
-- projecten zonder halfjaarlijkse records. Geverifieerd: 864/905/761/924 ongewijzigd.
-- Betreft: 761, 864, 869, 904, 905, 924.
UPDATE projects
SET mapping_config = jsonb_set(
  mapping_config, '{freq_map}',
  (mapping_config->'freq_map') || '{"halfjaarlijks":2,"half jaar":2,"per half jaar":2}'::jsonb
)
WHERE basicall_project_id IN (761, 864, 869, 904, 905, 924)
  AND NOT (mapping_config->'freq_map' ?| array['halfjaarlijks','half jaar','per half jaar','halfjaar']);
