-- get_project_annual_value: vervang ongetypte OR-substring match door een
-- duidelijke prioriteit-ordening, zodat een korte waarde ("Maandelijks") niet
-- foutief matcht met een langere, specifiekere key ("2 maandlijks") via de
-- key-bevat-value tak.
--
-- Match priority (meest specifieke eerst):
--   0. Exact match (value = key)
--   1. Value bevat key, langste key wint (bv "maandelijks" wint van "maand")
--   2. Key bevat value, langste key wint (alleen voor korte afkortingen zoals "m")
--
-- Voor Trombose folder (761) week 20: zonder deze fix kreeg de bimaandelijkse
-- machtiging (€7,50, freq "2 maandlijks") foutief multiplier 12 ipv 6, en de
-- normale Maandelijks-records kregen ook 6 ipv 12. Met deze fix: jaarwaarde €255.

CREATE OR REPLACE FUNCTION public.get_project_annual_value(
  p_project_id uuid,
  p_start_date date DEFAULT NULL::date,
  p_end_date date DEFAULT NULL::date,
  p_week_number integer DEFAULT NULL::integer,
  p_year integer DEFAULT NULL::integer
)
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
BEGIN
  SELECT mapping_config INTO v_mapping
  FROM projects WHERE id = p_project_id;

  IF v_mapping IS NULL THEN RETURN 0; END IF;

  v_amount_col := v_mapping->>'amount_col';
  v_freq_col := v_mapping->>'freq_col';
  v_freq_map := COALESCE(v_mapping->'freq_map', '{}'::jsonb);

  IF v_amount_col IS NULL OR v_freq_col IS NULL THEN RETURN 0; END IF;

  IF v_mapping->'sale_results' IS NOT NULL AND jsonb_array_length(v_mapping->'sale_results') > 0 THEN
    SELECT ARRAY(SELECT jsonb_array_elements_text(v_mapping->'sale_results')) INTO v_sale_results;
  ELSE
    v_sale_results := ARRAY['Sale','Donateur','Toezegging','Afspraak','Positief','Verkoop','Ja','Akkoord'];
  END IF;

  SELECT COALESCE(SUM(
    (
      SELECT NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(cr.raw_data->>v_amount_col, ''), ',', '.'), '[^0-9.\-]', '', 'g'), '')::numeric
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
      1
    )
  ), 0)
  INTO v_total
  FROM call_records cr
  WHERE cr.project_id = p_project_id
    AND cr.resultaat = ANY(v_sale_results)
    AND cr.raw_data->>v_amount_col IS NOT NULL
    AND cr.raw_data->>v_freq_col IS NOT NULL
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
