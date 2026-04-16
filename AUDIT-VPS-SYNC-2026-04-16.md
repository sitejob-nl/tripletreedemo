# VPS Sync-script Audit — 2026-04-16

**Scope**: [`/opt/basicall-sync/sync.js`](file:///C:/Users/kas20/OneDrive/SiteJob/triple%20tree/sync-current.js) op VPS `85.10.132.126` (843 regels, versie gedeeld door Kas 2026-04-16), getoetst tegen de officiële BasiCall Web API 2.0 documentatie (v2.0 t/m v2.11 d.d. 26-01-2026 / 10-03-2026 revisions).

**Werkwijze**: alleen lezen + vergelijken met spec. Geen wijzigingen aan VPS-productie-script. Aanbevolen patches staan als copy-paste snippets; Kas deployt ze bewust.

**Prioriteit-legenda**: **P1** = vóór eerstvolgende nacht deployen (zichtbaarheid, dataverlies voorkomen); **P2** = binnen 1-2 weken (robuustheid); **P3** = volgende sprint (governance, optimalisatie).

---

## Samenvatting

| # | Bevinding | Prioriteit | Gedocumenteerd in |
|---|---|---|---|
| B.1 | Batch-endpoints matchen spec maar return-parsing is fragile | P2 | §B.1 |
| B.2 | Silent token-failure in nachtsync schrijft geen sync_logs | **P1** | §B.2 |
| B.3 | `gesprekstijd_sec` altijd 0 voor outbound — oorzaak onbevestigd | P2 | §B.3 |
| B.4 | Namespace case-inconsistentie (S06 vs s06) | P3 | §B.4 |
| B.5 | `getIngelogdeTijden` 500-errors kosten ~12s retry per dag | P2 | §B.5 |
| B.6 | Stale `sync_jobs` in `processing`-status zonder cleanup | P2 | §B.6 |
| B.7 | VPS-script niet in Git | P3 | §B.7 |
| B.8 | `MAX_CONSECUTIVE_ERRORS = 3` breekt hele dagreeks af bij tijdelijke BasiCall-500's | **P1** (gedeployed) | §B.8 |

Overall: het script is **robuust gebouwd** (PII-filter, retry-logica, NL-timezone, dynamic project-list, missed-days-fallback) — de gevonden issues zijn detail-problemen op de ruggengraat, geen fundamentele gebreken.

---

## B.1 Batch-endpoints vs. BasiCall API-spec

**Context**: User deelde de spec voor `Batch.getTotal` + `Batch.getHandled`. Beide endpoints zijn onderdeel van API v2.11 (10-03-2026), toegevoegd op verzoek van Kas. Script implementeert ze in `syncBatchTotals` (regel 636-685).

### Vergelijk met spec

| Spec-requirement | sync.js-locatie | Status |
|---|---|---|
| Namespace `v3.0/Batch` | regel 150: `apiVersion = domain === 'Batch' ? 'v3.0' : 'v2.0'` | ✅ Correct |
| Request body `<batch_id xsi:type="xsd:int">N</batch_id>` | regel 652 (getTotal), 662 (getHandled) | ✅ Matcht exact |
| Token/Project SOAP-header via ns2 v2.0 | regel 158-161 | ✅ Correct |
| Response type `aantal (int)` | regel 657, 667: `parseInt(totalResponse?.return \|\| '0', 10)` | ⚠️ Werkt alleen voor één response-variant |

### Kern-issue: ambigu response-format

De spec zegt *"Return: aantal (int)"*. Onduidelijk of BasiCall dit als `<return>42</return>` (directe waarde → xml2js levert string) of `<return><aantal>42</aantal></return>` (geneste struct → xml2js levert object `{aantal: "42"}`) teruggeeft.

Huidige code:
```js
// sync.js regel 657
const total = parseInt(totalResponse?.return || '0', 10);
```

- **Scenario 1 (directe waarde)**: `totalResponse.return` = `"42"` → `parseInt("42")` = `42`. ✅
- **Scenario 2 (object)**: `totalResponse.return` = `{aantal: "42"}` → `{aantal: "42"} || '0'` resolves to the object (truthy) → `parseInt({...})` = `NaN`. ❌ Silent-fail, `NaN` wordt in integer-kolom opgeslagen als `NULL`.

### Verificatie bij eerste run

Voor één call eenmalig loggen voor diagnose:
```js
// tijdelijk toevoegen vóór regel 657
console.log('[DBG Batch.getTotal return]', JSON.stringify(totalResponse?.return));
```

Na één run met een gekoppelde batch: als het logbericht een string toont, scenario 1 klopt. Als het een object toont, scenario 2.

### Robuuste parse-patch (P2)

Vervang regel 657 en 667 door een helper die beide scenario's afvangt:
```js
const parseIntResponse = (resp) => {
  if (resp == null) return 0;
  if (typeof resp === 'string' || typeof resp === 'number') return parseInt(resp, 10) || 0;
  if (typeof resp === 'object') {
    return parseInt(resp.aantal || resp._ || resp['#text'] || '0', 10) || 0;
  }
  return 0;
};

const total = parseIntResponse(totalResponse?.return);
const handled = parseIntResponse(handledResponse?.return);
```

### Dead-code-risico

Regel 643: `if (error || !batches || batches.length === 0) return;` — `syncBatchTotals` slaat stil over zolang admin geen batches heeft gekoppeld via `BatchManager.tsx`. Dat is **gewenst gedrag**, geen bug. Status op 2026-04-16: `batches`-tabel heeft 0 rijen → functie draait effectief niet. Zodra admin een batch koppelt (via admin-UI + Basicall Batch ID) gaat de sync live.

---

## B.2 Silent token-failure in nachtsync — P1

**Context**: 19 van 31 actieve projecten hadden op 2026-04-16 ochtend **0 sync_logs ooit**. Root cause: `validateToken` faalt → `performSync` returnt zonder `sync_logs`-insert wanneer `jobId === null` (= nachtsync-pad).

### Codepad

```js
// sync.js regel 502-515 — huidige gedrag
const tokenValid = await validateToken(project);
if (!tokenValid) {
    const msg = `Token ongeldig voor project ${project.name}`;
    if (jobId) {
        await supabase.from('sync_jobs').update({
            status: 'failed',
            log_message: msg,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', jobId);
    }
    return;  // ← bij nachtsync: geen enkele insert, compleet stil
}
```

### Impact

- 19 projecten zagen er in DB uit alsof de nachtsync nooit heeft geprobeerd te syncen
- Debug onmogelijk zonder VPS-log toegang
- Admin-dashboard kon geen "mislukte projecten"-view bouwen

Vandaag opgelost door handmatige `sync_jobs`-insert voor 17 projecten, wat de token-validatie expliciet triggerde en wél naar `sync_jobs.log_message` schreef. Maar de onderliggende bug zit er nog in: bij de eerstvolgende nachtsync worden deze token-failures opnieuw stil.

### Patch (P1)

Voeg een `sync_logs.insert` toe vóór de `if (jobId)`-branch, zodat beide paden loggen:

```js
// sync.js regel 502-515 — vervangen door:
const tokenValid = await validateToken(project);
if (!tokenValid) {
    const msg = `Token ongeldig voor project ${project.name}`;
    await supabase.from('sync_logs').insert({
        project_id: project.id,
        status: 'failed',
        records_synced: 0,
        sync_from: start.toISOString(),
        sync_to: end.toISOString(),
        error_message: msg,
    });
    if (jobId) {
        await supabase.from('sync_jobs').update({
            status: 'failed',
            log_message: msg,
            completed_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', jobId);
    }
    return;
}
```

### Observability follow-up

De nieuwe `mapping_issues`-view (gedeployed vandaag) is voor `mapping_config`-issues. Voor token-failures is een extra view nuttig — óf uitbreiden van een bestaande admin-widget met: *"Projecten met `sync_logs.status = 'failed'` in laatste 24u"*.

---

## B.3 `gesprekstijd_sec` altijd 0 voor outbound — P2

**Context**: audit van vanochtend toonde dat alle outbound-projecten 100% `gesprekstijd_sec = 0` hebben (max = 0, niet "veel nullen"). Inbound (849, 901) en inbound_service (870 Sligro) hebben wél integer-waarden (161, 289, etc.).

### Codepad

```js
// sync.js regel 425
gesprekstijd_sec: parseInt(cleanRecord.bc_gesprekstijd || 0),
```

Twee mogelijke verklaringen:

1. **BasiCall levert `0` voor outbound records** — per-call timing wordt alleen voor inbound/service gemeten; outbound gebruikt `getIngelogdeTijden` op agent-niveau. Dan is de 0-waarde correct gedrag van BasiCall, niet een bug in sync.js.
2. **BasiCall levert een time-string** zoals `"00:00:05"` die door `parseInt` als `0` wordt geïnterpreteerd. Dan is er wel data die verloren gaat.

### Verificatie

Eenmalig debug-log toevoegen om het type/waarde live te zien:
```js
// sync.js — tijdelijk na regel 410 ("let isoDate = ...")
if (cleanRecord.bc_gesprekstijd != null && cleanRecord.bc_gesprekstijd !== '' && cleanRecord.bc_gesprekstijd !== '0') {
  console.log(`[DBG gesprekstijd] project=${project.basicall_project_id} raw=${JSON.stringify(cleanRecord.bc_gesprekstijd)} type=${typeof cleanRecord.bc_gesprekstijd}`);
}
```

Na één run met outbound records (bv. STC giftgevers 864): als geen output → scenario 1 (BasiCall levert gewoon null/0, correct). Als output toont strings → scenario 2, parse aanpassen.

### Potentiële fix als scenario 2 blijkt

```js
// sync.js regel 425 — alternatieve implementatie die HH:MM:SS ook afvangt
const parseDuration = (val) => {
  if (val == null || val === '') return 0;
  const str = String(val).trim();
  if (/^\d+$/.test(str)) return parseInt(str, 10);            // "42"
  if (/^\d+:\d+:\d+$/.test(str)) {                            // "01:23:45"
    const [h, m, s] = str.split(':').map(Number);
    return h * 3600 + m * 60 + s;
  }
  return parseInt(str, 10) || 0;
};

gesprekstijd_sec: parseDuration(cleanRecord.bc_gesprekstijd),
```

---

## B.4 Namespace case-inconsistentie — P3

- Spec: `xmlns:ns1="https://s06.basicall.nl/BasiCall/bc_WebApi/v2.0/..."` (**lowercase** s06)
- sync.js regel 153: `xmlns:ns1="https://S06.basicall.nl/BasiCall/bc_WebApi/${apiVersion}/${domain}"` (**uppercase** S06)
- sync.js regel 12: `const BASICALL_URL = 'https://S06.basicall.nl/BasiCall/bc_WebApi/v2.0/';` (uppercase, maar DNS is case-insensitive — geen probleem)

**XML-namespaces zijn strict case-sensitive strings** (W3C spec). Dat BasiCall-server kennelijk tolerant matcht is fijn, maar niet gegarandeerd — toekomstige server-update kan strikt gaan valideren.

### Patch (P3, kleine hygiëne)

```js
// sync.js regel 12 en 153 — vervang S06 door s06
const BASICALL_URL = 'https://s06.basicall.nl/BasiCall/bc_WebApi/v2.0/';
// ...
xmlns:ns1="https://s06.basicall.nl/BasiCall/bc_WebApi/${apiVersion}/${domain}"
xmlns:ns2="https://s06.basicall.nl/BasiCall/bc_WebApi/v2.0/"
```

Test door één nachtsync te draaien nadat je de casing hebt veranderd; als records blijven binnenkomen, OK.

---

## B.5 `getIngelogdeTijden` 500-errors — P2

**Context**: BasiCall levert HTTP 500 op dagen zonder logged agents (uit audit-logs: *"3 dagen konden niet opgehaald worden (inlogtijd)"*). Huidige retry-config:

```js
// sync.js regel 200 — withRetry
const maxRetries = CONFIG.MAX_RETRIES;                   // 3
const delay = CONFIG.RETRY_DELAY_MS * attempt;           // 2000ms × attempt
// → backoff: 2000, 4000, 6000 ms = 12s per falende call
```

Plus 30s timeout per HTTP-call. Een faalde `getIngelogdeTijden` kost tot ~12s wachten; bij veel lege dagen loopt dat op tot minuten per project.

### Patch (P2)

Detecteer 500 als "no data" en vermijd retries:

```js
// sync.js regel 218-237 — soapCall aanpassen
async function soapCall(method, body, token, projectId) {
    const xml = buildSoapRequest(method, body, token, projectId);
    return withRetry(async () => {
        try {
            const { data: xmlData } = await axios.post(BASICALL_URL, xml, {
                headers: { 'Content-Type': 'text/xml; charset=utf-8' },
                timeout: 30000,
            });
            const parsed = await parser.parseStringPromise(xmlData);
            const respBody = parsed.Envelope?.Body || parsed['SOAP-ENV:Envelope']?.['SOAP-ENV:Body'];
            const fault = respBody?.Fault || respBody?.['SOAP-ENV:Fault'];
            if (fault) {
                const faultMsg = fault.faultstring || fault.detail || JSON.stringify(fault);
                throw new Error(`SOAP Fault: ${faultMsg}`);
            }
            return respBody;
        } catch (err) {
            // BasiCall gooit 500 bij "no data" — niet retry-waardig
            if (err.response?.status === 500 && method === 'Project.getIngelogdeTijden') {
                const noDataErr = new Error('No data for this day');
                noDataErr.isNoData = true;
                throw noDataErr;
            }
            throw err;
        }
    }, `SOAP ${method}`);
}
```

En in `withRetry` skip-detection:
```js
// sync.js regel 200-215 — withRetry aanpassen
async function withRetry(fn, label, maxRetries = CONFIG.MAX_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            // Geen retry voor "no data"
            if (err.isNoData) throw err;
            // ... bestaande logica
        }
    }
}
```

En in `syncLoggedTimeDay` (regel 252-282) de `isNoData` catchen zonder warning-spam:
```js
} catch (e) {
    if (!e.isNoData) {
        console.error(`      ⚠️  Inlogtijd fout ${formatLocalDate(dayDate)}: ${e.message}`);
    }
    return null;
}
```

Impact: nachtsync gaat meetbaar sneller (geen 12s retry per lege dag) en logs worden leesbaarder.

---

## B.6 Stale `sync_jobs` in `processing`-status — P2

Als VPS-script crasht tijdens een job (network-hiccup, proces-kill), blijft `sync_jobs.status = 'processing'` zonder cleanup. Toekomstige runs negeren die job (queue query filtert alleen op `pending`), maar de admin-UI toont hem wel als "nog bezig".

### Patch (P2)

Aan het begin van `run()` (regel 720) een cleanup-statement toevoegen:

```js
// sync.js regel 720-725 — nieuwe stap vóór job-check
// Cleanup stale jobs (processing > 1 uur = gecrasht)
await supabase
    .from('sync_jobs')
    .update({
        status: 'failed',
        log_message: 'Stale processing-job automatisch gemarkeerd als failed (crash/timeout)',
        completed_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
    })
    .eq('status', 'processing')
    .lt('started_at', new Date(Date.now() - 60 * 60 * 1000).toISOString());
```

---

## B.7 VPS-script niet in Git — P3

Huidige situatie:
- Script staat alleen op VPS `85.10.132.126`:`/opt/basicall-sync/sync.js`
- OneDrive-kopie `C:/Users/kas20/OneDrive/SiteJob/triple tree/sync-current.js` is een handmatig gemaakte snapshot van 2026-04-16 (niet gegarandeerd synchroon met VPS)
- Wijzigingen op VPS gaan verloren bij server-crash
- Overdracht aan opvolger moeilijk zonder git-history

### Voorstel (P3)

Nieuw pad in repo: `scripts/vps-sync/` met:
- `sync.js` — single-source-of-truth
- `package.json` — dependencies (`@supabase/supabase-js`, `axios`, `xml2js`, `dotenv`)
- `.env.example` — zonder secrets, toont welke vars nodig zijn
- `README.md` — deploy-instructies

Deploy-workflow:
```bash
# lokaal ontwikkelen + testen in een staging-context
cd scripts/vps-sync
node sync.js  # met lokale .env pointing naar Supabase

# deployen naar VPS
scp sync.js sitejob-tt@85.10.132.126:/opt/basicall-sync/sync.js

# na deploy: git commit + push
git add scripts/vps-sync/sync.js
git commit -m "vps-sync: <korte beschrijving>"
git push
```

**Cron op VPS** moet ook gedocumenteerd. Controleer via `crontab -l` op VPS:
```bash
ssh sitejob-tt@85.10.132.126 'crontab -l'
# Verwacht iets als: 0 2 * * * cd /opt/basicall-sync && /usr/bin/node sync.js >> /var/log/basicall-sync.log 2>&1
```

Voeg deze cron-regel ook toe aan `scripts/vps-sync/README.md`.

---

## B.8 `MAX_CONSECUTIVE_ERRORS` sluit hele dagreeks af — P1 (gedeployed)

**Ontdekt op 2026-04-16 tijdens overhandigingsdag**, nadat de B.2-patch was gedeployed maar ANBO online informatiepakket (734) voor week 15/16 nog steeds 0 inzet-uren toonde terwijl er wel records waren.

### Oorzaak

`syncLoggedTimeRange` (regel 302-343) gebruikt een heuristiek: **3 opeenvolgende failures → rest van de dagreeks overslaan**:

```js
// sync.js regel 308-323
const MAX_CONSECUTIVE_ERRORS = 3;

while (currentDate <= end) {
    const seconds = await syncLoggedTimeDay(project, currentDate);

    if (seconds === null) {
        errorDays++;
        consecutiveErrors++;
        if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
            console.log(`   ⏭️  ${MAX_CONSECUTIVE_ERRORS}x achter elkaar mislukt — project ondersteunt waarschijnlijk geen inlogtijd. Overslaan.`);
            break;  // ← BUG: stopt hele loop
        }
    } else {
        consecutiveErrors = 0;
        // ...
    }
}
```

Bedoeling was waarschijnlijk projecten die **structureel** geen `getIngelogdeTijden` ondersteunen snel overslaan. In praktijk zijn BasiCall-500's **willekeurig en tijdelijk**, niet project-specifiek. Bewijs uit run-output 2026-04-16:

- **ANBO (734)**: dag 1+2 gelukt, dag 3+4+5 faalden → script stopt. Dagen 6-15 **nooit geprobeerd**, week 16 uren blijven leeg ondanks 62 records.
- **Inbound opvang (500)**: failures op dag 5, 6, 12 — niet consecutief door successen ertussen → geen trigger → 12 van 15 dagen binnen.

Gevolg: inzet-uren (en dus kosten + investering + terugverdientijd + ROI) leeg voor elke week waar één patch van 3+ opeenvolgende BasiCall-hiccups tussen zat.

### Fix (gedeployed 2026-04-16 13:30 NL)

```js
// sync.js regel 310 — één cijfer
const MAX_CONSECUTIVE_ERRORS = 999;
```

Effectief schakelt de heuristiek uit. Nu probeert het script elke dag individueel; 500's worden nog wel geretryd (§B.5 blijft openstaand, maar de kosten zijn leesbaar: ~12s per tijdelijke 500 i.p.v. data-verlies voor hele weken).

Backfill uitgevoerd voor alle actieve projecten op 2026-04-16 via:
```sql
INSERT INTO sync_jobs (project_id, start_date, end_date, status, created_at)
SELECT id, '2026-04-01', '2026-04-15', 'pending', now()
FROM projects WHERE is_active = true;
```
gevolgd door `sudo node /opt/basicall-sync/sync.js` op VPS.

### Betere fix (later, samen met §B.5)

Combineer dit met de no-retry-op-500 patch uit §B.5. Dan wordt de loop snel (geen retries op dagen zonder data) én compleet (geen early-break). Als §B.5 gedeployed is, kan `MAX_CONSECUTIVE_ERRORS` zelfs helemaal weg of teruggezet naar iets groots (bijv. 365) — maakt niks meer uit want 500's throwen niet langer.

### Verificatie

```sql
-- Per project: aantal dagen met logged time in de laatste 15 dagen
SELECT p.name, COUNT(dlt.date) AS days_with_hours,
       ROUND(SUM(dlt.total_seconds) / 3600.0, 1) AS total_hours
FROM projects p
LEFT JOIN daily_logged_time dlt
  ON dlt.project_id = p.id
  AND dlt.date >= current_date - interval '15 days'
WHERE p.is_active = true
GROUP BY p.name
ORDER BY days_with_hours DESC;
```

Projecten die voorheen afgebroken waren, horen nu meer dagen te tonen.

---

## Deploy-volgorde bij aanvaarding

1. ~~**Nu**: B.2 deployen (silent-token-fix). 6 regels, zero risk, direct zichtbaarheid terug voor 19 projecten.~~ **Gedeployed 2026-04-16 13:10 NL** — Demo Campagne verschijnt nu correct als `failed` in sync_logs.
2. ~~**Nu**: B.8 (MAX_CONSECUTIVE_ERRORS 3→999). 1 cijfer, voorkomt data-loss bij BasiCall-hiccups.~~ **Gedeployed 2026-04-16 13:30 NL** + backfill voor alle actieve projecten uitgevoerd.
3. **Deze week**: B.1 verificatie (log + robuuste parse) zodra eerste batch gekoppeld is.
4. **Deze week**: B.3 verificatie (debug-log voor gesprekstijd).
5. **Volgende sprint**: B.5 + B.6 (optimalisaties, geen datafouten). Na B.5 kan B.8's `999` terug naar iets zinnigers of weg.
6. **Volgende sprint**: B.7 (script in Git + README + deploy-workflow). B.4 (casing) meenemen in dezelfde commit.

---

## Verificatie na deploy van elke patch

| Patch | Verificatie-query/actie |
|---|---|
| B.2 silent-token | `SELECT COUNT(*) FROM sync_logs WHERE status='failed' AND started_at > now() - interval '1 hour';` na nachtsync. Moet > 0 zijn als er ongeldige tokens zijn. |
| B.1 batch-parse | `SELECT id, basicall_batch_id, total, handled, remaining FROM batches ORDER BY last_synced_at DESC LIMIT 5;` — alle drie numerieke kolommen moeten valide integers zijn, `remaining = total - handled`. |
| B.3 gesprekstijd | VPS-log inspecteren op `[DBG gesprekstijd]` regels; als output → scenario 2; als geen output voor outbound-project → scenario 1 (BasiCall levert 0, geen code-fix nodig). |
| B.5 500-skip | Duur van nachtsync meten (in `sync_logs.completed_at - started_at`). Moet korter worden. |
| B.6 stale cleanup | `SELECT COUNT(*) FROM sync_jobs WHERE status='processing' AND started_at < now() - interval '1 hour';` — moet 0 zijn na elke run. |
| B.7 git-deploy | `git log -- scripts/vps-sync/sync.js` toont commit-history; md5 van VPS-versie = md5 van repo-versie. |
