# Sligro Tintelingen — urenherstel, 16 november 2026

Status: voorbereid en gecontroleerd; **niet gedeployd, geen productiedata gewijzigd**.

## Oorzaak

De sync vroeg `Project.getIngelogdeTijden` op voor project 870. BasiCall heeft
op 2 juli 2026 in ticket 2026061510000046 bevestigd dat de uren voor deze
inboundcampagne via `Queue.getIngelogdeTijden` met queue 74 beschikbaar zijn.
De toen geleverde queue-interface was niet aangesloten in de sync.

De klantweergave vereist uren voor iedere beldag. Bij ontbrekende dagen blijven
agenturentotaal en calls per uur onbekend. Calls synchroniseerden wel; de oude
herstelronde controleerde alleen records, waardoor ontbrekende uren niet
opnieuw werden opgehaald.

## Alleen-lezen proefrun op echte bron

- Periode: 15 september t/m 14 november 2026 (na de laatste Excel-dag).
- Alle 52 beldagen succesvol uit BasiCall gelezen, geen bronfouten.
- 39 dagen hadden nog geen urenrij; 13 hadden al een bronwaarde.
- 10 bestaande handmatige correcties blijven leidend.
- Bronberekening conform Sligro-rapportage: `In gesprek` + `Nawerktijd`.
- Mailverwerking, pauzes en voorwerktijd niet als agenturen meegeteld.
- Week 46: 50.491 effectieve seconden = 14,0253 agenturen; bij 156 calls
  is dat 11,1228 calls per uur. Bestaande mailuren 23,75 blijven behouden;
  totaal agenten + mail = 37,7753 uur.
- Lege zondag 15 november gecontroleerd: HTTP 500 met SOAP-code 404 en
  `Geen resultaten gevonden`. Alleen deze expliciete leegmelding wordt bij
  afwezigheid van calls als lege dag behandeld; andere fouten blijven fouten.

Dit zijn verwachte cijfers na uitvoering, geen geverifieerde live weergave.
De dagresultaten staan in `preview.jsonl`; geen tokens of agentgegevens.

## Validatie

- 13 gerichte backendtests geslaagd.
- 6 bestaande inbound-servicetests geslaagd.
- Productiebuild en lint van het gewijzigde TypeScript-bestand geslaagd.
- Deploy-dry-run: alleen `sync.js`, `backfill-hours.js` en `HOURS.md` zouden
  naar de server gaan. Geen omgeving- of dependencywijzigingen.
- Bestaand live syncscript identiek aan de basis van deze branch (SHA-256
  `bfe2341f87a4485d59bbb24def2e795593d2eebdc1111cacca0293f1ea5488af`).

## Uitvoering na productieakkoord

1. Bewaar een kopie van het bestaande syncscript op de server.
2. Deploy vanuit `scripts/basicall-sync` met `./deploy.sh --apply`.
3. Draai de gerichte urenreparatie uit `scripts/basicall-sync/HOURS.md` met
   `--project=870 --from=2026-09-15 --to=2026-11-14 --apply`.
4. Bewaar het door het herstelcommando gemelde JSON-backuppad.
5. Controleer volledige urendekking, ongewijzigde handmatige correcties en
   mailuren, succesvolle auditregels en de klantweergave voor week 46.
6. Controleer de eerstvolgende automatische urenronde.

Er is geen frontend-release, schemawijziging of RLS-wijziging nodig.
