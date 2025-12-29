-- Functie voor het berekenen van KPI totalen over alle records
-- Inclusief sales count en totale gesprekstijd
CREATE OR REPLACE FUNCTION public.get_project_kpi_totals(
  p_project_id UUID,
  p_week_number INTEGER DEFAULT NULL
)
RETURNS TABLE (
  total_records BIGINT,
  total_sales BIGINT,
  total_gesprekstijd_sec BIGINT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    COUNT(*)::BIGINT as total_records,
    COUNT(*) FILTER (
      WHERE resultaat IN ('Sale', 'Donateur', 'Toezegging', 'Afspraak', 'Positief', 'Verkoop', 'Ja', 'Akkoord')
    )::BIGINT as total_sales,
    COALESCE(SUM(gesprekstijd_sec), 0)::BIGINT as total_gesprekstijd_sec
  FROM call_records
  WHERE project_id = p_project_id
    AND (p_week_number IS NULL OR week_number = p_week_number);
END;
$$;