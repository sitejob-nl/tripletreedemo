-- 1. Demo Project aanmaken
INSERT INTO public.projects (
  name, 
  project_key, 
  basicall_project_id, 
  basicall_token,
  hourly_rate,
  vat_rate,
  project_type,
  mapping_config,
  is_active
) VALUES (
  'Demo Campagne',
  'demo',
  0,
  'demo-token-niet-synchroniseren',
  35.00,
  21,
  'outbound',
  '{
    "amount_col": "termijnbedrag",
    "freq_col": "frequentie",
    "reason_col": "opzegreden",
    "freq_map": {
      "maand": 12, "maandelijks": 12, "mnd": 12, "m": 12,
      "kwartaal": 4, "k": 4,
      "jaar": 1, "jaarlijks": 1, "j": 1,
      "eenmalig": 1, "e": 1
    },
    "sale_results": ["Maandelijks", "Jaarlijks", "Eenmalig", "Sale", "Donateur"],
    "negative_reasoned": ["Financiele reden", "Ander goed doel", "Geen interesse"],
    "negative_unreasoned": ["Geen gehoor", "Voicemail/antwoordapparaat", "Max. belpogingen bereikt"]
  }'::jsonb,
  true
);

-- 2. Demo gebruiker koppelen aan het project
INSERT INTO public.customer_projects (user_id, project_id, created_by)
SELECT 
  '547e3b00-48c2-4f64-94a7-c96ad0e0fe55'::uuid,
  id,
  '547e3b00-48c2-4f64-94a7-c96ad0e0fe55'::uuid
FROM public.projects 
WHERE project_key = 'demo';

-- 3. Demo call records genereren (200 records verdeeld over weken 2-6 van 2026)
INSERT INTO public.call_records (basicall_record_id, project_id, beldatum, beltijd, gesprekstijd_sec, resultaat, week_number, raw_data)
SELECT 
  900000 + row_number() OVER () as basicall_record_id,
  (SELECT id FROM projects WHERE project_key = 'demo') as project_id,
  date_val as beldatum,
  time_val as beltijd,
  duration as gesprekstijd_sec,
  result as resultaat,
  EXTRACT(ISOYEAR FROM date_val::date) * 100 + EXTRACT(WEEK FROM date_val::date) as week_number,
  raw::jsonb as raw_data
FROM (
  -- Week 2: Sales
  SELECT '2026-01-05'::date as date_val, '09:15:00'::time as time_val, 245 as duration, 'Maandelijks' as result, '{"termijnbedrag": "10,00", "frequentie": "maand", "bc_belpogingen": 2, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}' as raw
  UNION ALL SELECT '2026-01-05', '09:45:00', 320, 'Maandelijks', '{"termijnbedrag": "15,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-05', '10:30:00', 180, 'Jaarlijks', '{"termijnbedrag": "100,00", "frequentie": "jaar", "bc_belpogingen": 3, "woonplaats": "Utrecht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-01-06', '11:00:00', 290, 'Maandelijks', '{"termijnbedrag": "7,50", "frequentie": "maand", "bc_belpogingen": 2, "woonplaats": "Den Haag", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-06', '14:20:00', 210, 'Eenmalig', '{"termijnbedrag": "25,00", "frequentie": "eenmalig", "bc_belpogingen": 1, "woonplaats": "Eindhoven", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Eenmalig"}'
  UNION ALL SELECT '2026-01-07', '09:10:00', 350, 'Maandelijks', '{"termijnbedrag": "20,00", "frequentie": "maand", "bc_belpogingen": 2, "woonplaats": "Tilburg", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-07', '10:45:00', 275, 'Jaarlijks', '{"termijnbedrag": "75,00", "frequentie": "jaar", "bc_belpogingen": 1, "woonplaats": "Groningen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-01-08', '13:30:00', 195, 'Maandelijks', '{"termijnbedrag": "12,50", "frequentie": "maand", "bc_belpogingen": 3, "woonplaats": "Almere", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-09', '15:00:00', 310, 'Eenmalig', '{"termijnbedrag": "50,00", "frequentie": "eenmalig", "bc_belpogingen": 2, "woonplaats": "Breda", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Eenmalig"}'
  UNION ALL SELECT '2026-01-09', '16:15:00', 240, 'Maandelijks', '{"termijnbedrag": "5,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Nijmegen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  -- Week 2: Negatief met reden
  UNION ALL SELECT '2026-01-05', '10:00:00', 120, 'Financiele reden', '{"opzegreden": "Geen geld momenteel", "bc_belpogingen": 2, "woonplaats": "Apeldoorn", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-05', '11:30:00', 95, 'Ander goed doel', '{"opzegreden": "Geeft al aan Rode Kruis", "bc_belpogingen": 1, "woonplaats": "Haarlem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-06', '09:30:00', 85, 'Geen interesse', '{"opzegreden": "Niet geïnteresseerd", "bc_belpogingen": 3, "woonplaats": "Arnhem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-06', '10:15:00', 110, 'Financiele reden', '{"opzegreden": "Werkloos", "bc_belpogingen": 2, "woonplaats": "Enschede", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-07', '11:00:00', 75, 'Ander goed doel', '{"opzegreden": "Steunt lokale stichting", "bc_belpogingen": 1, "woonplaats": "Amersfoort", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-07', '14:00:00', 130, 'Geen interesse', '{"opzegreden": "Wil niet gebeld worden", "bc_belpogingen": 4, "woonplaats": "Zaanstad", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-08', '09:45:00', 90, 'Financiele reden', '{"opzegreden": "Te hoge lasten", "bc_belpogingen": 2, "woonplaats": "Zwolle", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-08', '11:20:00', 105, 'Ander goed doel', '{"opzegreden": "Geeft al aan meerdere goede doelen", "bc_belpogingen": 1, "woonplaats": "Leiden", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-09', '10:30:00', 80, 'Geen interesse', '{"opzegreden": "Principieel tegen", "bc_belpogingen": 2, "woonplaats": "Maastricht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-09', '13:15:00', 115, 'Financiele reden', '{"opzegreden": "AOW alleen", "bc_belpogingen": 3, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-05', '14:30:00', 100, 'Ander goed doel', '{"opzegreden": "Al donateur KWF", "bc_belpogingen": 1, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-06', '15:45:00', 70, 'Geen interesse', '{"opzegreden": "Geen tijd voor telefoontjes", "bc_belpogingen": 2, "woonplaats": "Utrecht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-07', '16:00:00', 125, 'Financiele reden', '{"opzegreden": "Schuldsanering", "bc_belpogingen": 1, "woonplaats": "Den Haag", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-08', '14:15:00', 95, 'Geen interesse', '{"opzegreden": "Past niet in mijn prioriteiten", "bc_belpogingen": 3, "woonplaats": "Eindhoven", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  -- Week 2: Negatief zonder reden
  UNION ALL SELECT '2026-01-05', '12:00:00', 0, 'Geen gehoor', '{"bc_belpogingen": 5, "woonplaats": "Tilburg", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-01-06', '12:30:00', 0, 'Voicemail/antwoordapparaat', '{"bc_belpogingen": 4, "woonplaats": "Groningen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Voicemail/antwoordapparaat"}'
  UNION ALL SELECT '2026-01-07', '12:00:00', 0, 'Max. belpogingen bereikt', '{"bc_belpogingen": 6, "woonplaats": "Almere", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Max. belpogingen bereikt"}'
  UNION ALL SELECT '2026-01-08', '12:45:00', 0, 'Geen gehoor', '{"bc_belpogingen": 5, "woonplaats": "Breda", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-01-09', '11:30:00', 0, 'Voicemail/antwoordapparaat', '{"bc_belpogingen": 3, "woonplaats": "Nijmegen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Voicemail/antwoordapparaat"}'
  UNION ALL SELECT '2026-01-09', '14:00:00', 0, 'Geen gehoor', '{"bc_belpogingen": 6, "woonplaats": "Apeldoorn", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  -- Week 2: Overig
  UNION ALL SELECT '2026-01-05', '15:30:00', 45, 'Terugbelafspraak', '{"opmerking": "Bel volgende week terug", "bc_belpogingen": 2, "woonplaats": "Haarlem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Terugbelafspraak"}'
  UNION ALL SELECT '2026-01-06', '16:00:00', 30, 'Niet bereikbaar', '{"bc_belpogingen": 3, "woonplaats": "Arnhem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Niet bereikbaar"}'
  UNION ALL SELECT '2026-01-07', '15:15:00', 0, 'Nummer onjuist', '{"bc_belpogingen": 1, "woonplaats": "Enschede", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Nummer onjuist"}'
  UNION ALL SELECT '2026-01-08', '16:30:00', 60, 'Terugbelafspraak', '{"opmerking": "Partner moet erbij zijn", "bc_belpogingen": 2, "woonplaats": "Amersfoort", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Terugbelafspraak"}'
  UNION ALL SELECT '2026-01-09', '09:00:00', 25, 'Niet bereikbaar', '{"bc_belpogingen": 4, "woonplaats": "Zaanstad", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Niet bereikbaar"}'
  -- Week 3: Sales
  UNION ALL SELECT '2026-01-12', '09:00:00', 280, 'Maandelijks', '{"termijnbedrag": "12,50", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Zwolle", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-12', '10:15:00', 310, 'Jaarlijks', '{"termijnbedrag": "120,00", "frequentie": "jaar", "bc_belpogingen": 2, "woonplaats": "Leiden", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-01-12', '11:30:00', 195, 'Maandelijks', '{"termijnbedrag": "7,50", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Maastricht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-13', '09:45:00', 340, 'Eenmalig', '{"termijnbedrag": "100,00", "frequentie": "eenmalig", "bc_belpogingen": 2, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Eenmalig"}'
  UNION ALL SELECT '2026-01-13', '14:00:00', 265, 'Maandelijks', '{"termijnbedrag": "15,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-14', '10:30:00', 225, 'Maandelijks', '{"termijnbedrag": "10,00", "frequentie": "maand", "bc_belpogingen": 3, "woonplaats": "Utrecht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-14', '15:15:00', 290, 'Jaarlijks', '{"termijnbedrag": "150,00", "frequentie": "jaar", "bc_belpogingen": 1, "woonplaats": "Den Haag", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-01-15', '09:30:00', 180, 'Maandelijks', '{"termijnbedrag": "5,00", "frequentie": "maand", "bc_belpogingen": 2, "woonplaats": "Eindhoven", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-15', '11:00:00', 255, 'Eenmalig', '{"termijnbedrag": "30,00", "frequentie": "eenmalig", "bc_belpogingen": 1, "woonplaats": "Tilburg", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Eenmalig"}'
  UNION ALL SELECT '2026-01-16', '14:30:00', 320, 'Maandelijks', '{"termijnbedrag": "25,00", "frequentie": "maand", "bc_belpogingen": 2, "woonplaats": "Groningen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-16', '16:00:00', 210, 'Jaarlijks', '{"termijnbedrag": "60,00", "frequentie": "jaar", "bc_belpogingen": 1, "woonplaats": "Almere", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-01-16', '17:00:00', 275, 'Maandelijks', '{"termijnbedrag": "17,50", "frequentie": "maand", "bc_belpogingen": 3, "woonplaats": "Breda", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  -- Week 3: Negatief met reden
  UNION ALL SELECT '2026-01-12', '12:00:00', 85, 'Financiele reden', '{"opzegreden": "Pas gepensioneerd", "bc_belpogingen": 2, "woonplaats": "Nijmegen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-12', '13:30:00', 95, 'Ander goed doel', '{"opzegreden": "Geeft al aan Hartstichting", "bc_belpogingen": 1, "woonplaats": "Apeldoorn", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-12', '14:45:00', 110, 'Geen interesse', '{"opzegreden": "Vertrouwt goede doelen niet", "bc_belpogingen": 2, "woonplaats": "Haarlem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-13', '10:00:00', 75, 'Financiele reden', '{"opzegreden": "Geen inkomen", "bc_belpogingen": 3, "woonplaats": "Arnhem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-13', '11:30:00', 120, 'Ander goed doel', '{"opzegreden": "Max aantal goede doelen bereikt", "bc_belpogingen": 1, "woonplaats": "Enschede", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-13', '15:30:00', 90, 'Geen interesse', '{"opzegreden": "Te oud voor telemarketing", "bc_belpogingen": 2, "woonplaats": "Amersfoort", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-14', '09:15:00', 100, 'Financiele reden', '{"opzegreden": "Slechte economische tijden", "bc_belpogingen": 1, "woonplaats": "Zaanstad", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-14', '11:45:00', 80, 'Ander goed doel', '{"opzegreden": "Kerkelijke collecte", "bc_belpogingen": 2, "woonplaats": "Zwolle", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-14', '14:00:00', 115, 'Geen interesse', '{"opzegreden": "Principieel tegen telefonische werving", "bc_belpogingen": 3, "woonplaats": "Leiden", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-15', '10:30:00', 70, 'Financiele reden', '{"opzegreden": "Bijstandsuitkering", "bc_belpogingen": 2, "woonplaats": "Maastricht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-15', '12:15:00', 125, 'Ander goed doel', '{"opzegreden": "Geeft via collectebus", "bc_belpogingen": 1, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-15', '14:45:00', 85, 'Geen interesse', '{"opzegreden": "Interesseert me niet", "bc_belpogingen": 2, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-16', '09:00:00', 105, 'Financiele reden', '{"opzegreden": "Net huis gekocht", "bc_belpogingen": 1, "woonplaats": "Utrecht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-16', '10:45:00', 95, 'Ander goed doel', '{"opzegreden": "Support al 3 goede doelen", "bc_belpogingen": 3, "woonplaats": "Den Haag", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-16', '13:15:00', 75, 'Geen interesse', '{"opzegreden": "Geen zin in", "bc_belpogingen": 2, "woonplaats": "Eindhoven", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-16', '15:00:00', 110, 'Financiele reden', '{"opzegreden": "Gezinsuitbreiding", "bc_belpogingen": 1, "woonplaats": "Tilburg", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  -- Week 3: Negatief zonder reden
  UNION ALL SELECT '2026-01-12', '15:30:00', 0, 'Geen gehoor', '{"bc_belpogingen": 6, "woonplaats": "Groningen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-01-13', '12:00:00', 0, 'Voicemail/antwoordapparaat', '{"bc_belpogingen": 4, "woonplaats": "Almere", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Voicemail/antwoordapparaat"}'
  UNION ALL SELECT '2026-01-14', '12:30:00', 0, 'Max. belpogingen bereikt', '{"bc_belpogingen": 6, "woonplaats": "Breda", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Max. belpogingen bereikt"}'
  UNION ALL SELECT '2026-01-15', '13:00:00', 0, 'Geen gehoor', '{"bc_belpogingen": 5, "woonplaats": "Nijmegen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-01-15', '15:30:00', 0, 'Voicemail/antwoordapparaat', '{"bc_belpogingen": 3, "woonplaats": "Apeldoorn", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Voicemail/antwoordapparaat"}'
  UNION ALL SELECT '2026-01-16', '11:30:00', 0, 'Geen gehoor', '{"bc_belpogingen": 6, "woonplaats": "Haarlem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-01-16', '12:15:00', 0, 'Max. belpogingen bereikt', '{"bc_belpogingen": 6, "woonplaats": "Arnhem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Max. belpogingen bereikt"}'
  -- Week 3: Overig
  UNION ALL SELECT '2026-01-12', '16:30:00', 55, 'Terugbelafspraak', '{"opmerking": "Na 18:00 bereikbaar", "bc_belpogingen": 2, "woonplaats": "Enschede", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Terugbelafspraak"}'
  UNION ALL SELECT '2026-01-13', '16:45:00', 40, 'Niet bereikbaar', '{"bc_belpogingen": 3, "woonplaats": "Amersfoort", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Niet bereikbaar"}'
  UNION ALL SELECT '2026-01-14', '16:00:00', 0, 'Nummer onjuist', '{"bc_belpogingen": 1, "woonplaats": "Zaanstad", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Nummer onjuist"}'
  UNION ALL SELECT '2026-01-15', '16:15:00', 65, 'Terugbelafspraak', '{"opmerking": "Vrijdag terugbellen", "bc_belpogingen": 2, "woonplaats": "Zwolle", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Terugbelafspraak"}'
  UNION ALL SELECT '2026-01-16', '17:30:00', 35, 'Niet bereikbaar', '{"bc_belpogingen": 4, "woonplaats": "Leiden", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Niet bereikbaar"}'
  -- Week 4: Sales
  UNION ALL SELECT '2026-01-19', '09:15:00', 295, 'Maandelijks', '{"termijnbedrag": "10,00", "frequentie": "maand", "bc_belpogingen": 2, "woonplaats": "Maastricht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-19', '10:30:00', 330, 'Jaarlijks', '{"termijnbedrag": "100,00", "frequentie": "jaar", "bc_belpogingen": 1, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-01-19', '14:00:00', 210, 'Maandelijks', '{"termijnbedrag": "15,00", "frequentie": "maand", "bc_belpogingen": 2, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-20', '09:00:00', 275, 'Eenmalig', '{"termijnbedrag": "50,00", "frequentie": "eenmalig", "bc_belpogingen": 1, "woonplaats": "Utrecht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Eenmalig"}'
  UNION ALL SELECT '2026-01-20', '11:15:00', 245, 'Maandelijks', '{"termijnbedrag": "7,50", "frequentie": "maand", "bc_belpogingen": 3, "woonplaats": "Den Haag", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-21', '10:00:00', 320, 'Maandelijks', '{"termijnbedrag": "20,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Eindhoven", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-21', '14:30:00', 190, 'Jaarlijks', '{"termijnbedrag": "75,00", "frequentie": "jaar", "bc_belpogingen": 2, "woonplaats": "Tilburg", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-01-22', '09:30:00', 260, 'Maandelijks', '{"termijnbedrag": "12,50", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Groningen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-22', '15:00:00', 235, 'Eenmalig', '{"termijnbedrag": "25,00", "frequentie": "eenmalig", "bc_belpogingen": 2, "woonplaats": "Almere", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Eenmalig"}'
  UNION ALL SELECT '2026-01-23', '11:30:00', 305, 'Maandelijks', '{"termijnbedrag": "5,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Breda", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-23', '16:00:00', 285, 'Jaarlijks', '{"termijnbedrag": "200,00", "frequentie": "jaar", "bc_belpogingen": 3, "woonplaats": "Nijmegen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  -- Week 4: Negatief met reden
  UNION ALL SELECT '2026-01-19', '11:00:00', 90, 'Financiele reden', '{"opzegreden": "ZZP geen vast inkomen", "bc_belpogingen": 2, "woonplaats": "Apeldoorn", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-19', '12:30:00', 105, 'Ander goed doel', '{"opzegreden": "Sponsor kind in Afrika", "bc_belpogingen": 1, "woonplaats": "Haarlem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-19', '15:15:00', 75, 'Geen interesse', '{"opzegreden": "Bel me niet meer", "bc_belpogingen": 3, "woonplaats": "Arnhem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-20', '10:00:00', 115, 'Financiele reden', '{"opzegreden": "Alles gaat naar hypotheek", "bc_belpogingen": 2, "woonplaats": "Enschede", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-20', '13:45:00', 85, 'Ander goed doel', '{"opzegreden": "Alleen lokale initiatieven", "bc_belpogingen": 1, "woonplaats": "Amersfoort", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-20', '15:30:00', 95, 'Geen interesse', '{"opzegreden": "Geloof er niet in", "bc_belpogingen": 2, "woonplaats": "Zaanstad", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-21', '09:15:00', 110, 'Financiele reden', '{"opzegreden": "Kinderen kosten alles", "bc_belpogingen": 1, "woonplaats": "Zwolle", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-21', '11:45:00', 80, 'Ander goed doel', '{"opzegreden": "Dierenasiel belangrijker", "bc_belpogingen": 3, "woonplaats": "Leiden", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-21', '16:15:00', 125, 'Geen interesse', '{"opzegreden": "Heb andere prioriteiten", "bc_belpogingen": 2, "woonplaats": "Maastricht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-22', '10:30:00', 70, 'Financiele reden', '{"opzegreden": "Student, geen geld", "bc_belpogingen": 1, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-22', '12:00:00', 100, 'Ander goed doel', '{"opzegreden": "Steun milieuorganisaties", "bc_belpogingen": 2, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-22', '14:15:00', 90, 'Geen interesse', '{"opzegreden": "Wil gewoon niet", "bc_belpogingen": 1, "woonplaats": "Utrecht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-23', '09:45:00', 105, 'Financiele reden', '{"opzegreden": "Pensioen omlaag", "bc_belpogingen": 3, "woonplaats": "Den Haag", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-23', '13:00:00', 85, 'Ander goed doel', '{"opzegreden": "Kerk krijgt alles", "bc_belpogingen": 2, "woonplaats": "Eindhoven", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-23', '14:30:00', 75, 'Geen interesse', '{"opzegreden": "Nee is nee", "bc_belpogingen": 1, "woonplaats": "Tilburg", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  -- Week 4: Negatief zonder reden
  UNION ALL SELECT '2026-01-19', '13:00:00', 0, 'Geen gehoor', '{"bc_belpogingen": 5, "woonplaats": "Groningen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-01-20', '12:15:00', 0, 'Voicemail/antwoordapparaat', '{"bc_belpogingen": 4, "woonplaats": "Almere", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Voicemail/antwoordapparaat"}'
  UNION ALL SELECT '2026-01-21', '12:30:00', 0, 'Max. belpogingen bereikt', '{"bc_belpogingen": 6, "woonplaats": "Breda", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Max. belpogingen bereikt"}'
  UNION ALL SELECT '2026-01-22', '13:30:00', 0, 'Geen gehoor', '{"bc_belpogingen": 6, "woonplaats": "Nijmegen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-01-23', '10:15:00', 0, 'Voicemail/antwoordapparaat', '{"bc_belpogingen": 3, "woonplaats": "Apeldoorn", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Voicemail/antwoordapparaat"}'
  UNION ALL SELECT '2026-01-23', '12:00:00', 0, 'Geen gehoor', '{"bc_belpogingen": 5, "woonplaats": "Haarlem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  -- Week 4: Overig
  UNION ALL SELECT '2026-01-19', '16:30:00', 50, 'Terugbelafspraak', '{"opmerking": "Woensdag overdag", "bc_belpogingen": 2, "woonplaats": "Arnhem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Terugbelafspraak"}'
  UNION ALL SELECT '2026-01-20', '16:45:00', 30, 'Niet bereikbaar', '{"bc_belpogingen": 4, "woonplaats": "Enschede", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Niet bereikbaar"}'
  UNION ALL SELECT '2026-01-21', '17:00:00', 0, 'Nummer onjuist', '{"bc_belpogingen": 1, "woonplaats": "Amersfoort", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Nummer onjuist"}'
  UNION ALL SELECT '2026-01-22', '16:00:00', 60, 'Terugbelafspraak', '{"opmerking": "Eind van de maand", "bc_belpogingen": 2, "woonplaats": "Zaanstad", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Terugbelafspraak"}'
  UNION ALL SELECT '2026-01-23', '17:15:00', 40, 'Niet bereikbaar', '{"bc_belpogingen": 3, "woonplaats": "Zwolle", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Niet bereikbaar"}'
  -- Week 5: Sales (minder dan vorige weken)
  UNION ALL SELECT '2026-01-26', '09:30:00', 265, 'Maandelijks', '{"termijnbedrag": "10,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Leiden", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-26', '11:00:00', 310, 'Jaarlijks', '{"termijnbedrag": "120,00", "frequentie": "jaar", "bc_belpogingen": 2, "woonplaats": "Maastricht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-01-27', '09:15:00', 225, 'Maandelijks', '{"termijnbedrag": "15,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-27', '14:00:00', 295, 'Eenmalig', '{"termijnbedrag": "75,00", "frequentie": "eenmalig", "bc_belpogingen": 2, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Eenmalig"}'
  UNION ALL SELECT '2026-01-28', '10:30:00', 245, 'Maandelijks', '{"termijnbedrag": "7,50", "frequentie": "maand", "bc_belpogingen": 3, "woonplaats": "Utrecht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-29', '11:15:00', 320, 'Maandelijks', '{"termijnbedrag": "25,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Den Haag", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-29', '15:45:00', 190, 'Jaarlijks', '{"termijnbedrag": "60,00", "frequentie": "jaar", "bc_belpogingen": 2, "woonplaats": "Eindhoven", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-01-30', '09:00:00', 275, 'Maandelijks', '{"termijnbedrag": "12,50", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Tilburg", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-01-30', '14:30:00', 240, 'Eenmalig', '{"termijnbedrag": "30,00", "frequentie": "eenmalig", "bc_belpogingen": 2, "woonplaats": "Groningen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Eenmalig"}'
  -- Week 5: Negatief met reden
  UNION ALL SELECT '2026-01-26', '12:00:00', 95, 'Financiele reden', '{"opzegreden": "Net ontslagen", "bc_belpogingen": 2, "woonplaats": "Almere", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-26', '13:30:00', 110, 'Ander goed doel', '{"opzegreden": "Natuurbehoud gaat voor", "bc_belpogingen": 1, "woonplaats": "Breda", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-26', '15:00:00', 80, 'Geen interesse', '{"opzegreden": "Niet mijn ding", "bc_belpogingen": 2, "woonplaats": "Nijmegen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-27', '10:00:00', 105, 'Financiele reden', '{"opzegreden": "Ziekte, geen inkomen", "bc_belpogingen": 3, "woonplaats": "Apeldoorn", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-27', '11:30:00', 75, 'Ander goed doel', '{"opzegreden": "Vluchtelingenwerk", "bc_belpogingen": 1, "woonplaats": "Haarlem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-27', '15:15:00', 90, 'Geen interesse', '{"opzegreden": "Stop met bellen", "bc_belpogingen": 2, "woonplaats": "Arnhem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-28', '09:00:00', 115, 'Financiele reden', '{"opzegreden": "Echtscheiding", "bc_belpogingen": 1, "woonplaats": "Enschede", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-28', '11:45:00', 85, 'Ander goed doel', '{"opzegreden": "Amnesty International", "bc_belpogingen": 2, "woonplaats": "Amersfoort", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-28', '14:15:00', 100, 'Geen interesse', '{"opzegreden": "Niet via telefoon", "bc_belpogingen": 3, "woonplaats": "Zaanstad", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-29', '09:45:00', 70, 'Financiele reden', '{"opzegreden": "WW-uitkering", "bc_belpogingen": 2, "woonplaats": "Zwolle", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-01-29', '12:30:00', 120, 'Ander goed doel', '{"opzegreden": "Leger des Heils", "bc_belpogingen": 1, "woonplaats": "Leiden", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-01-29', '14:00:00', 85, 'Geen interesse', '{"opzegreden": "Geen commentaar", "bc_belpogingen": 2, "woonplaats": "Maastricht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-01-30', '10:15:00', 95, 'Financiele reden', '{"opzegreden": "Inflatie vreet alles", "bc_belpogingen": 1, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  -- Week 5: Negatief zonder reden
  UNION ALL SELECT '2026-01-26', '14:00:00', 0, 'Geen gehoor', '{"bc_belpogingen": 6, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-01-27', '12:00:00', 0, 'Voicemail/antwoordapparaat', '{"bc_belpogingen": 4, "woonplaats": "Utrecht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Voicemail/antwoordapparaat"}'
  UNION ALL SELECT '2026-01-28', '12:30:00', 0, 'Max. belpogingen bereikt', '{"bc_belpogingen": 6, "woonplaats": "Den Haag", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Max. belpogingen bereikt"}'
  UNION ALL SELECT '2026-01-29', '13:15:00', 0, 'Geen gehoor', '{"bc_belpogingen": 5, "woonplaats": "Eindhoven", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-01-30', '11:00:00', 0, 'Voicemail/antwoordapparaat', '{"bc_belpogingen": 3, "woonplaats": "Tilburg", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Voicemail/antwoordapparaat"}'
  -- Week 5: Overig
  UNION ALL SELECT '2026-01-26', '16:00:00', 45, 'Terugbelafspraak', '{"opmerking": "Dinsdag is beter", "bc_belpogingen": 2, "woonplaats": "Groningen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Terugbelafspraak"}'
  UNION ALL SELECT '2026-01-27', '16:30:00', 35, 'Niet bereikbaar', '{"bc_belpogingen": 3, "woonplaats": "Almere", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Niet bereikbaar"}'
  UNION ALL SELECT '2026-01-28', '16:15:00', 0, 'Nummer onjuist', '{"bc_belpogingen": 1, "woonplaats": "Breda", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Nummer onjuist"}'
  UNION ALL SELECT '2026-01-30', '15:45:00', 55, 'Terugbelafspraak', '{"opmerking": "Morgenochtend", "bc_belpogingen": 2, "woonplaats": "Nijmegen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Terugbelafspraak"}'
  -- Week 6: Sales (huidige week, minder data)
  UNION ALL SELECT '2026-02-02', '09:00:00', 280, 'Maandelijks', '{"termijnbedrag": "10,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Apeldoorn", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-02-02', '10:30:00', 315, 'Jaarlijks', '{"termijnbedrag": "150,00", "frequentie": "jaar", "bc_belpogingen": 2, "woonplaats": "Haarlem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-02-02', '14:15:00', 235, 'Maandelijks', '{"termijnbedrag": "20,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Arnhem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-02-03', '09:30:00', 290, 'Eenmalig', '{"termijnbedrag": "100,00", "frequentie": "eenmalig", "bc_belpogingen": 2, "woonplaats": "Enschede", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Eenmalig"}'
  UNION ALL SELECT '2026-02-03', '11:00:00', 250, 'Maandelijks', '{"termijnbedrag": "15,00", "frequentie": "maand", "bc_belpogingen": 1, "woonplaats": "Amersfoort", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-02-03', '15:00:00', 320, 'Maandelijks', '{"termijnbedrag": "7,50", "frequentie": "maand", "bc_belpogingen": 3, "woonplaats": "Zaanstad", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  UNION ALL SELECT '2026-02-04', '09:15:00', 275, 'Jaarlijks', '{"termijnbedrag": "80,00", "frequentie": "jaar", "bc_belpogingen": 1, "woonplaats": "Zwolle", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Jaarlijks"}'
  UNION ALL SELECT '2026-02-04', '10:45:00', 245, 'Maandelijks', '{"termijnbedrag": "12,50", "frequentie": "maand", "bc_belpogingen": 2, "woonplaats": "Leiden", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Maandelijks"}'
  -- Week 6: Negatief met reden
  UNION ALL SELECT '2026-02-02', '11:15:00', 90, 'Financiele reden', '{"opzegreden": "Geen ruimte in budget", "bc_belpogingen": 2, "woonplaats": "Maastricht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-02-02', '12:30:00', 105, 'Ander goed doel', '{"opzegreden": "Sponsort kinderen", "bc_belpogingen": 1, "woonplaats": "Amsterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-02-02', '15:45:00', 75, 'Geen interesse', '{"opzegreden": "Ben niet geinteresseerd", "bc_belpogingen": 2, "woonplaats": "Rotterdam", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-02-03', '10:15:00', 115, 'Financiele reden', '{"opzegreden": "Gepensioneerd, beperkt", "bc_belpogingen": 3, "woonplaats": "Utrecht", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-02-03', '12:00:00', 85, 'Ander goed doel', '{"opzegreden": "Geef aan Oxfam Novib", "bc_belpogingen": 1, "woonplaats": "Den Haag", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-02-03', '14:30:00', 95, 'Geen interesse', '{"opzegreden": "Niet voor mij", "bc_belpogingen": 2, "woonplaats": "Eindhoven", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-02-04', '09:45:00', 110, 'Financiele reden', '{"opzegreden": "Kosten rijzen de pan uit", "bc_belpogingen": 1, "woonplaats": "Tilburg", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-02-04', '11:30:00', 80, 'Ander goed doel', '{"opzegreden": "WNF is mijn keuze", "bc_belpogingen": 2, "woonplaats": "Groningen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-02-04', '14:00:00', 100, 'Geen interesse', '{"opzegreden": "Nee dankje", "bc_belpogingen": 3, "woonplaats": "Almere", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  UNION ALL SELECT '2026-02-02', '16:15:00', 70, 'Financiele reden', '{"opzegreden": "Mijn man is ziek", "bc_belpogingen": 2, "woonplaats": "Breda", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Financiele reden"}'
  UNION ALL SELECT '2026-02-03', '16:00:00', 90, 'Ander goed doel', '{"opzegreden": "Cliniclowns is mijn doel", "bc_belpogingen": 1, "woonplaats": "Nijmegen", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Ander goed doel"}'
  UNION ALL SELECT '2026-02-04', '15:15:00', 85, 'Geen interesse', '{"opzegreden": "Liever niet", "bc_belpogingen": 2, "woonplaats": "Apeldoorn", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen interesse"}'
  -- Week 6: Negatief zonder reden
  UNION ALL SELECT '2026-02-02', '13:00:00', 0, 'Geen gehoor', '{"bc_belpogingen": 5, "woonplaats": "Haarlem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  UNION ALL SELECT '2026-02-03', '13:30:00', 0, 'Voicemail/antwoordapparaat', '{"bc_belpogingen": 4, "woonplaats": "Arnhem", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Voicemail/antwoordapparaat"}'
  UNION ALL SELECT '2026-02-04', '12:15:00', 0, 'Max. belpogingen bereikt', '{"bc_belpogingen": 6, "woonplaats": "Enschede", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Max. belpogingen bereikt"}'
  UNION ALL SELECT '2026-02-04', '13:00:00', 0, 'Geen gehoor', '{"bc_belpogingen": 6, "woonplaats": "Amersfoort", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Geen gehoor"}'
  -- Week 6: Overig
  UNION ALL SELECT '2026-02-02', '17:00:00', 50, 'Terugbelafspraak', '{"opmerking": "Volgende week maandag", "bc_belpogingen": 2, "woonplaats": "Zaanstad", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Terugbelafspraak"}'
  UNION ALL SELECT '2026-02-03', '17:15:00', 30, 'Niet bereikbaar', '{"bc_belpogingen": 3, "woonplaats": "Zwolle", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Niet bereikbaar"}'
  UNION ALL SELECT '2026-02-04', '16:00:00', 0, 'Nummer onjuist', '{"bc_belpogingen": 1, "woonplaats": "Leiden", "bc_agentnaam": "Demo Agent", "bc_result_naam": "Nummer onjuist"}'
) as demo_data;