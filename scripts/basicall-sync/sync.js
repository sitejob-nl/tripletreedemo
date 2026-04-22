// Force NL timezone voor alle Date operaties — moet VOOR alles staan
process.env.TZ = 'Europe/Amsterdam';

require('dotenv').config();
const { createClient } = require('@supabase/supabase-js');
const axios = require('axios');
const xml2js = require('xml2js');

// --- CONFIGURATIE ---
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
const parser = new xml2js.Parser({ explicitArray: false, ignoreAttrs: true, tagNameProcessors: [xml2js.processors.stripPrefix] });
const BASICALL_URL = 'https://S06.basicall.nl/BasiCall/bc_WebApi/v2.0/';

const CONFIG = {
    BATCH_UPSERT_SIZE: 50,
    BATCH_DB_CHECK_SIZE: 1000,
    PARALLEL_FETCH_SIZE: 5,        // concurrent Record.get calls
    DELAY_BETWEEN_RECORDS_MS: 50,  // rate limit per record
    DELAY_BETWEEN_DAYS_MS: 100,    // rate limit per dag (inlogtijd)
    MAX_RETRIES: 3,
    RETRY_DELAY_MS: 2000,
    MAX_RECORD_ID_LENGTH: 20,
    TIMEZONE: 'Europe/Amsterdam',
};

// --- TOKEN HELPER ---
// Tokens staan in project_secrets (onbereikbaar via API, alleen service key)
async function enrichProjectsWithTokens(projects) {
    if (!projects || projects.length === 0) return projects;
    const ids = projects.map(p => p.id);
    const { data: secrets, error } = await supabase
        .from('project_secrets')
        .select('project_id, basicall_token')
        .in('project_id', ids);
    if (error) {
        console.error('❌ Kon tokens niet ophalen:', error.message);
        return projects;
    }
    const tokenMap = new Map(secrets.map(s => [s.project_id, s.basicall_token]));
    return projects.map(p => ({ ...p, basicall_token: tokenMap.get(p.id) || null }));
}

// --- PII FILTERING ---
const PII_BLACKLIST_PATTERNS = [
    /^(?!bc_agentnaam$|bc_result_naam$).*naam$/i,
    /^(?!bc_agentnaam$|bc_result_naam$).*name$/i,
    /voorletter/i, /initialen/i, /tussenvoegsel/i, /aanhef/i,
    /tenaamstelling/i, /briefadressering/i,
    /telefoon/i, /phone/i, /mobiel/i, /mobile/i,
    /email/i, /e-mail/i, /e_mail/i, /^mail/i,
    /^(?!.*plaats|.*city|.*stad|.*woonplaats|.*provincie).*adres/i,
    /street/i, /straat/i,
    /^postcode$/i, /zipcode/i, /bc_bmn_postcode/i,
    /huisnummer/i, /housenumber/i, /toevoeging/i,
    /^land$/i,
    /iban/i, /^bic$/i, /rekening/i, /bank.*nummer/i,
    /geboortedatum/i, /birthdate/i, /birth_date/i,
    /geslacht/i, /gender/i,
    /klantnummer/i, /donateur.*nummer/i, /donatienummer/i,
    /lidnummer/i, /relatienummer/i, /referentienummer/i,
    /contactid/i, /accountid/i, /contact_id/i, /account_id/i,
    /casesafeid/i,
    // Vrij-tekstvelden waar agenten PII in kunnen typen (IBANs, namen, etc.)
    /opmerkingen/i, /notitie/i, /notes/i, /comments/i, /memo/i,
];

const WHITELIST_PATTERNS = [
    /bc_agentnaam/i, /bc_result_naam/i, /bc_email_verwerking/i,
    /plaats/i, /woonplaats/i, /city/i, /stad/i,
    /provincie/i, /province/i, /billing_city/i,
];

function stripPIIFromRawData(rawData) {
    if (!rawData || typeof rawData !== 'object') return rawData;
    const cleaned = {};
    for (const [key, value] of Object.entries(rawData)) {
        if (WHITELIST_PATTERNS.some(p => p.test(key))) {
            cleaned[key] = value;
            continue;
        }
        if (!PII_BLACKLIST_PATTERNS.some(p => p.test(key))) {
            cleaned[key] = value;
        }
    }
    return cleaned;
}

// --- HELPERS ---

// Alle datum formatting in lokale NL-tijd (Europe/Amsterdam)
// BasicAll verwacht lokale tijden, NIET UTC
function formatLocalDateTime(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    return `${year}-${month}-${day} ${hours}:${minutes}:${seconds}`;
}

function formatLocalDateTimeISO(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hours = String(d.getHours()).padStart(2, '0');
    const minutes = String(d.getMinutes()).padStart(2, '0');
    const seconds = String(d.getSeconds()).padStart(2, '0');
    // Timezone offset berekenen (TZ=Europe/Amsterdam)
    const offsetMin = -d.getTimezoneOffset(); // positief voor CET/CEST
    const offsetHours = String(Math.floor(Math.abs(offsetMin) / 60)).padStart(2, '0');
    const offsetMins = String(Math.abs(offsetMin) % 60).padStart(2, '0');
    const offsetSign = offsetMin >= 0 ? '+' : '-';
    return `${year}-${month}-${day}T${hours}:${minutes}:${seconds}${offsetSign}${offsetHours}:${offsetMins}`;
}

// Aliassen voor backward compat in de rest van het script
const formatDate = formatLocalDateTime;
const formatDateISO = formatLocalDateTimeISO;

function getNowAmsterdam() {
    // TZ is forced to Europe/Amsterdam bovenaan het script
    // new Date() geeft dus al NL-tijd
    return new Date();
}

function formatLocalDate(d) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getWeekNumber(d) {
    // Kopie maken zodat origineel niet gemuteerd wordt
    const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
    date.setUTCDate(date.getUTCDate() + 4 - (date.getUTCDay() || 7));
    const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
    return Math.ceil(((date - yearStart) / 86400000 + 1) / 7);
}

function sleep(ms) {
    return new Promise(r => setTimeout(r, ms));
}

// --- SOAP HELPERS ---
function buildSoapRequest(method, body, token, projectId) {
    // Batch methods gebruiken v3.0 namespace, rest v2.0
    const domain = method.split('.')[0];
    const apiVersion = domain === 'Batch' ? 'v3.0' : 'v2.0';
    return `<?xml version="1.0" encoding="UTF-8"?>
    <SOAP-ENV:Envelope xmlns:SOAP-ENV="http://schemas.xmlsoap.org/soap/envelope/"
        xmlns:ns1="https://S06.basicall.nl/BasiCall/bc_WebApi/${apiVersion}/${domain}"
        xmlns:ns2="https://S06.basicall.nl/BasiCall/bc_WebApi/v2.0/"
        xmlns:xsd="http://www.w3.org/2001/XMLSchema"
        xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"
        SOAP-ENV:encodingStyle="http://schemas.xmlsoap.org/soap/encoding/">
        <SOAP-ENV:Header>
            <ns2:Token>${token}</ns2:Token>
            <ns2:Project>${projectId}</ns2:Project>
        </SOAP-ENV:Header>
        <SOAP-ENV:Body>
            <ns1:${method}>${body}</ns1:${method}>
        </SOAP-ENV:Body>
    </SOAP-ENV:Envelope>`;
}

function unboxRecords(responseObj) {
    if (!responseObj) return [];
    const raw = responseObj.return;
    if (!raw) return [];
    if (raw.item && Array.isArray(raw.item)) return raw.item;
    if (raw.item) return [raw.item];
    if (Array.isArray(raw)) return raw;
    return [raw];
}

function extractIdValue(rawId) {
    if (rawId === null || rawId === undefined) return null;
    let val = rawId;
    if (typeof rawId === 'object') {
        val = rawId._ || rawId.item || rawId['#text'] || JSON.stringify(rawId);
    }
    return String(val);
}

function parseBasicallStruct(raw) {
    const clean = {};
    if (!raw) return clean;
    const items = raw.item || raw;
    const arr = Array.isArray(items) ? items : [items];
    arr.forEach(field => {
        if (field && field.veld) clean[field.veld] = field.waarde;
        else Object.assign(clean, field);
    });
    return clean;
}

// --- RETRY WRAPPER ---
async function withRetry(fn, label, maxRetries = CONFIG.MAX_RETRIES) {
    for (let attempt = 1; attempt <= maxRetries; attempt++) {
        try {
            return await fn();
        } catch (err) {
            const isLast = attempt === maxRetries;
            if (isLast) {
                console.error(`   ❌ ${label}: Alle ${maxRetries} pogingen mislukt. Laatste error: ${err.message}`);
                throw err;
            }
            const delay = CONFIG.RETRY_DELAY_MS * attempt;
            console.warn(`   ⚠️  ${label}: Poging ${attempt}/${maxRetries} mislukt (${err.message}). Retry in ${delay}ms...`);
            await sleep(delay);
        }
    }
}

// --- SOAP CALL (met retry) ---
async function soapCall(method, body, token, projectId) {
    const xml = buildSoapRequest(method, body, token, projectId);
    return withRetry(async () => {
        const { data: xmlData } = await axios.post(BASICALL_URL, xml, {
            headers: { 'Content-Type': 'text/xml; charset=utf-8' },
            timeout: 30000,
        });
        const parsed = await parser.parseStringPromise(xmlData);
        const respBody = parsed.Envelope?.Body || parsed['SOAP-ENV:Envelope']?.['SOAP-ENV:Body'];

        // Check voor SOAP Fault
        const fault = respBody?.Fault || respBody?.['SOAP-ENV:Fault'];
        if (fault) {
            const faultMsg = fault.faultstring || fault.detail || JSON.stringify(fault);
            throw new Error(`SOAP Fault: ${faultMsg}`);
        }

        return respBody;
    }, `SOAP ${method}`);
}

// --- TOKEN VALIDATIE ---
async function validateToken(project) {
    try {
        const body = `<datum_van xsi:type="xsd:dateTime">${formatDateISO(new Date())}</datum_van><datum_tot xsi:type="xsd:dateTime">${formatDateISO(new Date())}</datum_tot>`;
        await soapCall('Record.getAfgehandeldIds', body, project.basicall_token, project.basicall_project_id);
        return true;
    } catch (err) {
        console.error(`   🔑 Token validatie mislukt voor ${project.name}: ${err.message}`);
        return false;
    }
}

// --- SYNC INGELOGDE TIJD: ENKELE DAG ---
async function syncLoggedTimeDay(project, dayDate) {
    const start = new Date(dayDate);
    start.setHours(0, 0, 0, 0);
    const end = new Date(dayDate);
    end.setHours(23, 59, 59, 999);

    try {
        const body = `
            <start_datum xsi:type="xsd:dateTime">${formatDateISO(start)}</start_datum>
            <eind_datum xsi:type="xsd:dateTime">${formatDateISO(end)}</eind_datum>
        `;
        const respBody = await soapCall(
            'Project.getIngelogdeTijden', body,
            project.basicall_token, project.basicall_project_id
        );
        const responseObj = respBody['Project.getIngelogdeTijdenResponse'];
        const items = unboxRecords(responseObj);

        let totalSeconds = 0;
        items.forEach(item => {
            const seconds = parseInt(item.aantal_seconden || '0', 10);
            if (!isNaN(seconds)) totalSeconds += seconds;
        });

        return totalSeconds;
    } catch (e) {
        // Return null bij error zodat we onderscheid kunnen maken met 0 seconden
        console.error(`      ⚠️  Inlogtijd fout ${formatLocalDate(dayDate)}: ${e.message}`);
        return null;
    }
}

// --- SYNC INGELOGDE TIJD: OPSLAAN NAAR DB ---
async function saveLoggedTime(projectId, dateStr, totalSeconds) {
    const { error } = await supabase
        .from('daily_logged_time')
        .upsert({
            project_id: projectId,
            date: dateStr,
            total_seconds: totalSeconds,
            synced_at: new Date().toISOString()
        }, { onConflict: 'project_id,date' });

    if (error) {
        console.error(`      ❌ DB Error voor ${dateStr}:`, error.message);
        return false;
    }
    return true;
}

// --- SYNC INGELOGDE TIJD: PERIODE ---
async function syncLoggedTimeRange(project, start, end) {
    console.log(`\n⏱️  Inlogtijd ophalen: ${project.name}`);
    let currentDate = new Date(start);
    let totalSaved = 0;
    let totalSeconds = 0;
    let errorDays = 0;
    let consecutiveErrors = 0;
    const MAX_CONSECUTIVE_ERRORS = 3;

    while (currentDate <= end) {
        const dateStr = formatLocalDate(currentDate);
        const seconds = await syncLoggedTimeDay(project, currentDate);

        if (seconds === null) {
            errorDays++;
            consecutiveErrors++;
            // Als eerste 3 dagen achter elkaar falen, skip de rest
            if (consecutiveErrors >= MAX_CONSECUTIVE_ERRORS) {
                console.log(`   ⏭️  ${MAX_CONSECUTIVE_ERRORS}x achter elkaar mislukt — project ondersteunt waarschijnlijk geen inlogtijd. Overslaan.`);
                break;
            }
        } else {
            consecutiveErrors = 0; // reset bij succes
            if (seconds > 0) {
                const saved = await saveLoggedTime(project.id, dateStr, seconds);
                if (saved) {
                    totalSaved++;
                    totalSeconds += seconds;
                    const hours = Math.round(seconds / 36) / 100;
                    console.log(`   ${dateStr}: ${hours}u ✓`);
                }
            }
        }

        currentDate.setDate(currentDate.getDate() + 1);
        await sleep(CONFIG.DELAY_BETWEEN_DAYS_MS);
    }

    const totalHours = Math.round(totalSeconds / 36) / 100;
    console.log(`   ✅ ${totalSaved} dagen opgeslagen, totaal: ${totalHours} uur${errorDays > 0 ? ` (${errorDays} dagen mislukt)` : ''}`);

    // Sync log voor inlogtijd
    await supabase.from('sync_logs').insert({
        project_id: project.id,
        status: errorDays > 0 ? 'warning' : 'success',
        records_synced: totalSaved,
        sync_from: start.toISOString(),
        sync_to: end.toISOString(),
        error_message: errorDays > 0 ? `${errorDays} dagen konden niet opgehaald worden (inlogtijd)` : null,
    });
}

// --- SYNC INGELOGDE TIJD: SINGLE DAY (nachtelijke ronde) ---
async function syncLoggedTimeSingleDay(project, start, end) {
    console.log(`\n⏱️  Inlogtijd ophalen: ${project.name}`);
    try {
        const body = `
            <start_datum xsi:type="xsd:dateTime">${formatDateISO(start)}</start_datum>
            <eind_datum xsi:type="xsd:dateTime">${formatDateISO(end)}</eind_datum>
        `;
        const respBody = await soapCall(
            'Project.getIngelogdeTijden', body,
            project.basicall_token, project.basicall_project_id
        );
        const responseObj = respBody['Project.getIngelogdeTijdenResponse'];
        const items = unboxRecords(responseObj);

        if (!items || items.length === 0) {
            console.log('   ✅ Geen inlogtijd data.');
            return;
        }

        let totalSeconds = 0;
        items.forEach(item => {
            const seconds = parseInt(item.aantal_seconden || '0', 10);
            if (!isNaN(seconds)) totalSeconds += seconds;
        });

        const dateStr = formatLocalDate(start);
        console.log(`   📊 ${items.length} entries, totaal: ${Math.round(totalSeconds / 3600 * 100) / 100} uur`);

        if (totalSeconds > 0) {
            const saved = await saveLoggedTime(project.id, dateStr, totalSeconds);
            if (saved) console.log('   💾 Opgeslagen.');
        }
    } catch (e) {
        console.error(`   ❌ Error inlogtijd:`, e.message);
    }
}

// --- FETCH ENKEL RECORD (met retry) ---
async function fetchRecordDetail(id, project) {
    const respBody = await soapCall(
        'Record.get',
        `<record_id>${id}</record_id>`,
        project.basicall_token,
        project.basicall_project_id
    );

    const rResponse = respBody['Record.getResponse'];
    const rawRecord = rResponse ? rResponse.return : null;

    if (!rawRecord) return null;

    const cleanRecord = parseBasicallStruct(rawRecord);
    const strippedRecord = stripPIIFromRawData(cleanRecord);

    let isoDate = cleanRecord.bc_beldatum;
    if (isoDate && /^\d{2}-\d{2}-\d{4}/.test(isoDate)) {
        const parts = isoDate.split('-');
        isoDate = `${parts[2]}-${parts[1]}-${parts[0]}`;
    }

    if (!isoDate) return null;

    const recordId = cleanRecord.bc_record_id ? parseInt(cleanRecord.bc_record_id) : parseInt(id);

    return {
        basicall_record_id: recordId,
        project_id: project.id,
        beldatum: isoDate,
        beltijd: cleanRecord.bc_beltijd || null,
        gesprekstijd_sec: parseInt(cleanRecord.bc_gesprekstijd || 0),
        resultaat: cleanRecord.bc_result_naam || 'Onbekend',
        week_number: getWeekNumber(new Date(isoDate)),
        raw_data: strippedRecord,
        synced_at: new Date().toISOString(),
    };
}

// --- PARALLEL BATCH FETCH ---
async function fetchRecordsBatch(ids, project) {
    const results = [];
    const errors = [];

    // Verwerk in parallel batches van PARALLEL_FETCH_SIZE
    for (let i = 0; i < ids.length; i += CONFIG.PARALLEL_FETCH_SIZE) {
        const batch = ids.slice(i, i + CONFIG.PARALLEL_FETCH_SIZE);

        const batchResults = await Promise.allSettled(
            batch.map(async (id) => {
                if (!id || id.length > CONFIG.MAX_RECORD_ID_LENGTH) return null;
                await sleep(CONFIG.DELAY_BETWEEN_RECORDS_MS);
                return fetchRecordDetail(id, project);
            })
        );

        for (const result of batchResults) {
            if (result.status === 'fulfilled' && result.value) {
                results.push(result.value);
            } else if (result.status === 'rejected') {
                errors.push(result.reason?.message || 'Unknown error');
            }
        }

        // Progress indicator
        const progress = Math.min(i + CONFIG.PARALLEL_FETCH_SIZE, ids.length);
        process.stdout.write(`\r   📥 ${progress}/${ids.length} opgehaald...`);
    }

    process.stdout.write('\n');

    // Log eerste paar unieke errors als er fouten waren
    if (errors.length > 0) {
        const uniqueErrors = [...new Set(errors)].slice(0, 3);
        console.warn(`   ⚠️  ${errors.length} record errors. Voorbeelden: ${uniqueErrors.join(', ')}`);
    }

    return { results, errorCount: errors.length };
}

// --- UPSERT BATCH NAAR DB ---
async function upsertBatch(records) {
    if (records.length === 0) return;

    const { error } = await supabase
        .from('call_records')
        .upsert(records, { onConflict: 'basicall_record_id,project_id' });

    if (error) {
        console.error(`   ❌ Upsert error (${records.length} records):`, error.message);
        throw error;
    }
}

// --- CORE SYNC (call records) ---
async function performSync(project, start, end, jobId = null) {
    console.log(`\n🔄 Uitvoeren: ${project.name}`);
    console.log(`   📅 ${formatDate(start)} tot ${formatDate(end)}`);

    if (jobId) {
        await supabase.from('sync_jobs').update({
            status: 'processing',
            started_at: new Date().toISOString(),
            updated_at: new Date().toISOString(),
        }).eq('id', jobId);
    }

    try {
        // 1. Token check
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
            return;
        }

        // 2. Haal afgehandelde record IDs op
        const idsBody = `<datum_van xsi:type="xsd:dateTime">${formatDateISO(start)}</datum_van><datum_tot xsi:type="xsd:dateTime">${formatDateISO(end)}</datum_tot>`;
        const body = await soapCall(
            'Record.getAfgehandeldIds', idsBody,
            project.basicall_token, project.basicall_project_id
        );
        const responseObj = body['Record.getAfgehandeldIdsResponse'];
        const rawItems = unboxRecords(responseObj);

        if (!rawItems || rawItems.length === 0) {
            console.log('   ✅ Geen records.');
            if (jobId) {
                await supabase.from('sync_jobs').update({
                    status: 'completed',
                    records_synced: 0,
                    log_message: 'Geen records gevonden.',
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }).eq('id', jobId);
            }
            return;
        }

        // 3. Parse IDs
        let ids = [];
        rawItems.forEach(item => {
            const valStr = extractIdValue(item);
            if (valStr && valStr !== 'null' && valStr !== 'undefined') {
                if (valStr.includes(',')) ids.push(...valStr.split(',').map(s => s.trim()));
                else if (!valStr.startsWith('{')) ids.push(valStr);
            }
        });
        ids = [...new Set(ids)];
        console.log(`   🔎 ${ids.length} ID's gevonden.`);

        // 4. Check welke al in DB zitten
        const existingIds = new Set();
        for (let i = 0; i < ids.length; i += CONFIG.BATCH_DB_CHECK_SIZE) {
            const batch = ids.slice(i, i + CONFIG.BATCH_DB_CHECK_SIZE);
            const { data: existing } = await supabase
                .from('call_records')
                .select('basicall_record_id')
                .in('basicall_record_id', batch)
                .eq('project_id', project.id);
            if (existing) existing.forEach(r => existingIds.add(String(r.basicall_record_id)));
        }

        const idsToFetch = ids.filter(id => !existingIds.has(String(id)));
        console.log(`      ♻️ ${ids.length - idsToFetch.length} al in DB. 📥 ${idsToFetch.length} nieuw.`);

        if (idsToFetch.length === 0) {
            if (jobId) {
                await supabase.from('sync_jobs').update({
                    status: 'completed',
                    records_synced: ids.length,
                    log_message: 'Alle records al gesynchroniseerd.',
                    completed_at: new Date().toISOString(),
                    updated_at: new Date().toISOString(),
                }).eq('id', jobId);
            }
            return;
        }

        // 5. Fetch record details (parallel in batches)
        const { results: fetchedRecords, errorCount } = await fetchRecordsBatch(idsToFetch, project);
        console.log(`   📋 ${fetchedRecords.length} records opgehaald, ${errorCount} fouten.`);

        // 6. Upsert in batches naar DB
        for (let i = 0; i < fetchedRecords.length; i += CONFIG.BATCH_UPSERT_SIZE) {
            const batch = fetchedRecords.slice(i, i + CONFIG.BATCH_UPSERT_SIZE);
            await upsertBatch(batch);
        }
        console.log(`   💾 ${fetchedRecords.length} records opgeslagen.`);

        // 7. Sync log
        await supabase.from('sync_logs').insert({
            project_id: project.id,
            status: errorCount > 0 ? 'warning' : 'success',
            records_synced: fetchedRecords.length,
            sync_from: start.toISOString(),
            sync_to: end.toISOString(),
            error_message: errorCount > 0 ? `${errorCount} records konden niet opgehaald worden` : null,
        });

        // 8. Job update
        if (jobId) {
            await supabase.from('sync_jobs').update({
                status: 'completed',
                records_synced: fetchedRecords.length,
                log_message: `${fetchedRecords.length} gesynchroniseerd${errorCount > 0 ? `, ${errorCount} fouten` : ''}`,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }).eq('id', jobId);
        }

    } catch (e) {
        console.error(`      ❌ Fatal error:`, e.message);

        await supabase.from('sync_logs').insert({
            project_id: project.id,
            status: 'failed',
            records_synced: 0,
            sync_from: start.toISOString(),
            sync_to: end.toISOString(),
            error_message: e.message,
        });

        if (jobId) {
            await supabase.from('sync_jobs').update({
                status: 'failed',
                log_message: e.message,
                completed_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
            }).eq('id', jobId);
        }
    }
}

// --- DISCOVER BATCHES ---
// Vraagt via Batch.getAll alle bekende batches op bij BasiCall en voegt nieuwe toe
// aan de `batches`-tabel. Bestaande rijen worden nooit verwijderd (historie +
// eventuele handmatig toegevoegde rijen blijven behouden).
async function discoverBatches(project) {
    let respBody;
    try {
        respBody = await soapCall(
            'Batch.list',
            '',
            project.basicall_token,
            project.basicall_project_id
        );
    } catch (err) {
        console.warn(`   ⚠️  Batch.list mislukt voor ${project.name}: ${err.message}`);
        return;
    }

    const responseObj = respBody['Batch.listResponse'];
    const items = unboxRecords(responseObj);

    if (!items || items.length === 0) {
        return;
    }

    // Parse items: elk item is óf een struct met veld/waarde pairs, óf een object met directe keys.
    const discovered = items
        .map(item => {
            const parsed = parseBasicallStruct(item);
            const rawId = parsed.batch_id ?? parsed.id ?? item.batch_id ?? item.id;
            const rawName = parsed.naam ?? parsed.name ?? item.naam ?? item.name;
            const rawStatus = parsed.status ?? item.status;
            const batchId = rawId ? parseInt(rawId, 10) : NaN;
            if (isNaN(batchId)) return null;
            return {
                basicall_batch_id: batchId,
                name: rawName ? String(rawName) : `Batch ${batchId}`,
                status: rawStatus !== undefined ? parseInt(rawStatus, 10) : null,
            };
        })
        .filter(Boolean);

    if (discovered.length === 0) {
        console.warn(`   ⚠️  Batch.list: response niet herkend voor ${project.name}. Raw: ${JSON.stringify(respBody).slice(0, 500)}`);
        return;
    }

    // Bestaande batch-ids ophalen
    const { data: existing, error: existingErr } = await supabase
        .from('batches')
        .select('basicall_batch_id')
        .eq('project_id', project.id);

    if (existingErr) {
        console.warn(`   ⚠️  Kon bestaande batches niet ophalen voor ${project.name}: ${existingErr.message}`);
        return;
    }

    const existingIds = new Set((existing || []).map(r => r.basicall_batch_id));
    const toInsert = discovered
        .filter(b => !existingIds.has(b.basicall_batch_id))
        .map(b => ({
            project_id: project.id,
            basicall_batch_id: b.basicall_batch_id,
            name: b.name,
            status: isNaN(b.status) ? null : b.status,
        }));

    if (toInsert.length === 0) {
        console.log(`📦 ${project.name}: geen nieuwe batches (${discovered.length} bekend)`);
        return;
    }

    const { error: insertErr } = await supabase.from('batches').insert(toInsert);
    if (insertErr) {
        console.error(`   ❌ Kon nieuwe batches niet toevoegen voor ${project.name}: ${insertErr.message}`);
        return;
    }

    console.log(`📦 ${project.name}: ${toInsert.length} nieuwe batch(es) ontdekt`);
    toInsert.forEach(b => console.log(`   + ${b.name} (id ${b.basicall_batch_id})`));
}

// --- SYNC BATCH TOTALS ---
async function syncBatchTotals(project) {
    // Haal bekende batches op voor dit project
    const { data: batches, error } = await supabase
        .from('batches')
        .select('id, basicall_batch_id, name')
        .eq('project_id', project.id);

    if (error || !batches || batches.length === 0) return;

    console.log(`\n📦 Batch totals ophalen: ${project.name} (${batches.length} batches)`);

    for (const batch of batches) {
        try {
            // Batch.getTotal
            const totalBody = await soapCall(
                'Batch.getTotal',
                `<batch_id xsi:type="xsd:int">${batch.basicall_batch_id}</batch_id>`,
                project.basicall_token,
                project.basicall_project_id
            );
            const totalResponse = totalBody['Batch.getTotalResponse'];
            const total = parseInt(totalResponse?.return || '0', 10);

            // Batch.getHandled
            const handledBody = await soapCall(
                'Batch.getHandled',
                `<batch_id xsi:type="xsd:int">${batch.basicall_batch_id}</batch_id>`,
                project.basicall_token,
                project.basicall_project_id
            );
            const handledResponse = handledBody['Batch.getHandledResponse'];
            const handled = parseInt(handledResponse?.return || '0', 10);

            // Update DB
            await supabase
                .from('batches')
                .update({
                    total,
                    handled,
                    last_synced_at: new Date().toISOString(),
                })
                .eq('id', batch.id);

            const remaining = total - handled;
            console.log(`   ${batch.name}: ${handled}/${total} afgehandeld, ${remaining} resterend`);
        } catch (err) {
            console.error(`   ❌ Batch ${batch.name}: ${err.message}`);
        }
    }
}

// --- MISSED DAYS CHECK ---
async function getMissedDays(project) {
    // Check wanneer de laatste succesvolle sync was per project
    const { data: lastSync } = await supabase
        .from('sync_logs')
        .select('sync_to')
        .eq('project_id', project.id)
        .in('status', ['success', 'warning'])
        .order('sync_to', { ascending: false })
        .limit(1)
        .single();

    if (!lastSync?.sync_to) return null;

    const lastSyncDate = new Date(lastSync.sync_to);
    const now = getNowAmsterdam();
    const yesterday = new Date(now);
    yesterday.setDate(now.getDate() - 1);

    // Als laatste sync meer dan 1 dag geleden is → er zijn gemiste dagen
    const daysDiff = Math.floor((yesterday - lastSyncDate) / 86400000);
    if (daysDiff > 1) {
        const missedStart = new Date(lastSyncDate);
        missedStart.setDate(missedStart.getDate() + 1);
        missedStart.setHours(0, 0, 0, 0);
        return { start: missedStart, days: daysDiff - 1 };
    }

    return null;
}

// --- MAIN ---
async function run() {
    const startTime = Date.now();
    console.log(`\n${'='.repeat(60)}`);
    console.log(`--- RUN START: ${new Date().toISOString()} ---`);
    console.log(`--- NL tijd:   ${formatDate(new Date())} ---`);
    console.log(`${'='.repeat(60)}`);

    try {
        // 1. CHECK VOOR HANDMATIGE JOBS
        const { data: jobs, error: jobsError } = await supabase
            .from('sync_jobs')
            .select('*, projects(*)')
            .eq('status', 'pending')
            .order('created_at', { ascending: true });

        if (jobsError) {
            console.error('❌ Kon jobs niet ophalen:', jobsError.message);
            return;
        }

        if (jobs && jobs.length > 0) {
            console.log(`\n⚡ ${jobs.length} HANDMATIGE JOBS GEVONDEN\n`);

            // Enrich job projects met tokens uit project_secrets
            const jobProjects = jobs.filter(j => j.projects).map(j => j.projects);
            const enrichedProjects = await enrichProjectsWithTokens(jobProjects);
            const projectMap = new Map(enrichedProjects.map(p => [p.id, p]));

            for (const job of jobs) {
                if (!job.projects) {
                    console.error(`   ❌ Job ${job.id}: project niet gevonden`);
                    await supabase.from('sync_jobs').update({
                        status: 'failed',
                        log_message: 'Project niet gevonden',
                        updated_at: new Date().toISOString(),
                    }).eq('id', job.id);
                    continue;
                }

                const project = projectMap.get(job.projects.id) || job.projects;
                console.log(`\n📋 Job: ${project.name} (${job.start_date} - ${job.end_date})`);
                await performSync(project, new Date(job.start_date), new Date(job.end_date), job.id);
                await syncLoggedTimeRange(project, new Date(job.start_date), new Date(job.end_date));
                await discoverBatches(project);
                await syncBatchTotals(project);
            }

            const elapsed = Math.round((Date.now() - startTime) / 1000);
            console.log(`\n--- ✅ ALLE JOBS KLAAR (${elapsed}s) ---`);
            return;
        }

        // 2. AUTOMATISCHE NACHTRONDE
        console.log('\n🌙 Nachtelijke ronde');

        const now = getNowAmsterdam();
        const yesterdayStart = new Date(now);
        yesterdayStart.setDate(now.getDate() - 1);
        yesterdayStart.setHours(0, 0, 0, 0);
        const yesterdayEnd = new Date(now);
        yesterdayEnd.setDate(now.getDate() - 1);
        yesterdayEnd.setHours(23, 59, 59, 999);

        console.log(`   Periode: ${formatDate(yesterdayStart)} - ${formatDate(yesterdayEnd)}`);

        const { data: projects, error: projError } = await supabase
            .from('projects')
            .select('*')
            .eq('is_active', true);

        if (projError) {
            console.error('❌ Kon projecten niet ophalen:', projError.message);
            return;
        }

        if (!projects || projects.length === 0) {
            console.log('   Geen actieve projecten.');
            return;
        }

        // Enrich met tokens uit project_secrets
        const enrichedProjects = await enrichProjectsWithTokens(projects);

        console.log(`   ${enrichedProjects.length} actieve projecten.\n`);

        for (const p of enrichedProjects) {
            // Check op gemiste dagen
            const missed = await getMissedDays(p);
            if (missed) {
                console.log(`\n⚠️  ${p.name}: ${missed.days} gemiste dag(en) gevonden, inhalen vanaf ${formatLocalDate(missed.start)}`);
                await performSync(p, missed.start, yesterdayEnd);
                await syncLoggedTimeRange(p, missed.start, yesterdayEnd);
            } else {
                // Normale sync van gisteren
                await performSync(p, yesterdayStart, yesterdayEnd);
                await syncLoggedTimeSingleDay(p, yesterdayStart, yesterdayEnd);
            }
            // Batch discovery + totals altijd updaten
            await discoverBatches(p);
            await syncBatchTotals(p);
        }

        const elapsed = Math.round((Date.now() - startTime) / 1000);
        console.log(`\n--- ✅ NACHTELIJKE RONDE KLAAR (${elapsed}s) ---`);

    } catch (e) {
        console.error(`\n💀 FATALE ERROR: ${e.message}`);
        console.error(e.stack);

        // Log fatale error naar DB
        try {
            await supabase.from('error_logs').insert({
                error_type: 'sync_fatal',
                error_message: e.message,
                stack_trace: e.stack,
                component_name: 'sync-basicall',
                metadata: { timestamp: new Date().toISOString() },
            });
        } catch (_) {
            // Als zelfs de error log faalt, dan is het klaar
        }

        process.exit(1);
    }
}

run();
