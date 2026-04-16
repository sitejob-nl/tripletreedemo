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
- **`Batch.getHandled(batch_id)` + `Batch.getTotal(batch_id)`** — voorraad. API 2.11 (10-03-2026). Op ons verzoek toegevoegd. **Nog niet geïntegreerd** (0 rijen in `batches`).

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

- **Esther van Weert** (PM, dagelijks gebruik): e.vanweert@ttcallcenters.nl
- **Willem Geerts** (directeur): w.geerts@ttcallcenters.nl
- **Commercieel**: €8.000 eenmalig (betaald 17-12-2025) + €250/maand excl. BTW (hosting/IP/monitoring/backup/support, facturatie vanaf maand 2)

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

Zie [AUDIT-2026-04-16.md](./AUDIT-2026-04-16.md) voor volledige audit. Samenvatting:

1. **Sync-cadans**: draait niet nachtelijks; logs tonen 3-dagen-interval (08, 11, 14, 15 apr). Cron- of script-instelling checken op VPS.
2. **19 van 31 projecten syncen nooit**: VPS-script heeft hardcoded project-list. ANBO (734), Amazone en Omroep MAX zitten er niet in.
3. **Voorraad-KPI leeg**: `batches`-tabel is 0 rijen. Sync script vult `Batch.getHandled`/`getTotal` nog niet.
4. **Repeterende warning "3 dagen konden niet opgehaald worden (inlogtijd)"**: `Project.getIngelogdeTijden` date-range-limiet.
5. **Geen tests** in frontend.
6. **Mapping-tool zelfstandig**: niet getest of nieuw project zonder code-deploy volledig werkt (Amazone als casus).

## Conventies

- Dutch UI-strings (klanten lezen Nederlands). Code + comments: Engels.
- Geen nieuwe migrations uploaden naar `supabase/migrations/` zonder ze eerst tegen live toe te passen (MCP `apply_migration`) — Lovable-drift maakt dat lokale migrations niet overeenkomen met productie.
- `beldatum` is TEXT (VPS voert DD-MM-YYYY in), trigger `sync_beldatum_to_date()` vult `beldatum_date` (DATE). Queries: **altijd** `beldatum_date` gebruiken, nooit string-sort op `beldatum`.
- Tijdzone: TIMESTAMPTZ staat in UTC; frontend interpreteert via date-fns. Geen expliciete `AT TIME ZONE 'Europe/Amsterdam'` in SQL-queries — VPS moet dagsnijding in Amsterdam-tijd doen.
- Frontend heeft al `BatchProgress.tsx` en `BatchManager.tsx` — backend moet alleen nog data leveren.
