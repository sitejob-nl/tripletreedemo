// Verrijk bestaande gespreksrecords met de aantoonbare Queue-nawerktijd.
// Standaard alleen-lezen. Geen uren-, correctie-, mapping- of mailmutaties.
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { parseOptions } = require('./backfill-hours.js');
const { supabase, enrichProjectsWithTokens, enrichQueueAfterCallRecords, loggedTimeSource, parseLocalJobDate } = require('./sync.js');

async function main(args = process.argv.slice(2)) {
    const options = parseOptions(args);
    const { data: project, error } = await supabase.from('projects')
        .select('id,name,basicall_project_id,project_type,mapping_config')
        .eq('basicall_project_id', Number(options.project)).single();
    if (error) throw error;
    if (loggedTimeSource(project).method !== 'Queue.getIngelogdeTijden') throw new Error('Geen geverifieerde wachtrij gekoppeld');
    const [withToken] = await enrichProjectsWithTokens([project]);
    if (!withToken.basicall_token) throw new Error('Geen BasiCall-token beschikbaar');
    const previous = [];
    for (let offset = 0; ; offset += 1000) {
        const { data, error: readError } = await supabase.from('call_records')
            .select('id,project_id,basicall_record_id,beldatum_date,raw_data')
            .eq('project_id', project.id).gte('beldatum_date', options.from).lte('beldatum_date', options.to)
            .order('beldatum_date').order('id').range(offset, offset + 999);
        if (readError) throw readError;
        previous.push(...data);
        if (data.length < 1000) break;
    }
    const result = await enrichQueueAfterCallRecords(withToken, previous);
    for (const day of result.days) console.log(JSON.stringify(day));
    console.log(JSON.stringify({ mode: options.apply ? 'apply' : 'preview', project: project.name,
        days: result.days.length, records: previous.length,
        matched: result.days.reduce((sum, day) => sum + day.matched, 0), errors: result.errors }));
    const unmatched = {};
    for (const record of result.records) {
        if (record.raw_data?.bc_nawerktijd !== undefined) continue;
        const resultName = record.raw_data?.bc_result_naam || 'Onbekend';
        const key = `${record.beldatum_date}: ${resultName}`;
        unmatched[key] = (unmatched[key] || 0) + 1;
    }
    console.log(JSON.stringify({ unmatched }));
    if (result.errors.length) throw new Error('Bronfouten; niets opgeslagen');
    const original = new Map(previous.map(record => [record.id, record]));
    const changed = result.records.filter(record => JSON.stringify(record.raw_data) !== JSON.stringify(original.get(record.id).raw_data));
    if (!options.apply || changed.length === 0) return;
    const backup = path.join(os.tmpdir(), `basicall-after-call-${options.project}-${Date.now()}.json`);
    fs.writeFileSync(backup, JSON.stringify({ project_id: project.id, options,
        previous: changed.map(record => ({ id: record.id, raw_data: original.get(record.id).raw_data })),
    }), { mode: 0o600, flag: 'wx' });
    console.log(`Backup: ${backup}`);
    let saved = 0;
    for (const record of changed) {
        // Optimistische vergelijking voorkomt overschrijven van een gelijktijdige sync.
        let query = supabase.from('call_records').update({ raw_data: record.raw_data })
            .eq('id', record.id).eq('project_id', project.id);
        const raw = original.get(record.id).raw_data;
        query = raw === null ? query.is('raw_data', null) : query.eq('raw_data', JSON.stringify(raw));
        const { data, error: saveError } = await query.select('id');
        if (saveError || data?.length !== 1) throw new Error(`Opslaan onderbroken na ${saved} records; controleer backup ${backup}`);
        saved++;
    }
    const { error: auditError } = await supabase.from('sync_logs').insert({
        project_id: project.id, kind: 'after_call_time', status: 'success',
        records_synced: saved, expected_records: changed.length, failed_records: 0,
        sync_from: parseLocalJobDate(options.from).toISOString(), sync_to: parseLocalJobDate(options.to, true).toISOString(),
        error_message: 'Gerichte nawerktijdreparatie via BasiCall-wachtrij', completed_at: new Date().toISOString(),
    });
    if (auditError) throw new Error(`Alle ${saved} records opgeslagen, maar auditregistratie mislukt: ${auditError.message}`);
    console.log(JSON.stringify({ saved, backup }));
}
if (require.main === module) main().catch(error => { console.error(error.message); process.exitCode = 1; });
module.exports = { main };
