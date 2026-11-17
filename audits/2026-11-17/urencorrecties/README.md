# Urencorrecties in rapportages — 17 november 2026

Status: na expliciet akkoord op 17 november 2026 live uitgerold. PR #39 is
samengevoegd als `6130780a51dbfda4d8d91cb16ee05ba019d006a5`; de productiecode
is identiek aan de geteste PR-commit `545dde0f017857f42930284ec7dbfd8964f5b03a`.

## Melding en broncontrole

Sarah meldt bij Max Magazine 12 uur in een tabel, terwijl in Urencorrectie
10 uur staat. Kas vraagt dat correcties bij alle campagnes/perioden werken.
Er is geen specifieke dag of tabel opgegeven.

Live alleen-lezen gecontroleerd:

- Max Magazine: project `bc18f999-194e-4774-9f47-d61ae9817cfc`, BasiCall 937,
  template `outbound_standard`, urenfactor 1.
- Correcties naar 10 uur bestaan op 27, 29 en 30 oktober 2026. De correctie
  van 28 oktober is 12 uur. Deze gegevens zijn niet gewijzigd.
- Max magazine leden is een ander project (BasiCall 942), ook met factor 1.
- Beide projecten hebben geen geïmporteerde weekrapportages die uren overschrijven.
- De exacte gemelde live cel is niet gereproduceerd: datum/tabel onbekend en
  zowel de geïsoleerde Chrome op jawerkt-ai als het bestaande Chrome-profiel
  vragen om inloggen. Geen authenticatie omzeild of productie-testdata geschreven.

## Aangetoonde codeproblemen

1. Opslaan invalideert `daily_hours_breakdown` en `logged_time`, maar niet
   `logged_time_weekly`. Een reeds geladen weekvergelijking houdt de oude uren.
2. Grafiekdata in de weekvergelijking is alleen afhankelijk van callrecords;
   gewijzigde uren/tarieven veranderen de grafiek daardoor niet.
3. Nulcorrecties vallen in tabellen en jaar-export terug op gesprekstijd.
   Ontbrekende bronuren en expliciet gecorrigeerde nul werden niet onderscheiden.
4. Andere geopende dashboards verversen niet vanzelf bij een correctie: de
   globale queryinstelling schakelt verversen bij vensterfocus uit.

## Reparatie

- Na opslaan alle drie de projectgebonden urenqueries verversen en wachten op
  de actieve queries. Ook na gedeeltelijk mislukte opslag de geslaagde dagen
  zichtbaar maken; invoer bij opslagfout behouden.
- Gedurende de volledige opslag/reload de invoer vergrendelen.
- Beide urenhooks elke minuut en bij terugkeren naar het venster verversen.
- Eén resolver/aggregator voor dag-, totaal- en weekuren; een nulcorrectie
  blijft nul. Ontbrekende/lege syncuren behouden de bestaande fallback.
- Grafieken rekenen opnieuw met de actuele uren.
- Nulcorrecties werken door in outbound-, inbound- en servicetabellen en de
  outbound-/retentie-/service-export. Bestaande rapportage-overrides, urenfactor,
  afronding en per-sale-facturatie behouden hun betekenis.
- Geen database-, RLS-, syncserver- of historische-datawijzigingen.

## Validatie

- 41 Vitest-tests geslaagd, inclusief echte QueryClient-refetch van 12 naar
  10 uur (ook weekcache), projectisolatie, nul versus ontbrekende bron, tabel-
  en kostencellen, en gegenereerde outbound/retentie Excel-werkboeken
  (dag/week/jaar: 10, 0 en correctie verwijderen -> 12).
- Productiebuild en lint van alle gewijzigde bestanden geslaagd.
- Losse TypeScript-check heeft nog één bestaande fout buiten deze wijziging:
  `ResultsBreakdown.tsx:66` geeft `MappingConfig | {}` door waar `MappingConfig`
  is vereist. Geen nieuwe typefouten in de gewijzigde bestanden.
- Productie-uitrol is afgerond. Ingelogde visuele acceptatie staat nog open:
  de browsersessie vraagt om inloggen. Geen fictieve correctie in een
  klantcampagne opgeslagen.

## Productiecontrole

- Vercel-release `dpl_9yEKLXkgPMYqhv8TNzifjog9G16M`, commit `6130780`,
  status `READY`, productie, zonder aliasfout. Gereed op 17 november om 11:10 CET.
- `app.ttcallcenters.nl` en `.com` staan op deze release. De `.nl`-homepage
  serveert `/assets/index-BZgaXaoe.js`; vóór uitrol was dit `index-BBv5W8aa.js`.
- De gedownloade productie-JavaScriptbundel is byte voor byte gelijk aan
  de lokaal geteste build: SHA-256
  `c6212e40be2b5dfc98f80c708837accf12a63e7dc0788efe1eabfdd78bad0d3e`.
  De publieke pagina opent in Google Chrome op
  jawerkt-ai zonder consolefouten; de loginbeveiliging blijft actief.
- Live database nogmaals alleen-lezen gecontroleerd: op 27, 29 en 30 oktober
  staan de correcties van Max Magazine nog steeds op 36.000 seconden (10 uur).
  Ook de overige opgeslagen correcties zijn behouden.
- Terugvalrelease: `dpl_4ipGzNQM3cPEpKe1JwGLHHkKfpHP`, commit `f2668b0`.
  Niet teruggezet; vastgelegd als rollbackmogelijkheid.

## BasiCall-verzoek (afzonderlijke opdracht)

Mail vanaf `kas@sitejob.nl` aan het uit eerdere correspondentie geverifieerde
`support@basicall.nl` verstuurd: Filmfestival Hersenstichting (943) toevoegen
aan de bestaande API-koppeling op S06, met verzoek om bevestiging na activatie.
Gmail bevestigde status `SENT`, bericht-ID `1a1e8f05d0178054`.
Geen token meegestuurd. Import wacht nog op werkende API-toegang.
