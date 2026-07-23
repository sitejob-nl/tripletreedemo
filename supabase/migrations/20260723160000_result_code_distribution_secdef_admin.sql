-- get_result_code_distribution timede uit onder de authenticated role: SECURITY INVOKER
-- betekende RLS-evaluatie (has_role + customer_projects EXISTS) per rij over 136k+
-- call_records → statement timeout → HTTP 500 → de unmapped-codes-kaart op /admin
-- bleef stil leeg (QA-rapport 23-07-2026, punt A3).
-- SECURITY DEFINER slaat RLS over; de admin-gate zit expliciet in de WHERE zodat
-- niet-admins een lege set krijgen. Anon mag de functie helemaal niet aanroepen
-- (zelfde patroon als de secdef-fix van 2026-06-01).
-- Toegepast op live via MCP apply_migration op 23-07-2026 (result_code_distribution_secdef_admin).
CREATE OR REPLACE FUNCTION public.get_result_code_distribution()
RETURNS TABLE(project_id uuid, resultaat text, cnt bigint, last_date date)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT cr.project_id,
         TRIM(cr.resultaat) AS resultaat,
         COUNT(*)::bigint AS cnt,
         MAX(cr.beldatum_date) AS last_date
  FROM call_records cr
  WHERE (public.has_role(auth.uid(), 'admin'::app_role) OR public.has_role(auth.uid(), 'superadmin'::app_role))
    AND COALESCE(TRIM(cr.resultaat), '') <> ''
  GROUP BY cr.project_id, TRIM(cr.resultaat)
  ORDER BY cr.project_id, COUNT(*) DESC;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_result_code_distribution() FROM anon;
