-- get_project_annual_value: ondersteun een VAST bedrag per sale via mapping_config.flat_sale_value.
-- REEDS OP LIVE via MCP. Voor lead-/aanmeldcampagnes die per sale betaald worden
-- (ANBO: €37,08/sale) waar BasiCall geen termijnbedrag/frequentie levert. Als flat_sale_value > 0
-- is, telt elke sale exact dat bedrag (geen bedrag-veld/frequentie). Heeft voorrang op de
-- bedrag×frequentie-logica (met fallback). Conservatief: alleen actief waar flat_sale_value gezet is.
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

  -- VAST BEDRAG PER SALE (bv. ANBO: betaald per aanmelding). Heeft voorrang.
  v_flat := v_mapping->>'flat_sale_value';
  IF v_flat IS NOT NULL AND v_flat ~ '^[0-9]+([.,][0-9]+)?$' AND REPLACE(v_flat, ',', '.')::numeric > 0 THEN
    SELECT COUNT(*)::numeric * REPLACE(v_flat, ',', '.')::numeric
    INTO v_total
    FROM call_records cr
    WHERE cr.project_id = p_project_id
      AND cr.resultaat = ANY(v_sale_results)
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
    AND cr.resultaat = ANY(v_sale_results)
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
