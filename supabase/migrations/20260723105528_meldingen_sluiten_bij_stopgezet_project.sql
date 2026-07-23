-- Een project dat op inactief gaat (of reporting_state 'ended') wordt niet meer
-- gesynct, dus evaluate_project_quality/sync.js raken zijn openstaande meldingen
-- nooit meer aan: ze blijven eeuwig rood op het admin-dashboard. Op 23-07-2026 gold
-- dat voor 16 meldingen van 695/914/924/927, stopgezet op 21-07.
create or replace function public.resolve_issues_for_stopped_project()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (new.is_active is distinct from old.is_active and new.is_active = false)
     or (new.reporting_state is distinct from old.reporting_state and new.reporting_state = 'ended') then
    update public.data_quality_issues
    set resolved_at = now(), email_status = 'disabled'
    where project_id = new.id and resolved_at is null;
  end if;
  return new;
end;
$$;

drop trigger if exists trg_resolve_issues_for_stopped_project on public.projects;
create trigger trg_resolve_issues_for_stopped_project
  after update of is_active, reporting_state on public.projects
  for each row execute function public.resolve_issues_for_stopped_project();

-- Eenmalig: de meldingen van al-stopgezette projecten alsnog sluiten.
update public.data_quality_issues q
set resolved_at = now(), email_status = 'disabled'
from public.projects p
where p.id = q.project_id
  and q.resolved_at is null
  and (p.is_active = false or p.reporting_state = 'ended');
