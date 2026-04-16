import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Nederlandse steden voor geografische spreiding
const CITIES = [
  'Amsterdam', 'Rotterdam', 'Den Haag', 'Utrecht', 'Eindhoven',
  'Tilburg', 'Groningen', 'Almere', 'Breda', 'Nijmegen',
  'Apeldoorn', 'Haarlem', 'Arnhem', 'Enschede', 'Amersfoort',
  'Zaanstad', 'Haarlemmermeer', 'Zwolle', 'Leiden', 'Maastricht'
];

// Resultaat types met distributie
const RESULT_TYPES = {
  sales: [
    { name: 'Maandelijks', freq: 'maand', amounts: [5, 7.5, 10, 12.5, 15, 20, 25] },
    { name: 'Jaarlijks', freq: 'jaar', amounts: [50, 75, 100, 120, 150] },
    { name: 'Eenmalig', freq: 'eenmalig', amounts: [10, 15, 20, 25, 50] },
  ],
  negative_reasoned: [
    { name: 'Financiele reden', reasons: ['Geen geld momenteel', 'Te hoge lasten', 'Werkloos'] },
    { name: 'Ander goed doel', reasons: ['Geeft al aan ander doel', 'Steunt lokale stichting'] },
    { name: 'Geen interesse', reasons: ['Niet geïnteresseerd', 'Wil niet gebeld worden'] },
  ],
  negative_unreasoned: [
    { name: 'Geen gehoor', reasons: [] },
    { name: 'Voicemail/antwoordapparaat', reasons: [] },
    { name: 'Max. belpogingen bereikt', reasons: [] },
  ],
  other: [
    { name: 'Terugbelafspraak', reasons: ['Bel volgende week terug'] },
    { name: 'Niet bereikbaar', reasons: [] },
    { name: 'Nummer onjuist', reasons: [] },
  ]
};

// Helper functies
function randomChoice<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}

function randomInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatAmount(amount: number): string {
  return amount.toFixed(2).replace('.', ',');
}

function generateTime(): string {
  const hour = randomInt(9, 20);
  const minute = randomInt(0, 59);
  const second = randomInt(0, 59);
  return `${hour.toString().padStart(2, '0')}:${minute.toString().padStart(2, '0')}:${second.toString().padStart(2, '0')}`;
}

function generateDemoRecords(projectId: string): any[] {
  const records: any[] = [];
  let recordId = 900000; // Start met hoog nummer om conflicten te voorkomen
  
  // Genereer data voor weken 2-6 van 2026
  const weeks = [
    { week: 2, startDate: new Date('2026-01-05'), records: 40 },
    { week: 3, startDate: new Date('2026-01-12'), records: 45 },
    { week: 4, startDate: new Date('2026-01-19'), records: 42 },
    { week: 5, startDate: new Date('2026-01-26'), records: 38 },
    { week: 6, startDate: new Date('2026-02-02'), records: 35 },
  ];

  for (const weekData of weeks) {
    const { week, startDate, records: recordCount } = weekData;
    
    // Distributie per week: 25% sales, 35% neg reasoned, 15% neg unreasoned, 25% other
    const salesCount = Math.round(recordCount * 0.25);
    const negReasonedCount = Math.round(recordCount * 0.35);
    const negUnreasonedCount = Math.round(recordCount * 0.15);
    const otherCount = recordCount - salesCount - negReasonedCount - negUnreasonedCount;

    // Sales records
    for (let i = 0; i < salesCount; i++) {
      const saleType = randomChoice(RESULT_TYPES.sales);
      const amount = randomChoice(saleType.amounts);
      const dayOffset = randomInt(0, 4); // Ma-Vr
      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);
      
      records.push({
        basicall_record_id: recordId++,
        project_id: projectId,
        beldatum: date.toISOString().split('T')[0],
        beltijd: generateTime(),
        gesprekstijd_sec: randomInt(120, 600), // Sales gesprekken zijn langer
        resultaat: saleType.name,
        week_number: week,
        raw_data: {
          termijnbedrag: formatAmount(amount),
          frequentie: saleType.freq,
          bc_belpogingen: randomInt(1, 4),
          woonplaats: randomChoice(CITIES),
          bc_agentnaam: 'Demo Agent',
          bc_result_naam: saleType.name,
        }
      });
    }

    // Negatief met reden
    for (let i = 0; i < negReasonedCount; i++) {
      const negType = randomChoice(RESULT_TYPES.negative_reasoned);
      const dayOffset = randomInt(0, 4);
      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);
      
      records.push({
        basicall_record_id: recordId++,
        project_id: projectId,
        beldatum: date.toISOString().split('T')[0],
        beltijd: generateTime(),
        gesprekstijd_sec: randomInt(60, 300),
        resultaat: negType.name,
        week_number: week,
        raw_data: {
          opzegreden: randomChoice(negType.reasons),
          bc_belpogingen: randomInt(1, 5),
          woonplaats: randomChoice(CITIES),
          bc_agentnaam: 'Demo Agent',
          bc_result_naam: negType.name,
        }
      });
    }

    // Negatief zonder reden
    for (let i = 0; i < negUnreasonedCount; i++) {
      const negType = randomChoice(RESULT_TYPES.negative_unreasoned);
      const dayOffset = randomInt(0, 4);
      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);
      
      records.push({
        basicall_record_id: recordId++,
        project_id: projectId,
        beldatum: date.toISOString().split('T')[0],
        beltijd: generateTime(),
        gesprekstijd_sec: randomInt(0, 30), // Kort of geen gesprek
        resultaat: negType.name,
        week_number: week,
        raw_data: {
          bc_belpogingen: randomInt(3, 6), // Meer pogingen voor geen gehoor
          woonplaats: randomChoice(CITIES),
          bc_agentnaam: 'Demo Agent',
          bc_result_naam: negType.name,
        }
      });
    }

    // Overig
    for (let i = 0; i < otherCount; i++) {
      const otherType = randomChoice(RESULT_TYPES.other);
      const dayOffset = randomInt(0, 4);
      const date = new Date(startDate);
      date.setDate(date.getDate() + dayOffset);
      
      records.push({
        basicall_record_id: recordId++,
        project_id: projectId,
        beldatum: date.toISOString().split('T')[0],
        beltijd: generateTime(),
        gesprekstijd_sec: randomInt(30, 180),
        resultaat: otherType.name,
        week_number: week,
        raw_data: {
          bc_belpogingen: randomInt(1, 4),
          woonplaats: randomChoice(CITIES),
          bc_agentnaam: 'Demo Agent',
          bc_result_naam: otherType.name,
          ...(otherType.reasons.length > 0 && { opmerking: randomChoice(otherType.reasons) }),
        }
      });
    }
  }

  return records;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify admin role
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const { data: roleData } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .single();

    if (!roleData || (roleData.role !== 'admin' && roleData.role !== 'superadmin')) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('Starting demo data seed...');

    // 1. Check of demo project al bestaat
    const { data: existingProject } = await supabaseAdmin
      .from('projects')
      .select('id')
      .eq('project_key', 'demo')
      .single();

    let projectId: string;

    if (existingProject) {
      projectId = existingProject.id;
      console.log('Demo project exists, clearing existing demo records...');
      
      // Verwijder bestaande demo records
      const { error: deleteError } = await supabaseAdmin
        .from('call_records')
        .delete()
        .eq('project_id', projectId);
      
      if (deleteError) {
        console.error('Error deleting existing records:', deleteError);
      }
    } else {
      // 2. Maak demo project aan
      console.log('Creating demo project...');
      const { data: newProject, error: projectError } = await supabaseAdmin
        .from('projects')
        .insert({
          name: 'Demo Campagne',
          project_key: 'demo',
          basicall_project_id: 0,
          hourly_rate: 35.00,
          vat_rate: 21,
          project_type: 'outbound',
          is_active: true,
          mapping_config: {
            amount_col: 'termijnbedrag',
            freq_col: 'frequentie',
            reason_col: 'opzegreden',
            freq_map: {
              maand: 12, maandelijks: 12, mnd: 12, m: 12,
              kwartaal: 4, k: 4,
              jaar: 1, jaarlijks: 1, j: 1,
              eenmalig: 1, e: 1
            },
            sale_results: ['Maandelijks', 'Jaarlijks', 'Eenmalig', 'Sale', 'Donateur'],
            negative_reasoned: ['Financiele reden', 'Ander goed doel', 'Geen interesse'],
            negative_unreasoned: ['Geen gehoor', 'Voicemail/antwoordapparaat', 'Max. belpogingen bereikt']
          }
        })
        .select('id')
        .single();

      if (projectError) {
        console.error('Project creation error:', projectError);
        return new Response(
          JSON.stringify({ error: 'Failed to create demo project', details: projectError.message }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      projectId = newProject.id;
    }

    console.log(`Demo project ID: ${projectId}`);

    // 3. Genereer en insert demo records
    const demoRecords = generateDemoRecords(projectId);
    console.log(`Generated ${demoRecords.length} demo records`);

    // Insert in batches van 50
    const batchSize = 50;
    let insertedCount = 0;

    for (let i = 0; i < demoRecords.length; i += batchSize) {
      const batch = demoRecords.slice(i, i + batchSize);
      const { error: insertError } = await supabaseAdmin
        .from('call_records')
        .insert(batch);

      if (insertError) {
        console.error(`Batch insert error at ${i}:`, insertError);
        return new Response(
          JSON.stringify({ 
            error: 'Failed to insert demo records', 
            details: insertError.message,
            inserted: insertedCount 
          }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      insertedCount += batch.length;
    }

    console.log(`Successfully seeded ${insertedCount} demo records`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        projectId,
        recordsCreated: insertedCount,
        message: `Demo project '${existingProject ? 'refreshed' : 'created'}' met ${insertedCount} call records`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error', details: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
