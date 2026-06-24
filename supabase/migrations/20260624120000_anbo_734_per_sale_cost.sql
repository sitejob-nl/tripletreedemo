-- REEDS OP LIVE via MCP apply_migration (2026-06-24).
-- ANBO 734 ("ANBO online informatiepakket") wordt PER SALE betaald: EUR 37,08 excl. btw per sale
-- i.p.v. per uur (mail Willem 2026-06-24).
--   1) cost_per_sale = 37.08  -> klant-facing kosten/investering = aantal sales x 37,08 (nieuw kostenpad,
--      zie src/lib/cost.ts getCostPerSale + de calcInvestment-branches).
--   2) flat_sale_value verwijderd -> jaarwaarde valt terug op de normale Bedrag x Frequentie-berekening.
--      (flat_sale_value zette de jaarwaarde fout op 37,08/sale; jaarwaarde = waarde lidmaatschap voor ANBO,
--       de kosten 37,08/sale is wat Triple Tree int.)
-- ALLEEN 734. 827 ("ANBO Tipgids", report_template='flat') blijft ongemoeid en houdt flat_sale_value.
UPDATE projects
SET mapping_config = (mapping_config - 'flat_sale_value')
                     || jsonb_build_object('cost_per_sale', 37.08)
WHERE basicall_project_id = 734;
