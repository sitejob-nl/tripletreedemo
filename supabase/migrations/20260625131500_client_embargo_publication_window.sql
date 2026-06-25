-- Embargo / publication window: clients only see a calendar day's data from
-- 09:00 (Europe/Amsterdam) on the FOLLOWING morning. Admin/superadmin keep
-- real-time, unrestricted access. This gives Triple Tree a correction window
-- between the 04:00 import and the 09:00 publication.
--
-- Enforced in RLS so EVERY path inherits it: all KPI RPCs run as SECURITY
-- INVOKER (get_project_kpi_totals, get_project_annual_value,
-- get_available_weeks, get_project_result_distribution), and direct SELECTs
-- already pass through RLS. Single source of truth for the 09:00 rule lives in
-- client_visible_cutoff(). Mirrored (preview only) in src/lib/embargo.ts.

create or replace function public.client_visible_cutoff()
returns date
language sql
stable
set search_path = public
as $$
  select (now() at time zone 'Europe/Amsterdam')::date
       - case when (now() at time zone 'Europe/Amsterdam')::time >= time '09:00'
              then 1 else 2 end;
$$;

comment on function public.client_visible_cutoff() is
  'Max inclusive beldatum_date/date visible to non-admin clients: previous day from 09:00 Europe/Amsterdam onward, otherwise the day before that. Mirrored in src/lib/embargo.ts (preview only).';

-- call_records: add the embargo to the customer branch only.
alter policy "Users can view call_records based on role or project assignment"
on public.call_records
using (
  has_role((select auth.uid()), 'admin'::app_role)
  or has_role((select auth.uid()), 'superadmin'::app_role)
  or (
    exists (
      select 1 from customer_projects
      where customer_projects.project_id = call_records.project_id
        and customer_projects.user_id = (select auth.uid())
    )
    and call_records.beldatum_date <= public.client_visible_cutoff()
  )
);

-- daily_logged_time: same embargo, on the `date` column.
alter policy "Users can view logged time based on role or project assignment"
on public.daily_logged_time
using (
  has_role((select auth.uid()), 'admin'::app_role)
  or has_role((select auth.uid()), 'superadmin'::app_role)
  or (
    exists (
      select 1 from customer_projects
      where customer_projects.project_id = daily_logged_time.project_id
        and customer_projects.user_id = (select auth.uid())
    )
    and daily_logged_time.date <= public.client_visible_cutoff()
  )
);
