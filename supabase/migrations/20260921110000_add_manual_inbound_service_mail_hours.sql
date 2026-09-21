-- BasiCall does not expose reliable email-processing hours per inbound campaign.
-- Admins can therefore maintain one auditable weekly value in the existing
-- report override layer. The function deliberately patches only mailHours;
-- imported Excel metrics and live call data remain untouched.

create or replace function public.upsert_inbound_service_mail_hours(
  p_project_id uuid,
  p_year integer,
  p_week_number integer,
  p_mail_hours numeric
)
returns jsonb
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  v_user_id uuid := (select auth.uid());
  v_project public.projects%rowtype;
  v_override public.reportage_weekly_overrides%rowtype;
  v_now timestamptz := now();
begin
  if v_user_id is null
     or not (
       public.has_role(v_user_id, 'admin'::public.app_role)
       or public.has_role(v_user_id, 'superadmin'::public.app_role)
     ) then
    raise exception 'Alleen beheerders kunnen mailuren aanpassen'
      using errcode = '42501';
  end if;

  if p_year not between 2000 and 2100
     or p_week_number not between 1 and 53 then
    raise exception 'Ongeldige rapportageweek'
      using errcode = '22023';
  end if;

  if p_mail_hours is null or p_mail_hours < 0 then
    raise exception 'Mailuren moeten nul of hoger zijn'
      using errcode = '22023';
  end if;

  select * into v_project
  from public.projects
  where id = p_project_id;

  if not found then
    raise exception 'Project niet gevonden'
      using errcode = 'P0002';
  end if;

  if v_project.report_template is distinct from 'inbound_service'
     and v_project.project_type is distinct from 'inbound_service' then
    raise exception 'Mailuren zijn alleen beschikbaar voor klantenserviceprojecten'
      using errcode = '22023';
  end if;

  insert into public.reportage_weekly_overrides (
    project_id,
    year,
    week_number,
    template,
    source_file,
    source_sheet,
    metrics,
    daily_metrics,
    result_rows,
    source_hash,
    imported_at,
    imported_by
  ) values (
    p_project_id,
    p_year,
    p_week_number,
    'inbound_service',
    'Handmatige dashboardinvoer',
    format('Week %s - %s', p_week_number, p_year),
    jsonb_build_object(
      'mailHours', p_mail_hours,
      'mailHoursSource', 'manual',
      'mailHoursUpdatedAt', v_now
    ),
    '{}'::jsonb,
    '[]'::jsonb,
    md5(format('%s:%s:%s:manual-mail-hours', p_project_id, p_year, p_week_number)),
    v_now,
    format('manual:%s', v_user_id)
  )
  on conflict (project_id, year, week_number)
  do update set
    metrics = public.reportage_weekly_overrides.metrics || jsonb_build_object(
      'mailHours', excluded.metrics -> 'mailHours',
      'mailHoursSource', 'manual',
      'mailHoursUpdatedAt', excluded.metrics -> 'mailHoursUpdatedAt'
    ),
    imported_at = case
      when public.reportage_weekly_overrides.source_file = 'Handmatige dashboardinvoer'
        then excluded.imported_at
      else public.reportage_weekly_overrides.imported_at
    end,
    imported_by = case
      when public.reportage_weekly_overrides.source_file = 'Handmatige dashboardinvoer'
        then excluded.imported_by
      else public.reportage_weekly_overrides.imported_by
    end
  returning * into v_override;

  return to_jsonb(v_override);
end;
$$;

revoke all on function public.upsert_inbound_service_mail_hours(uuid, integer, integer, numeric) from public;
grant execute on function public.upsert_inbound_service_mail_hours(uuid, integer, integer, numeric) to authenticated;

comment on function public.upsert_inbound_service_mail_hours(uuid, integer, integer, numeric) is
  'Admin-only weekly mail-hours input for inbound-service reports; preserves Excel and live call metrics.';
