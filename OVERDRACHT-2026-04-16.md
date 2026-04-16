# Overdracht Triple Tree Portal — 16 april 2026, 16:00

**Aanwezig**: Kas (SiteJob), Esther van Weert (PM), Willem Geerts (directeur)
**Live sinds**: 17-12-2025 op https://app.ttcallcenters.nl

---

## 1. Wat we vandaag hebben gedaan (korte stand-up)

Vanmorgen audit uitgevoerd op het systeem ter voorbereiding op deze overhandiging. Drie productie-fixes live gezet:

1. **Mapping-config fix** — één project (STC WB 6 maanden) leverde stilletjes €0 op bij positieve gesprekken. Gefixt in de database én een **admin-waarschuwing toegevoegd** op het dashboard die deze fout in de toekomst meteen aan jullie toont.

2. **Silent-token fix op nachtsync** — als een BasiCall-token ongeldig werd, werd dat 's nachts niet gemeld. 19 projecten leken daardoor "dood". Nu zie je elke falende sync meteen in het admin-dashboard.

3. **Logged-time bug gefixt** — het nachtscript brak de hele week af als BasiCall 3× achter elkaar een 500-fout gaf. Daarom miste ANBO week 15/16 uren-data ondanks 62 records. Nu probeert het elke dag individueel.

Daarna een **volledige backfill** gedraaid voor alle actieve projecten over 1-15 april. Resultaat: 14 projecten hebben nu goede dekking (6-12 dagen uren-data), 14 zijn écht slapend (terecht leeg), 2 hebben een BasiCall-probleem (zie §3).

---

## 2. Systeem in het kort (wat Esther + Willem moeten weten)

### Waar staat alles?
| Onderdeel | Locatie |
|---|---|
| Dashboard | https://app.ttcallcenters.nl (Vercel) |
| Database | Supabase (Frankfurt) — project `tvsdbztjqksxybxjwtrf` |
| Sync-script | VPS Hetzner `85.10.132.126`:`/opt/basicall-sync/sync.js` — draait elke nacht via cron |
| Broncode | GitHub `sitejob-nl/tripletreedemo` |

### Hoe komt data binnen?
1. Elke nacht haalt het VPS-script via BasiCall-SOAP alle afgehandelde records + logged-tijd op.
2. Data wordt opgeslagen in Supabase met **PII-filtering** (IBAN/telefoon/e-mail verwijderd, alleen plaatsnaam + agentnaam behouden).
3. Klanten loggen in op het dashboard en zien alleen hún eigen projecten (via Row-Level Security + `customer_projects`-koppeling).

### Rollen
- **superadmin / admin** (Triple Tree intern) — ziet alles, beheert projecten, mappings, batches, klantaccounts
- **user** (klant) — ziet alleen eigen projecten

### Kern-KPI's die klanten zien
**Outbound**: Aantal positief, jaarwaarde, bruto/netto conversie, kosten per donateur, ROI, terugverdientijd
**Inbound (financieel)**: Behouden jaarwaarde, retentie-ratio
**Inbound (service)**: Afgehandeld / niet-afgehandeld ratio

---

## 3. Open issues (te bespreken)

### A. BasiCall 500-errors op `getIngelogdeTijden`
**Probleem**: Voor 2 projecten komen wel records binnen maar geen uren:
- **Hersenstichting inbound** (849) — 10 dagen records, 0 dagen uren
- **NL Tour Rides** (901) — 7 dagen records, 0 dagen uren

**Wat we weten**: BasiCall geeft 500-errors op de `Project.getIngelogdeTijden`-call voor deze projecten. Ons script is niet kapot.

**Actie**: mailen naar BasiCall-dev (Kas doet dit, samen met de al-geschreven `Batch.list`-feature-request).

### B. Batch-voorraad ("nog te bellen")
**Probleem**: De UI voor "X van Y gebeld, Z te gaan" is **ingebouwd** maar toont nog niks omdat de `batches`-tabel leeg is.

**Waarom leeg**: BasiCall heeft geen discovery-endpoint. Per project moet een batch-ID handmatig ingevuld worden in **Admin → Batches** tab.

**Waar halen we die batch-IDs?** Vanuit de BasiCall-beheerinterface (waar jullie agents werken) of door te bellen met jullie BasiCall-contactpersoon.

**Oplossing op langere termijn**: Kas stuurt een feature-request naar BasiCall voor een `Batch.list(project_id)`-endpoint (mail staat klaar in repo).

### C. Nog 5 kleine verbeteringen in de audit
Deze staan gedocumenteerd in [AUDIT-VPS-SYNC-2026-04-16.md](./AUDIT-VPS-SYNC-2026-04-16.md) — geen van deze is blokkerend:
- B.1 Batch-response parsing robuuster maken (zodra eerste batch gekoppeld is)
- B.3 Verificatie `gesprekstijd_sec` altijd 0 voor outbound (BasiCall-bug of datatype-issue)
- B.5 Snellere sync door 500-errors niet te retrien
- B.6 Automatisch stale `processing`-jobs opschonen
- B.7 VPS-script in Git zetten (nu alleen op server)

Prioriteit: in de volgende sprint, niet urgent.

---

## 4. Wat ik (Kas) wil bespreken / vragen

### Feedback op het systeem
- [ ] **Is de navigatie logisch** voor Esther's dagelijks gebruik?
- [ ] **Missen jullie KPI's** die in de oude Excel-rapportage wel stonden?
- [ ] **Welke klant gaat als eerste** pilot-dashboard krijgen? (voorstel: State of Children — meeste data/campagnes)
- [ ] **Hartstichting demo-feedback** — iets concreets ontvangen?
- [ ] **Nieuwe klanten** die er bij moeten: Amazone kinderen, Omroep MAX winback — wanneer starten?

### Sander's Excel-export
Sander wil Excel per mail blijven ontvangen. Huidige status: download-knop werkt op dashboard, mail-verzending is **nog niet gebouwd**. Wil hij zelf downloaden en versturen, of prioriteit geven aan automatische mail-export?

### Commercieel
- [ ] **€250/maand vanaf maand 2** — eerste factuur moment? (feitelijk maand 5 al, loopt sinds dec 2025)
- [ ] **Meeruren/uitbreidingen** — hoe willen jullie dat factureren? (per feature, uurtje-factuurtje, vast maandbedrag erbij?)

### Operationele afspraken
- [ ] **Wie is contactpersoon** bij storingen/bugs? (Esther op e.vanweert@ttcallcenters.nl?)
- [ ] **Slack / WhatsApp / mail** — waar willen jullie support-vragen stellen?
- [ ] **Reactietijd-verwachting** — 24u werkdagen is redelijk? Kritieke storing direct?
- [ ] **Toegang DNS** bij Meetwerk ICT — wie neemt DNS-wijzigingen voor hun rekening als er iets aan het domein moet veranderen?

### Toekomst-features besproken in februari
Uit de februari-meeting — nog niet gebouwd, goed moment om te prioriteren:
1. **Goals/targets per campagne** — doel per week + netto-berekening t.o.v. target
2. **Project verbergen/verwijderen in Admin UI** (naast `is_active=false`)
3. **Excel-export via systeem-mail** (voor Sander)
4. **Demo-video + PWA-uitleg in welkomsmail** naar nieuwe klanten
5. **Steam-integratie** — tweede bron-systeem naast BasiCall

Vraag: welke van deze is voor jullie P1 voor komende maand?

---

## 5. Overhandigingschecklist

- [x] CLAUDE.md bijgewerkt met alle context (business-rules, UI-beslissingen, contactpersonen)
- [x] Audit-document [AUDIT-2026-04-16.md](./AUDIT-2026-04-16.md) compleet
- [x] VPS sync-script audit [AUDIT-VPS-SYNC-2026-04-16.md](./AUDIT-VPS-SYNC-2026-04-16.md) compleet
- [x] Mail-concept BasiCall `Batch.list` [MAIL-BASICALL-BATCH-LIST.md](./MAIL-BASICALL-BATCH-LIST.md) klaar
- [x] Productie-fixes live (mapping, silent-token, logged-time)
- [ ] **Esther toegang geven** tot:
  - [ ] Admin-dashboard (als superadmin)
  - [ ] Supabase dashboard (alleen lezen, voor debugging)
  - [ ] GitHub-repo (issues + PR's als ze iets willen volgen)
  - [ ] VPS-toegang? (minder nodig, maar kan)
- [ ] **Willem toegang geven** tot:
  - [ ] Admin-dashboard
  - [ ] Facturatie-dashboard Vercel (als hij de hosting-factuur wil zien)

---

## 6. Wat er daarna per week/maand moet gebeuren

**Wekelijks** (Esther, ~30 min):
- Inloggen, nieuwe klanten/projecten toevoegen als BasiCall-IDs binnenkomen
- Mapping-issues-widget checken — als er projecten met rode waarschuwing staan: klik "Configureer"
- Sync-jobs-tab checken op failed-items

**Maandelijks** (Kas, remote):
- Schema-dump Supabase als backup
- Audit-document bijwerken als nieuwe bugs/features er zijn
- Facturering (€250/maand excl. BTW)

**Bij storingen** (Kas):
- SSH naar VPS, check `/var/log/basicall-sync.log`
- Supabase logs via dashboard
- Meetwerk ICT voor DNS-issues

---

## Bijlage: belangrijke documenten

| Document | Doel |
|---|---|
| [CLAUDE.md](./CLAUDE.md) | Volledige context van het systeem voor dev-doeleinden |
| [AUDIT-2026-04-16.md](./AUDIT-2026-04-16.md) | Audit van frontend + database |
| [AUDIT-VPS-SYNC-2026-04-16.md](./AUDIT-VPS-SYNC-2026-04-16.md) | Audit van VPS sync-script met 8 bevindingen |
| [MAIL-BASICALL-BATCH-LIST.md](./MAIL-BASICALL-BATCH-LIST.md) | Klaar-voor-verzending feature-request aan BasiCall |
