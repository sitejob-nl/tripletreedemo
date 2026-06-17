-- Klanten moeten hun campagne-kosten zien (investering, kosten per donateur,
-- terugverdientijd, ROI). Die werden NaN omdat projects_public geen hourly_rate had.
-- security_invoker=true blijft behouden: elke klant ziet via projects-RLS alleen
-- z'n eigen projecten, dus geen cross-tenant tarief-lek.
-- LET OP: CREATE OR REPLACE VIEW mag bestaande kolommen niet herschikken — daarom
-- staan hourly_rate + vat_rate achteraan.
create or replace view public.projects_public
with (security_invoker = true)
as
select
  id,
  name,
  project_key,
  is_active,
  project_type,
  mapping_config,
  hours_factor,
  total_to_call,
  created_at,
  updated_at,
  hourly_rate,
  vat_rate
from public.projects;
