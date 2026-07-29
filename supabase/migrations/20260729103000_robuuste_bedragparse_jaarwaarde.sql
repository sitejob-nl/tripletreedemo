-- Jaarwaarde: één typefout in een bedrag mocht niet de hele week op €0 zetten.
--
-- Aanleiding (29-07-2026, PDV Diepe reactivatie 919, week 31): een agent typte in BasiCall
-- "5,.00" in het bedragveld. get_project_annual_value maakte daar via
-- REPLACE(',', '.') de string "5..00" van en castte die naar numeric. Dat gooit een
-- fout, en de blanket `EXCEPTION WHEN OTHERS THEN RETURN 0` van de functie ving hem op:
-- de KPI-kaart toonde €0,00 jaarwaarde voor de héle campagne die week, terwijl er 6
-- sales stonden. De klant zag dus geen fout maar een geloofwaardige nul.
--
-- Erger nog: de client-side kant (parseDutchFloat) leverde voor dezelfde waarde gewoon
-- 5 op, dus matrix/Excel-export en de KPI-kaart liepen uiteen — precies wat de
-- pariteitsafspraak tussen beide rekenpaden moet voorkomen.
--
-- Fix: één gedeelde, niet-falende parser. Regels (identiek gespiegeld in
-- src/lib/dataProcessing.ts → parseDutchFloat):
--   1. alles behalve cijfers . , en - weggooien;
--   2. bij twee scheidingstekens is de RECHTSE de decimaal ("1.234,56" NL, "1,234.56" EN);
--   3. alleen komma  -> decimaalteken;
--   4. herhaalde punten uit typefouten samenvouwen ("5..00" -> "5.00");
--   5. de eerste geldige numerieke token pakken; lukt niets, dan NULL i.p.v. een fout.
--
-- RESTRISICO: de `EXCEPTION WHEN OTHERS THEN RETURN 0` onderaan get_project_annual_value
-- blijft staan en zet bij élke onverwachte fout stilletjes €0 neer — geen foutmelding, wel
-- een geloofwaardig getal. Het bedrag-parsen was de bekende trigger en is nu afgevangen;
-- valt de jaarwaarde ooit weer onverklaarbaar op 0, verdenk dan eerst deze vanger.

create or replace function public.parse_amount_text(p_value text)
returns numeric
language plpgsql
immutable
set search_path to 'public'
as $$
declare
  v text;
  v_comma int;
  v_dot int;
begin
  if p_value is null then return null; end if;

  v := regexp_replace(p_value, '[^0-9.,\-]', '', 'g');
  if v = '' then return null; end if;

  v_comma := position(',' in reverse(v));
  v_dot := position('.' in reverse(v));

  if v_comma > 0 and v_dot > 0 then
    -- Het scheidingsteken dat het dichtst bij het eind staat, is de decimaal.
    if v_comma < v_dot then
      v := replace(replace(v, '.', ''), ',', '.');
    else
      v := replace(v, ',', '');
    end if;
  elsif v_comma > 0 then
    v := replace(v, ',', '.');
  end if;

  v := regexp_replace(v, '\.{2,}', '.', 'g');
  -- LET OP: non-capturing group. substring(... from pattern) geeft bij een gewone
  -- groep de INHOUD VAN DIE GROEP terug, niet de hele match — met '(\.[0-9]+)?' werd
  -- "10.00" dus ".00" en "12" zelfs NULL.
  v := substring(v from '-?[0-9]+(?:\.[0-9]+)?');

  if v is null or v = '' then return null; end if;
  return v::numeric;
exception
  when others then
    -- Nooit doorgooien: de aanroeper vangt fouten met een RETURN 0 op de hele som af.
    return null;
end;
$$;

comment on function public.parse_amount_text(text) is
  'Leest een bedrag uit vrije BasiCall-invoer (NL/EN scheidingstekens, typefouten) en geeft NULL i.p.v. een fout wanneer er geen getal in zit. Spiegel van parseDutchFloat in src/lib/dataProcessing.ts.';

create or replace function public.get_project_annual_value(
  p_project_id uuid,
  p_start_date date default null::date,
  p_end_date date default null::date,
  p_week_number integer default null::integer,
  p_year integer default null::integer
)
returns numeric
language plpgsql
stable
set search_path to 'public'
as $function$
DECLARE
  v_mapping jsonb;
  v_amount_col text;
  v_freq_col text;
  v_freq_map jsonb;
  v_sale_results text[];
  v_total numeric := 0;
  v_flat text;
  v_project_type text;
  v_substring_patterns text[];
BEGIN
  SELECT mapping_config, project_type::text INTO v_mapping, v_project_type FROM projects WHERE id = p_project_id;
  IF v_mapping IS NULL THEN RETURN 0; END IF;

  -- Inbound (retentie): behouden waarde telt retention_results ∪ partial_success_results
  -- met SUBSTRING-match — mirror van categorizeInboundResult/matchesAny (statsHelpers.ts).
  IF v_project_type = 'inbound' THEN
    SELECT ARRAY(
      SELECT DISTINCT LOWER(TRIM(e.val)) FROM (
        SELECT jsonb_array_elements_text(COALESCE(v_mapping->'retention_results', '[]'::jsonb)) AS val
        UNION ALL
        SELECT jsonb_array_elements_text(COALESCE(v_mapping->'partial_success_results', '[]'::jsonb))
      ) e WHERE TRIM(e.val) <> ''
    ) INTO v_substring_patterns;
    IF v_substring_patterns IS NULL OR array_length(v_substring_patterns, 1) IS NULL THEN
      RETURN 0;
    END IF;
  END IF;

  IF v_mapping->'sale_results' IS NOT NULL AND jsonb_array_length(v_mapping->'sale_results') > 0 THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_mapping->'sale_results')) INTO v_sale_results;
  ELSE
    v_sale_results := ARRAY['Sale','Donateur','Toezegging','Afspraak','Positief','Verkoop','Ja','Akkoord'];
  END IF;

  v_sale_results := v_sale_results || ARRAY[
    'sale','donateur','toezegging','maandelijks','jaarlijks','wil lid worden',
    'machtiging per maand','machtiging per kwartaal','machtiging per jaar','machtiging per half jaar'
  ];

  v_flat := v_mapping->>'flat_sale_value';
  IF v_flat IS NOT NULL AND v_flat ~ '^[0-9]+([.,][0-9]+)?$' AND REPLACE(v_flat, ',', '.')::numeric > 0 THEN
    SELECT COUNT(*)::numeric * REPLACE(v_flat, ',', '.')::numeric
    INTO v_total
    FROM call_records cr
    WHERE cr.project_id = p_project_id
      AND (
        (v_project_type = 'inbound' AND EXISTS (
          SELECT 1 FROM unnest(v_substring_patterns) pat
          WHERE position(pat IN LOWER(TRIM(cr.resultaat))) > 0
        ))
        OR (v_project_type IS DISTINCT FROM 'inbound'
            AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x))
      )
      AND (p_start_date IS NULL OR cr.beldatum_date >= p_start_date)
      AND (p_end_date IS NULL OR cr.beldatum_date <= p_end_date)
      AND (p_week_number IS NULL OR cr.week_number = p_week_number)
      AND (p_year IS NULL OR (cr.beldatum_date >= (p_year || '-01-01')::date AND cr.beldatum_date <= (p_year || '-12-31')::date));
    RETURN v_total;
  END IF;

  v_amount_col := v_mapping->>'amount_col';
  v_freq_col := v_mapping->>'freq_col';
  v_freq_map := COALESCE(v_mapping->'freq_map', '{}'::jsonb);
  IF v_amount_col IS NULL OR v_freq_col IS NULL THEN RETURN 0; END IF;

  SELECT COALESCE(SUM(
    -- Bedrag via de niet-falende parser: onleesbare invoer telt als 0 voor dat ene record,
    -- in plaats van de hele som naar 0 te laten klappen via de EXCEPTION-vanger onderaan.
    COALESCE(
      public.parse_amount_text(cr.raw_data->>v_amount_col),
      public.parse_amount_text(cr.raw_data->>'termijnbedrag'),
      public.parse_amount_text(cr.raw_data->>'Bedrag'),
      0
    )
    *
    COALESCE(
      (
        SELECT (kv.value)::text::numeric
        FROM jsonb_each(v_freq_map) kv
        WHERE LOWER(TRIM(COALESCE(cr.raw_data->>v_freq_col, ''))) <> ''
          AND (
            LOWER(TRIM(COALESCE(cr.raw_data->>v_freq_col, ''))) = LOWER(kv.key)
            OR LOWER(TRIM(COALESCE(cr.raw_data->>v_freq_col, ''))) LIKE '%' || LOWER(kv.key) || '%'
            OR LOWER(kv.key) LIKE '%' || LOWER(TRIM(COALESCE(cr.raw_data->>v_freq_col, ''))) || '%'
          )
        ORDER BY
          CASE
            WHEN LOWER(TRIM(COALESCE(cr.raw_data->>v_freq_col, ''))) = LOWER(kv.key) THEN 0
            WHEN LOWER(TRIM(COALESCE(cr.raw_data->>v_freq_col, ''))) LIKE '%' || LOWER(kv.key) || '%' THEN 1
            ELSE 2
          END,
          LENGTH(kv.key) DESC
        LIMIT 1
      ),
      NULLIF(REGEXP_REPLACE(COALESCE(cr.raw_data->>v_freq_col, ''), '[^0-9]', '', 'g'), '')::numeric,
      (
        SELECT (kv.value)::text::numeric
        FROM jsonb_each(v_freq_map) kv
        WHERE LOWER(TRIM(COALESCE(cr.resultaat, ''))) <> ''
          AND (
            LOWER(TRIM(COALESCE(cr.resultaat, ''))) = LOWER(kv.key)
            OR LOWER(TRIM(COALESCE(cr.resultaat, ''))) LIKE '%' || LOWER(kv.key) || '%'
            OR LOWER(kv.key) LIKE '%' || LOWER(TRIM(COALESCE(cr.resultaat, ''))) || '%'
          )
        ORDER BY
          CASE
            WHEN LOWER(TRIM(COALESCE(cr.resultaat, ''))) = LOWER(kv.key) THEN 0
            WHEN LOWER(TRIM(COALESCE(cr.resultaat, ''))) LIKE '%' || LOWER(kv.key) || '%' THEN 1
            ELSE 2
          END,
          LENGTH(kv.key) DESC
        LIMIT 1
      ),
      1
    )
  ), 0)
  INTO v_total
  FROM call_records cr
  WHERE cr.project_id = p_project_id
    AND (
      (v_project_type = 'inbound' AND EXISTS (
        SELECT 1 FROM unnest(v_substring_patterns) pat
        WHERE position(pat IN LOWER(TRIM(cr.resultaat))) > 0
      ))
      OR (v_project_type IS DISTINCT FROM 'inbound'
          AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x))
    )
    AND (p_start_date IS NULL OR cr.beldatum_date >= p_start_date)
    AND (p_end_date IS NULL OR cr.beldatum_date <= p_end_date)
    AND (p_week_number IS NULL OR cr.week_number = p_week_number)
    AND (p_year IS NULL OR (cr.beldatum_date >= (p_year || '-01-01')::date AND cr.beldatum_date <= (p_year || '-12-31')::date));

  RETURN v_total;
EXCEPTION
  WHEN OTHERS THEN
    RETURN 0;
END;
$function$;
