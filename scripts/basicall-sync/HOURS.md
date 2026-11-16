# Inbound-uren

De uren van Sligro Tintelingen (project 870) komen uit
`Queue.getIngelogdeTijden` met SOAP-header `Queue: 74`, niet uit
`Project.getIngelogdeTijden`. BasiCall bevestigde deze interface op 2 juli 2026
in ticket 2026061510000046. De bron is op 16 november 2026 opnieuw uitgelezen.

De Sligro-rapportage berekent agentinzet uit gesprekstijd plus nawerktijd.
Daarom tellen uitsluitend de queue-statussen `In gesprek` en `Nawerktijd` mee.
De queue levert ook pauzes, voorwerktijd en `Emailverwerking`; die tellen niet
mee als agenturen. De bestaande handmatige mailuren blijven apart staan.
`corrected_seconds` blijft leidend en wordt nooit overschreven door de sync.

## Nieuwe inbound-campagne controleren

1. Vraag BasiCall naar het queue-ID; een project-ID is geen queue-ID.
2. Leg het gecontroleerde ID vast in `mapping_config.basicall_queue_id`.
   Alleen Sligro heeft een ingebouwde, geverifieerde standaardwaarde.
3. Draai de urenpreview voor een afgesloten belweek. Controleer de gekozen
   bron, alle beldagen en de uren tegen de klantafspraak/bronrapportage.
4. Controleer in het dashboard agenturen én calls per uur. Mailuren moeten
   afzonderlijk worden aangeleverd; ontbrekende waarden worden niet geschat.

De nacht- en middagronde controleren ontbrekende uren los van de records-sync:
maximaal vijf dagen per ronde, binnen de laatste tien afgesloten dagen.
Handmatige correcties (ook een expliciete nul) worden gerespecteerd.
Een mislukte definitieve urenronde verschijnt in `sync_logs` en als
`sync_hours_failure` in het beheerderslog, maximaal eenmaal per project/dag
per 24 uur. Deze nieuwe route verzendt geen e-mail.

## Gerichte reparatie

Voer uit vanuit `/opt/basicall-sync`, met de bestaande serveromgeving.
Standaard is dit alleen-lezen; de volledige cron en jobqueue worden niet gestart.

```sh
node backfill-hours.js --project=870 --from=2026-09-15 --to=2026-11-14
```

Pas na akkoord op de productiewijziging:

```sh
node backfill-hours.js --project=870 --from=2026-09-15 --to=2026-11-14 --apply
```

De reparatie leest eerst alle uren. Als één dag mislukt wordt niets opgeslagen.
Vóór de eerste databasewijziging wordt een JSON-backup met oorspronkelijke
waarden in de tijdelijke servermap geschreven (modus 0600); het pad verschijnt
in de uitvoer. Elke opgeslagen dag krijgt een uren-auditregel. Bij een
opslagfout stopt de reparatie en meldt hoeveel dagen al zijn opgeslagen.
Herhalen is idempotent voor de bronuren; correcties en rapportage-overrides
worden niet gewijzigd. Bewaar het backuppad bij de oplevering.

De frontend gebruikt de bestaande urentabel, zodat een aparte frontend-release
niet nodig is voor deze reparatie. De syncserver moet wel de nieuwe `sync.js`
en `backfill-hours.js` krijgen via `deploy.sh --apply` (na productieakkoord).

## Nawerktijd per gesprek

`Queue.getIngelogdeTijden` levert naast status en seconden ook `record_id`.
De records-sync koppelt `Nawerktijd` per kalenderdag en record aan
`raw_data.bc_nawerktijd`. Het bestaande dashboard en de Excel-export lezen
dit veld al. Er worden geen agentgegevens uit de queue overgenomen.

Een record met `In gesprek` maar zonder nawerksegment krijgt een aantoonbare
nul; records die niet in de queue voorkomen blijven onbekend. Een bronfout
blokkeert de calls-import niet en krijgt een aparte `after_call_time`-auditregel.
Wachttijd of service level wordt niet afgeleid uit gespreksduur of IVR-nulwaarden.

Gerichte aanvulling van bestaande records (standaard alleen-lezen):

```sh
node backfill-after-call.js --project=870 --from=2026-09-15 --to=2026-11-15
```

Na akkoord: voeg `--apply` toe. Het commando leest eerst de volledige bron,
stopt vóór mutaties bij bronfouten en maakt een backup met rechten 0600.
Alleen `raw_data` van gekoppelde records verandert. Een vergelijking met de
oorspronkelijke JSON voorkomt overschrijven van gelijktijdige wijzigingen.
Bij een conflict stopt het commando en meldt het aantal opgeslagen records
en het backuppad. Uren, handmatige correcties en weekoverrides blijven behouden.

## Validatie

```sh
node --test scripts/basicall-sync/tests/sync.cjs
npm test -- --run src/lib/inboundServiceMetrics.test.ts
npm run build
```
