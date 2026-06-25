# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Triple Tree Portal — projectgids

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
- **Sync**: Node.js script gespiegeld in `scripts/basicall-sync/sync.js`; productie draait op VPS Hetzner `85.10.132.126` (user `sitejob-tt`) als `/opt/basicall-sync/sync.js`. Twee cron-regels in de `sitejob-tt` crontab (Europe/Amsterdam): **04:00** = volledige ronde, **13:30** = `node sync.js retry` (alleen gemiste-dagen-backfill — vangt de projecten op die in BasiCalls nachtelijke 500-venster vielen). Sinds 2026-06-01 draait de sync als `sitejob-tt`, niet meer als root.
- **Origin**: project is extern gescaffold, eerste live-schema wijzigingen belandden daardoor niet allemaal in `supabase/migrations/`. Altijd live schema checken via MCP voor je lokale migrations baseert op wat er in de repo staat.

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

**Triggers/functies**: `sync_beldatum_to_date()` (DD-MM-YYYY → DATE), `has_role()`, `get_project_kpi_totals()`, `get_project_annual_value()`, `get_available_weeks()`, `handle_new_user_from_invite()`.

## Berekeningspaden (KPI's, conversie, uren, jaarwaarde)

De niet-triviale kern, verspreid over meerdere files: dezelfde cijfers worden via **twee paden** berekend die gelijk moeten lopen. Wijzig je het ene, wijzig dan het andere.

- **Dashboard-KPI's** — [useKPIAggregates.ts](src/hooks/useKPIAggregates.ts) → RPC `get_project_kpi_totals` (positief + gesprekstijd) en `get_project_annual_value` (jaarwaarde). Inbound-retentie telt "behouden" (`retention_results` ∪ `partial_success_results`, substring-match) i.p.v. sales; outbound = `isSale()` (zie hieronder).
- **Sale-matching (outbound)** — `isSale(resultaat, config)` in [lib/statsHelpers.ts](src/lib/statsHelpers.ts): **UNION** van `mapping_config.sale_results` + hardcoded `SALE_RESULTS`-defaults, **case-insensitive + trim, EXACT-gelijkheid** (géén substring — anders matcht 'donateur' op "Is al donateur"). Mirror van het `isUnreachable`-patroon. Gebruik dit overal i.p.v. een losse `sale_results.includes()`; de RPC's `get_project_kpi_totals`/`get_project_annual_value` doen `LOWER(TRIM(...))`-gelijkheid tegen dezelfde UNION zodat KPI-kaart, matrix, export én jaarwaarde gelijk tellen. Kale `eenmalig`/`per kwartaal`/`halfjaarlijks` staan BEWUST niet in de defaults (projectafhankelijk → via `mapping_config.sale_results`, bv. STC 540/904/905/907).
- **Rapportage / Excel** — [useReportMatrixData.ts](src/hooks/useReportMatrixData.ts) + [hooks/templates/](src/hooks/templates/) rekenen client-side (eigen kopie van dezelfde logica). Dit pad én de RPC's moeten consistent blijven, anders wijkt de KPI-kaart af van de rapportage/export.
- **Jaarwaarde-RPC** (`get_project_annual_value`): bedrag = `amount_col → termijnbedrag → Bedrag` (fallback); frequentie = `freq_map(freq_col) → numeriek(freq_col) → freq_map(resultaat) → 1`. `mapping_config.flat_sale_value` (vast bedrag per sale) heeft **voorrang**: jaarwaarde = aantal sales × dat bedrag — voor lead-/aanmeldcampagnes zonder termijnbedrag/frequentie (nu nog **alleen ANBO Tipgids 827**, die geen Bedrag/Frequentie in de data heeft).
- **Kosten/facturatie & `flat_sale_value` ≠ `cost_per_sale`** (PR #15, 24-06-2026): twee LOSSE begrippen die niet door elkaar mogen lopen. **`flat_sale_value`** = vaste **JAARWAARDE** per sale (waarde lidmaatschap voor de klant). **`mapping_config.cost_per_sale`** = vaste **KOSTEN/vergoeding** per sale die Triple Tree int (klant-facing investering), i.p.v. uren × uurtarief. Helper [lib/cost.ts](src/lib/cost.ts) `getCostPerSale()` is de single source of truth, ingeprikt op **elke** `calcInvestment`-site ([ReportMatrix.tsx](src/components/Dashboard/ReportMatrix.tsx), Dashboard-KPI, [useExcelExport.ts](src/hooks/useExcelExport.ts) outbound, [WeekComparison.tsx](src/components/Dashboard/WeekComparison.tsx)) — als `cost_per_sale > 0`: investering = aantal sales × dat bedrag. **ANBO 734** ("online informatiepakket") = per-sale (€37,08, `cost_per_sale` gezet, `flat_sale_value` verwijderd → jaarwaarde = Bedrag×Frequentie). Per-sale geldt nu alleen outbound; inbound/service-export bewust niet aangeraakt. NB: `MappingTool.tsx` spreadt sinds PR #15 `...project.mapping_config` vóór de beheerde velden, zodat opslaan niet-beheerde keys (zoals `flat_sale_value` op 827) niet meer stilletjes wist.
- **Conversie & afboekcode-categorisatie** — [lib/statsHelpers.ts](src/lib/statsHelpers.ts). `isUnreachable` / `categorizeNegativeResult` matchen via **substring** en gebruiken de **UNION** van project-`mapping_config` + hardcoded defaults (`UNREACHABLE_RESULTS` / `NEGATIVE_*`). Netto-conversie = sales / (calls − onbereikbaar − `exclude_from_net`). **Valkuil**: een resultaatcode die in géén categorie valt blijft in de noemer → netto structureel te laag. Nieuwe BasiCall-codes met afwijkende spelling ("foutief nummer" ≠ "foutief telefoonnummer") als stam toevoegen aan de defaults of `mapping_config`.
- **Gesprekken per uur** — twee metrics naast elkaar (sinds juni-2026 reconciliatie). **"Afgehandeld per uur"** = álle afgehandelde records / uur (oude "Gesprekken per uur"). **"Bereikte gesprekken per uur"** = contacten (`calls − onbereikbaar`) / uur — dít sluit aan op BasiCall's "gesprekken per uur" (BasiCall telt geen voicemail/geen-gehoor/max-belpogingen als gesprek). Talk-time (`gesprekstijd_sec`) is voor bijna alle outbound-projecten 0, dus contacten worden via `isUnreachable` bepaald, niet via talk-time. Beide in [ReportMatrix.tsx](src/components/Dashboard/ReportMatrix.tsx) + [outboundStandardExport.ts](src/hooks/templates/outboundStandardExport.ts).
- **Conversie weergave** — **Netto** (`sales/bereikbaar`) is het hoofdcijfer (matcht BasiCall's "conversie"); **Bruto** (`sales/alle calls`) alleen voor admin (`isAdmin`-prop op ReportMatrix). Klant vergeleek eerder Bruto met BasiCall's netto → leek 7-8× te laag.
- **Uren** — businessregel [lib/hours.ts](src/lib/hours.ts): elk uur-getal PER CEL naar boven afronden (vol uur, factuur). Dashboard-weektotaal = **som van per-dag-afgeronde uren** (mirror van de export), bron `daily_logged_time`, per dag fallback naar gesprekstijd als logtijd ontbreekt. Wijkt daardoor bewust 0–2u af van BasiCall (dat niet per cel afrondt).
- **Inbound-uren bestaan niet per campagne**: `getIngelogdeTijden(campagne)` geeft 404; de bemanning is gepoold onder de gedeelde wachtrij "Inbound opvang" (project 500). Dashboard toont voor inbound dus gesprekstijd (lager dan BasiCalls bezetting). Niet reconstrueerbaar uit onze data of de v2.11-API (uitputtend onderzocht) — open vraag bij BasiCall, zie [MAIL-BASICALL-INBOUND-UREN.md](MAIL-BASICALL-INBOUND-UREN.md).

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

Header per request: `Token` (string) + `Project` (int). IP-whitelist 85.10.132.126 verplicht. Token-opslag: `project_secrets.basicall_token` (één rij per project, maar **account-breed dezelfde waarde**: alle echte Triple Tree-projecten delen hetzelfde BasiCall account-token; per request verschilt alleen het `Project`-ID). Daarom heeft het project-formulier sinds 24-06-2026 **geen tokenveld meer** — bij het aanmaken van een nieuw project zet de `project-secret` edge function automatisch het gedeelde account-token (= meest voorkomende waarde in `project_secrets` via `mostFrequentToken`). Een afwijkend token per project (bv. een toekomstige klant met eigen BasiCall-account) kan alleen nog handmatig via de edge function/SQL.

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
ssh tt-vps                 # alias in ~/.ssh/config → sitejob-tt@85.10.132.126 (key ~/.ssh/tt_vps)
cd /opt/basicall-sync      # sinds 2026-06-01 eigendom van sitejob-tt → deployen kan zonder sudo
crontab -l                 # nachtsync staat in sitejob-tt's EIGEN crontab (04:00), niet meer root/cron.d
tail -n 200 /var/log/basicall.log   # actueel logpad — LET OP: NIET basicall-sync.log
```

**Scriptbron staat nu in GitHub** onder `scripts/basicall-sync/sync.js`; productie blijft draaien vanaf `/opt/basicall-sync/sync.js` op de VPS. Wijzig sync-logica eerst in de repo, deploy daarna naar de VPS en houd noodwijzigingen op de VPS direct gespiegeld terug naar GitHub.

Repo-side deploy:

```bash
cd scripts/basicall-sync
./deploy.sh              # dry-run
./deploy.sh --apply      # rsync + npm install --omit=dev op VPS
./deploy.sh --restart    # --apply + handmatige node sync.js test
```

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
4. ~~**`Project.getIngelogdeTijden` 500-errors**~~ — **gemitigeerd 2026-06-01 (B.5)**: 500's op dagen zonder logged agents worden nu als "geen data" herkend en niet meer geretryd (scheelt ~12s/lege dag + log-ruis). De 500's zelf blijven BasiCall-side. Daarnaast HTTP-timeout 30s→60s tegen chronische timeouts op grote projecten (734/827/888/924/695).
5. ~~**Silent token-failure in nachtsync**~~ — **opgelost 2026-06-01**: de redundante pre-flight token-check is verwijderd. Die schreef een `warning`-rij die meetelde in `getMissedDays()` en zo de wekelijkse maandag-gap maskeerde (→ dataverlies). De echte sync logt nu zelf `failed` met `[Mogelijk token-/auth-probleem]`-prefix via de catch; de maandag-gap herstelt vanzelf via de missed-days-backfill.
9. **Wekelijkse maandag-uitval** — elke maandag ~04:00 geeft BasiCall HTTP 500 op alle projecten (vermoedelijk onderhoudsvenster aan hun kant); 0 records die nacht, herstelt zichzelf de dinsdag erna via de backfill. Nog na te vragen bij BasiCall. Geen brand — niet als storing escaleren.
6. **VPS/repo sync-discipline** — bron staat nu in `scripts/basicall-sync/sync.js`; houd `/opt/basicall-sync/sync.js` en de repo-copy gelijk na elke deploy of noodwijziging. Zie AUDIT-VPS-SYNC §B.7.
7. **Geen tests** in frontend.
8. **Mapping-tool zelfstandig** — niet formeel getest met een gloednieuw project. Amazone kinderen + Omroep MAX zijn de eerste echte casus.

### Update juni 2026 (na week-22-review Esther + Willem)

- **Afboekcode-categorisatie gefixt** (PR #10): netto-conversie was 2-9× te laag doordat hoog-volume codes (max. belpogingen, blacklisted, terugbelafspraak, dialer verbroken, foutief nummer, financiele reden, ander goed doel) in geen categorie vielen. Defaults uitgebreid + config UNION defaults in `statsHelpers.ts`. Nieuwe netto-% nog te valideren tegen Willems BasiCall-rapport.
- **ANBO 04:00-uitval** (734/827; soms ook 864/924): BasiCall geeft 's nachts HTTP 500 voor deze project-ID's maar serveert overdag prima — opgevangen door de **13:30-retry-cron**. Hetzelfde geldt voor #9 (maandag-uitval). Token is geldig; geen brand meer.
- **Inbound-uren**: bron-limiet (bemanning gepoold onder queue 500) — zie §Berekeningspaden; mail naar BasiCall klaar.
- **Nieuw**: `mapping_config.flat_sale_value` (vaste jaarwaarde per sale; **later voor ANBO 734 vervangen door `cost_per_sale`-facturatie, zie §Berekeningspaden / PR #15**); jaarwaarde-RPC bedrag/freq-fallback; halfjaarlijks×2 in freq_map's; `sync_logs.kind` ('records'|'logged_time'); per-dag `getMissedDays`-backfill + persistent-failure-alert in sync.js.
- **BasiCall-reconciliatie 22-06-2026** (branch `fix/basicall-reconciliatie-contacten-netto`): n.a.v. Esthers vergelijking van ~13 projecten. (1) Sale-matching robuust: nieuw `isSale()` + `SALE_RESULTS`-defaults (UNION + case-insensitive) vervangt exacte `sale_results.includes()` in alle client-paden + beide RPC's → gemiste positieven hersteld (11 +1, 869 +2, 539 +10 "Machtiging per Jaar"). (2) Nieuwe metric "Bereikte gesprekken per uur" (contacten/uur) naast "Afgehandeld per uur"; matcht BasiCall (827: 3,1 vs 3,0; 907: 3,2 vs 3,4; 864: 4,0 vs 4,4). (3) Netto conversie = hoofdcijfer, Bruto admin-only. (4) `UNREACHABLE_RESULTS` aangevuld (`onjuist naw`, `nawt`, `dubbel in lijst`, `recent benaderd`, `niet meer benaderen`, `leeg`). (5) Per-project: 540 sale_results gelijkgetrokken met 904/905/907. **Geen bug**: uren ±1-2u (afrondregel), Hersenstichting Storno t/m wk16 (campagne ligt stil, sync gezond, 0 nieuwe afgehandelde records sinds 15-04).
- **LET OP**: regelnummer-verwijzingen in dit bestand (bv. "sync.js regel 411 / 636-685 / 73-86") zijn indicatief en lopen achter op de code — zoek altijd op functienaam (`performSync`, `syncBatchTotals`, `stripPIIFromRawData`, `getMissedDays`).

## Conventies

- Dutch UI-strings (klanten lezen Nederlands). Code + comments: Engels.
- Geen nieuwe migrations uploaden naar `supabase/migrations/` zonder ze eerst tegen live toe te passen (MCP `apply_migration`) — historische schema-drift maakt dat lokale migrations niet automatisch overeenkomen met productie.
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
- **Embargo / publicatievenster** (25-06-2026, PR #19): klanten zien de cijfers van kalenderdag D pas vanaf **09:00 op D+1**; admin/superadmin zien alles **real-time**. Geeft TT een correctievenster tussen de 04:00-import en de 09:00-publicatie. **Afgedwongen in RLS** — de klant-tak van de SELECT-policies op `call_records` (`beldatum_date`) en `daily_logged_time` (`date`) AND't een conditie `<= public.client_visible_cutoff()` (de 09:00/Europe-Amsterdam-regel; vóór 09:00 → vandaag−2, anders vandaag−1). Omdat álle KPI-RPC's `SECURITY INVOKER` zijn, erven KPI-kaart, matrix, jaarwaarde én Excel-export dit automatisch — verklaart waarom een **klant minder data ziet dan de admin**. Admin-preview ("bekijk als klant") cap't client-side via `maxDate` op `ResolvedDateFilter` + `applyMaxDate()` (helper `src/lib/embargo.ts` spiegelt de SQL); echte klanten leunen op RLS (`maxDate=null`). Mini-beperking: jaar-Excel-templates fetchen zelf → echte klanten via RLS gecapt (ok), admin-preview-export niet.
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
