# Sligro Tintelingen — urenherstel, 16 november 2026

Status: **gedeployd op de live syncserver en aangevuld na expliciet akkoord**.
Alle 52 beldagen van 15 september t/m 15 november 2026 hebben uren.
De live klantweergave is op 16 november 2026 om circa 11:44 CET gecontroleerd.

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

Deze cijfers zijn na uitvoering in de database en live klantweergave bevestigd.
De proefrun staat in `preview.jsonl`, de uitgevoerde reparatie in `applied.jsonl`;
beide bevatten geen tokens of agentgegevens.

## Validatie

- 13 gerichte backendtests geslaagd.
- 6 bestaande inbound-servicetests geslaagd.
- Productiebuild en lint van het gewijzigde TypeScript-bestand geslaagd.
- Deploy-dry-run: alleen `sync.js`, `backfill-hours.js` en `HOURS.md` zouden
  naar de server gaan. Geen omgeving- of dependencywijzigingen.
- Bestaand live syncscript identiek aan de basis van deze branch (SHA-256
  `bfe2341f87a4485d59bbb24def2e795593d2eebdc1111cacca0293f1ea5488af`).

## Uitgevoerde uitrol en herstel

- Server: `tt-vps`, map `/opt/basicall-sync`. Uitgerold met het projectspecifieke
  `scripts/basicall-sync/deploy.sh --apply`; geen omgeving- of dependencywijzigingen.
- Gedeployde broncommit: `5832ce7`.
- `sync.js` SHA-256:
  `c23eec9d8ecb1ecf6249ec6abb2dd4c1289d8f9bb5495b42682270984972485b`.
- `backfill-hours.js` SHA-256:
  `4609cd716e9360f7c3ad855a0019fed4723c1a3a233589316257b02bac762d44`.
- JavaScript-syntax op de live server gecontroleerd.
- Uitgevoerd: `node backfill-hours.js --project=870 --from=2026-09-15 --to=2026-11-15 --apply`.
- Resultaat: 52 dagen opgeslagen, 0 bronfouten, 39 ontbrekende urenrijen
  toegevoegd en 13 bronwaarden vernieuwd. De 10 handmatige correcties blijven leidend.
- Codebackup: `/home/sitejob-tt/basicall-sync-backups/sligro-hours-20261116T103751Z/`.
- Oorspronkelijke urenbackup: `/tmp/basicall-hours-870-1794825644518.json`.
  Bewaarde kopie: `hours-before.json` in bovenstaande codebackupmap (rechten 0600).

## Controle na uitvoering

- Alle 52 beldagen hebben uren; 0 ontbrekende beldagen.
- 52 succesvolle, gerichte `logged_time`-auditregels in `sync_logs`.
- Handmatige correcties ongewijzigd, inclusief datum, uitvoerder en notitie:
  fingerprint voor en na `efedfb6f02cf40f22b60c47d54d01fbf`.
- Alle weekoverrides, waaronder mailuren, ongewijzigd:
  fingerprint voor en na `76df01c7da63b791d6163759b2f15cbf`.
- Week 46 heeft 50.491 effectieve seconden. Live op
  `https://app.ttcallcenters.nl/dashboard`, Sligro Tintelingen, week 46,
  met de admin-optie **Bekijk als klant**: 156 calls, **11.1 calls per uur**,
  **14,03 agenturen**, **23,75 mailuren**, **37,78 uur totaal**.
- Een gewone herlaadactie verving de aanvankelijk verouderde browserweergave.
  De bestaande frontendrelease op `f2668b0` toont daarna de juiste cijfers;
  er is geen frontend-release uitgevoerd. Dit is een klantpreview vanuit een
  beheeraccount, geen afzonderlijke aanmelding als Sligro-gebruiker.
- De bestaande cron blijft de nieuwe `sync.js` uitvoeren. Het afzonderlijke
  urenherstel draait in de nacht- en middagronde. De eerstvolgende automatische
  cronronde is op het moment van deze oplevering nog niet waargenomen.

Geen schemawijziging of RLS-wijziging uitgevoerd. De bronwijziging staat ter
review in PR #34; de syncserver is al bijgewerkt en de database is hersteld.
