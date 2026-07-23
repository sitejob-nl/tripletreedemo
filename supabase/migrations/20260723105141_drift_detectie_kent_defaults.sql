-- Drift-detectie gebruikte alleen mapping_config, terwijl de rekenpaden de UNION van
-- config + hardcoded defaults gebruiken (statsHelpers.ts). Codes die alléén via de
-- defaults herkend worden ('Geen gehoor', 'Blacklisted', 'Is al donateur') werden
-- daardoor als "Onbekende resultaatcode" gemeld terwijl het dashboard ze correct telt:
-- 251 van de 344 meldingen op 23-07-2026 waren vals. Dat maakt het admin-signaal
-- waardeloos (alarmmoeheid) — precies wat de kaart moest voorkomen.
--
-- quality_result_is_mapped() spiegelt classifyResultCoverage() en vervangt de
-- exact-match-tegen-alle-lijsten in de drift-loop. Geen gedragsverandering voor
-- klanten: quality_enforcement_enabled staat overal op false, dus er wordt geen
-- cijfer verborgen. Na toepassing: 344 -> 93 drift-meldingen, en een pariteitscheck
-- over alle 524 (project, resultaatcode)-combinaties gaf 0 afwijkingen tussen SQL en TS.

create or replace function public.quality_result_defaults(p_kind text)
returns text[]
language sql
immutable
set search_path to 'public'
as $$
  -- Spiegel van de defaults in src/lib/statsHelpers.ts.
  -- BIJ WIJZIGEN: pas beide kanten aan, anders lopen ze weer uiteen.
  select case p_kind
    when 'sale' then array[
      'sale','donateur','toezegging','maandelijks','jaarlijks','wil lid worden',
      'machtiging per maand','machtiging per kwartaal','machtiging per jaar',
      'machtiging per half jaar']
    when 'unreachable' then array[
      'geen gehoor','voicemail','in gesprek','niet bereikbaar','niet bereikt',
      'terugbellen','terugbelafspraak','niet beschikbaar','onjuiste naw-gegevens',
      'onjuiste naw','foutief telefoonnummer','foutief nummer','foutieve telefoon',
      'fax','belpogingen','blacklist','dialer','abandoned','onjuist naw','nawt',
      'dubbel in lijst','recent benaderd','niet meer benaderen','leeg']
    when 'neg_arg' then array[
      'geen geld','heeft al machtiging','steunt al te veel goede doelen','te oud',
      'doet geen zaken telefonisch','geen medewerking','is bot','wil niet',
      'geen interesse','te jong','geen budget','financiele redenen',
      'financiele reden','financiële reden','ander goed doel']
    when 'neg_notarg' then array[
      'niet meer benaderen','onjuiste naw-gegevens','onjuiste naw','is bedrijf',
      'contactpersoon overleden','overleden','fax','is verhuisd','verhuisd',
      'spreekt geen nederlands','geen telemarketing','al donateur',
      'foutief telefoonnummer','bmnr','niet bereikbaar','geen gehoor','voicemail',
      'in gesprek','terugbellen','niet beschikbaar']
    else '{}'::text[]
  end;
$$;

create or replace function public.quality_result_is_mapped(
  p_config jsonb, p_project_type text, p_resultaat text
) returns boolean
language sql
stable
set search_path to 'public'
as $$
  -- Spiegel van classifyResultCoverage(): UNION van mapping_config + defaults, met per
  -- categorie dezelfde matchwijze als de rekenpaden — EXACT voor sale/handled (anders
  -- matcht 'donateur' op "Is al donateur"), SUBSTRING voor onbereikbaar/negatief/
  -- retentie. position() i.p.v. LIKE zodat % en _ in een configwaarde geen wildcard
  -- worden. Lege entries tellen niet mee (die zouden élke code matchen).
  with r as (select lower(btrim(p_resultaat)) as res),
  exact_hit as (
    select exists (
      select 1 from unnest(
        case
          when p_project_type = 'inbound_service' then
            (select coalesce(array_agg(v), '{}') from public.quality_config_values(p_config, array['handled_results','not_handled_results','other_results']) v)
          when p_project_type = 'inbound' then
            (select coalesce(array_agg(v), '{}') from public.quality_config_values(p_config, array['other_results']) v)
          else
            (select coalesce(array_agg(v), '{}') from public.quality_config_values(p_config, array['sale_results','other_results']) v)
            || public.quality_result_defaults('sale')
        end
      ) e, r
      where nullif(btrim(e), '') is not null and lower(btrim(e)) = r.res
    ) as hit
  ),
  substring_hit as (
    select exists (
      select 1 from unnest(
        case
          when p_project_type = 'inbound_service' then '{}'::text[]
          when p_project_type = 'inbound' then
            (select coalesce(array_agg(v), '{}') from public.quality_config_values(p_config, array['retention_results','lost_results','partial_success_results','unreachable_results']) v)
            || public.quality_result_defaults('unreachable')
          else
            (select coalesce(array_agg(v), '{}') from public.quality_config_values(p_config, array['unreachable_results','negative_argumentated','negative_not_argumentated']) v)
            || public.quality_result_defaults('unreachable')
            || public.quality_result_defaults('neg_arg')
            || public.quality_result_defaults('neg_notarg')
        end
      ) e, r
      where nullif(btrim(e), '') is not null and position(lower(btrim(e)) in r.res) > 0
    ) as hit
  )
  select (select hit from exact_hit) or (select hit from substring_hit);
$$;

create or replace function public.evaluate_project_quality(p_project_id uuid)
 returns void
 language plpgsql
 security definer
 set search_path to 'public'
as $function$
declare
  v_project public.projects%rowtype;
  v_config jsonb;
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
    v_value_keys := '{}'::text[];
    v_result_metrics := array['service', 'analysis', 'export'];
  elsif v_project.project_type = 'inbound' then
    v_value_keys := array['retention_results', 'partial_success_results'];
    v_result_metrics := array['retention', 'annual_value', 'analysis', 'export'];
  else
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

  -- GEWIJZIGD: quality_result_is_mapped i.p.v. exact-match tegen alleen de config,
  -- zodat de defaults meetellen precies zoals in de rekenpaden.
  for v_row in
    select cr.resultaat as value,
           min(cr.beldatum_date) as period_start,
           max(cr.beldatum_date) as period_end
    from public.call_records cr
    where cr.project_id = p_project_id
      and nullif(btrim(cr.resultaat), '') is not null
      and not public.quality_result_is_mapped(v_config, v_project.project_type::text, cr.resultaat)
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
$function$;
