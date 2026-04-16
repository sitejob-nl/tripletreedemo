# Triple Tree Portal — CLAUDE.md

> Geautomatiseerd rapportageplatform voor call center Triple Tree (ttcallcenters.nl, Bogert 31-05 Eindhoven). Vervangt handmatige Excel-rapportage: BasiCall → Supabase → klantportaal.

**Live**: https://app.ttcallcenters.nl — productie sinds 17-12-2025. Overhandigd 2026-04-16 aan Esther van Weert (PM) en Willem Geerts (directeur).

---

## Stack

- **Frontend**: React 18 + TypeScript + Vite + shadcn/ui + Radix + Tailwind
- **Data**: Tanstack Query v5 + Supabase JS v2 (publishable/anon key)
- **Grafieken**: Recharts + Mapbox GL
- **Export**: xlsx-js-style (Excel-weekrapportage per project_type)
- **Hosting frontend**: Vercel, CNAME `app.ttcallcenters.nl` → Vercel (DNS bij Meetwerk ICT)
- **DB**: Supabase project `tvsdbztjqksxybxjwtrf` (Frankfurt eu-central-2, Postgres 17.6)
- **Sync**: Node.js script op VPS Hetzner `85.10.132.126` (user `sitejob-tt`), **niet in deze repo** — `/opt/basicall-sync/sync.js`, cron nachtelijks (zie §Status)
- **Origin**: bootstrapped met Lovable (project-id `3a3f02f2-25bd-41de-acfa-7434d8da8532`). Schema-wijzigingen via Lovable/dashboard belanden soms NIET in `supabase/migrations/` → altijd live schema checken via MCP.

## Architectuur

```
BasiCall SOAP (s06.basicall.nl)
        ↑ IP-whitelist: 85.10.132.126
VPS Hetzner /opt/basicall-sync/sync.js  (cron, Europe/Amsterdam)
        ↓ service_role key
Supabase (RLS) — tvsdbztjqksxybxjwtrf
        ↓ anon key + RLS
Vercel frontend (app.ttcallcenters.nl)
        ↓ auth per user
Admin (Triple Tree) = superadmin/admin role
Klant = user role + customer_projects join
```

**Belangrijk**: `supabase/functions/sync-project/` is **DEPRECATED** — kan BasiCall niet bereiken vanaf Supabase edge (geen vast IP). Header van die file documenteert dat. Frontend kan via `sync_jobs`-tabel jobs queuen (admin-only RLS) die de VPS kan oppakken.

## Rollen en multi-tenant isolatie

- `user_roles.role`: `user` | `admin` | `superadmin`
- Helper: `has_role(uuid, app_role)` — SECURITY DEFINER, voorkomt RLS-recursie
- Alle customer-facing tables (`projects`, `call_records`, `batches`, `daily_logged_time`, `customer_projects`) hebben patroon:
  ```
  admin/superadmin full access
  OR EXISTS (customer_projects WHERE project_id = X AND user_id = auth.uid())
  ```
- `project_secrets` (BasiCall-token): RLS **aan**, **0 policies** = default-deny = alleen `service_role` leest. Correct.
- `sync_logs`, `sync_jobs`, `user_roles`, `pending_invitations`: admin-only.

## Database-tabellen

| Tabel | Doel |
|---|---|
| `projects` | 31 rijen. basicall_project_id, project_type (outbound/inbound/inbound_service), hourly_rate, vat_rate, mapping_config JSONB, total_to_call, hours_factor |
| `project_secrets` | 31 rijen. project_id → basicall_token. **Niet in repo-migrations** — live toegevoegd |
| `batches` | 0 rijen. id, project_id, basicall_batch_id, name, status, **total, handled, remaining**, last_synced_at. **Niet in repo-migrations** — live toegevoegd. Voorraad-KPI bron |
| `call_records` | 5.461 rijen. basicall_record_id (uniek), beldatum (TEXT DD-MM-YYYY) + beldatum_date (DATE via trigger), beltijd, gesprekstijd_sec, resultaat, week_number, raw_data JSONB, synced_at |
| `sync_logs` | 177 rijen. Audit-trail per sync-attempt per project |
| `sync_jobs` | 0 rijen. Queue pending/processing/completed/failed (admin-only) |
| `user_roles` | 5 rijen |
| `customer_projects` | 4 rijen. user_id ↔ project_id multi-tenant join |
| `daily_logged_time` | 58 rijen. Ureninzet per dag met correctie-velden |
| `error_logs` | 13 rijen. Client-errors (authenticated insert allowed) |
| `pending_invitations` | 0 rijen. Email-invites met project_ids[] |

**Views**: `projects_public` (zonder token — legacy, token zit nu in `project_secrets`, niet meer in `projects`).

**Triggers/functies**: `sync_beldatum_to_date()` (DD-MM-YYYY → DATE), `has_role()`, `get_project_kpi_totals()`, `get_available_weeks()`, `handle_new_user_from_invite()`.

## Actieve projecten (uit Supabase, 2026-04-16)

BasiCall `project_id` → dashboard naam:
- 11 Proefdiervrij storno · 500 Inbound opvang · 539 Hersenstichting Storno · 540 Save the Children WB 2020
- 625 Proefdiervrij Upgrade · **734 ANBO online informatiepakket** (32,50 €/u) · 759 Proefdiervrij winback
- 761 Trombosestichting folder · 807 KIA samen tegen armoede · 827 ANBO Tipgids · 837 Test project
- 849 Hersenstichting inbound · 864 STC giftgevers · 869 Hersenstichting bestellers · 870 Sligro tintelingen (inbound_service)
- 873 Tintelingen B2B outbound · 888 Cliniclowns leads (30 €/u) · 889 Sligro B2B · 893 Triple Tree
- 897 TTC marktonderzoek · 899 De Limburgse Kluis · 900 Duramotion · 901 NL Tour Rides (inbound)
- 904 STC storno · 905 STC WB Mailgroep · 906 Fysio-Match · 907 STC WB 6 maanden
- 908 Bop Pitstop · 909 EO Eenmalig naar Structureel (32,50 €/u) · 910 Fysiomatch outbound
- 0 Demo Campagne

**Nog toe te voegen** (mail Esther 15-04): Amazone kinderen, Omroep MAX winback actie.

## BasiCall API (s06.basicall.nl/BasiCall/bc_WebApi/v2.0/, SOAP)

Header per request: `Token` (string, per project) + `Project` (int). IP-whitelist 85.10.132.126 verplicht. Token-opslag: `project_secrets.basicall_token`.

Endpoints relevant:
- `Record.getAfgehandeldIds(datum_van, datum_tot)` — afgehandelde record-ids (API ≥2.9, 22-01-2026)
- `Record.get(record_id)` — alle velden
- `Result.get()` — resultcodes per project
- `Project.getIngelogdeTijden(start, eind, agent_id?)` — ureninzet per status (API 2.8, specifiek toegevoegd 27-01-2026)
- `Record.getRVB(page, datum_van, datum_tot)` — Recht van Bezwaar
- `Blacklist.get(page, delta)` — blacklist delta-sync
- **`Batch.getHandled(batch_id)` + `Batch.getTotal(batch_id)`** — voorraad. API 2.11 (10-03-2026). Op ons verzoek toegevoegd door BasiCall. **Gebruikt** in `sync.js` (`syncBatchTotals`, regel 636-685). Namespace `v3.0/Batch`, return = int `aantal`. `batches`-tabel vult pas nadat admin per project een batch koppelt via `BatchManager.tsx` (anders slaat de functie stil over).

## Environment (frontend, Vite)

```
VITE_SUPABASE_URL=https://tvsdbztjqksxybxjwtrf.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=<anon key>
```

Mapbox public token hardcoded in [src/config/mapbox.ts](src/config/mapbox.ts).

## VPS-toegang (Kas)

```bash
ssh sitejob-tt@85.10.132.126
cd /opt/basicall-sync
# sync.js + logs. Cron: crontab -l (of /etc/cron.d/)
tail -n 200 /var/log/basicall-sync.log   # pad verifiëren
```

**Script staat niet in GitHub.** Alle wijzigingen aan sync-logica gebeuren rechtstreeks op de VPS. Overweeg handmatige backup/mirror naar repo na overhandiging.

## Contactpersonen

**Triple Tree intern**
- **Esther van Weert** (PM, dagelijks gebruik): e.vanweert@ttcallcenters.nl
- **Willem Geerts** (directeur): w.geerts@ttcallcenters.nl
- **Sander** (TT-collega) — *"traditioneel"*, wil Excel-rapportage per mail blijven ontvangen. Dashboard mag, maar export-via-mail moet operationeel blijven (zie Feature-roadmap).

**BasiCall**
- **Contactpersoon** ("haar") — vrouwelijke contactpersoon bij BasiCall die project-IDs uitgeeft. Kas belt handmatig per nieuwe klant om die te achterhalen. Niet structureel opgelost.
- **Developer** (nieuw/junior) — implementeerde API v2.11 (`Batch.getTotal`/`Batch.getHandled`, live 10-03-2026) op verzoek Kas. Leert van deze use-case. Bij toekomstige feature-requests aan BasiCall: via dezelfde dev.

**Overig**
- **Josiah** — genoemd in feb-meeting als betrokken bij uren-aanpas-feature (rol onduidelijk; mogelijk dev of adviseur van Kas).
- **Meetwerk ICT** — DNS-beheer voor `ttcallcenters.nl`. Kas levert DNS-instructies, geen volledige domein-toegang nodig.

**Klanten van Triple Tree (gebruikers van het dashboard)**
- **State of Children** — gewenste eerste pilot-klant (meeste campagnes en data). In DB vermoedelijk `Save the Children WB 2020` (540, momenteel 0 records) — naam-matching met Esther verifiëren.
- **Hartstichting** — heeft demo-omgeving gezien, feedback was positief maar niet concreet.
- **Zygo** — klant waarvoor dashboard-uitrol **níet** gewenst is (Speaker 4 in meeting). Niet in `projects` meenemen of achter `is_active=false` houden.
- **Overig**: zie lijst actieve projecten hierboven; Duramotion (900) + "Test project" (837) + "Demo Campagne" (0) zijn intern en horen niet in klant-view.

## Commercieel

- **Eenmalig**: €8.000 (factuur 17-12-2025 betaald door Willem)
- **Lopend**: €250/maand excl. BTW — hosting, dedicated IP, monitoring, backup, support. Facturatie start vanaf maand 2.

## Dev & deploy

```bash
npm install
npm run dev        # vite dev server
npm run build      # production
npm run lint       # eslint
```

- Merge naar `main` op GitHub `sitejob-nl/tripletreedemo` → Vercel auto-deploy naar app.ttcallcenters.nl.
- Supabase migrations: **deze repo loopt achter op live schema** (`batches`, `project_secrets` zijn live maar niet in `supabase/migrations/`). Dump vóór elke grote wijziging:
  ```
  supabase db dump --linked --data-only=false -f supabase/schema-snapshot.sql
  ```

## Bekende probleemgebieden (stand 16-04-2026)

Zie [AUDIT-2026-04-16.md](./AUDIT-2026-04-16.md) + [AUDIT-VPS-SYNC-2026-04-16.md](./AUDIT-VPS-SYNC-2026-04-16.md) voor volledige audits. Samenvatting van resterende punten:

1. ~~**19 van 31 projecten syncen nooit**~~ — **vandaag opgelost**: 3 projecten hadden records in de afgelopen 2 weken (ANBO 734: 75 records, Proefdiervrij winback 759: 128, Trombosestichting 761: 83). De overige 14 zijn slapend (geen afgehandelde records in BasiCall), niet kapot. Root-cause was een silent-token-failure in `performSync` — zie audit.
2. ~~**Voorraad-KPI leeg**~~ — sync-script gebruikt `Batch.getHandled`/`getTotal` al; `batches` vult zodra admin per project batches koppelt via `BatchManager.tsx`.
3. ~~**Mapping-configs met silent €0**~~ — **vandaag gefixt**: migration `20260416120000_fix_mapping_configs.sql` + `mapping_issues`-view + guardrail in `MappingTool.tsx`.
4. **`Project.getIngelogdeTijden` 500-errors** blijven — BasiCall-side, gebeurt op dagen zonder logged agents. Retry-logic vangt op; geoptimaliseerd kan via no-retry-op-500.
5. **Silent token-failure in nachtsync** — VPS-script schrijft geen `sync_logs` als token invalideert tijdens nachtsync (alleen bij handmatige sync_jobs). Fix = 6 regels; zie AUDIT-VPS-SYNC §B.2.
6. **VPS-script staat niet in Git** — wijziging verloren bij server-crash. Zie AUDIT-VPS-SYNC §B.7.
7. **Geen tests** in frontend.
8. **Mapping-tool zelfstandig** — niet formeel getest met een gloednieuw project. Amazone kinderen + Omroep MAX zijn de eerste echte casus.

## Conventies

- Dutch UI-strings (klanten lezen Nederlands). Code + comments: Engels.
- Geen nieuwe migrations uploaden naar `supabase/migrations/` zonder ze eerst tegen live toe te passen (MCP `apply_migration`) — Lovable-drift maakt dat lokale migrations niet overeenkomen met productie.
- `beldatum` is TEXT (VPS voert DD-MM-YYYY in of ISO YYYY-MM-DD; beide paths ondersteund in sync.js regel 411), trigger `sync_beldatum_to_date()` vult `beldatum_date` (DATE). Queries: **altijd** `beldatum_date` gebruiken, nooit string-sort op `beldatum`.
- Tijdzone: TIMESTAMPTZ staat in UTC; frontend interpreteert via date-fns. VPS-script forceert `TZ=Europe/Amsterdam` bovenaan (sync.js regel 2). Geen expliciete `AT TIME ZONE 'Europe/Amsterdam'` in SQL-queries nodig.
- Frontend heeft al `BatchProgress.tsx` en `BatchManager.tsx` — backend levert data via `syncBatchTotals` zodra admin batches koppelt.

## Business-rules (uit feb 2026 meeting)

- **Retentie-ratio noemer = aantal gebelde records** (`call_records` waar een resultaat bekend is), **NIET** de totale voorraad (`batches.total`). Speaker 3 expliciet: *"Nee, van wat er gebeld is"* (29:34).
- **"Eenmalig" telt als positief resultaat** — moet standaard in `sale_results` voor nieuwe outbound projecten. Is meegenomen in de fix voor project 907 via freq-map uitbreiding.
- **"Te oud" uit bruto-netto conversie** — BasiCall labelt het als "beargumenteerd", maar het moet uit de netto conversie worden gehouden. Per-project override via `unreachable_results` of een specifiek `negative_not_argumentated`-entry (MappingTool ondersteunt beide).
- **"Overleden"-classificatie**: geen vaste afspraak met klanten. Per project configureerbaar — gedrag kan per klant verschillen.
- **Inbound = twee smaken**:
  - *Retentie/financieel* (bijv. Hersenstichting, project_type=`inbound`): dashboard toont "behouden jaarwaarde" t.o.v. "verloren jaarwaarde". Elke euro die gered wordt = positief; basisaanname is dat de klant zou stoppen.
  - *Klantenservice* (bijv. Sligro tintelingen, project_type=`inbound_service`): geen geldwaarde, alleen "afgehandeld" vs. "niet-afgehandeld" ratio. Dashboard-labels switchen automatisch.
- **Uur-bedrag berekening**: `(totaal_seconden / 3600) × hourly_rate` per dag. `weekday_rates` in `mapping_config` overruled `hourly_rate` voor specifieke weekdagen (bijv. zaterdag-tarief).
- **Uren-correctie door admin**: handmatig per-dag override via `daily_logged_time.corrected_seconds` (met `corrected_by` + `correction_note` voor audit-trail). Factor-correctie via `projects.hours_factor` is beschikbaar maar minder gewenst.
- **PII-filtering**: IBAN, namen, telefoon, e-mail worden **vóór import** uit `raw_data` verwijderd door VPS-script (`stripPIIFromRawData`, regel 73-86). Whitelist: plaatsnaam (voor Mapbox-geografie) + agentnaam (voor TT-interne toetsing). Alles via regex-patterns; bij nieuwe PII-velden uitbreiden in blacklist.

## UI-beslissingen (uit feb 2026 meeting)

- **Eurotekens** bij alle bedrag-KPI's (jaarwaarde, kosten, behouden waarde). Zichtbaar in dashboard.
- **Kleuren en iconen** behouden in KPI-kaarten — Speaker 4: *"Ik vind het wel leuk zo"*. Niet vervangen door sobere look.
- **Geen last-sign-in-tracking** voor klantaccounts (privacy-keuze). Admin-overview toont dit niet voor klanten.
- **Geen push-notificaties** gewenst bij overhandiging (geen dagelijkse "vandaag is dit..."-berichten).
- **PWA-install uitleg** moet in de eerste welkomsmail naar klanten: hoe app op telefoon/laptop te pinnen. Dashboard is op mobiel volledig functioneel.
- **Projecten die niet relevant zijn voor klanten** (demo, Duramotion, Test project) moeten kunnen worden verborgen — nu via `is_active=false`, UI-verwijder-knop is nog een open item (zie roadmap).

## Feature-roadmap (uit feb 2026 meeting, nog niet gebouwd)

- **Goals/targets per campagne** (Speaker 4, 24:51): doel per week/periode, netto-berekening t.o.v. target. Geen `project_goals`-tabel of target-KPI in huidige code.
- **Project verbergen/verwijderen in Admin UI** (23:57): naast `is_active=false` ook een expliciete "verbergen"-knop met confirmation-dialog. Duramotion (900) + Demo (0) + Test (837) zijn de actuele casussen.
- **Excel-export via systeem-mail** (Speaker 3, 18:46): naast download-knop ook een "verstuur naar..."-optie die het Excel-bestand direct vanuit de backend naar een opgegeven adres stuurt. Belangrijk voor Sander.
- **Demo-video + PWA-uitleg in eerste welkomsmail** (17:23): een mooi mail-template met screen-recording-link en app-installatie-instructie.
- **Steam-integratie** (26:03): tweede bron-systeem naast BasiCall. Kolommen zijn vergelijkbaar; `daily_logged_time` mogelijk anders. Bij nieuwe klant wordt een `bron_systeem`-dropdown "BasiCall | Steam" nodig.
- **Badges Plan-B (achterhaald)**: in meeting besproken als fallback voor handmatige batch-total-invoer. Niet meer relevant — BasiCall levert sinds API v2.11 `Batch.getTotal`/`getHandled`, VPS-script gebruikt ze al.

## Meeting-datering (historische context)

De feb-2026 overdrachts-meeting vond plaats **rond 17-20 februari 2026** (Kas: *"maandag na carnaval is het nu denk ik"* — carnaval 2026 viel 15-17 feb; beoogd go-live maandag 23 feb). Dat verklaart:
- Waarom `daily_logged_time` pas vanaf **2026-03-11** structureel gevuld is (~3 weken na meeting voor nachtsync stabiel draaide).
- Waarom op meeting-moment API v2.9 (`getAfgehandeldIds`, uit 22-01) en v2.10 (`getIngelogdeTijden`, uit 26-01) net beschikbaar waren.
- Waarom Kas in de meeting zegt: *"alleen badge aanmaken, maar nog niet opvragen"* — `Batch.getTotal`/`getHandled` (API v2.11) bestonden nog niet; BasiCall voegde ze pas 10-03-2026 toe op Kas' verzoek.

Deze historische context kan zinvol zijn bij het interpreteren van oude records, migraties of beslissingen in git-log.
