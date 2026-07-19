-- Herhaalbare RLS-smoketest voor de centrale trustlaag.
-- Uitvoeren op een lokale/preview-database NADAT de pending migratie is toegepast.
-- De transactie wordt altijd teruggedraaid.

begin;

do $$
declare
  v_admin constant uuid := '10000000-0000-0000-0000-000000000001';
  v_assigned constant uuid := '10000000-0000-0000-0000-000000000002';
  v_unassigned constant uuid := '10000000-0000-0000-0000-000000000003';
  v_project constant uuid := '20000000-0000-0000-0000-000000000001';
begin
  insert into auth.users (id)
  values
    (v_admin),
    (v_assigned),
    (v_unassigned)
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (v_admin, 'admin'::public.app_role)
  on conflict do nothing;

  insert into public.projects (
    id, name, project_key, basicall_project_id, is_active, project_type,
    mapping_config, reporting_state, quality_enforcement_enabled,
    quality_tracking_started_at
  ) values (
    v_project, 'RLS quality fixture', 'rls-quality-fixture', 999999, true, 'outbound',
    '{"amount_col":"bedrag","freq_col":"frequentie","freq_map":{"maand":12},"sale_results":[],"negative_argumentated":[],"negative_not_argumentated":[],"unreachable_results":[],"other_results":[]}'::jsonb,
    'live', false, current_date
  ) on conflict (id) do nothing;

  insert into public.customer_projects (user_id, project_id, created_by)
  values (v_assigned, v_project, v_admin)
  on conflict do nothing;

  perform public.set_data_quality_issue(
    v_project, 'rls:test', 'drift', 'critical', array['export'],
    'Klantveilige testmelding.', 'Technisch testdetail.', current_date, current_date
  );
end;
$$;

-- Admin: technische tabel en veilige RPC zijn toegankelijk.
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000001', true);
do $$
begin
  if (select count(*) from public.data_quality_issues where issue_key = 'rls:test') <> 1 then
    raise exception 'RLS-test mislukt: admin ziet het issue niet';
  end if;
  perform * from public.get_project_data_quality(
    '20000000-0000-0000-0000-000000000001', current_date, current_date
  );
end;
$$;

-- Toegewezen klant: geen technische details, wel veilige status.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000002', true);
do $$
begin
  if (select count(*) from public.data_quality_issues) <> 0 then
    raise exception 'RLS-test mislukt: toegewezen klant ziet technische issues';
  end if;
  perform * from public.get_project_data_quality(
    '20000000-0000-0000-0000-000000000001', current_date, current_date
  );
end;
$$;

-- Niet-toegewezen klant: geen tabelrijen en de RPC weigert toegang.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub', '10000000-0000-0000-0000-000000000003', true);
do $$
declare v_denied boolean := false;
begin
  if (select count(*) from public.data_quality_issues) <> 0 then
    raise exception 'RLS-test mislukt: niet-toegewezen klant ziet technische issues';
  end if;
  begin
    perform * from public.get_project_data_quality(
      '20000000-0000-0000-0000-000000000001', current_date, current_date
    );
  exception when others then
    v_denied := position('Geen toegang' in sqlerrm) > 0;
  end;
  if not v_denied then
    raise exception 'RLS-test mislukt: niet-toegewezen klant kreeg RPC-toegang';
  end if;
end;
$$;

-- Anon: geen SELECT-grant en geen EXECUTE-grant.
reset role;
set local role anon;
select set_config('request.jwt.claim.sub', '', true);
do $$
declare
  v_table_denied boolean := false;
  v_rpc_denied boolean := false;
begin
  begin
    perform count(*) from public.data_quality_issues;
  exception when insufficient_privilege then
    v_table_denied := true;
  end;
  begin
    perform * from public.get_project_data_quality(
      '20000000-0000-0000-0000-000000000001', current_date, current_date
    );
  exception when insufficient_privilege then
    v_rpc_denied := true;
  end;
  if not v_table_denied or not v_rpc_denied then
    raise exception 'RLS-test mislukt: anon heeft toegang';
  end if;
end;
$$;

reset role;
rollback;
