-- Fix: get_project_annual_value gebruikte een exacte JSON-key lookup
-- (v_freq_map->>LOWER(TRIM(freqRaw))), waardoor "Per kwartaal" niet matchte
-- met freq_map-sleutel "kwartaal":4. De multiplier viel dan stilzwijgend
-- terug op 1, wat €105 te weinig opleverde voor STC WB 6 maanden (907)
-- week 20.
--
-- Frontend doet al substring-match in src/lib/statsHelpers.ts
-- (detectFrequencyFromConfig), maar de top-KPI gebruikt deze RPC voor
-- server-side aggregatie zodat we de divergentie krijgen.
--
-- Vervangen door substring-match: voor elke key in freq_map kijken of
-- LOWER(TRIM(freqRaw)) de key bevat of andersom (dezelfde regel als frontend).
-- Eerste match wint; volgorde is jsonb_each-volgorde (zelfde als JS
-- Object.entries-volgorde). Behoudt:
-- - eenmalig/0/e short-circuit niet (frontend doet die hard-coded boven map;
--   server skip is OK want freq_map bevat doorgaans al "eenmalig":1)
-- - numeric fallback voor pure-getal freq-velden waar geen freq_map bestaat

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

  -- Bereken totaal:
  -- 1. Parse bedrag uit raw_data via dynamische kolomnaam (NL komma → punt)
  -- 2. Bepaal multiplier via substring-match tegen freq_map; fallback numeriek; fallback 1
  SELECT COALESCE(SUM(
    (
      SELECT NULLIF(REGEXP_REPLACE(REPLACE(COALESCE(cr.raw_data->>v_amount_col, ''), ',', '.'), '[^0-9.\-]', '', 'g'), '')::numeric
    )
    *
    COALESCE(
      -- Substring-match tegen freq_map (zelfde semantiek als frontend
      -- detectFrequencyFromConfig). Pak de eerste match.
      (
        SELECT (kv.value)::text::numeric
        FROM jsonb_each(v_freq_map) kv
        WHERE LOWER(TRIM(COALESCE(cr.raw_data->>v_freq_col, ''))) <> ''
          AND (
            LOWER(TRIM(COALESCE(cr.raw_data->>v_freq_col, ''))) LIKE '%' || LOWER(kv.key) || '%'
            OR LOWER(kv.key) LIKE '%' || LOWER(TRIM(COALESCE(cr.raw_data->>v_freq_col, ''))) || '%'
          )
        LIMIT 1
      ),
      -- Pure-getal fallback: alleen als raw_data->>v_freq_col exact een getal is
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
