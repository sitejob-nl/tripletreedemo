-- Create RPC function to get available weeks for a project
-- This uses DISTINCT to avoid row limit issues and is much more efficient
CREATE OR REPLACE FUNCTION public.get_available_weeks(p_project_id uuid)
RETURNS TABLE(week_number int, iso_year int, value text)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT DISTINCT
    cr.week_number::int,
    EXTRACT(isoyear FROM cr.beldatum_date)::int as iso_year,
    EXTRACT(isoyear FROM cr.beldatum_date)::int || '-' || LPAD(cr.week_number::text, 2, '0') as value
  FROM call_records cr
  WHERE cr.project_id = p_project_id
    AND cr.week_number IS NOT NULL
    AND cr.beldatum_date IS NOT NULL
  ORDER BY iso_year DESC, week_number DESC;
$$;