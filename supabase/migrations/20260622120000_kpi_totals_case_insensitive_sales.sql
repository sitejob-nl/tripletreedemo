-- get_project_kpi_totals: maak de sale-telling case-insensitive (trim + lower).
-- Reden (BasiCall-reconciliatie juni 2026): outbound sale-matching was exact +
-- hoofdlettergevoelig, waardoor codes als "machtiging per kwartaal" (kleine letter) of
-- "Machtiging per Half jaar" gemist werden → "Aantal Positief" structureel 1 te laag.
-- De client (useKPIAggregates) geeft nu de UNION (config.sale_results ∪ SALE_RESULTS) mee
-- via p_sale_results; deze functie vergelijkt voortaan case-insensitive zodat de KPI-kaart
-- exact gelijk telt aan isSale() in de rapportage/matrix. Verder ongewijzigd.
CREATE OR REPLACE FUNCTION public.get_project_kpi_totals(
  p_project_id uuid,
  p_week_number integer DEFAULT NULL::integer,
  p_sale_results text[] DEFAULT ARRAY['Sale','Donateur','Toezegging','Afspraak','Positief','Verkoop','Ja','Akkoord']
)
 RETURNS TABLE(total_records bigint, total_sales bigint, total_gesprekstijd_sec bigint)
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
BEGIN
  RETURN QUERY
  SELECT
    COUNT(*)::BIGINT as total_records,
    COUNT(*) FILTER (
      WHERE LOWER(TRIM(resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(p_sale_results) x)
    )::BIGINT as total_sales,
    COALESCE(SUM(gesprekstijd_sec), 0)::BIGINT as total_gesprekstijd_sec
  FROM call_records
  WHERE project_id = p_project_id
    AND (p_week_number IS NULL OR week_number = p_week_number);
END;
$function$;
