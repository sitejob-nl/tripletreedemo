
Doel
- Zorgen dat bij wisselen van project alle project-afhankelijke data (incl. `availableWeeks`) gegarandeerd “hard” ververst, zodat je niet blijft hangen op een subset (zoals alleen week 5 en 6).

Wat ik nu zie in de code (relevant)
- `useAvailableWeeks(projectId)` gebruikt queryKey: `['available_weeks', projectId]` en haalt weken uit `call_records` op.
- In `Dashboard.tsx` heb je nu een wrapper `setSelectedProjectKey()` die `invalidateQueries` doet, maar:
  - De initial auto-select (eerste project kiezen) gebruikt nog `setSelectedProjectKeyState(...)` en omzeilt dus je “hard refresh” pad.
  - `invalidateQueries` alleen is soms niet agressief genoeg bij frustrerende “stale UI” situaties (zeker als er requests in-flight zijn of de UI nog oude data vasthoudt). Dan wil je meestal: cancel + remove + refetch, en ook je lokale UI-state resetten (week/page/datefilter) zodat je niet per ongeluk in een “rare combinatie” blijft hangen.

Hypothese voor waarom jij nog steeds alleen week 5/6 ziet
- Niet de database: in de DB zijn er voor STC giftgevers aantoonbaar week 1 t/m 6 aanwezig.
- Wél frontend state/cache: ergens blijft een oude `availableWeeks` set hangen of wordt niet opnieuw geladen op het moment dat de UI hem nodig heeft.
- Daarnaast: de week-jaar sleutel wordt afgeleid van `beldatum_date.getFullYear()`. ISO week 1 kan eind december in het vorige kalenderjaar vallen (bijv. 2025-12-29 t/m 2026-01-04). Daardoor kan “Week 1” als (2025) én (2026) voorkomen. Dat verklaart niet “alleen 5/6”, maar het is wel een randgeval dat we meteen beter kunnen maken.

Aanpak (implementatie)
1) Maak project-switch “atomic”: reset UI-state + kill queries
- In `src/pages/Dashboard.tsx` pas ik `setSelectedProjectKey` aan zodat die bij een projectwissel:
  - (a) UI-state reset:
    - `setSelectedWeek('all')` (of leeg) zodat we niet per ongeluk een week filter meenemen die niet matcht
    - `setDashboardPage(1)` (en eventueel pageSize laten staan)
    - `setDateFilterType('week')` en `setDateRange({start:null,end:null})` om cross-project “range” verwarring te vermijden
  - (b) Query’s cancelt die nog bezig zijn voor project-data:
    - `queryClient.cancelQueries({ predicate: ... })`
  - (c) Query-cache echt weggooit (hard refresh i.p.v. “stale-while-revalidate”):
    - `queryClient.removeQueries({ predicate: ... })`
  - (d) Daarna expliciet opnieuw ophaalt:
    - `queryClient.refetchQueries({ predicate: ... })` (met focus op `available_weeks` en eventueel `projects`-afhankelijk spul)

  Predicate-filter (belangrijk)
  - In plaats van losse `invalidateQueries({queryKey: [...]})` voor 6 keys, gebruik ik 1 predicate die matcht op `queryKey[0]`:
    - `call_records`, `available_weeks`, `kpi_aggregates`, `logged_time`, `report_matrix_data`, `total_record_count`
  - Dat dekt meteen alle varianten met parameters (projectId/week/page).

2) Zorg dat ook de “eerste project auto-select” door dezelfde switch-logica loopt
- In de `useEffect` die het eerste project kiest (regels rond 103-108) vervang ik `setSelectedProjectKeyState(...)` door de wrapper `setSelectedProjectKey(...)`.
- Zo is het gedrag consistent: altijd dezelfde reset/invalidation.

3) Fix/verbeter het week-jaar randgeval (ISO week vs kalenderjaar)
- In `useAvailableWeeks` (in `src/hooks/useCallRecords.ts`) verbeter ik de jaarbepaling:
  - Nu: `const year = date.getFullYear()`
  - Beter: gebruik ISO-week-jaar (zodat week 1 bij 2026 ook echt “2026-01” wordt, ook als de maandag in 2025 valt).
  - Implementatie: met `date-fns` (staat al in deps) `getISOWeekYear(date)` i.p.v. `getFullYear()`.
- Dit voorkomt dubbele “Week 1 (2025)” vs “Week 1 (2026)” entries en maakt de selector betrouwbaarder aan jaargrenzen.

4) (Optioneel maar sterk) Kleine debug-hulp voor jou: toon wat er binnenkomt
- Tijdelijk (of achter een dev-flag) log ik in de console:
  - projectId + aantal availableWeeks + eerste/laatste week value
- Zo kun jij meteen zien: komt de backend-lijst wel goed terug na switch?

Bestanden die ik ga aanpassen
- `src/pages/Dashboard.tsx`
  - project switch handler: cancel/remove/refetch + state reset
  - initial auto-select effect: wrapper gebruiken
- `src/hooks/useCallRecords.ts`
  - `useAvailableWeeks`: ISO week-year gebruiken voor `value`/`label` consistentie (jaargrens fix)
  - (optioneel) debug logging

Acceptatiecriteria (wat jij straks moet zien)
- Wissel naar “STC giftgevers”:
  - week dropdown bevat week 1 t/m 6 (en eventueel 49-52 van 2025, afhankelijk van data)
  - je blijft niet hangen op alleen week 5/6
- Wissel daarna naar een ander project en terug:
  - weeks verversen elke keer consistent
  - geen “oude lijst” die blijft staan

Testplan (e2e)
1) Hard refresh browser (Ctrl+F5) één keer.
2) Ga naar dashboard → selecteer STC giftgevers → open week dropdown:
   - check dat week 1–6 aanwezig is.
3) Switch project naar bijv. “Demo Campagne” → terug naar STC giftgevers:
   - check opnieuw week 1–6.
4) Selecteer week 1 → check dat call_records/kpi’s veranderen (dus niet alleen selector).

Risico’s / trade-offs
- `removeQueries` zorgt dat je tijdens switch kort “lege state/loading” ziet: dat is bewust, want jij wilt liever correctheid dan “mooie” overgang.
- Als je heel veel queries hebt, predicate moet strak blijven zodat we niet onnodig alles weggooien (ik beperk het tot de project-data keys).

Als je dit plan goedkeurt, implementeer ik dit in één pass en kun jij meteen opnieuw testen met kas@sitejob.nl.
