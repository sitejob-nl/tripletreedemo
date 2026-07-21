-- Grouped resultaat-verdeling over ALLE projecten in één call — voedt de
-- "niet-ingedeelde resultaatcodes"-melding op het admin-dashboard.
-- SECURITY INVOKER (default): RLS op call_records blijft gelden, dus admin ziet
-- alles, een klant alleen eigen projecten (incl. embargo-venster). Classificatie
-- (welke code in welke categorie valt) gebeurt bewust client-side met
-- classifyResultCoverage zodat de UNION-met-defaults-logica maar op één plek leeft.
-- Toegepast op live via MCP apply_migration op 2026-07-10.
CREATE OR REPLACE FUNCTION public.get_result_code_distribution()
RETURNS TABLE(project_id uuid, resultaat text, cnt bigint, last_date date)
LANGUAGE sql
STABLE
SET search_path TO 'public'
AS $function$
  SELECT cr.project_id,
         TRIM(cr.resultaat) AS resultaat,
         COUNT(*)::bigint AS cnt,
         MAX(cr.beldatum_date) AS last_date
  FROM call_records cr
  WHERE COALESCE(TRIM(cr.resultaat), '') <> ''
  GROUP BY cr.project_id, TRIM(cr.resultaat)
  ORDER BY cr.project_id, COUNT(*) DESC;
$function$;
