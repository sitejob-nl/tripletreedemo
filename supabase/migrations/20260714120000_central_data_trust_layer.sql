-- CENTRALE DATA-TRUSTLAAG
--
-- Deze migratie is na expliciete go-live-goedkeuring naar productie uitgerold.
-- De migratie is additief en behoudt de live security_invoker projects_public-view.

begin;

-- ---------------------------------------------------------------------------
-- Projectlevenscyclus en volledige sync-administratie
-- ---------------------------------------------------------------------------

alter table public.projects
  add column if not exists reporting_state text not null default 'live',
  add column if not exists quality_enforcement_enabled boolean not null default false,
  add column if not exists quality_tracking_started_at timestamptz;

alter table public.projects
  drop constraint if exists projects_reporting_state_check;
alter table public.projects
  add constraint projects_reporting_state_check
  check (reporting_state in ('live', 'paused', 'ended'));

comment on column public.projects.reporting_state is
  'live wordt bewaakt en gesynchroniseerd; paused/ended blijven historisch zichtbaar.';
comment on column public.projects.quality_enforcement_enabled is
  'Gerichte klantblokkades pas activeren nadat de nulmeting voor dit project groen is.';
comment on column public.projects.quality_tracking_started_at is
  'Eerste dag waarvoor de trustlaag dagelijkse syncvolledigheid afdwingt.';

alter table public.sync_logs
  add column if not exists expected_records integer not null default 0,
  add column if not exists failed_records integer not null default 0;

update public.sync_logs
set completed_at = coalesce(completed_at, started_at, now()),
    expected_records = case
      when status = 'success' then coalesce(records_synced, 0)
      else expected_records
    end,
    failed_records = case
      when status = 'warning' then greatest(failed_records, 1)
      else failed_records
    end;

alter table public.sync_logs
  alter column completed_at set default now(),
  alter column completed_at set not null;

alter table public.sync_logs
  drop constraint if exists sync_logs_expected_records_check,
  drop constraint if exists sync_logs_records_synced_check,
  drop constraint if exists sync_logs_failed_records_check,
  drop constraint if exists sync_logs_status_check;
alter table public.sync_logs
  add constraint sync_logs_expected_records_check check (expected_records >= 0),
  add constraint sync_logs_records_synced_check check (records_synced >= 0),
  add constraint sync_logs_failed_records_check check (failed_records >= 0),
  add constraint sync_logs_status_check
    check (status in ('running', 'success', 'warning', 'failed'));

create index if not exists idx_sync_logs_quality_coverage
  on public.sync_logs (project_id, kind, sync_from, sync_to, status);

-- ---------------------------------------------------------------------------
-- Admin-only issues en mappingversies
-- ---------------------------------------------------------------------------

create table if not exists public.data_quality_issues (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  issue_key text not null,
  source text not null check (source in ('sync', 'mapping', 'drift', 'hours')),
  severity text not null check (severity in ('info', 'warning', 'critical')),
  affected_metrics text[] not null default '{}',
  public_message text not null,
  admin_detail text not null,
  period_start date,
  period_end date,
  first_seen_at timestamptz not null default now(),
  last_seen_at timestamptz not null default now(),
  resolved_at timestamptz,
  last_notified_at timestamptz,
  email_status text not null default 'pending'
    check (email_status in ('pending', 'sent', 'disabled', 'error')),
  unique (project_id, issue_key)
);

create index if not exists idx_data_quality_open
  on public.data_quality_issues (project_id, severity, last_seen_at desc)
  where resolved_at is null;

alter table public.data_quality_issues enable row level security;
drop policy if exists "Admins beheren data quality issues" on public.data_quality_issues;
create policy "Admins beheren data quality issues"
  on public.data_quality_issues for all to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'superadmin'::public.app_role)
  )
  with check (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'superadmin'::public.app_role)
  );
revoke all on public.data_quality_issues from anon;
grant select, insert, update, delete on public.data_quality_issues to authenticated;
grant all on public.data_quality_issues to service_role;

create table if not exists public.project_mapping_versions (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  version integer not null check (version > 0),
  config jsonb not null,
  approved_by uuid references auth.users(id) on delete set null,
  approved_at timestamptz not null default now(),
  rolled_back_from uuid references public.project_mapping_versions(id) on delete set null,
  is_active boolean not null default false,
  note text,
  unique (project_id, version)
);

create unique index if not exists idx_project_mapping_one_active
  on public.project_mapping_versions(project_id) where is_active;

alter table public.project_mapping_versions enable row level security;
drop policy if exists "Admins beheren mappingversies" on public.project_mapping_versions;
create policy "Admins beheren mappingversies"
  on public.project_mapping_versions for all to authenticated
  using (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'superadmin'::public.app_role)
  )
  with check (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'superadmin'::public.app_role)
  );
revoke all on public.project_mapping_versions from anon;
grant select, insert, update, delete on public.project_mapping_versions to authenticated;
grant all on public.project_mapping_versions to service_role;

insert into public.project_mapping_versions
  (project_id, version, config, approved_by, is_active, note)
select p.id, 1, p.mapping_config, null, true,
       'Bestaande mapping bij introductie van de trustlaag'
from public.projects p
where p.mapping_config is not null
  and not exists (
    select 1 from public.project_mapping_versions mv where mv.project_id = p.id
  );

-- ---------------------------------------------------------------------------
-- Interne helpers
-- ---------------------------------------------------------------------------

create or replace function public.quality_config_values(
  p_config jsonb,
  p_keys text[]
)
returns table(value text)
language sql
immutable
set search_path = public
as $$
  select distinct item.value
  from unnest(p_keys) as key_name
  cross join lateral jsonb_array_elements_text(
    case
      when jsonb_typeof(p_config -> key_name) = 'array' then p_config -> key_name
      else '[]'::jsonb
    end
  ) as item(value)
  where nullif(btrim(item.value), '') is not null;
$$;

create or replace function public.set_data_quality_issue(
  p_project_id uuid,
  p_issue_key text,
  p_source text,
  p_severity text,
  p_affected_metrics text[],
  p_public_message text,
  p_admin_detail text,
  p_period_start date default null,
  p_period_end date default null
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  insert into public.data_quality_issues (
    project_id, issue_key, source, severity, affected_metrics,
    public_message, admin_detail, period_start, period_end,
    first_seen_at, last_seen_at, resolved_at, email_status
  ) values (
    p_project_id, p_issue_key, p_source, p_severity,
    coalesce(p_affected_metrics, '{}'::text[]), p_public_message,
    p_admin_detail, p_period_start, p_period_end,
    now(), now(), null, 'pending'
  )
  on conflict (project_id, issue_key) do update set
    source = excluded.source,
    severity = excluded.severity,
    affected_metrics = excluded.affected_metrics,
    public_message = excluded.public_message,
    admin_detail = excluded.admin_detail,
    period_start = excluded.period_start,
    period_end = excluded.period_end,
    last_seen_at = now(),
    resolved_at = null,
    email_status = case
      when public.data_quality_issues.resolved_at is not null then 'pending'
      else public.data_quality_issues.email_status
    end
  returning id into v_id;
  return v_id;
end;
$$;

revoke all on function public.set_data_quality_issue(
  uuid, text, text, text, text[], text, text, date, date
) from public, anon, authenticated;
grant execute on function public.set_data_quality_issue(
  uuid, text, text, text, text[], text, text, date, date
) to service_role;

-- ---------------------------------------------------------------------------
-- Centrale evaluatie: expliciete mapping, drift en urenbron
-- ---------------------------------------------------------------------------

create or replace function public.evaluate_project_quality(p_project_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_config jsonb;
  v_keys text[];
  v_value_keys text[];
  v_seen text[] := '{}'::text[];
  v_seen_sync text[] := '{}'::text[];
  v_amount_col text;
  v_freq_col text;
  v_row record;
  v_result_metrics text[];
  v_period_start date;
  v_period_end date;
  v_has_records boolean;
  v_sync_start date;
  v_day date;
begin
  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'Project niet gevonden'; end if;

  v_config := coalesce(v_project.mapping_config, '{}'::jsonb);

  if v_project.reporting_state = 'live'
     and v_project.quality_tracking_started_at is not null then
    v_sync_start := greatest(v_project.quality_tracking_started_at::date, current_date - 60);
    if v_sync_start <= current_date - 1 then
      for v_day in
        select day::date
        from generate_series(v_sync_start, current_date - 1, interval '1 day') day
        where not exists (
          select 1 from public.sync_logs sl
          where sl.project_id = p_project_id
            and coalesce(sl.kind, 'records') = 'records'
            and sl.status = 'success'
            and sl.sync_from::date <= day::date
            and sl.sync_to::date >= day::date
            and sl.records_synced = sl.expected_records
            and sl.failed_records = 0
        )
      loop
        perform public.set_data_quality_issue(
          p_project_id, 'sync:' || v_day::text, 'sync', 'critical',
          array['records', 'sales', 'annual_value', 'conversion', 'retention',
                'service', 'hours', 'costs', 'analysis', 'export'],
          'Een deel van deze dag wordt opnieuw opgehaald; rapportcijfers zijn tijdelijk verborgen.',
          'Geen volledige records-sync geregistreerd voor ' || v_day::text || '.',
          v_day, v_day
        );
        v_seen_sync := array_append(v_seen_sync, 'sync:' || v_day::text);
      end loop;

      update public.data_quality_issues
      set resolved_at = now(), email_status = 'disabled'
      where project_id = p_project_id
        and source = 'sync'
        and resolved_at is null
        and period_start >= v_sync_start
        and period_end <= current_date - 1
        and not (issue_key = any(v_seen_sync));
    end if;
  end if;

  if v_project.project_type = 'inbound_service' then
    v_keys := array['handled_results', 'not_handled_results', 'other_results'];
    v_value_keys := '{}'::text[];
    v_result_metrics := array['service', 'analysis', 'export'];
  elsif v_project.project_type = 'inbound' then
    v_keys := array['retention_results', 'lost_results', 'partial_success_results',
                    'unreachable_results', 'other_results'];
    v_value_keys := array['retention_results', 'partial_success_results'];
    v_result_metrics := array['retention', 'annual_value', 'analysis', 'export'];
  else
    v_keys := array['sale_results', 'negative_argumentated',
                    'negative_not_argumentated', 'unreachable_results', 'other_results'];
    v_value_keys := array['sale_results'];
    v_result_metrics := array['sales', 'conversion', 'costs', 'annual_value',
                              'analysis', 'export'];
  end if;

  select min(beldatum_date), max(beldatum_date)
    into v_period_start, v_period_end
  from public.call_records where project_id = p_project_id;
  v_has_records := v_period_start is not null;

  if v_has_records
     and v_project.project_type <> 'inbound_service'
     and not (v_config ? 'flat_sale_value') then
    v_amount_col := nullif(v_config ->> 'amount_col', '');
    v_freq_col := nullif(v_config ->> 'freq_col', '');

    if v_amount_col is null or not exists (
      select 1 from public.call_records
      where project_id = p_project_id and raw_data ? v_amount_col
    ) then
      perform public.set_data_quality_issue(
        p_project_id, 'mapping:amount-field', 'mapping', 'critical',
        array['annual_value', 'export'],
        'De jaarwaarde wordt tijdelijk niet getoond omdat een bronveld wordt gecontroleerd.',
        format('Bedragveld %L ontbreekt in de aangeleverde data.', v_amount_col),
        v_period_start, v_period_end
      );
      v_seen := array_append(v_seen, 'mapping:amount-field');
    end if;

    if v_freq_col is null or not exists (
      select 1 from public.call_records
      where project_id = p_project_id and raw_data ? v_freq_col
    ) then
      perform public.set_data_quality_issue(
        p_project_id, 'mapping:frequency-field', 'mapping', 'critical',
        array['annual_value', 'export'],
        'De jaarwaarde wordt tijdelijk niet getoond omdat een bronveld wordt gecontroleerd.',
        format('Frequentieveld %L ontbreekt in de aangeleverde data.', v_freq_col),
        v_period_start, v_period_end
      );
      v_seen := array_append(v_seen, 'mapping:frequency-field');
    elsif jsonb_typeof(v_config -> 'freq_map') <> 'object' then
      perform public.set_data_quality_issue(
        p_project_id, 'mapping:frequency-map', 'mapping', 'critical',
        array['annual_value', 'export'],
        'De jaarwaarde wordt tijdelijk niet getoond omdat frequenties worden gecontroleerd.',
        'freq_map ontbreekt of is geen object.', v_period_start, v_period_end
      );
      v_seen := array_append(v_seen, 'mapping:frequency-map');
    else
      for v_row in
        select cr.raw_data ->> v_freq_col as value,
               min(cr.beldatum_date) as period_start,
               max(cr.beldatum_date) as period_end
        from public.call_records cr
        where cr.project_id = p_project_id
          and exists (
            select 1
            from public.quality_config_values(v_config, v_value_keys) positive
            where lower(btrim(positive.value)) = lower(btrim(cr.resultaat))
          )
          and nullif(btrim(cr.raw_data ->> v_freq_col), '') is not null
          and not exists (
            select 1 from jsonb_object_keys(v_config -> 'freq_map') mapped(key)
            where lower(btrim(mapped.key)) = lower(btrim(cr.raw_data ->> v_freq_col))
          )
        group by cr.raw_data ->> v_freq_col
      loop
        perform public.set_data_quality_issue(
          p_project_id,
          'drift:frequency:' || md5(lower(btrim(v_row.value))),
          'drift', 'critical', array['annual_value', 'export'],
          'De jaarwaarde wordt tijdelijk niet getoond omdat een nieuwe frequentie wordt gecontroleerd.',
          format('Onbekende frequentiewaarde: %L.', v_row.value),
          v_row.period_start, v_row.period_end
        );
        v_seen := array_append(v_seen, 'drift:frequency:' || md5(lower(btrim(v_row.value))));
      end loop;
    end if;
  end if;

  for v_row in
    select cr.resultaat as value,
           min(cr.beldatum_date) as period_start,
           max(cr.beldatum_date) as period_end
    from public.call_records cr
    where cr.project_id = p_project_id
      and nullif(btrim(cr.resultaat), '') is not null
      and not exists (
        select 1 from public.quality_config_values(v_config, v_keys) mapped
        where lower(btrim(mapped.value)) = lower(btrim(cr.resultaat))
      )
    group by cr.resultaat
  loop
    perform public.set_data_quality_issue(
      p_project_id,
      'drift:result:' || md5(lower(btrim(v_row.value))),
      'drift', 'critical', v_result_metrics,
      'Een nieuw resultaat wordt gecontroleerd; de geraakte cijfers zijn tijdelijk verborgen.',
      format('Onbekende resultaatcode: %L.', v_row.value),
      v_row.period_start, v_row.period_end
    );
    v_seen := array_append(v_seen, 'drift:result:' || md5(lower(btrim(v_row.value))));
  end loop;

  select min(day), max(day) into v_period_start, v_period_end
  from (
    select cr.beldatum_date as day
    from public.call_records cr
    left join public.daily_logged_time dlt
      on dlt.project_id = cr.project_id and dlt.date = cr.beldatum_date
    where cr.project_id = p_project_id
      and cr.beldatum_date >= current_date - 60
    group by cr.beldatum_date
    having coalesce(max(dlt.total_seconds), 0) <= 0
       and coalesce(sum(cr.gesprekstijd_sec), 0) <= 0
  ) missing_hours;

  if v_period_start is not null then
    perform public.set_data_quality_issue(
      p_project_id, 'hours:no-source', 'hours', 'critical',
      array['hours', 'costs', 'export'],
      'Uren en kosten zijn tijdelijk verborgen omdat de urenbron wordt gecontroleerd.',
      'Voor één of meer dagen ontbreekt zowel ingelogde tijd als gesprekstijd.',
      v_period_start, v_period_end
    );
    v_seen := array_append(v_seen, 'hours:no-source');
  end if;

  update public.data_quality_issues
  set resolved_at = now(), email_status = 'disabled'
  where project_id = p_project_id
    and source in ('mapping', 'drift', 'hours')
    and resolved_at is null
    and not (issue_key = any(v_seen));
end;
$$;

revoke all on function public.evaluate_project_quality(uuid) from public, anon, authenticated;
grant execute on function public.evaluate_project_quality(uuid) to service_role;

-- ---------------------------------------------------------------------------
-- Admin-RPC: kandidaten, goedkeuring en rollback
-- ---------------------------------------------------------------------------

create or replace function public.get_project_mapping_candidates(p_project_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_config jsonb;
  v_freq_col text;
  v_fields jsonb;
  v_results jsonb;
  v_frequencies jsonb;
begin
  if not (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'superadmin'::public.app_role)
  ) then raise exception 'Geen toegang'; end if;

  select coalesce(mapping_config, '{}'::jsonb) into v_config
  from public.projects where id = p_project_id;
  if not found then raise exception 'Project niet gevonden'; end if;
  v_freq_col := nullif(v_config ->> 'freq_col', '');

  select coalesce(jsonb_agg(jsonb_build_object('name', name, 'count', count)
                            order by count desc, name), '[]'::jsonb)
    into v_fields
  from (
    select field.name, count(*)::integer as count
    from public.call_records cr
    cross join lateral jsonb_object_keys(cr.raw_data) field(name)
    where cr.project_id = p_project_id
      and cr.beldatum_date >= current_date - 90
    group by field.name
  ) q;

  select coalesce(jsonb_agg(jsonb_build_object(
      'value', resultaat, 'count', count, 'last_date', last_date
    ) order by count desc, resultaat), '[]'::jsonb)
    into v_results
  from (
    select resultaat, count(*)::integer as count, max(beldatum_date) as last_date
    from public.call_records
    where project_id = p_project_id
      and beldatum_date >= current_date - 90
      and nullif(btrim(resultaat), '') is not null
    group by resultaat
  ) q;

  if v_freq_col is null then
    v_frequencies := '[]'::jsonb;
  else
    select coalesce(jsonb_agg(jsonb_build_object(
        'value', value, 'count', count, 'last_date', last_date
      ) order by count desc, value), '[]'::jsonb)
      into v_frequencies
    from (
      select raw_data ->> v_freq_col as value,
             count(*)::integer as count,
             max(beldatum_date) as last_date
      from public.call_records
      where project_id = p_project_id
        and beldatum_date >= current_date - 90
        and nullif(btrim(raw_data ->> v_freq_col), '') is not null
      group by raw_data ->> v_freq_col
    ) q;
  end if;

  return jsonb_build_object(
    'fields', v_fields,
    'results', v_results,
    'frequency_values', v_frequencies
  );
end;
$$;

revoke all on function public.get_project_mapping_candidates(uuid) from public, anon;
grant execute on function public.get_project_mapping_candidates(uuid) to authenticated;

create or replace function public.approve_project_mapping(
  p_project_id uuid,
  p_config jsonb,
  p_project_type text default null,
  p_hourly_rate numeric default null,
  p_hours_factor numeric default null
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_project_type text;
  v_keys text[];
  v_value_keys text[];
  v_row record;
  v_matches integer;
  v_version integer;
  v_amount_col text;
  v_freq_col text;
begin
  if not (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'superadmin'::public.app_role)
  ) then raise exception 'Alleen beheerders kunnen mappings goedkeuren'; end if;

  if p_config is null or jsonb_typeof(p_config) <> 'object' then
    raise exception 'Mappingconfiguratie moet een object zijn';
  end if;

  select * into v_project from public.projects where id = p_project_id for update;
  if not found then raise exception 'Project niet gevonden'; end if;
  v_project_type := coalesce(p_project_type, v_project.project_type, 'outbound');

  if v_project_type = 'inbound_service' then
    v_keys := array['handled_results', 'not_handled_results', 'other_results'];
    v_value_keys := '{}'::text[];
  elsif v_project_type = 'inbound' then
    v_keys := array['retention_results', 'lost_results', 'partial_success_results',
                    'unreachable_results', 'other_results'];
    v_value_keys := array['retention_results', 'partial_success_results'];
  else
    v_keys := array['sale_results', 'negative_argumentated',
                    'negative_not_argumentated', 'unreachable_results', 'other_results'];
    v_value_keys := array['sale_results'];
  end if;

  for v_row in
    select distinct resultaat
    from public.call_records
    where project_id = p_project_id and nullif(btrim(resultaat), '') is not null
  loop
    select count(*) into v_matches
    from unnest(v_keys) key_name
    cross join lateral jsonb_array_elements_text(
      case when jsonb_typeof(p_config -> key_name) = 'array'
           then p_config -> key_name else '[]'::jsonb end
    ) item(value)
    where lower(btrim(item.value)) = lower(btrim(v_row.resultaat));
    if v_matches <> 1 then
      raise exception 'Resultaat % moet in exact één categorie staan (nu %)',
        v_row.resultaat, v_matches;
    end if;
  end loop;

  if v_project_type <> 'inbound_service' and not (p_config ? 'flat_sale_value') then
    v_amount_col := nullif(p_config ->> 'amount_col', '');
    v_freq_col := nullif(p_config ->> 'freq_col', '');
    if exists (select 1 from public.call_records where project_id = p_project_id)
       and (v_amount_col is null or not exists (
         select 1 from public.call_records
         where project_id = p_project_id and raw_data ? v_amount_col
       )) then raise exception 'Bedragveld ontbreekt in de recente brondata'; end if;
    if exists (select 1 from public.call_records where project_id = p_project_id)
       and (v_freq_col is null or not exists (
         select 1 from public.call_records
         where project_id = p_project_id and raw_data ? v_freq_col
       )) then raise exception 'Frequentieveld ontbreekt in de recente brondata'; end if;
    if jsonb_typeof(p_config -> 'freq_map') <> 'object' then
      raise exception 'freq_map moet een object zijn';
    end if;
    if exists (
      select 1 from jsonb_each(p_config -> 'freq_map') item
      where jsonb_typeof(item.value) <> 'number'
         or (item.value #>> '{}')::numeric <= 0
    ) then raise exception 'Elke frequentie moet een positieve numerieke vermenigvuldiger hebben'; end if;

    if exists (
      select 1 from public.call_records cr
      where cr.project_id = p_project_id
        and exists (
          select 1
          from public.quality_config_values(p_config, v_value_keys) positive
          where lower(btrim(positive.value)) = lower(btrim(cr.resultaat))
        )
        and nullif(btrim(cr.raw_data ->> v_freq_col), '') is not null
        and not exists (
          select 1 from jsonb_object_keys(p_config -> 'freq_map') mapped(key)
          where lower(btrim(mapped.key)) = lower(btrim(cr.raw_data ->> v_freq_col))
        )
    ) then raise exception 'Niet alle frequentiewaarden hebben een expliciete vermenigvuldiger'; end if;
  end if;

  select coalesce(max(version), 0) + 1 into v_version
  from public.project_mapping_versions where project_id = p_project_id;

  update public.project_mapping_versions set is_active = false
  where project_id = p_project_id and is_active;

  update public.projects set
    mapping_config = p_config,
    project_type = coalesce(p_project_type, project_type),
    hourly_rate = coalesce(p_hourly_rate, hourly_rate),
    hours_factor = coalesce(p_hours_factor, hours_factor),
    updated_at = now()
  where id = p_project_id;

  insert into public.project_mapping_versions
    (project_id, version, config, approved_by, is_active)
  values (p_project_id, v_version, p_config, auth.uid(), true);

  perform public.evaluate_project_quality(p_project_id);
  return v_version;
end;
$$;

revoke all on function public.approve_project_mapping(uuid, jsonb, text, numeric, numeric)
  from public, anon;
grant execute on function public.approve_project_mapping(uuid, jsonb, text, numeric, numeric)
  to authenticated;

create or replace function public.rollback_project_mapping(
  p_project_id uuid,
  p_version integer
)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_source public.project_mapping_versions%rowtype;
  v_new_version integer;
begin
  if not (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'superadmin'::public.app_role)
  ) then raise exception 'Alleen beheerders kunnen mappings terugzetten'; end if;

  select * into v_source from public.project_mapping_versions
  where project_id = p_project_id and version = p_version;
  if not found then raise exception 'Mappingversie niet gevonden'; end if;

  perform 1 from public.projects where id = p_project_id for update;
  select coalesce(max(version), 0) + 1 into v_new_version
  from public.project_mapping_versions where project_id = p_project_id;
  update public.project_mapping_versions set is_active = false
  where project_id = p_project_id and is_active;
  update public.projects set mapping_config = v_source.config, updated_at = now()
  where id = p_project_id;
  insert into public.project_mapping_versions
    (project_id, version, config, approved_by, rolled_back_from, is_active, note)
  values (
    p_project_id, v_new_version, v_source.config, auth.uid(), v_source.id, true,
    format('Teruggezet naar versie %s', p_version)
  );
  perform public.evaluate_project_quality(p_project_id);
  return v_new_version;
end;
$$;

revoke all on function public.rollback_project_mapping(uuid, integer) from public, anon;
grant execute on function public.rollback_project_mapping(uuid, integer) to authenticated;

-- ---------------------------------------------------------------------------
-- Klantveilige, periodebewuste kwaliteitsstatus
-- ---------------------------------------------------------------------------

create or replace function public.get_project_data_quality(
  p_project_id uuid,
  p_start_date date,
  p_end_date date
)
returns table (
  status text,
  verified_through date,
  blocked_metrics text[],
  messages jsonb
)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_project public.projects%rowtype;
  v_effective_start date;
  v_effective_end date;
  v_first_missing date;
  v_issue_count integer := 0;
  v_issue_metrics text[] := '{}'::text[];
  v_messages jsonb := '[]'::jsonb;
  v_all_metrics constant text[] := array[
    'records', 'sales', 'annual_value', 'conversion', 'retention', 'service',
    'hours', 'costs', 'analysis', 'export'
  ];
begin
  if p_start_date is null or p_end_date is null or p_start_date > p_end_date then
    raise exception 'Ongeldige rapportageperiode';
  end if;

  select * into v_project from public.projects where id = p_project_id;
  if not found then raise exception 'Project niet gevonden'; end if;

  if not (
    public.has_role((select auth.uid()), 'admin'::public.app_role)
    or public.has_role((select auth.uid()), 'superadmin'::public.app_role)
    or exists (
      select 1 from public.customer_projects cp
      where cp.project_id = p_project_id and cp.user_id = (select auth.uid())
    )
  ) then raise exception 'Geen toegang'; end if;

  v_effective_end := least(p_end_date, current_date - 1);
  v_effective_start := greatest(
    p_start_date,
    coalesce(v_project.quality_tracking_started_at::date, p_start_date)
  );

  if v_effective_start <= v_effective_end and v_project.reporting_state = 'live' then
    select min(day)::date into v_first_missing
    from generate_series(v_effective_start, v_effective_end, interval '1 day') day
    where not exists (
      select 1 from public.sync_logs sl
      where sl.project_id = p_project_id
        and coalesce(sl.kind, 'records') = 'records'
        and sl.status = 'success'
        and sl.completed_at is not null
        and sl.sync_from::date <= day::date
        and sl.sync_to::date >= day::date
        and sl.records_synced = sl.expected_records
        and sl.failed_records = 0
    );
  end if;

  select count(distinct issue.id)::integer,
         coalesce(array_agg(distinct metric.value) filter (where metric.value is not null), '{}'::text[])
    into v_issue_count, v_issue_metrics
  from public.data_quality_issues issue
  left join lateral unnest(issue.affected_metrics) metric(value) on true
  where issue.project_id = p_project_id
    and issue.resolved_at is null
    and coalesce(issue.period_end, 'infinity'::date) >= p_start_date
    and coalesce(issue.period_start, '-infinity'::date) <= p_end_date;

  select coalesce(jsonb_agg(jsonb_build_object(
      'code', issue_key, 'text', public_message, 'severity', severity
    ) order by case severity when 'critical' then 1 when 'warning' then 2 else 3 end,
               last_seen_at desc), '[]'::jsonb)
    into v_messages
  from public.data_quality_issues issue
  where issue.project_id = p_project_id
    and issue.resolved_at is null
    and coalesce(issue.period_end, 'infinity'::date) >= p_start_date
    and coalesce(issue.period_start, '-infinity'::date) <= p_end_date;

  if v_first_missing is not null then
    v_messages := jsonb_build_array(jsonb_build_object(
      'code', 'sync:incomplete-period',
      'text', 'Een deel van de gekozen periode wordt opnieuw gecontroleerd.',
      'severity', 'critical'
    )) || v_messages;
  end if;

  if v_project.reporting_state = 'ended' then
    status := 'historical';
    blocked_metrics := '{}'::text[];
  elsif v_project.reporting_state = 'paused' then
    status := 'attention';
    blocked_metrics := '{}'::text[];
    v_messages := jsonb_build_array(jsonb_build_object(
      'code', 'project:paused',
      'text', 'Dit project is gepauzeerd; historische gegevens blijven beschikbaar.',
      'severity', 'info'
    )) || v_messages;
  elsif v_first_missing is null and v_issue_count = 0 then
    status := 'verified';
    blocked_metrics := '{}'::text[];
  else
    status := case when v_first_missing is not null then 'blocked' else 'attention' end;
    if v_project.quality_enforcement_enabled then
      blocked_metrics := case
        when v_first_missing is not null then v_all_metrics
        else v_issue_metrics
      end;
      if cardinality(blocked_metrics) > 0 then status := 'blocked'; end if;
    else
      blocked_metrics := '{}'::text[];
    end if;
  end if;

  if v_project.reporting_state in ('paused', 'ended') then
    select max(sl.sync_to::date) into verified_through
    from public.sync_logs sl
    where sl.project_id = p_project_id
      and coalesce(sl.kind, 'records') = 'records'
      and sl.status = 'success'
      and sl.records_synced = sl.expected_records
      and sl.failed_records = 0
      and sl.sync_to::date <= p_end_date;
  elsif v_effective_end < p_start_date then
    verified_through := p_end_date;
  elsif v_first_missing is null then
    verified_through := v_effective_end;
  elsif v_first_missing > v_effective_start then
    verified_through := v_first_missing - 1;
  else
    select max(sl.sync_to::date) into verified_through
    from public.sync_logs sl
    where sl.project_id = p_project_id
      and coalesce(sl.kind, 'records') = 'records'
      and sl.status = 'success'
      and sl.records_synced = sl.expected_records
      and sl.failed_records = 0
      and sl.sync_to::date < v_first_missing;
  end if;

  messages := v_messages;
  return next;
end;
$$;

revoke all on function public.get_project_data_quality(uuid, date, date) from public, anon;
grant execute on function public.get_project_data_quality(uuid, date, date) to authenticated;

-- De bestaande kolomvolgorde blijft staan; nieuwe veilige velden worden achteraan toegevoegd.
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
  vat_rate,
  reporting_state,
  report_template,
  basicall_project_id,
  quality_enforcement_enabled,
  quality_tracking_started_at
from public.projects;

-- Nulmeting: registreert problemen, maar blokkeert geen enkele klant zolang de
-- per-project quality_enforcement_enabled-vlag uit staat.
do $$
declare v_project record;
begin
  for v_project in select id from public.projects loop
    perform public.evaluate_project_quality(v_project.id);
  end loop;
end;
$$;

commit;
