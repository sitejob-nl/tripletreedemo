import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

/**
 * seed-demo-data — vult het demoproject (project_key = 'demo') met 100% verzonnen
 * data zodat het gedeeld kan worden met potentiele klanten.
 *
 * Alles wat deze functie schrijft is mock: verzonnen resultaatcodes, bedragen,
 * plaatsnamen en agentnamen. Er wordt NOOIT data van een echt project gelezen of
 * gekopieerd, en elke schrijf-/verwijderactie is hard gescoped op het project met
 * project_key = 'demo'.
 *
 * Verschil met de oude versie:
 *  - datums zijn RELATIEF (laatste N weken t/m gisteren) i.p.v. hardcoded week 2-6 2026,
 *    zodat een demo altijd "recent" oogt zonder terugbladeren;
 *  - vult ook daily_logged_time (uren/kosten/investering) en batches (voorraad-KPI);
 *  - zet het project actief + reporting_state 'live' + report_template 'outbound_standard';
 *  - koppelt het demo-account automatisch aan het project.
 *
 * Embargo: klanten zien dag D pas vanaf 09:00 op D+1 (RLS). We genereren daarom
 * t/m gisteren; vóór 09:00 ziet het demo-account de laatste dag nog niet. Dat is
 * bewust — het demoaccount gedraagt zich exact als een echte klant.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const DEMO_PROJECT_KEY = 'demo';
const DEMO_EMAIL = 'demo@tripletree.nl';
const DEMO_BASICALL_PROJECT_ID = 0;
const RECORD_ID_OFFSET = 900000;
const DEFAULT_WEEKS = 10;
const HOURLY_RATE = 35.0;
const BATCH_TOTAL = 25000;

// Verzonnen geografische spreiding — voedt de kaart op het dashboard.
const CITIES = [
  'Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven',
  'Tilburg', 'Groningen', 'Almere', 'Breda', 'Nijmegen',
  'Apeldoorn', 'Haarlem', 'Arnhem', 'Enschede', 'Amersfoort',
  'Zwolle', 'Leiden', 'Maastricht', 'Venlo', 'Alkmaar',
];

// Verzonnen agenten (geen echte medewerkers).
const AGENTS = ['Demo Agent 1', 'Demo Agent 2', 'Demo Agent 3', 'Demo Agent 4'];

// Resultaatcodes zijn zo gekozen dat ze in de bestaande categorisatie van
// statsHelpers.ts vallen (sale / argumentated / unreachable), zodat netto-conversie,
// contacten-per-uur en de unmapped-codes-kaart kloppen zonder extra config.
const SALE_TYPES = [
  { name: 'Machtiging per Maand', freq: 'maand', amounts: [5, 7.5, 10, 12.5, 15], weight: 55 },
  { name: 'Machtiging per Kwartaal', freq: 'kwartaal', amounts: [15, 20, 25, 30], weight: 15 },
  { name: 'Machtiging per Jaar', freq: 'jaar', amounts: [50, 60, 75, 100, 120], weight: 20 },
  { name: 'Eenmalige gift', freq: 'eenmalig', amounts: [10, 15, 20, 25, 50], weight: 10 },
];

const NEGATIVE_REASONED = [
  { name: 'Financiele reden', reasons: ['Geen geld momenteel', 'Te hoge lasten', 'Tijdelijk zonder werk'] },
  { name: 'Geen interesse', reasons: ['Niet geinteresseerd', 'Wil niet gebeld worden'] },
  { name: 'Ander goed doel', reasons: ['Steunt al een ander doel', 'Geeft aan lokale stichting'] },
  { name: 'Steunt al te veel goede doelen', reasons: ['Heeft al vier machtigingen lopen'] },
];

const UNREACHABLE = [
  { name: 'Geen gehoor', share: 40 },
  { name: 'Voicemail/antwoordapparaat', share: 25 },
  { name: 'Max. belpogingen bereikt', share: 20 },
  { name: 'Foutief telefoonnummer', share: 10 },
  { name: 'Terugbelafspraak', share: 5 },
];

const OTHER = [
  { name: 'Al donateur', reasons: ['Geeft al maandelijks'] },
  { name: 'Overleden', reasons: [] },
];

// Mapping-config die exact past bij de bovenstaande verzonnen codes.
const DEMO_MAPPING_CONFIG = {
  amount_col: 'termijnbedrag',
  freq_col: 'frequentie',
  reason_col: 'opzegreden',
  freq_map: {
    maand: 12, maandelijks: 12, mnd: 12, m: 12,
    kwartaal: 4, k: 4,
    halfjaar: 2,
    jaar: 1, jaarlijks: 1, j: 1,
    eenmalig: 1, e: 1,
  },
  sale_results: [
    'Machtiging per Maand',
    'Machtiging per Kwartaal',
    'Machtiging per Jaar',
    'Eenmalige gift',
  ],
  negative_argumentated: NEGATIVE_REASONED.map(n => n.name),
  negative_not_argumentated: ['Al donateur', 'Overleden'],
  unreachable_results: UNREACHABLE.map(u => u.name),
};

// ── helpers ────────────────────────────────────────────────────────────────

function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function weightedChoice<T extends { weight?: number; share?: number }>(arr: T[]): T {
  const total = arr.reduce((sum, item) => sum + (item.weight ?? item.share ?? 1), 0);
  let roll = Math.random() * total;
  for (const item of arr) {
    roll -= (item.weight ?? item.share ?? 1);
    if (roll <= 0) return item;
  }
  return arr[arr.length - 1];
}

function formatAmount(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

function generateTime(): string {
  const hour = randomInt(9, 20);
  return `${String(hour).padStart(2, '0')}:${String(randomInt(0, 59)).padStart(2, '0')}:${String(randomInt(0, 59)).padStart(2, '0')}`;
}

/** Vandaag in Europe/Amsterdam, als UTC-middernacht zodat datum-rekenwerk simpel blijft. */
function todayInAmsterdam(): Date {
  const iso = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric', month: '2-digit', day: '2-digit',
  }).format(new Date());
  return new Date(`${iso}T00:00:00Z`);
}

function addDays(date: Date, days: number): Date {
  const next = new Date(date.getTime());
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

function toISODate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** ISO-weeknummer (maandag als eerste dag), mirror van wat de sync schrijft. */
function isoWeek(date: Date): number {
  const target = new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));
  const dayNum = (target.getUTCDay() + 6) % 7;
  target.setUTCDate(target.getUTCDate() - dayNum + 3);
  const firstThursday = new Date(Date.UTC(target.getUTCFullYear(), 0, 4));
  const firstDayNum = (firstThursday.getUTCDay() + 6) % 7;
  firstThursday.setUTCDate(firstThursday.getUTCDate() - firstDayNum + 3);
  return 1 + Math.round((target.getTime() - firstThursday.getTime()) / (7 * 24 * 3600 * 1000));
}

// ── generator ──────────────────────────────────────────────────────────────

interface DemoDay {
  date: Date;
  records: Record<string, unknown>[];
  loggedSeconds: number;
}

/**
 * Bouwt de belweken op: alleen ma-vr, laatste `weeks` weken t/m gisteren.
 * De sale-ratio loopt licht op over de weken zodat de weekvergelijking in het
 * dashboard een herkenbare (positieve) trend laat zien.
 */
function generateDemoDays(projectId: string, weeks: number): DemoDay[] {
  const end = addDays(todayInAmsterdam(), -1);
  const start = addDays(end, -(weeks * 7 - 1));
  const totalDays = weeks * 7;
  const days: DemoDay[] = [];
  let recordId = RECORD_ID_OFFSET;

  for (let offset = 0; offset < totalDays; offset++) {
    const date = addDays(start, offset);
    const weekday = date.getUTCDay();
    if (weekday === 0 || weekday === 6) continue; // geen weekendshifts in de demo

    const progress = offset / Math.max(totalDays - 1, 1); // 0 → 1 over de periode

    // Verhoudingen zijn gekalibreerd op de echte campagnes in productie (juli 2026):
    // 86-91% van de gebelde records is niet-bereikt (geen gehoor, voicemail, max.
    // belpogingen), en van de wél bereikte contacten wordt 15-22% een sale. Dat geeft
    // een netto-conversie in dezelfde orde als ANBO/KIA/STC. Met een lagere
    // onbereikbaar-quote zou de demo onrealistisch gunstig ogen.
    const dayRecords = randomInt(170, 240);
    const unreachableCount = Math.round(dayRecords * (0.86 + Math.random() * 0.05));
    const contacts = dayRecords - unreachableCount;

    const saleRate = 0.15 + progress * 0.07 + (Math.random() - 0.5) * 0.04;
    const salesCount = Math.max(1, Math.round(contacts * saleRate));
    const negativeCount = Math.round((contacts - salesCount) * 0.82);
    const otherCount = Math.max(0, contacts - salesCount - negativeCount);

    const isoDate = toISODate(date);
    const week = isoWeek(date);
    const records: Record<string, unknown>[] = [];

    const baseRecord = (resultaat: string, gesprekstijd: number, extra: Record<string, unknown>) => ({
      basicall_record_id: recordId++,
      project_id: projectId,
      beldatum: isoDate,
      beltijd: generateTime(),
      gesprekstijd_sec: gesprekstijd,
      resultaat,
      week_number: week,
      raw_data: {
        bc_result_naam: resultaat,
        bc_belpogingen: randomInt(1, 5),
        woonplaats: randomChoice(CITIES),
        bc_agentnaam: randomChoice(AGENTS),
        ...extra,
      },
    });

    for (let i = 0; i < salesCount; i++) {
      const sale = weightedChoice(SALE_TYPES);
      records.push(baseRecord(sale.name, randomInt(150, 620), {
        termijnbedrag: formatAmount(randomChoice(sale.amounts)),
        frequentie: sale.freq,
      }));
    }

    for (let i = 0; i < negativeCount; i++) {
      const negative = randomChoice(NEGATIVE_REASONED);
      records.push(baseRecord(negative.name, randomInt(45, 260), {
        opzegreden: randomChoice(negative.reasons),
      }));
    }

    for (let i = 0; i < unreachableCount; i++) {
      const type = weightedChoice(UNREACHABLE);
      records.push(baseRecord(type.name, randomInt(0, 25), {}));
    }

    for (let i = 0; i < otherCount; i++) {
      const other = randomChoice(OTHER);
      records.push(baseRecord(other.name, randomInt(30, 150), {
        ...(other.reasons.length > 0 && { opzegreden: randomChoice(other.reasons) }),
      }));
    }

    // Ureninzet zo afgeleid dat "bereikte gesprekken per uur" rond 3,5-4,5 uitkomt —
    // hetzelfde bereik als de echte outbound-campagnes.
    const contactsPerHour = 3.5 + Math.random();
    const loggedSeconds = Math.round((contacts / contactsPerHour) * 3600);

    days.push({ date, records, loggedSeconds });
  }

  return days;
}

// ── handler ────────────────────────────────────────────────────────────────

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const json = (body: unknown, status = 200) =>
    new Response(JSON.stringify(body), {
      status,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // ── admin-check ─────────────────────────────────────────────────────────
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return json({ error: 'Authorization required' }, 401);
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return json({ error: 'Unauthorized' }, 401);
    }

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || (roleData.role !== 'admin' && roleData.role !== 'superadmin')) {
      return json({ error: 'Admin access required' }, 403);
    }

    let weeks = DEFAULT_WEEKS;
    try {
      const body = await req.json();
      if (body && typeof body.weeks === 'number') {
        weeks = Math.min(26, Math.max(2, Math.round(body.weeks)));
      }
    } catch {
      // geen body meegegeven → default
    }

    console.log(`Seeding demo data (${weeks} weken) op verzoek van ${user.id}`);

    // ── 1. demoproject ophalen of aanmaken ─────────────────────────────────
    const { data: existingProject, error: lookupError } = await supabaseAdmin
      .from('projects')
      .select('id, project_key')
      .eq('project_key', DEMO_PROJECT_KEY)
      .maybeSingle();

    if (lookupError) {
      console.error('Project lookup error:', lookupError);
      return json({ error: 'Demoproject kon niet opgezocht worden', details: lookupError.message }, 500);
    }

    const projectFields = {
      name: 'Demo Campagne',
      project_key: DEMO_PROJECT_KEY,
      basicall_project_id: DEMO_BASICALL_PROJECT_ID,
      hourly_rate: HOURLY_RATE,
      vat_rate: 21,
      project_type: 'outbound',
      report_template: 'outbound_standard',
      // BEWUST 'paused', niet 'live': de nachtsync selecteert op
      // is_active = true AND reporting_state = 'live'. Zou de demo 'live' staan, dan
      // probeert de VPS elke nacht BasiCall-project 0 te syncen → gegarandeerde
      // failures + persistent-failure-alerts. 'paused' is voor de klant onzichtbaar
      // (het label staat alleen in de admin-projectlijst).
      reporting_state: 'paused',
      is_active: true,
      total_to_call: BATCH_TOTAL,
      mapping_config: DEMO_MAPPING_CONFIG,
    };

    let projectId: string;

    if (existingProject) {
      projectId = existingProject.id;
      const { error: updateError } = await supabaseAdmin
        .from('projects')
        .update(projectFields)
        .eq('id', projectId)
        .eq('project_key', DEMO_PROJECT_KEY); // veiligheidsslot: nooit een echt project raken

      if (updateError) {
        console.error('Project update error:', updateError);
        return json({ error: 'Demoproject kon niet bijgewerkt worden', details: updateError.message }, 500);
      }
    } else {
      const { data: newProject, error: insertError } = await supabaseAdmin
        .from('projects')
        .insert(projectFields)
        .select('id')
        .single();

      if (insertError || !newProject) {
        console.error('Project creation error:', insertError);
        return json({ error: 'Demoproject kon niet aangemaakt worden', details: insertError?.message }, 500);
      }
      projectId = newProject.id;
    }

    // ── 2. oude demodata wissen (alleen dit project) ───────────────────────
    for (const table of ['call_records', 'daily_logged_time', 'batches']) {
      const { error: deleteError } = await supabaseAdmin.from(table).delete().eq('project_id', projectId);
      if (deleteError) {
        console.error(`Delete error op ${table}:`, deleteError);
        return json({ error: `Bestaande demodata in ${table} kon niet gewist worden`, details: deleteError.message }, 500);
      }
    }

    // ── 3. genereren + wegschrijven ────────────────────────────────────────
    const days = generateDemoDays(projectId, weeks);
    const records = days.flatMap(day => day.records);

    const chunkSize = 500;
    for (let i = 0; i < records.length; i += chunkSize) {
      const { error: recordError } = await supabaseAdmin
        .from('call_records')
        .insert(records.slice(i, i + chunkSize));

      if (recordError) {
        console.error(`Insert error bij record ${i}:`, recordError);
        return json({ error: 'Demo-records konden niet weggeschreven worden', details: recordError.message, inserted: i }, 500);
      }
    }

    const loggedTime = days.map(day => ({
      project_id: projectId,
      date: toISODate(day.date),
      total_seconds: day.loggedSeconds,
      synced_at: new Date().toISOString(),
    }));

    const { error: timeError } = await supabaseAdmin.from('daily_logged_time').insert(loggedTime);
    if (timeError) {
      console.error('Logged time insert error:', timeError);
      return json({ error: 'Demo-uren konden niet weggeschreven worden', details: timeError.message }, 500);
    }

    // ── 4. voorraad-KPI ────────────────────────────────────────────────────
    const handled = records.length;
    const { error: batchError } = await supabaseAdmin.from('batches').insert({
      project_id: projectId,
      basicall_batch_id: 1,
      name: 'Demo bestand 2026',
      status: 1,
      total: BATCH_TOTAL,
      handled, // `remaining` is een generated column — niet zelf invullen
      last_synced_at: new Date().toISOString(),
    });

    if (batchError) {
      console.error('Batch insert error:', batchError);
      return json({ error: 'Demo-batch kon niet weggeschreven worden', details: batchError.message }, 500);
    }

    // ── 5. demo-account koppelen (self-healing) ────────────────────────────
    let demoUserLinked = false;
    const { data: userList } = await supabaseAdmin.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const demoUser = userList?.users?.find(u => u.email?.toLowerCase() === DEMO_EMAIL);

    if (demoUser) {
      const { error: linkError } = await supabaseAdmin
        .from('customer_projects')
        .upsert({ user_id: demoUser.id, project_id: projectId }, { onConflict: 'user_id,project_id' });
      demoUserLinked = !linkError;
      if (linkError) console.error('Koppeling demo-account mislukt:', linkError);
    }

    const firstDay = days[0]?.date;
    const lastDay = days[days.length - 1]?.date;

    console.log(`Demo geseed: ${records.length} records, ${days.length} beldagen`);

    return json({
      success: true,
      projectId,
      weeks,
      recordsCreated: records.length,
      daysCreated: days.length,
      periodStart: firstDay ? toISODate(firstDay) : null,
      periodEnd: lastDay ? toISODate(lastDay) : null,
      demoUserLinked,
      demoEmail: DEMO_EMAIL,
      message: `Demoproject gevuld met ${records.length} verzonnen records over ${days.length} beldagen.`,
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return json({ error: 'Internal server error', details: String(error) }, 500);
  }
});
