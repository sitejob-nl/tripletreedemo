-- Urencorrectie-paneel: gesprekstijd-fallback (per-project, corrigeerbaar).
-- Applied live via MCP apply_migration on 2026-06-24.

-- 1. Allow admins/superadmins to INSERT logged time rows (needed to correct
--    fallback days that have no daily_logged_time row yet). SELECT + UPDATE
--    policies already exist; INSERT was default-deny.
create policy "Admins can insert logged time"
  on public.daily_logged_time
  for insert
  to authenticated
  with check (
    has_role((select auth.uid()), 'admin'::app_role)
    or has_role((select auth.uid()), 'superadmin'::app_role)
  );

-- 2. Per-date hours breakdown for the admin Urencorrectie panel: merges logged
--    time with per-day gesprekstijd (talk time) so the panel can fall back to
--    gesprekstijd when no logged row exists. SECURITY INVOKER -> RLS of the
--    caller applies (panel is admin-only; customers stay scoped to their projects).
create or replace function public.get_daily_hours_breakdown(
  p_project_id uuid,
  p_start date,
  p_end date
)
returns table (
  day date,
  row_id uuid,
  logged_seconds integer,
  corrected_seconds integer,
  gesprekstijd_seconds bigint
)
language sql
stable
security invoker
set search_path = public
as $$
  with logged as (
    select dlt.date as d, dlt.id, dlt.total_seconds, dlt.corrected_seconds
    from daily_logged_time dlt
    where dlt.project_id = p_project_id
      and dlt.date >= p_start
      and dlt.date <= p_end
  ),
  talk as (
    select cr.beldatum_date as d, sum(cr.gesprekstijd_sec)::bigint as gesprekstijd_seconds
    from call_records cr
    where cr.project_id = p_project_id
      and cr.beldatum_date >= p_start
      and cr.beldatum_date <= p_end
    group by cr.beldatum_date
  )
  select
    coalesce(l.d, t.d) as day,
    l.id as row_id,
    l.total_seconds as logged_seconds,
    l.corrected_seconds as corrected_seconds,
    coalesce(t.gesprekstijd_seconds, 0::bigint) as gesprekstijd_seconds
  from logged l
  full outer join talk t on l.d = t.d
  order by 1;
$$;

grant execute on function public.get_daily_hours_breakdown(uuid, date, date) to authenticated;
