// Controleert of de database en de frontend dezelfde resultaatcodes als "ingedeeld"
// beschouwen: quality_result_is_mapped() (SQL) versus classifyResultCoverage() (TS).
//
// WAAROM: beide kanten hebben een eigen kopie van dezelfde standaardlijsten
// (statsHelpers.ts en quality_result_defaults()). Toen ze uiteenliepen meldde het
// admin-dashboard 251 van de 344 codes onterecht als "onbekend" (23-07-2026).
// Draai dit na elke wijziging aan een van beide lijsten.
//
// Draaien:
//   SUPABASE_URL=... SUPABASE_SERVICE_KEY=... npx vite-node scripts/check-quality-parity.mjs
// (service key nodig: de check leest álle projecten, ook zonder ingelogde gebruiker.
//  Dezelfde waarden als in /opt/basicall-sync/.env op de VPS.)
//
// Exit-code 1 bij afwijkingen, zodat het ook in CI kan.
import { createClient } from '@supabase/supabase-js';
import { classifyResultCoverage } from '../src/lib/statsHelpers.ts';

const { SUPABASE_URL, SUPABASE_SERVICE_KEY } = process.env;
if (!SUPABASE_URL || !SUPABASE_SERVICE_KEY) {
  console.error('Zet SUPABASE_URL en SUPABASE_SERVICE_KEY in de omgeving.');
  process.exit(2);
}
const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_KEY);

const { data: projects, error } = await supabase
  .from('projects').select('id, basicall_project_id, project_type, mapping_config');
if (error) { console.error(error.message); process.exit(2); }

let checked = 0;
const mismatches = [];

for (const p of projects) {
  const { data: rows, error: rErr } = await supabase
    .rpc('get_project_result_distribution', { p_project_id: p.id });
  if (rErr) { console.error(`RPC-fout ${p.basicall_project_id}: ${rErr.message}`); continue; }

  for (const { resultaat } of rows ?? []) {
    if (!resultaat?.trim()) continue;
    const ts = classifyResultCoverage(resultaat, p.mapping_config ?? {}, p.project_type) !== 'todo';
    const { data: sql, error: fErr } = await supabase.rpc('quality_result_is_mapped', {
      p_config: p.mapping_config ?? {}, p_project_type: p.project_type, p_resultaat: resultaat,
    });
    if (fErr) { console.error(`fn-fout: ${fErr.message}`); continue; }
    checked++;
    if (ts !== sql) mismatches.push({ bc: p.basicall_project_id, type: p.project_type, resultaat, ts, sql });
  }
}

console.log(`${checked} (project, resultaatcode)-combinaties gecontroleerd.`);
if (!mismatches.length) {
  console.log('PARITEIT OK — SQL en TypeScript geven overal hetzelfde antwoord.');
  process.exit(0);
}
console.log(`${mismatches.length} AFWIJKINGEN:`);
for (const m of mismatches) {
  console.log(`  ${m.bc} (${m.type}) "${m.resultaat}" -> TS ingedeeld=${m.ts}, SQL ingedeeld=${m.sql}`);
}
process.exit(1);
