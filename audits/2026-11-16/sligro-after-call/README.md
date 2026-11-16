# Sligro nawerktijd en filmfestival — vervolg 16 november 2026

Status: nawerktijdreparatie voorbereid en alleen-lezen gecontroleerd.
**Nog niet gedeployd; in dit vervolg geen productiedata gewijzigd.**
De eerdere urenreparatie is wel live; zie het naastgelegen `sligro-hours`-audit.

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
  Verwachte live weergave: **1,07 minuut gemiddelde nawerktijd**.
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

Na akkoord op de aanvullende productiedeploy:

1. Bewaar de huidige `sync.js` op de syncserver voor rollback.
2. `./deploy.sh --apply` vanuit `scripts/basicall-sync`; geen omgevingwijziging.
3. Vanuit `/opt/basicall-sync`:
   `node backfill-after-call.js --project=870 --from=2026-09-15 --to=2026-11-15 --apply`.
4. Bewaar het door de reparatie gemelde backupbestand buiten `/tmp`.
5. Controleer week 46 op 1,07 minuut, behoud van alle andere recordvelden en
   ongewijzigde uren, correcties en weekoverrides.
6. Controleer de live klantweergave. Het service level blijft onbekend totdat
   de benodigde brondata beschikbaar zijn.

Geen schemawijziging, RLS-wijziging of frontend-release nodig.
