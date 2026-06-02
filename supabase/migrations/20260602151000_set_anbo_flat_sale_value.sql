-- ANBO 734 + 827 worden per sale betaald (€37,08 excl. btw), geen donatie-jaarwaarde.
-- REEDS OP LIVE via MCP. Zet flat_sale_value zodat de (jaar)waarde = aantal sales × 37,08.
UPDATE projects
SET mapping_config = jsonb_set(mapping_config, '{flat_sale_value}', '37.08'::jsonb)
WHERE basicall_project_id IN (734, 827);
