// Controleert of de frontend en de database hetzelfde bedrag lezen uit ruwe BasiCall-invoer:
// parseDutchFloat() (src/lib/dataProcessing.ts) versus public.parse_amount_text() (SQL).
//
// WAAROM: de KPI-kaart rekent via de RPC get_project_annual_value, matrix en Excel-export
// rekenen client-side. Lopen de parsers uiteen, dan toont dezelfde campagne twee bedragen.
// Op 29-07-2026 gebeurde dat: een agent typte "5,.00" bij PDV Diepe reactivatie. De SQL-kant
// castte "5..00" naar numeric, dat gooide een fout, en de blanket EXCEPTION-vanger van
// get_project_annual_value maakte er €0,00 van voor de HELE campagne — week 31 én jaartotaal.
// De client las gewoon 5. Draai dit script na elke wijziging aan een van beide parsers.
//
// Draaien:
//   npx vite-node scripts/check-amount-parity.mjs
//
// Exit-code 1 bij afwijkingen, zodat het ook in CI kan.
//
// De verwachte waarden zijn de uitkomst van public.parse_amount_text() op de 581 unieke
// bedragwaarden die op 29-07-2026 in call_records stonden. Alles wat afwijkend geschreven
// was staat hieronder; de rest is een dwarsdoorsnede van normale waarden. null = "geen
// getal": SQL geeft dan NULL (valt door naar de volgende kolom), de client 0.
import { parseDutchFloat } from '../src/lib/dataProcessing.ts';

const CASES = [
  // --- Echte tikfouten uit BasiCall ---
  ['5,.00', 5],
  ['20,.00', 20],
  ['10.,00', 10],
  ['5.,00', 5],
  ['3.,00', 3],
  ['6,,00', 6],
  [',20,00', 20],
  ['5`,00', 5],
  ['5euro', 5],
  ['15 ,00', 15],
  ['5 ,00', 5],
  ['5,00 ', 5],
  ['10,00  ', 10],
  ['10,', 10],
  ['15,', 15],
  ['50,', 50],
  ['25,0', 25],
  ['10,000', 10],
  ['5,000', 5],
  ['15,000', 15],
  // --- Drijvende-komma-ruis uit het bronsysteem ---
  ['13,720000000000001', 13.72],
  ['18,469999999999999', 18.47],
  ['29,170000000000002', 29.17],
  ['6,2999999999999998', 6.3],
  ['8,3300000000000001', 8.33],
  ['15,880000000000001', 15.88],
  // --- Geen bedrag ---
  ['n.v.t.', null],
  ['nvt', null],
  ['', null],
  ['abc', null],
  [null, null],
  [undefined, null],
  // --- Gewone waarden, beide notaties ---
  ['0.00', 0],
  ['0.01', 0.01],
  ['1', 1],
  ['1,00', 1],
  ['10.00', 10],
  ['10,00', 10],
  ['12,50', 12.5],
  ['100,00', 100],
  ['1000.00', 1000],
  ['1150.00', 1150],
  ['2533,58', 2533.58],
  ['9.99', 9.99],
  [42, 42],
  [0, 0],
  // --- Scheidingstekens: de rechtse is de decimaal ---
  ['1.234,56', 1234.56],
  ['1,234.56', 1234.56],
  ['€ 12,50', 12.5],
  ['-7,50', -7.5],
];

let failures = 0;
for (const [input, expected] of CASES) {
  const actual = parseDutchFloat(input);
  const want = expected ?? 0;
  // Marge tegen drijvende-komma-ruis; bedragen zijn nooit fijner dan centen.
  if (!Number.isFinite(actual) || Math.abs(actual - want) > 0.005) {
    failures += 1;
    console.error(`✗ ${JSON.stringify(input)}: client ${actual}, database ${want}`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} van de ${CASES.length} bedragen worden verschillend gelezen.`);
  process.exit(1);
}
console.log(`✓ ${CASES.length} bedragen: frontend en database lezen hetzelfde getal.`);
