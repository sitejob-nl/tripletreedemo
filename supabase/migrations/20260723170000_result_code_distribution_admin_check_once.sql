-- Vervolg op 20260723160000: SECURITY DEFINER alleen was niet genoeg. De admin-gate
-- stond in de WHERE van een SQL-functie, waardoor de planner has_role(auth.uid(), ...)
-- per rij evalueerde over 136k call_records — dezelfde per-rij-kosten als de RLS die we
-- juist wilden omzeilen, dus opnieuw statement timeout / HTTP 500.
-- Nu plpgsql: de rolcheck draait exact één keer en valt bij niet-admins meteen terug op
-- een lege set; daarna één seq scan (~170 ms gemeten).
-- Toegepast op live via MCP apply_migration op 23-07-2026 en geverifieerd op /admin
-- (kaart toont 87 codes bij 19 projecten, geen console-errors meer).
CREATE OR REPLACE FUNCTION public.get_result_code_distribution()
RETURNS TABLE(project_id uuid, resultaat text, cnt bigint, last_date date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT (public.has_role(auth.uid(), 'admin'::app_role)
       OR public.has_role(auth.uid(), 'superadmin'::app_role)) THEN
    RETURN;
  END IF;

  RETURN QUERY
  SELECT cr.project_id,
         TRIM(cr.resultaat) AS resultaat,
         COUNT(*)::bigint AS cnt,
         MAX(cr.beldatum_date) AS last_date
  FROM call_records cr
  WHERE COALESCE(TRIM(cr.resultaat), '') <> ''
  GROUP BY cr.project_id, TRIM(cr.resultaat)
  ORDER BY cr.project_id, COUNT(*) DESC;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.get_result_code_distribution() FROM anon;
