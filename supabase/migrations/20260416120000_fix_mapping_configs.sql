-- 20260416120000_fix_mapping_configs.sql
-- Correct mapping_config for 4 projects where amount_col/freq_col point to
-- raw_data keys that do not exist. Current dashboard processing silently
-- falls back to hardcoded ["termijnbedrag","Bedrag","Frequentie"] which
-- masks the misconfiguration for project 907 (STC WB 6 maanden) but still
-- produces wrong frequency multipliers, and produces €0 revenue for
-- project 888 (Cliniclowns, raw_data key is "bedrag_euro").
--
-- Audit evidence for each project is in AUDIT-2026-04-16.md.
--
-- Projects 870 Sligro (inbound_service) and 901 NL Tour Rides (mail campaign)
-- already have correct handled_results / retention_results; no fix needed.

-- 907 STC WB 6 maanden: amount_col Bedrag -> termijnbedrag. freq_col already
-- works via fallback but rewrite to bc_result_naam so the preview-hook reflects
-- reality (resultaat-name contains frequency info: "Maandelijks" etc.).
UPDATE projects
SET mapping_config = mapping_config
  || jsonb_build_object('amount_col', 'termijnbedrag')
  || jsonb_build_object('freq_col', 'bc_result_naam')
WHERE basicall_project_id = 907;

-- 888 Cliniclowns leads: amount lives in bedrag_euro.
UPDATE projects
SET mapping_config = mapping_config
  || jsonb_build_object('amount_col', 'bedrag_euro')
  || jsonb_build_object('freq_col', 'bc_result_naam')
WHERE basicall_project_id = 888;

-- 11 Proefdiervrij storno: amount in Nbedrag, freq in Ntermijn (matches
-- sibling project 869 Hersenstichting bestellers which is wired the same way).
UPDATE projects
SET mapping_config = mapping_config
  || jsonb_build_object('amount_col', 'Nbedrag')
  || jsonb_build_object('freq_col', 'Ntermijn')
WHERE basicall_project_id = 11;

-- 807 KIA samen tegen armoede: amount_col=Amount is already correct.
-- Wissel freq_col van bc_result_naam naar Frequency (capital F), dat veld
-- bestaat wel in raw_data met waarden zoals "Maandelijks"/"Eenmalig"/
-- "Kwartaal"/"Jaarlijks" die freq_map al herkent (case-insensitive).
UPDATE projects
SET mapping_config = mapping_config || jsonb_build_object('freq_col', 'Frequency')
WHERE basicall_project_id = 807;
