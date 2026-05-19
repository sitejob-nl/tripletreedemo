-- Trombose folder (761) mapping correction:
-- BasiCall stuurt voor dit project de actuele machtigingsdata in *_nieuw velden,
-- niet in de basis-velden waar onze mapping naar wees. Daardoor was Bedrag leeg
-- en bleef de jaarwaarde €0. Bovendien staat in Betaalfrequentie_nieuw soms
-- "2-maandelijks" (= 6x per jaar, door Esther bevestigd) — daarvoor is een nieuwe
-- freq_map key nodig zodat de substring-match niet stilzwijgend ×12 oplevert via
-- "maand" patroon.
--
-- Eigenaar Triple Tree meldde Trombose Folder week 20 €0 jaarwaarde op 2026-05-19.

UPDATE projects
SET mapping_config = mapping_config
  || jsonb_build_object('amount_col', 'Bedrag_nieuw')
  || jsonb_build_object('freq_col', 'Betaalfrequentie_nieuw')
  || jsonb_build_object('freq_map', (mapping_config->'freq_map')
     || jsonb_build_object(
       '2-maandelijks', 6,
       '2 maandlijks', 6,
       'tweemaandelijks', 6,
       'per 2 maanden', 6
     )
   )
WHERE basicall_project_id = 761;
