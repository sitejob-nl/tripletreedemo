const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

process.env.TZ = 'Europe/Amsterdam';
const source = fs.readFileSync(path.join(__dirname, '../sync.js'), 'utf8');
const project = { id: 'sligro', name: 'Sligro tintelingen', basicall_project_id: 870, project_type: 'inbound_service', basicall_token: 'test-token' };

function harness({ query = () => ({ data: [], error: null }), post } = {}) {
    const requests = [];
    const queries = [];
    const db = { from(table) {
        const operations = [];
        const builder = new Proxy({}, { get(_, key) {
            if (key === 'then') return (resolve, reject) => {
                queries.push({ table, operations });
                return Promise.resolve().then(() => query(table, operations)).then(resolve, reject);
            };
            return (...args) => { operations.push([key, ...args]); return builder; };
        } });
        return builder;
    } };
    const sandbox = {
        module: { exports: {} },
        process: { env: {}, argv: [] },
        console: { log() {}, warn() {}, error() {} },
        setTimeout: callback => { callback(); },
        require(name) {
            if (name === 'dotenv') return { config() {} };
            if (name === '@supabase/supabase-js') return { createClient: () => db };
            if (name === 'xml2js') return { Parser: class { async parseStringPromise(value) { return value; } }, processors: { stripPrefix() {} } };
            if (name === 'axios') return { async post(url, xml) {
                requests.push(xml);
                if (!post) throw new Error('Unexpected SOAP call');
                return post(xml);
            } };
            throw new Error(`Unexpected require: ${name}`);
        },
    };
    const context = vm.createContext(sandbox);
    vm.runInContext(source + '\nthis.api = { buildSoapRequest, loggedTimeSource, loggedTimeSeconds, syncLoggedTimeDay, syncLoggedTimeSingleDay, getActiveCallDays, getMissedLoggedTimeDays, logLoggedTimeSync, parseLocalJobDate };', context);
    return { ...sandbox.api, queries, requests, context, exports: sandbox.module.exports };
}

const operation = (ops, name) => ops.find(op => op[0] === name);
const plain = value => JSON.parse(JSON.stringify(value));

test('import starts no cron, queue processing or mail', () => {
    const app = harness();
    assert.equal(app.queries.length, 0);
    assert.equal(app.requests.length, 0);
});

test('Sligro routes hours to Queue 74; outbound remains project-scoped', () => {
    const app = harness();
    assert.deepEqual(plain(app.loggedTimeSource(project)), { method: 'Queue.getIngelogdeTijden', id: 74 });
    const xml = app.buildSoapRequest('Queue.getIngelogdeTijden', '', 'test', 74);
    assert.match(xml, /<ns2:Queue>74<\/ns2:Queue>/);
    assert.doesNotMatch(xml, /<ns2:Project>/);
    assert.match(xml, /v2\.0\/Queue/);
    assert.match(app.buildSoapRequest('Record.get', '', 'test', 870), /<ns2:Project>870/);
    assert.match(app.buildSoapRequest('Batch.getTotal', '', 'test', 870), /v3\.0\/Batch/);
    assert.deepEqual(plain(app.loggedTimeSource({ ...project, project_type: 'outbound' })), { method: 'Project.getIngelogdeTijden', id: 870 });
});

test('new inbound campaigns can configure a verified queue without changing other campaigns', () => {
    const app = harness();
    assert.equal(app.loggedTimeSource({ ...project, basicall_project_id: 999, mapping_config: { basicall_queue_id: 88 } }).id, 88);
    assert.equal(app.loggedTimeSource({ ...project, basicall_project_id: 849 }).method, 'Project.getIngelogdeTijden');
    assert.throws(() => app.loggedTimeSource({ ...project, mapping_config: { basicall_queue_id: 'incorrect' } }), /wachtrij-ID/);
});

test('queue agent hours match gesprek + nawerk; mail and breaks never counted twice', () => {
    const app = harness();
    const items = [
        { status: 'In gesprek', aantal_seconden: '7239' },
        { status: 'Nawerktijd', aantal_seconden: '1373' },
        { status: 'Emailverwerking', aantal_seconden: '521' },
        { status: 'Kleine pauze', aantal_seconden: '605' },
        { status: 'Voorwerktijd', aantal_seconden: '10' },
        { status: 'Uitbellend', aantal_seconden: '33' },
    ];
    assert.equal(app.loggedTimeSeconds(items, true), 8612);
    assert.equal(app.loggedTimeSeconds(items, false), 9781);
    assert.throws(() => app.loggedTimeSeconds([{ aantal_seconden: 30 }], true), /status/);
    assert.throws(() => app.loggedTimeSeconds([{ status: 'In gesprek', aantal_seconden: '30x' }], true), /seconden/);
    assert.throws(() => app.loggedTimeSeconds([{ status: 'In gesprek', aantal_seconden: -1 }], true), /seconden/);
});

test('successful queue sync writes hours and audit, without overwriting corrections', async () => {
    const app = harness({
        query: table => ({ data: table === 'call_records' ? [{ id: 'call' }] : [], error: null }),
        post: () => ({ data: { Envelope: { Body: { 'Queue.getIngelogdeTijdenResponse': { return: { item: [
            { status: 'In gesprek', aantal_seconden: 1171 },
            { status: 'Nawerktijd', aantal_seconden: 323 },
            { status: 'Emailverwerking', aantal_seconden: 395 },
        ] } } } } } }),
    });
    await app.syncLoggedTimeSingleDay(project, new Date('2026-11-14T00:00:00+01:00'), new Date('2026-11-14T23:59:59+01:00'));
    const upsert = operation(app.queries.find(q => q.table === 'daily_logged_time').operations, 'upsert');
    assert.equal(upsert[1].total_seconds, 1494);
    assert.equal(upsert[1].date, '2026-11-14');
    assert.deepEqual(Object.keys(upsert[1]).sort(), ['date', 'project_id', 'synced_at', 'total_seconds']);
    assert.equal(operation(app.queries.find(q => q.table === 'sync_logs').operations, 'insert')[1].status, 'success');
});

test('missing queue hours with calls remain an error and raise an admin log', async () => {
    const app = harness({
        query: table => ({ data: table === 'call_records' ? [{ id: 'call' }] : [], error: null }),
        post: () => ({ data: { Envelope: { Body: { 'Queue.getIngelogdeTijdenResponse': { return: null } } } } }),
    });
    await app.syncLoggedTimeSingleDay(project, new Date('2026-11-14'), new Date('2026-11-14'));
    assert.equal(app.queries.some(q => q.table === 'daily_logged_time'), false);
    assert.equal(operation(app.queries.find(q => q.table === 'sync_logs').operations, 'insert')[1].status, 'failed');
    const alerts = app.queries.filter(q => q.table === 'error_logs' && operation(q.operations, 'insert'));
    assert.equal(alerts.length, 1);
    assert.equal(operation(alerts[0].operations, 'insert')[1].error_type, 'sync_hours_failure');
});

test('queue HTTP 500 is never silently accepted as an empty day', async () => {
    const app = harness({ post: () => { throw Object.assign(new Error('HTTP 500'), { response: { status: 500 } }); } });
    const result = await app.syncLoggedTimeDay(project, new Date('2026-11-14'), false);
    assert.equal(result.outcome, 'error');
    assert.equal(app.requests.length, 3);
});

test('explicit queue SOAP 404 means no data only when there are no calls', async () => {
    const app = harness({ post: () => { throw Object.assign(new Error('HTTP 500'), { response: {
        status: 500, data: { Envelope: { Body: { Fault: { faultcode: '404', faultstring: 'Geen resultaten gevonden' } } } },
    } }); } });
    assert.equal((await app.syncLoggedTimeDay(project, new Date('2026-11-15'), false)).outcome, 'nodata');
    assert.equal(app.requests.length, 1);
    assert.equal((await app.syncLoggedTimeDay(project, new Date('2026-11-15'), true)).outcome, 'error');
    assert.equal(app.requests.length, 2);
});

test('admin alerts are throttled, and preview runs do not raise them', async () => {
    const app = harness({ query: table => ({ data: table === 'error_logs' ? [{ id: 'existing' }] : [], error: null }) });
    const outcome = { status: 'failed', savedDays: 0, expectedDays: 1, failedDays: 1, message: 'Test' };
    await app.logLoggedTimeSync(project, new Date(), new Date(), outcome);
    assert.equal(app.queries.some(q => q.table === 'error_logs' && operation(q.operations, 'insert')), false);
    app.queries.length = 0;
    await app.logLoggedTimeSync(project, new Date(), new Date(), { ...outcome, isFinalForDay: false });
    assert.equal(app.queries.some(q => q.table === 'error_logs'), false);
});

test('historical hours scan paginates beyond the first 1000 calls', async () => {
    const app = harness({ query: (table, ops) => ({ data: operation(ops, 'range')[1] === 0
        ? Array.from({ length: 1000 }, () => ({ beldatum_date: '2026-09-15' }))
        : [{ beldatum_date: '2026-11-14' }], error: null }) });
    assert.deepEqual([...(await app.getActiveCallDays('sligro', '2026-09-15', '2026-11-14'))], ['2026-09-15', '2026-11-14']);
    assert.equal(app.queries.length, 2);
});

test('a failed admin-alert lookup does not interrupt synchronization', async () => {
    const app = harness({ query: table => {
        if (table === 'error_logs') throw new Error('Connection interrupted');
        return { data: [], error: null };
    } });
    await app.logLoggedTimeSync(project, new Date(), new Date(), {
        status: 'failed', savedDays: 0, expectedDays: 1, failedDays: 1, message: 'Test',
    });
    assert.equal(app.queries.filter(q => q.table === 'sync_logs').length, 1);
});

test('hours retry detects gaps independently of record-sync success and respects corrections', async () => {
    const app = harness({ query: table => ({ data: table === 'call_records'
        ? ['09', '10', '11', '12', '13', '14'].map(d => ({ beldatum_date: `2026-11-${d}` }))
        : [
            { date: '2026-11-11', total_seconds: 560, corrected_seconds: 10800 },
            { date: '2026-11-12', total_seconds: 9956, corrected_seconds: null },
            { date: '2026-11-13', total_seconds: 4770, corrected_seconds: 0 },
        ], error: null }) });
    vm.runInContext("getNowAmsterdam = () => new Date('2026-11-16T12:00:00+01:00')", app.context);
    const days = await app.getMissedLoggedTimeDays(project);
    assert.deepEqual(Array.from(days, d => d.getDate()), [14, 10, 9]);
    assert.equal(app.queries.some(q => q.table === 'sync_logs'), false);
});

test('backfill is read-only by default and refuses invalid or unfinished dates', async () => {
    const app = harness();
    const sandbox = { module: { exports: {} }, process: { argv: [] }, console: { log() {} },
        require: name => name === './sync.js' ? app.exports : require(name) };
    vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../backfill-hours.js'), 'utf8'), sandbox);
    const { parseOptions } = sandbox.module.exports;
    const args = ['--project=870', '--from=2026-09-15', '--to=2026-11-14'];
    assert.equal(parseOptions(args).apply, undefined);
    assert.equal(parseOptions([...args, '--apply']).apply, true);
    assert.throws(() => parseOptions(['--project=870', '--from=2026-02-30', '--to=2026-11-14']), /datum/);
    assert.throws(() => parseOptions(['--project=870', '--from=2026-11-14', '--to=2099-01-01']), /afgesloten periode/);
    assert.throws(() => parseOptions([...args, '--unexpected']), /Onbekend argument/);
    assert.equal(app.queries.length, 0);
});
