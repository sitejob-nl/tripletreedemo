# QA-rapport — visuele/UX-review Triple Tree Portal

**Datum:** 23 juli 2026 · **Omgeving:** productie (app.ttcallcenters.nl) · **Methode:** handmatige walkthrough via browser (Playwright), desktop 1440×900 + mobiel 390×844, als superadmin én in "Bekijk als klant"-modus. **Er is niets aangepast** — puur kijken, klikken en vergelijken.

**QA-account:** `qa-claude@sitejob.nl` (rol: superadmin, aangemaakt 23-07-2026, user-id `44e7ce67-f756-47bd-91fe-2bc01d59bcb8`). Verwijderen kan met:
```sql
DELETE FROM public.user_roles WHERE user_id = '44e7ce67-f756-47bd-91fe-2bc01d59bcb8';
DELETE FROM auth.users WHERE id = '44e7ce67-f756-47bd-91fe-2bc01d59bcb8';
```

**Screenshots:** map [qa-screenshots-2026-07-23/](qa-screenshots-2026-07-23/) — nummers hieronder verwijzen daarnaar.

**Bekeken:** login, dashboard (Anbo outbound · Hersenstichting inbound · Sligro klantenservice · Hersenstichting Storno slapend), klant-preview met Rapport/Visueel/Analyse (incl. alle 4 analyse-tabs), Beheer (alle 6 tabs), Developer Console (alle tabs), API-docs, /welcome, 404, mobiel.

---

## TL;DR

Het portaal staat er in de basis goed op: de klant-view is overzichtelijk, embargo werkt zoals ontworpen, batch-voortgang en geo-analyse zien er verzorgd uit, en de uren-afrondregel is overal consistent doorgevoerd. Maar er zijn **zes punten die het datavertrouwen raken** — en dat is precies het bestaansrecht van dit dashboard: alle zes Recharts-grafieken renderen leeg, de inbound-KPI-kaart wijkt af van de matrix (€0 vs €300), de unmapped-codes-kaart op /admin is dood door een RPC-timeout, de Analyse-view hanteert een derde telling, de klant-preview toont niet wat de klant echt ziet, en de trust-banner belooft iets ("cijfers verborgen") dat niet gebeurt.

---

## A. Hoog — raakt datavertrouwen of kernfunctionaliteit

### A1. Alle Recharts-grafieken renderen leeg (6 stuks)
Zes grafieken tonen assen/legenda maar géén data, terwijl de data er aantoonbaar is (mini-KPI's en legenda's ernaast tonen wél waarden). Geen console-errors — het faalt stil.

- **Visueel-view (klant!):** "Jaarwaarde Ontwikkeling" (leeg, terwijl er €576 aan sales in de week zit; x-as toont bovendien "woensdag … woensdag … dinsdag") en "Donatie Types" (alleen legenda "Doorlopend", geen diagram). *Screenshot 11.*
- **Analyse → Belpogingen:** "Verdeling Belpogingen" en "Conversie per Aantal Pogingen" beide leeg, terwijl de kaartjes erboven (Optimaal Aantal 2, Hoogste Conversie 5.1%) gevuld zijn. *Screenshot 16.*
- **Analyse → Resultaten:** "Categorieverdeling" (pie) volledig leeg; "Resultaten Verdeling" toont alleen y-as-labels. De HTML/CSS-balken ("Statistieken per Categorie", "Resultaat Verdeling" in Visueel) werken wél — het probleem zit specifiek in de SVG/Recharts-rendering of de data-mapping ernaartoe. *Screenshot 17.*

Dit is de view die klanten "Visueel" noemen; die is nu feitelijk kapot.

### A2. Inbound: KPI-kaart ≠ matrix (dual-path-divergentie)
Hersenstichting-Inbound, week 2026-30: KPI-kaart **"Behouden Waarde € 0,00"** (popover zegt óók €0,00) terwijl de matrix eronder **"Jaarwaarde behouden € 300,00"** en "Netto behouden € 300,00" telt. Retentie Ratio: KPI **4.3%** vs matrix **4.8%** (andere noemer: totaal 23 vs excl. "nog in behandeling" 21). Dit is exact het twee-paden-probleem (RPC vs client) dat volgens CLAUDE.md gelijk moet lopen — voor outbound is dat na de pariteits-harness in orde, voor inbound dus niet. *Screenshots 6, 7.*

Bonus: de popover op de kaart "Behouden Waarde" heet "Opbouw **Jaarwaarde**" — verkeerd label voor inbound.

### A3. RPC `get_result_code_distribution` → 500: unmapped-codes-kaart is dood
Op /admin faalt de RPC 2× met HTTP 500. Postgres-logs: **"canceling statement due to statement timeout"** (3× in 24u). Als admin-rol draait de functie in <1s (539 rijen); onder de `authenticated` role met RLS-evaluatie over 136k call_records haalt hij de timeout niet. Gevolg: de admin-kaart die nieuwe BasiCall-codes zichtbaar moet maken (PR #26) toont **niets**, en de fout wordt stil weggeslikt in de UI. Het vangnet waar jullie op leunen staat dus uit zonder dat iemand het ziet. Fix-richting: SECURITY DEFINER met admin-check, een materialized/pre-aggregated pad, of index/query-optimalisatie.

### A4. Analyse-view telt anders dan Rapport (derde telling)
Zelfde project, zelfde week (Anbo, wk30, 99 calls):
- "Statistieken per Categorie" (Analyse → Resultaten): **17 positief / 79 neutraal / 3 negatief**. Het Rapport telt **3 positief, 4 negatief-bearg., 92 negatief-niet-bearg., 87 onbereikbaar**. Dit component gebruikt duidelijk een eigen (oude?) categorisering, niet `classifyResultCoverage`. *Screenshot 17.*
- Weekvergelijking: **"Aantal beluren 0.00" en "Sales per uur 0.00"** terwijl het Rapport 4,00 beluren en 0,75 telt — dit pad gebruikt de `daily_logged_time`-fallback niet. Ook verschijnt geselecteerde week 29 niet als kolom (alleen Week 30). *Screenshot 12.*

### A5. Klant-preview toont niet wat de klant ziet — en Bruto/Netto is inconsistent
- [Dashboard.tsx:673](src/pages/Dashboard.tsx#L673) geeft `isAdmin={isDbAdmin}` door aan ReportMatrix, óók met "Bekijk als klant" aan. De preview toont daardoor de rij **"Bruto conversie"** die echte klanten (isDbAdmin=false) niet zien. Esther denkt dus dat de klant iets anders ziet dan werkelijk. *Screenshot 10.*
- Omgekeerd toont **Analyse → Weekvergelijking klanten alléén "Bruto Conversie"** (geen Netto) — tegen de afspraak "Netto = hoofdcijfer, Bruto admin-only" in. Klant kan daar alsnog bruto naast BasiCall's netto leggen: precies de verwarring die in juni is opgelost. *Screenshot 12.*

### A6. Trust-banner belooft iets dat niet gebeurt
Banner (Anbo): *"Een nieuw resultaat wordt gecontroleerd; **de geraakte cijfers zijn tijdelijk verborgen**."* De trustlaag-enforcement staat overal uit — er wordt níéts verborgen. Een betrouwbaarheidsbanner die zelf niet klopt ondermijnt het hele verhaal. Tekst aanpassen (bv. "…wordt gecontroleerd; de cijfers kunnen nog wijzigen") of enforcement aanzetten. *Screenshot 2.*

---

## B. Middel — UX en consistentie

1. **Slugs i.p.v. projectnamen** in sidebar én paginatitel: "anbo", "Eo-Zilver-Goud-Naar-Structureel", "Save-The-Children-Wb-2020" (CSS-capitalize over de key). De echte namen bestaan gewoon (Beheer → Projecten toont ze). Klanten zien dit ook. *Screenshots 2, 10.*
2. **Getalnotatie door elkaar** (NL/EN): "€ 192,00" naast "25.0%" en "2.66" uur in dezelfde tabel; klantview-detailtabel toont zelfs "€ 192.00"; urencorrectie Sligro toont gecorrigeerd "5,5" naast origineel "3.17" **in dezelfde rij**; Beheer → Projecten "€32.5"; Sligro "4.31 min" (leest als 4m31s) naast "4:18" voor dezelfde metric. Eén notatie kiezen (NL) en overal doorvoeren. *Screenshots 4, 8, 21.*
3. **Admin-dashboard begraaft de cijfers**: trust-banner → 4-staps uitleg → volledige MappingTool → urencorrectie, en dán pas KPI's. En /admin rendert **100 issues zonder paginering** (pagina van 10.000+ px). Config default inklappen en het Betrouwbaarheidscentrum pagineren/groeperen per project. *Screenshots 4, 18.*
4. **Twee onboarding-flows tegelijk**: de 14-staps tour opent bovenop het 4-staps "Zo blijft het dashboard betrouwbaar"-paneel — twee progressbars en twee "Volgende"-knoppen in beeld. *Screenshot 2.*
5. **Opslag-status verwarrend**: MappingTool toonde bij eerste bezoek "Niet opgeslagen" (zonder dat ik iets deed), later "Opgeslagen". *Screenshots 4, 32.*
6. **Sync-presets verouderd**: "Heel 2024" (default!) en "2025 t/m nu" in juli 2026 — dynamisch maken ("Dit jaar", "Vorig jaar"). *Screenshot 26.*
7. **Misleidende nullen**: "Kosten per Donateur € 0,00" bij 0 sales terwijl er €128,76 kosten waren (storno wk16); "Terugverdientijd 0.0 mnd" / "ROI 0.00x" op dagen zonder sales; Sligro "Service level 0.0%" oogt als dramatisch falen maar is vermoedelijk ontbrekende data; alle sync-logs "Duur: 0s". Toon "–" of "n.v.t." waar geen betekenisvolle waarde is. *Screenshots 9, 8, 27.*
8. **Analyse-tabs dubbele labels**: "Weekvergelijking Weken", "Geografisch Geo", "Belpogingen Calls", "Resultaten Stats" — lang én kort label worden samen gerenderd. *Screenshot 12.*
9. **Week springt stil terug**: campagne zonder recente data (Storno) laadt week 16 zonder melding dat je naar april kijkt. Goed gedrag, maar een kleine hint ("laatste week met data") zou verwarring schelen. *Screenshot 9.*
10. **Datumformaten wisselen**: "23 jul. 2026", "23-7-2026, 13:31:11", "4-2-2026", "2026-07-22 (W30)", "13-07-2026 → 20-07-2026".
11. **Config-check niet type-bewust**: Klantenservice-project (Sligro) krijgt rode waarschuwingen op Bedrag-/Frequentie-veld die voor dat type irrelevant zijn; "Preview Berekening (0 **sales**)" op inbound/service. *Screenshot 8.*
12. **Welcome-pagina logo onzichtbaar**: witte logo-variant op lichte achtergrond. De pagina zelf (PWA-instructies per platform) is juist sterk. *Screenshot 35.*
13. **API-docs documenteren de deprecated `sync-project` edge function** incl. werkende "Test"-knop — die functie kan BasiCall niet bereiken. Verwijderen of markeren als deprecated. *Screenshot 30.*
14. **Error Logs**: 66 open sync-alerts gelabeld als "JavaScript"-errors, tekst loopt uit beeld, geen afhandel/resolve-flow — dit slibt dicht. *Screenshot 28.*
15. **"Weergave-modus alleen zichtbaar voor klanten"** — cryptische mededeling; admin kan Visueel/Analyse alleen via de klant-toggle bereiken en weet niet dat dát de route is.

---

## C. Laag — polijstwerk

- Halve vertalingen: filteroptie "**Datum Range**", "Email" (→ E-mail), "Recent Detail Data", kolomkop "Metric", badge "Success".
- "Resultaat Verdeling"-balken zijn állemaal groen, ook "Blacklisted" en "Geen gehoor" — kleur naar categorie (groen/grijs/rood) zou direct leesbaar zijn.
- KPI "Inzet Uren — *Totale beltijd*": ondertitel klopt niet (het zijn gelogde/gecorrigeerde uren, per dag afgerond). De afrondregel zelf is overal consistent (2.66 → 1+2+1 = 4u), maar nergens uitgelegd — een tooltip zou de "2.66 vs 4" vraag voorkomen.
- "Score per uur" is een duplicaat van "Positief per uur" in dezelfde matrix.
- Plaatsnamen lowercase in Top Locaties ("nieuw-lekkerland", "'s-gravenzande"); "21 steden via geocoding gevonden!" (uitroepteken uit de toon).
- Euro-spacing wisselt: "€ 576,00" vs "€192,00" vs "€37,08/sale".
- Mobiel: geen horizontale page-overflow (goed!), maar de Totaal-kolom van de matrix staat helemaal rechts — overwegen om die op mobiel te pinnen; geen scroll-hint op de tabel.
- 404-pagina functioneel maar kaal (geen logo); Batch-tabel heeft geen zichtbare sorteerkolommen; zoekveld Gebruikers zegt "Zoek op naam of user ID" maar de tabel toont e-mails.

---

## D. Wat er goed uitziet (expliciet benoemd)

- **Klant-view (Rapport)**: KPI's bovenaan, rustige opbouw, embargo correct (klant ziet t/m gisteren, admin realtime) — geverifieerd in preview.
- **Rekenwerk dat klopte bij narekenen**: jaarwaarde-popover (3 × €48 × 4 = €576), netto conversie (3/12 = 25%), uren-afronding consistent tussen urencorrectie, KPI en matrix, Sligro-ratio's (93,2% overal gelijk), gebruikerstellers (9+3+2 = 14).
- **Geografische analyse**: kaart, conversie-legenda, dekking-infobalk ("83 van 99 records") en Top Locaties — beste onderdeel van de Analyse-view.
- **Beheer**: Projecten/Klanten/Gebruikers-tabs verzorgd; "Jij"-badge met uitgeschakelde self-delete; inloglink + koppelen per klant; batchmanager met verse sync-tijden; demo-omgevingskaart met "Klaar om te delen".
- **Onboarding-tour ankert netjes** op de juiste elementen (stap 2 → sidebar highlight).
- **Welcome-pagina** met PWA-installatie per platform — precies wat in de roadmap stond.
- **Mobiel**: layout stapelt goed, tabellen scrollen in eigen container, geen layout-breuk.

---

## E. Prioriteitsvoorstel

| # | Actie | Waarom eerst |
|---|---|---|
| 1 | Recharts-grafieken repareren (A1) | Klant-facing view is zichtbaar kapot |
| 2 | Inbound KPI-RPC gelijktrekken met matrix (A2) | €0 vs €300 is direct vertrouwensverlies |
| 3 | `get_result_code_distribution` timeout fixen (A3) | Vangnet voor nieuwe codes staat stil uit |
| 4 | Preview-fidelity + Bruto/Netto in Analyse (A5) | Afspraak uit juni wordt omzeild |
| 5 | Trust-banner-copy (A6) + Analyse-telling (A4) | Kleine fix, grote geloofwaardigheid |
| 6 | Slugs → projectnamen (B1) + getalnotatie (B2) | Grootste visuele kwaliteitssprong voor weinig werk |
