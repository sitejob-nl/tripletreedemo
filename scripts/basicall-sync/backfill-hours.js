// Gerichte urenreparatie: standaard alleen een preview. Geen records-sync,
// projectwijzigingen, jobqueue of e-mail. Uitvoeren vanuit /opt/basicall-sync.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const {
    supabase, enrichProjectsWithTokens, getActiveCallDays, parseLocalJobDate,
    syncLoggedTimeDay, saveLoggedTime, logLoggedTimeSync, loggedTimeSource,
} = require('./sync.js');

function parseOptions(args) {
    const options = {};
    for (const arg of args) {
        if (arg === '--apply') { options.apply = true; continue; }
        const match = arg.match(/^--(project|from|to)=(.+)$/);
        if (!match) throw new Error(`Onbekend argument: ${arg}`);
        options[match[1]] = match[2];
    }
    if (!/^\d+$/.test(options.project ?? '') || Number(options.project) <= 0) {
        throw new Error('Gebruik --project=<BasiCall project-ID> --from=YYYY-MM-DD --to=YYYY-MM-DD [--apply]');
    }
    for (const key of ['from', 'to']) {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(options[key] ?? '')) throw new Error(`Ongeldige ${key}-datum`);
        const parsed = parseLocalJobDate(options[key]);
        const [year, month, day] = options[key].split('-').map(Number);
        if (parsed.getFullYear() !== year || parsed.getMonth() + 1 !== month || parsed.getDate() !== day) {
            throw new Error(`Ongeldige ${key}-datum`);
        }
    }
    const start = parseLocalJobDate(options.from);
    const end = parseLocalJobDate(options.to);
    const today = new Date(); today.setHours(0, 0, 0, 0);
    if (start > end || end >= today || end - start > 366 * 86400000) {
        throw new Error('Kies een afgesloten periode van maximaal één jaar');
    }
    return options;
}

async function main(args = process.argv.slice(2)) {
    const options = parseOptions(args);
    const { data: project, error } = await supabase.from('projects')
        .select('id,name,basicall_project_id,project_type,mapping_config')
        .eq('basicall_project_id', Number(options.project)).single();
    if (error) throw error;
    const source = loggedTimeSource(project);
    const [withToken] = await enrichProjectsWithTokens([project]);
    if (!withToken.basicall_token) throw new Error('Geen BasiCall-token beschikbaar');
    const activeDays = await getActiveCallDays(project.id, options.from, options.to);
    const { data: previous, error: previousError } = await supabase.from('daily_logged_time')
        .select('id,project_id,date,total_seconds,corrected_seconds,corrected_at,corrected_by,correction_note,synced_at')
        .eq('project_id', project.id).gte('date', options.from).lte('date', options.to);
    if (previousError) throw previousError;
    const byDay = new Map((previous || []).map(row => [row.date, row]));
    const results = [];
    for (const day of [...activeDays].sort()) {
        const result = await syncLoggedTimeDay(withToken, parseLocalJobDate(day), true);
        const old = byDay.get(day);
        const row = {
            day, ...result,
            previous_seconds: old?.total_seconds ?? null,
            corrected_seconds: old?.corrected_seconds ?? null,
            effective_seconds: old?.corrected_seconds ?? (result.outcome === 'ok' ? result.seconds : null),
        };
        results.push(row);
        console.log(JSON.stringify(row));
    }
    const failed = results.filter(row => row.outcome !== 'ok');
    console.log(JSON.stringify({
        mode: options.apply ? 'apply' : 'preview', project: project.name, source,
        activeDays: results.length, failedDays: failed.length,
        correctedDaysPreserved: results.filter(row => row.corrected_seconds !== null).length,
        effectiveSeconds: failed.length === 0 ? results.reduce((sum, row) => sum + row.effective_seconds, 0) : null,
    }));
    if (failed.length) throw new Error('Urenbron niet compleet; niets opgeslagen');
    if (!options.apply || results.length === 0) return;

    // Bewaar de oorspronkelijke bronwaarden vóór de eerste mutatie. Correcties
    // staan in aparte kolommen en worden nooit door saveLoggedTime geschreven.
    const backup = path.join(os.tmpdir(), `basicall-hours-${options.project}-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify({ project_id: project.id, options, previous, results }, null, 2), { mode: 0o600, flag: 'wx' });
    console.log(`Backup: ${backup}`);
    let savedDays = 0;
    for (const row of results) {
        const saved = await saveLoggedTime(project.id, row.day, row.seconds);
        await logLoggedTimeSync(project, parseLocalJobDate(row.day), parseLocalJobDate(row.day, true), {
            status: saved ? 'success' : 'failed', savedDays: saved ? 1 : 0,
            expectedDays: 1, failedDays: saved ? 0 : 1,
            message: saved ? 'Gerichte urenreparatie via BasiCall-wachtrij' : `Opslaan van ${row.day} mislukt`,
        });
        if (!saved) throw new Error(`Reparatie onderbroken na ${savedDays} opgeslagen dagen; zie backup ${backup}`);
        savedDays++;
    }
    console.log(JSON.stringify({ savedDays, backup }));
}

if (require.main === module) {
    main().catch(error => { console.error(error.message); process.exitCode = 1; });
}
module.exports = { main, parseOptions };
