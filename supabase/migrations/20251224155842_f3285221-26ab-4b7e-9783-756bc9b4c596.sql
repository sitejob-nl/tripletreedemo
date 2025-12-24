UPDATE public.projects 
SET mapping_config = jsonb_build_object(
  'amount_col', 'Bedrag',
  'freq_col', 'Frequentie',
  'freq_map', jsonb_build_object(
    'mnd', 12,
    'jaar', 1,
    'maand', 12,
    'eenmalig', 1,
    'kwartaal', 4,
    'jaarlijks', 1,
    'maandelijks', 12
  ),
  'reason_col', 'opzegreden',
  'sale_results', jsonb_build_array('Sale', 'Donateur', 'Toezegging', 'Maandelijks', 'Machtiging per Maand', 'Wil lid worden', 'Jaarlijks')
);