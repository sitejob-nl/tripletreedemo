# Sligro nawerktijd en filmfestival — vervolg 16 november 2026

Status: **na expliciet akkoord gedeployd en uitgevoerd op 16 november 2026**.
774 bestaande gesprekken zijn aangevuld; de live klantpreview toont voor
week 46 **1,07 minuut gemiddelde nawerktijd**. De eerdere urenreparatie blijft
ongewijzigd; zie het naastgelegen `sligro-hours`-audit.

## Sligro nawerktijd

De live BasiCall Queue 74 levert per status `record_id`, `aantal_seconden`,
`start_tijd` en `eind_tijd`. De nieuwe verwerking telt uitsluitend `Nawerktijd`
per datum en record. `In gesprek` zonder nawerksegment bewijst nul nawerktijd;
zonder gekoppeld queue-record blijft de waarde onbekend.

De bestaande frontend en Excel-export lezen `raw_data.bc_nawerktijd` al.
Daarom is alleen een syncserver-uitrol nodig. De reguliere records-sync
verrijkt de gegevens vóór opslaan, zodat toekomstige imports de waarde niet
weer verwijderen. Bronfouten blokkeren de calls niet en krijgen een aparte audit.

Alleen-lezen proefrun over 15 september t/m 15 november:

- 52 beldagen, 830 callrecords, 774 met aantoonbare nawerktijd, 0 bronfouten.
- 53 verloren inboundcalls krijgen geen verzonnen nawerktijd.
- Bij 3 andere records ontbreekt de koppeling: één afgehandeld gesprek op
  16 september, één op 18 september en één onbekend resultaat op 29 september.
  Hiervoor blijft het veld onbekend; een onvolledig dag-/weekgemiddelde blijft leeg.
- Week 46: alle 144 aangenomen gesprekken gekoppeld, 9.210 seconden nawerktijd.
  Gecontroleerde live weergave: **1,07 minuut gemiddelde nawerktijd**.
- `preview.jsonl` bevat uitsluitend dagtotalen en aantallen per resultaat.

## Service level

De gekoppelde records bevatten geen expliciet wachttijdveld. Gecontroleerde
records hebben `bc_ivr_starttijd = 0000-00-00 00:00:00` en
`bc_ivr_gesprekstijd = 0`; dat bewijst geen wachttijd van nul seconden.
De live WSDL biedt geen afzonderlijke queue-wachttijd- of servicelevelmethode.
Er wordt geen service level uit gespreksduur afgeleid.

Nog nodig van BasiCall: wachttijd per aangenomen gesprek of het aantoonbare
aantal binnen 30 seconden aangenomen gesprekken, per dag voor Queue 74,
met een gedocumenteerde definitie van het meetmoment. Een bevoegde bronrapportage
met dezelfde definitie kan als gecontroleerde aanvulling dienen.

Bronnen: live SOAP/WSDL op de bestaande syncserver, BasiCall-documentatie 2.12
(20 april 2026, supportticket 2026041610000093), en queue-uitbreiding bevestigd
in supportticket 2026061510000046 van 2 juli 2026.

## Filmfestival Hersenstichting

- Dashboardnaam: `filmfestival hersestichting` (zoals aangemaakt).
- Project: `cc786b19-8007-4b4c-a5c6-ac04068d558a`, BasiCall-project 943.
- Actief, outbound, template `outbound_standard`; aangemaakt 16 november om 13:45 CET.
- 0 records, geen eerdere importjob of syncresultaat bij eerste controle.
- Een token is opgeslagen, maar BasiCall weigert de combinatie met HTTP 500
  en SOAP-fout **Authentication Required**, ook voor alleen week 46.
- De token is niet leeg en bevat geen witruimte; geen token afgedrukt of aangepast.
- Projectnummer en token moeten via Projectbeheer/BasiCall worden gecontroleerd.
  Geen import gestart zolang deze koppeling wordt geweigerd.

## Validatie en uitvoering

19 backendtests, 7 inbound-servicetests, frontendbuild en gerichte lint geslaagd.
De tests controleren onder meer onbekend versus nul, dagscheiding, behoud van
bronvelden, foutafhandeling, alleen-lezen preview, backup en concurrentieconflict.

Uitgevoerd op de live syncserver `tt-vps`, broncommit `1578c46`:

- Rollbackmap: `/home/sitejob-tt/basicall-sync-backups/sligro-after-call-20261116T162959Z/`.
- Uitrol met `./deploy.sh --apply` vanuit `scripts/basicall-sync`; geen
  omgeving- of dependencywijzigingen. Syntax en hashes op de server gecontroleerd.
- SHA-256 `sync.js`: `37d61eb0f3ed6b717a476902fc34677f60416c05dc6d053b50e64376510d4e5d`.
- SHA-256 `backfill-after-call.js`: `7e1cb1feb5f4aa285c022fca18acdbdef2d1ab663630596c096c757389d07a84`.
- Uitgevoerd vanuit `/opt/basicall-sync`:
  `node backfill-after-call.js --project=870 --from=2026-09-15 --to=2026-11-15 --apply`.
- Succes om 17:32 CET: 774 records opgeslagen, 0 bron- of opslagfouten.
  Alle dagresultaten staan in `applied.jsonl`; succesvolle audit in `sync_logs`.
- Datarollback: `/tmp/basicall-after-call-870-1794846680205.json`, duurzaam
  bewaard als `after-call-before.json` in bovenstaande rollbackmap (rechten 0600).

Controle na uitvoering:

- 830 callrecords behouden, 774 hebben nu `bc_nawerktijd`.
- Alle overige recordvelden zijn exact gelijk; fingerprint vóór en na:
  `749032b9601b97ef2898d88654db197a`.
- Uren inclusief alle correcties exact gelijk; fingerprint vóór en na:
  `45ad2d4ba43eef4e4c3fbf256777d6a7`.
- Alle weekoverrides, inclusief mailuren, exact gelijk; fingerprint vóór en na:
  `76df01c7da63b791d6163759b2f15cbf`.
- Live dashboard, Sligro, week 46, **Bekijk als klant**: nawerktijd **1,07 min**,
  156 calls, 11,1 calls per uur, 14,03 agenturen en 37,78 totaaluren.
  Dit is de klantpreview vanuit een beheeraccount, geen Sligro-gebruikerslogin.
- De melding van ontbrekende nawerktijd is verdwenen; alleen wachttijd/service
  level blijft onbekend. Filmfestival is nog niet geïmporteerd en de koppeling
  is niet aangepast, in afwachting van de opgevraagde gegevens.
- De reguliere cron gebruikt de uitgerolde verrijking bij volgende imports.
  De eerstvolgende automatische records-sync is nog niet waargenomen.

Geen schemawijziging, RLS-wijziging of frontend-release nodig.
