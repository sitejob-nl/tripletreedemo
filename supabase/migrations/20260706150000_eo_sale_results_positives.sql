-- EO-campagnes toonden 0 positieven: hun positieve resultaatcodes stonden niet in
-- mapping_config.sale_results (alleen de default ["Sale","Donateur","Toezegging"]).
-- isSale() matcht EXACT (case-insensitive), dus "EO Donateur" / "EO donateur jaarlijks"
-- werden niet als positief geteld. Aangevuld n.a.v. reconciliatie-mail Esther (05-07-2026).
--
-- Al toegepast op live via MCP (06-07-2026); dit bestand mirrort dat terug naar de repo.
-- Idempotent: jsonb_agg(distinct ...) dedupliceert, dus herhaald draaien is veilig en
-- overige mapping_config-keys blijven ongemoeid (jsonb_set op alleen {sale_results}).

update projects p
set mapping_config = jsonb_set(
  coalesce(p.mapping_config, '{}'::jsonb),
  '{sale_results}',
  (
    select jsonb_agg(distinct v order by v)
    from (
      select jsonb_array_elements_text(coalesce(p.mapping_config->'sale_results', '[]'::jsonb)) as v
      union
      select unnest(array['EO Donateur', 'EO donateur jaarlijks'])
    ) s
  )
)
where p.basicall_project_id in (935, 933);
