# Urencorrecties in rapportages — 17 november 2026

Status: voorbereid en lokaal getest; nog niet naar productie uitgerold.

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
- Productie-uitrol en ingelogde visuele acceptatie staan nog open. Na uitrol
  een echte correctie controleren in dagrapport, weekvergelijking en export;
  geen fictieve correctie in een klantcampagne opslaan.

## BasiCall-verzoek (afzonderlijke opdracht)

Mail vanaf `kas@sitejob.nl` aan het uit eerdere correspondentie geverifieerde
`support@basicall.nl` verstuurd: Filmfestival Hersenstichting (943) toevoegen
aan de bestaande API-koppeling op S06, met verzoek om bevestiging na activatie.
Gmail bevestigde status `SENT`, bericht-ID `1a1e8f05d0178054`.
Geen token meegestuurd. Import wacht nog op werkende API-toegang.
