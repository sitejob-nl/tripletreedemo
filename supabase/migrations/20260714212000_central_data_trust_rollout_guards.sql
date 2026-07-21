-- Gefaseerde uitrolwaarborgen voor de centrale data-trustlaag.

begin;

create index if not exists idx_project_mapping_versions_approved_by
  on public.project_mapping_versions (approved_by);

create index if not exists idx_project_mapping_versions_rolled_back_from
  on public.project_mapping_versions (rolled_back_from);

-- Alleen live projecten horen open kwaliteitsproblemen te hebben. Deze guard
-- voorkomt dat een handmatige mappingactie op een gepauzeerd of beëindigd
-- project opnieuw een probleem opent.
create or replace function public.guard_non_live_quality_issue()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.resolved_at is null and exists (
    select 1
    from public.projects project
    where project.id = new.project_id
      and project.reporting_state <> 'live'
  ) then
    new.resolved_at := now();
    new.email_status := 'disabled';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_non_live_quality_issue()
  from public, anon, authenticated;
grant execute on function public.guard_non_live_quality_issue() to service_role;

drop trigger if exists guard_non_live_quality_issue
  on public.data_quality_issues;
create trigger guard_non_live_quality_issue
before insert or update on public.data_quality_issues
for each row execute function public.guard_non_live_quality_issue();

-- Een wijziging van rapportagestatus of handhaving vernieuwt de nulmeting
-- direct. Gepauzeerde en beëindigde projecten houden hun historie, zonder
-- nieuwe open kwaliteitsproblemen.
create or replace function public.refresh_quality_after_project_state_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.reporting_state <> 'live' then
    update public.data_quality_issues
    set resolved_at = coalesce(resolved_at, now()),
        email_status = 'disabled'
    where project_id = new.id
      and resolved_at is null;
  else
    perform public.evaluate_project_quality(new.id);
  end if;
  return new;
end;
$$;

revoke all on function public.refresh_quality_after_project_state_change()
  from public, anon, authenticated;
grant execute on function public.refresh_quality_after_project_state_change()
  to service_role;

drop trigger if exists refresh_quality_after_project_state_change
  on public.projects;
create trigger refresh_quality_after_project_state_change
after update of reporting_state, quality_enforcement_enabled,
  quality_tracking_started_at on public.projects
for each row
when (
  old.reporting_state is distinct from new.reporting_state
  or old.quality_enforcement_enabled is distinct from new.quality_enforcement_enabled
  or old.quality_tracking_started_at is distinct from new.quality_tracking_started_at
)
execute function public.refresh_quality_after_project_state_change();

-- De bestaande is_active-indeling is de veilige eerste classificatie:
-- actieve projecten blijven live, inactieve projecten worden historisch.
update public.projects
set reporting_state = case when is_active then 'live' else 'ended' end
where reporting_state is distinct from
  case when is_active then 'live' else 'ended' end;

update public.data_quality_issues issue
set resolved_at = coalesce(issue.resolved_at, now()),
    email_status = 'disabled'
from public.projects project
where project.id = issue.project_id
  and project.reporting_state <> 'live'
  and issue.resolved_at is null;

commit;
