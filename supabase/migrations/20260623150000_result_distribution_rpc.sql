-- get_project_result_distribution: resultaat → aantal records, voor de live
-- "categorie-dekking" in de mapping-configurator (admin-only UI). Eén GROUP BY
-- i.p.v. tienduizenden rijen client-side ophalen. Niet SECURITY DEFINER → draait
-- met de rechten van de aanroeper, dus de bestaande call_records-RLS (admin full
-- access) blijft van kracht; geen tenant-lek.
CREATE OR REPLACE FUNCTION public.get_project_result_distribution(p_project_id uuid)
 RETURNS TABLE(resultaat text, cnt bigint)
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT COALESCE(NULLIF(TRIM(cr.resultaat), ''), '(leeg)') AS resultaat,
         COUNT(*)::bigint AS cnt
  FROM call_records cr
  WHERE cr.project_id = p_project_id
  GROUP BY COALESCE(NULLIF(TRIM(cr.resultaat), ''), '(leeg)')
  ORDER BY COUNT(*) DESC;
$function$;
