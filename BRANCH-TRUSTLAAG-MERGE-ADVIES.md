# Branch `feat/data-trustlaag-en-sync-fixes` — wat zit erin en wat merge je?

Commit `09b8e50`, 35 bestanden, lokaal (niet gepusht). Opgesteld 19-07-2026 na een
geautomatiseerde analyse: 5 agents lazen elk een deel van de branch, daarna zijn alle
27 bevindingen die mogelijk data voor klanten verbergen apart nagetrokken.

---

## Kernconclusie

**Deze branch mergen verandert vandaag niets voor je klanten. Nul.**

Alle 27 controles kwamen op hetzelfde uit: er verdwijnt geen cijfer en geen sectie.
De reden is één schakelaar. `quality_enforcement_enabled` staat op `false` bij alle 40
projecten, en de RPC `get_project_data_quality` zet `blocked_metrics` dan hard op leeg
(migratie `20260714120000`, regel 828-836). Het hele blokkeerpad in de frontend leest
uitsluitend die lijst. Leeg = niets geblokkeerd.

**Maar de machinerie zit er volledig in.** Zodra iemand die schakelaar voor één project
omzet — het is een gewone toggle in het projectbewerkscherm — gaat er wél van alles weg.
Dat is precies wat niet mag. De schakelaar is dus geen veiligheid, het is uitstel.

---

## Zonder zorgen mergen

Deze verbeteren de correctheid of raken alleen beheerders.

| Onderdeel | Waarom veilig |
|---|---|
| `scripts/basicall-sync/sync.js` | Draait al identiek in productie. Bevat de fix waarmee 1.711 belpogingen terugkwamen. |
| De twee migraties | Al toegepast op de live database sinds 14 juli. De repo loopt achter, niet andersom. |
| `supabase/functions/quality-alert/` | Al gedeployed. Stuurt alleen mail naar `info@sitejob.nl`. |
| `DataQualityCenter.tsx` | Admin-only overzicht van openstaande controlepunten. |
| `DataTrustOnboarding.tsx` | Rendert alleen voor admins. |
| `ProjectDialog.tsx`, `ProjectsTable.tsx` | Beheerschermen. De activatieknop schrijft nu ook `reporting_state`. |
| Mappinggoedkeuring (`approve_project_mapping`) | Weigert een mapping op te slaan waarin een resultaatcode niet in precies één categorie staat. Dit maakt cijfers juister aan de bron. |
| `mappingTrust.ts` + `useMappingCandidates` | Stelt velden en waarden voor op basis van de echte data. |
| Tests (3× vitest, 2× SQL) | 17 tests, draaien groen. |
| Deep-link/projectselectie-fix, Euro-icoon, typing in `recordValue.ts` | Kleine correctheids- en opmaakverbeteringen. |

---

## Eruit halen of ombouwen vóór iemand de schakelaar omzet

Alles hieronder verbergt data zodra `quality_enforcement_enabled` aan gaat.

| Bestand | Regel | Wat er gebeurt |
|---|---|---|
| `Dashboard.tsx` | 643-676 | De drie hoofdweergaven (rapportage, dashboard, analyse) worden vervangen door een rood omrand vak "Dit onderdeel wordt gecontroleerd". Geen tabel, geen grafiek, geen cijfer. |
| `Dashboard.tsx` | 100-103 | `blocksReport` slaat aan bij *welke* geblokkeerde metric dan ook behalve analyse en export. Eén geblokkeerde metric (bijvoorbeeld alleen uren) laat dus de complete weekrapportage verdwijnen, inclusief sales en conversie die wél kloppen. |
| `Dashboard.tsx` | 640 | De voortgangsbalk verdwijnt volledig uit de pagina, zonder placeholder of uitleg. Dit is de ergste variant: gisteren stond er iets, vandaag niets. |
| `KPICard.tsx` | 52-53 | De waarde wordt vervangen door een streepje `—`. |
| `KPICard.tsx` | 62-64 | De normale toelichting onder het cijfer wordt vervangen door "Wordt gecontroleerd". |
| `KPICard.tsx` | 75 | De popover met de opbouw van de jaarwaarde is niet meer op te vragen. |
| `DataQualityBanner.tsx` | 37-41 | Rode alarmbalk met schild-icoon bij een routinematige sync-achterstand. |
| `DataQualityBanner.tsx` | 60-72 | `QualityBlockedPanel` — het vehikel voor de sectie-blackout. |
| `ReportViewSection.tsx` | 156-160 | De Excel-exportknop wordt uitgeschakeld. Mildste geval, maar Sander is van die export afhankelijk. |

**De bedrading in `KPICardsSection.tsx` (regel 50, 115-234) mag blijven.** Die geeft per
kaart netjes door welk cijfer onzeker is. Het probleem zit puur in wat `KPICard` daarmee
doet. Bouw je die om naar "cijfer laten staan met een aantekening", dan hoeft de bedrading
niet aangeraakt te worden.

Twee dingen die los van elkaar zouden moeten staan maar dat nu niet doen:

- **Banner tonen** en **cijfers blokkeren** hangen aan dezelfde vlag (`Dashboard.tsx`
  regel 549). De groene variant "Gecontroleerd t/m 17 juli" is juist vertrouwenwekkend en
  zou je willen tonen zónder het blokkeerpad aan te zetten.
- **Het kwaliteitsvenster** (`Dashboard.tsx` regel 91-98) valt zonder datumfilter terug op
  de volledige projecthistorie vanaf `created_at`. Omdat `sync_logs` maar beperkte historie
  heeft, levert dat vrijwel altijd een "ontbrekende dag" op. Begrens dat op
  `quality_tracking_started_at`.

---

## Drie observaties over rekencorrectheid

Deze staan los van het blokkeren en raken je eigenlijke prioriteit: kloppen de cijfers.

### 1. Excel-export en dashboard kiezen het frequentieveld omgekeerd

Deze branch draait de volgorde om in `recordValue.ts` — de geconfigureerde `freq_col` wint
nu van het generieke veld `frequency`, met een terechte reden in de code: bij
winback-projecten kan het generieke veld nog de oude donatiefrequentie bevatten.

`outboundStandardExport.ts` (regel 257, 260, 352, 354) is niet meegewijzigd en kiest nog
steeds `rawData['frequency']` vóór de geconfigureerde kolom.

**Praktisch effect vandaag: nul.** Ik heb het gemeten — van 82.335 records in de laatste
90 dagen heeft er **geen enkele** een veld `frequency` of `amount`. Beide paden vallen dus
terug op dezelfde geconfigureerde kolom.

Het blijft een val voor later: levert BasiCall ooit een veld met die exacte naam, dan wijkt
de Excel-export stilletjes af van het dashboard. Volgens CLAUDE.md moeten die twee paden
gelijk lopen. Eén regel gelijktrekken lost het op.

### 2. `other_results` zit in geen enkel rekenpad

De nieuwe mappingcategorie "Overig — bewust neutraal" wordt opgeslagen en gebruikt in de
driftdetectie, maar komt niet voor in `statsHelpers.ts`, `useKPIAggregates` of
`useReportMatrixData`.

Gevolg: een code die je in "Overig" parkeert verdwijnt uit de meldingen, maar telt in de
berekening gewoon mee in de noemer van de netto conversie. Als dat de bedoeling is
("behandel als normaal gesprek") is het correct. Zo niet, dan is het een val: het lijkt
opgelost terwijl het cijfer niet verandert. **Even vaststellen wat de bedoeling was.**

### 3. "Voorstellen invullen" kan een ingestelde frequentie overschrijven

In `MappingTool.tsx` (regel 539) mergt de knop de voorgestelde `freq_map` over de
bestaande heen: bij een sleutelbotsing wint het voorstel. De categorieën zijn wél
beschermd tegen overschrijven. Dat is inconsistent — klikt iemand die knop op een project
dat al goed staat, dan kan een handmatig vastgelegde vermenigvuldiger stilletjes wijzigen.

---

## Aanbevolen volgorde

1. **Merge de backend en de adminschermen.** Dat is wat al live draait plus gereedschap
   dat alleen jij en Esther zien. Nul risico voor klanten.
2. **Haal het blokkeerpad eruit of bouw het om** vóór het klantdashboard live gaat. Het
   is nu één toggle verwijderd van een leeg scherm.
3. **Trek `outboundStandardExport.ts` gelijk** met `recordValue.ts`. Kost een regel, en
   voorkomt dat de export ooit van het dashboard gaat afwijken.
4. **Stel vast wat `other_results` hoort te doen** en zorg dat de rekenlogica dat volgt.
5. **De 380 niet-gecategoriseerde resultaatcodes opruimen.** Bestaande backlog van 10 juli.
   Dit is waarschijnlijk de grootste winst voor de juistheid van je netto conversie, en
   staat helemaal los van deze branch.

---

## Wat er buiten deze branch nog openstaat

- **Kemkens Inbound (927)** en **Hersenstichting Storno nieuw (914)** leveren geen data;
  BasiCall moet ze openzetten.
- **De mail aan Esther** ligt klaar in de scratchpad, inclusief de melding dat cijfers van
  vóór 14 juli te laag staan.
- **De UTC/NL-datumvergelijking** in de trustlaag-SQL vergelijkt `sync_from::date` (UTC)
  met een lokale kalenderdag. Bevestigd tegen productie. Latent zolang de handhaving uit
  staat, maar het gaat dagen verkeerd beoordelen zodra je hem aanzet.
