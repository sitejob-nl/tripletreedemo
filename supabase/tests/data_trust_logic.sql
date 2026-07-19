-- Functionele smoketest voor mappinggoedkeuring, rollback en complete/lege dagen.
-- Uitvoeren op een lokale/preview-database nadat de pending migratie is toegepast.

begin;

insert into auth.users (id)
values ('30000000-0000-0000-0000-000000000001')
on conflict (id) do nothing;
insert into public.user_roles (user_id, role)
values ('30000000-0000-0000-0000-000000000001', 'admin'::public.app_role)
on conflict do nothing;

insert into public.projects (
  id, name, project_key, basicall_project_id, is_active, project_type,
  mapping_config, reporting_state, quality_enforcement_enabled,
  quality_tracking_started_at
) values (
  '40000000-0000-0000-0000-000000000001', 'Trust logic fixture',
  'trust-logic-fixture', 999998, true, 'outbound', '{}'::jsonb,
  'live', true, current_date - 2
);

insert into public.call_records (
  project_id, basicall_record_id, beldatum_date, gesprekstijd_sec, resultaat, raw_data
) values (
  '40000000-0000-0000-0000-000000000001', 1, current_date - 1, 60, 'Sale',
  '{"bedrag":"10,00","frequentie":"maand"}'::jsonb
);

-- Lege dag is volledig; de volgende dag bevat exact één opgehaald record.
insert into public.sync_logs (
  project_id, status, kind, records_synced, expected_records, failed_records,
  sync_from, sync_to, completed_at
) values
  ('40000000-0000-0000-0000-000000000001', 'success', 'records', 0, 0, 0,
   current_date - 2, current_date - 2, now()),
  ('40000000-0000-0000-0000-000000000001', 'success', 'records', 1, 1, 0,
   current_date - 1, current_date - 1, now());

set local role authenticated;
select set_config('request.jwt.claim.sub', '30000000-0000-0000-0000-000000000001', true);

do $$
declare
  v_version integer;
  v_status text;
  v_bad_mapping_rejected boolean := false;
begin
  v_version := public.approve_project_mapping(
    '40000000-0000-0000-0000-000000000001',
    '{
      "amount_col":"bedrag",
      "freq_col":"frequentie",
      "freq_map":{"maand":12},
      "sale_results":["Sale"],
      "negative_argumentated":[],
      "negative_not_argumentated":[],
      "unreachable_results":[],
      "other_results":[]
    }'::jsonb,
    'outbound', 35, 1
  );
  if v_version <> 1 then raise exception 'Verwacht mappingversie 1'; end if;

  select q.status into v_status
  from public.get_project_data_quality(
    '40000000-0000-0000-0000-000000000001', current_date - 2, current_date
  ) q;
  if v_status <> 'verified' then
    raise exception 'Volledige plus nul-recorddag moeten verified zijn, status=%', v_status;
  end if;

  begin
    perform public.approve_project_mapping(
      '40000000-0000-0000-0000-000000000001',
      '{
        "amount_col":"bedrag",
        "freq_col":"frequentie",
        "freq_map":{"onbekend":1},
        "sale_results":["Sale"],
        "negative_argumentated":[],
        "negative_not_argumentated":[],
        "unreachable_results":[],
        "other_results":[]
      }'::jsonb,
      'outbound', 35, 1
    );
  exception when others then
    v_bad_mapping_rejected := position('frequentiewaarden' in sqlerrm) > 0;
  end;
  if not v_bad_mapping_rejected then
    raise exception 'Onbekende frequentiewaarde is niet afgewezen';
  end if;

  v_version := public.approve_project_mapping(
    '40000000-0000-0000-0000-000000000001',
    '{
      "amount_col":"bedrag",
      "freq_col":"frequentie",
      "reason_col":"reden",
      "freq_map":{"maand":12},
      "sale_results":["Sale"],
      "negative_argumentated":[],
      "negative_not_argumentated":[],
      "unreachable_results":[],
      "other_results":[]
    }'::jsonb,
    'outbound', 35, 1
  );
  if v_version <> 2 then raise exception 'Verwacht mappingversie 2'; end if;
  v_version := public.rollback_project_mapping(
    '40000000-0000-0000-0000-000000000001', 1
  );
  if v_version <> 3 then raise exception 'Rollback moet als versie 3 worden vastgelegd'; end if;
end;
$$;

reset role;
rollback;
