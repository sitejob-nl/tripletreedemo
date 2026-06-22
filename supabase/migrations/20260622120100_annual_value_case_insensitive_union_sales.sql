-- get_project_annual_value: sale-predicaat case-insensitive + UNION met universele
-- sale-defaults (mirror van SALE_RESULTS in src/lib/statsHelpers.ts). Reden: jaarwaarde
-- moet exact hetzelfde sale-predicaat gebruiken als de sales-telling (get_project_kpi_totals
-- / isSale), anders lopen "aantal positief" en jaarwaarde uiteen. Alle freq-map- en
-- flat_sale_value-logica blijft ONGEWIJZIGD; alleen de twee `cr.resultaat = ANY(...)`
-- predicaten en de opbouw van v_sale_results wijzigen.
CREATE OR REPLACE FUNCTION public.get_project_annual_value(p_project_id uuid, p_start_date date DEFAULT NULL::date, p_end_date date DEFAULT NULL::date, p_week_number integer DEFAULT NULL::integer, p_year integer DEFAULT NULL::integer)
 RETURNS numeric
 LANGUAGE plpgsql
 STABLE
 SET search_path TO 'public'
AS $function$
DECLARE
  v_mapping jsonb;
  v_amount_col text;
  v_freq_col text;
  v_freq_map jsonb;
  v_sale_results text[];
  v_total numeric := 0;
  v_flat text;
BEGIN
  SELECT mapping_config INTO v_mapping FROM projects WHERE id = p_project_id;
  IF v_mapping IS NULL THEN RETURN 0; END IF;

  IF v_mapping->'sale_results' IS NOT NULL AND jsonb_array_length(v_mapping->'sale_results') > 0 THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_mapping->'sale_results')) INTO v_sale_results;
  ELSE
    v_sale_results := ARRAY['Sale','Donateur','Toezegging','Afspraak','Positief','Verkoop','Ja','Akkoord'];
  END IF;

  -- Union met universele sale-defaults (mirror van SALE_RESULTS in statsHelpers.ts), zodat
  -- forgotten/anders-gespelde codes (bv. "machtiging per kwartaal") ook meetellen. Match
  -- is case-insensitive gelijkheid (zie predicaten hieronder). Kale eenmalig/per kwartaal/
  -- halfjaarlijks staan hier BEWUST NIET in (projectafhankelijk, via mapping_config).
  v_sale_results := v_sale_results || ARRAY[
    'sale','donateur','toezegging','maandelijks','jaarlijks','wil lid worden',
    'machtiging per maand','machtiging per kwartaal','machtiging per jaar','machtiging per half jaar'
  ];

  -- VAST BEDRAG PER SALE (bv. ANBO: betaald per aanmelding). Heeft voorrang.
  v_flat := v_mapping->>'flat_sale_value';
  IF v_flat IS NOT NULL AND v_flat ~ '^[0-9]+([.,][0-9]+)?$' AND REPLACE(v_flat, ',', '.')::numeric > 0 THEN
    SELECT COUNT(*)::numeric * REPLACE(v_flat, ',', '.')::numeric
    INTO v_total
    FROM call_records cr
    WHERE cr.project_id = p_project_id
      AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x)
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
    COALESCE(
      NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(cr.raw_data->>v_amount_col, ''), ',', '.'), '[^0-9.\-]', '', 'g'), '')::numeric,
      NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(cr.raw_data->>'termijnbedrag', ''), ',', '.'), '[^0-9.\-]', '', 'g'), '')::numeric,
      NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(cr.raw_data->>'Bedrag', ''), ',', '.'), '[^0-9.\-]', '', 'g'), '')::numeric,
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
    AND LOWER(TRIM(cr.resultaat)) = ANY(SELECT LOWER(TRIM(x)) FROM unnest(v_sale_results) x)
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
