
Doel (wat jij terecht verwacht)
- Als je een project selecteert, moet de week-dropdown exact de weken tonen waarvoor er data is in `call_records` voor dát project. Geen “subset”, geen cache-artefacten, en geen afhankelijkheid van hoeveel records er totaal zijn.

Wat er echt aan de hand is (grondig + meetbaar)
1) Er is niets “hardcoded” in de week-dropdown zelf
- `DateFilterSelector` rendert simpelweg `availableWeeks.map(...)`.
- Die `availableWeeks` komen uit `useAvailableWeeks(projectId)`.

2) De hook haalt nu weken op via het ophalen van rijen uit `call_records`
- In `useAvailableWeeks` doen we:
  - `select('week_number, beldatum_date')`
  - `order('beldatum_date', desc)`
  - `.range(0, 4999)`
  - Daarna dedupen we client-side naar unieke week/year combinaties.

3) De log bewijst dat de backend maar een deel teruggeeft
Uit jouw console logs:
- `[useAvailableWeeks] projectId=... weeks=2, range=2026-05 → 2026-06`

Maar in de database (read-query) is de verdeling voor STC giftgevers:
- week 1: 2
- week 2: 58
- week 3: 239
- week 4: 456
- week 5: 883
- week 6: 964
Totaal: 2602 records, en week_number is overal gevuld.

Dat betekent: de frontend vraagt wél om meer, maar krijgt slechts de “meest recente batch” terug. Dit is precies consistent met een server-side row cap (vaak 1000) op PostgREST/Supabase die je met `.range(...)` niet altijd effectief kunt omzeilen. Daardoor zie je alleen weken 5/6, omdat die in de nieuwste ~1000 records vallen.

4) Waarom zie je bij “Save the Children” weken uit 2025?
Niet door hardcoding: die data staat daadwerkelijk in `call_records` voor dat project.
- Voor “Save the Children WB 2020” is min_date = 2025-05-21 en max_date = 2026-02-04.
Dus de dropdown doet precies wat je vraagt: weken tonen waar data is. Alleen: bij STC giftgevers wordt de set incompleet door de row cap.

Fundamentele fix (architectuur)
Stoppen met “weeks afleiden door veel rijen op te halen”.
In plaats daarvan: laat Postgres zélf de unieke week/year combinaties teruggeven (distinct), zonder dat we duizenden call_records hoeven te fetchen.
Dan:
- geen 1000-row limiet probleem
- sneller
- altijd correct

Implementatieplan (code + database)
A) Database: maak een veilige RPC (Postgres function) voor beschikbare weken
1. Voeg een migration toe in `supabase/migrations/` met een functie, bijv.:
   - `public.get_available_weeks(p_project_id uuid)`
   - Return type: rows met `week_number int`, `iso_year int`
2. Query in SQL:
   - `select distinct week_number, extract(isoyear from beldatum_date)::int as iso_year`
   - `from call_records`
   - `where project_id = p_project_id and week_number is not null and beldatum_date is not null`
   - `order by iso_year desc, week_number desc`
3. (Optioneel) Voeg een tweede kolom toe `value text` = `${iso_year}-${lpad(week_number,2,'0')}` om frontend nog simpeler te maken.

B) Frontend: `useAvailableWeeks` ombouwen naar `supabase.rpc(...)`
1. In `src/hooks/useCallRecords.ts`:
   - Vervang de `from('call_records')...range(...)` aanpak door:
     - `const { data, error } = await supabase.rpc('get_available_weeks', { p_project_id: projectId })`
   - Map resultaat naar `WeekYear[]`:
     - `value = ${iso_year}-${pad2(week_number)}`
     - `label = Week ${week_number} (${iso_year})`
   - Houd de bestaande sortering als fallback (maar de SQL levert al gesorteerd).
2. Laat de oude client-side dedupe code als fallback staan voor het geval RPC nog niet beschikbaar is (bijv. tijdelijk) — maar standaard gebruiken we de RPC.

C) UX/Copy: haal hardcoded “2025” teksten weg (dit veroorzaakt verwarring)
In `src/pages/Dashboard.tsx` staan hardcoded strings zoals:
- `Totaal 2025`
- `Totaaloverzicht 2025`
- `Retentie Overzicht 2025`
Die vervangen we door neutrale, correcte labels, bijv.:
- `Totaal (alle weken)`
- `Totaaloverzicht (alle weken)`
- of dynamisch: `Totaal ${minYear}–${maxYear}` op basis van `availableWeeks`.

D) Testplan (end-to-end, exact op jouw issue)
1. Ga naar /dashboard → selecteer “STC giftgevers”
   - Verwachting: week dropdown toont Week 1 t/m Week 6 (2026).
2. Switch naar een ander project en terug
   - Verwachting: dropdown blijft correct (geen 5/6-only).
3. Selecteer Week 1
   - Verwachting: callrecords/KPI’s veranderen zichtbaar.
4. Check “Save the Children WB 2020”
   - Verwachting: dropdown toont ook 2025-weken (want data bestaat echt), maar zonder dat het op hardcoding lijkt.

Waarom dit de juiste fix is
- We lossen niet “symptomen” (cache) op, maar de echte oorzaak: incomplete datasets door server row limits.
- De week dropdown wordt een pure “distinct weeks” query, wat precies is wat je functioneel bedoelt.

Risico’s / aandachtspunten
- We moeten de RPC/migration publiceren naar Live als je dit daar ook wilt.
- RLS: call_records is beschermd; RPC draait als security-invoker. We moeten zorgen dat RPC dezelfde toegangsregels respecteert (of expliciet `security definer` vermijden). In de meeste gevallen is `security invoker` gewenst zodat gebruikers alleen weken zien van projecten waar ze rechten op hebben.

Wat ik nodig heb van jou (alleen als keuze, niet technisch)
- Wil je bij “Alle weken” een neutrale tekst (“Totaal”) of juist een dynamische range (“Totaal 2025–2026”)?
  - Ik kan dit zonder extra vragen implementeren met “Totaal (alle weken)” als default.
