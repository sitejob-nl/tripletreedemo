import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface BasiCallRecord {
  record_id: number;
  beldatum: string;
  beltijd: string;
  gesprekstijd_sec: number;
  resultaat: string;
  [key: string]: any;
}

interface Project {
  id: string;
  name: string;
  basicall_project_id: number;
  basicall_token: string;
  mapping_config: any;
}

// Helper functie om Europees datumformaat (dd-mm-yyyy) naar ISO (yyyy-mm-dd) te converteren
const convertEuropeanToISO = (dateStr: string | null): string | null => {
  if (!dateStr) return null;
  
  // Check of het al ISO formaat is (yyyy-mm-dd)
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return dateStr;
  }
  
  // Converteer van dd-mm-yyyy naar yyyy-mm-dd
  const parts = dateStr.split('-');
  if (parts.length === 3 && parts[0].length <= 2) {
    const [day, month, year] = parts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  // Probeer andere scheidingstekens (bijv. /)
  const slashParts = dateStr.split('/');
  if (slashParts.length === 3 && slashParts[0].length <= 2) {
    const [day, month, year] = slashParts;
    return `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  }
  
  console.warn(`Could not parse date format: ${dateStr}`);
  return dateStr; // Return original als we het niet kunnen parsen
};

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const { project_id, project_key, from_date, to_date } = await req.json();

    if (!project_id && !project_key) {
      return new Response(
        JSON.stringify({ error: 'project_id of project_key is vereist' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Starting sync for project: ${project_id || project_key}`);

    // Fetch project details
    let projectQuery = supabase.from('projects').select('*');
    if (project_id) {
      projectQuery = projectQuery.eq('id', project_id);
    } else {
      projectQuery = projectQuery.eq('project_key', project_key);
    }

    const { data: projectData, error: projectError } = await projectQuery.single();

    if (projectError || !projectData) {
      console.error('Project not found:', projectError);
      return new Response(
        JSON.stringify({ error: 'Project niet gevonden' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const project = projectData as Project;
    console.log(`Found project: ${project.name} (BasiCall ID: ${project.basicall_project_id})`);

    // Create sync log entry
    const { data: syncLog, error: syncLogError } = await supabase
      .from('sync_logs')
      .insert({
        project_id: project.id,
        status: 'running',
        sync_from: from_date ? new Date(from_date).toISOString() : null,
        sync_to: to_date ? new Date(to_date).toISOString() : null,
      })
      .select()
      .single();

    if (syncLogError) {
      console.error('Error creating sync log:', syncLogError);
      return new Response(
        JSON.stringify({ error: 'Kon sync log niet aanmaken' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Created sync log: ${syncLog.id}`);

    try {
      // Build BasiCall API URL
      const basicallBaseUrl = 'https://app.basicall.nl/api/v1';
      let apiUrl = `${basicallBaseUrl}/projects/${project.basicall_project_id}/records`;
      
      const params = new URLSearchParams();
      if (from_date) params.append('from', from_date);
      if (to_date) params.append('to', to_date);
      if (params.toString()) {
        apiUrl += `?${params.toString()}`;
      }

      console.log(`Fetching from BasiCall API: ${apiUrl}`);

      // Fetch data from BasiCall API
      const basicallResponse = await fetch(apiUrl, {
        headers: {
          'Authorization': `Bearer ${project.basicall_token}`,
          'Accept': 'application/json',
        },
      });

      if (!basicallResponse.ok) {
        const errorText = await basicallResponse.text();
        console.error(`BasiCall API error: ${basicallResponse.status} - ${errorText}`);
        throw new Error(`BasiCall API fout: ${basicallResponse.status}`);
      }

      const records: BasiCallRecord[] = await basicallResponse.json();
      console.log(`Received ${records.length} records from BasiCall`);

      // Calculate week number helper
      const getWeekNumber = (dateStr: string): number => {
        const date = new Date(dateStr);
        const startOfYear = new Date(date.getFullYear(), 0, 1);
        const days = Math.floor((date.getTime() - startOfYear.getTime()) / (24 * 60 * 60 * 1000));
        return Math.ceil((days + startOfYear.getDay() + 1) / 7);
      };

      // Process and upsert records
      let recordsSynced = 0;
      const batchSize = 100;

      for (let i = 0; i < records.length; i += batchSize) {
        const batch = records.slice(i, i + batchSize);
        
        const recordsToUpsert = batch.map((record) => {
          const isoDate = convertEuropeanToISO(record.beldatum);
          return {
            basicall_record_id: record.record_id,
            project_id: project.id,
            beldatum: isoDate,
            beltijd: record.beltijd || null,
            gesprekstijd_sec: record.gesprekstijd_sec || 0,
            resultaat: record.resultaat || null,
            week_number: isoDate ? getWeekNumber(isoDate) : null,
            raw_data: record,
            synced_at: new Date().toISOString(),
          };
        });

        const { error: upsertError } = await supabase
          .from('call_records')
          .upsert(recordsToUpsert, {
            onConflict: 'basicall_record_id',
            ignoreDuplicates: false,
          });

        if (upsertError) {
          console.error(`Error upserting batch ${i / batchSize + 1}:`, upsertError);
          throw new Error(`Database upsert fout: ${upsertError.message}`);
        }

        recordsSynced += batch.length;
        console.log(`Processed ${recordsSynced}/${records.length} records`);
      }

      // Update sync log with success
      await supabase
        .from('sync_logs')
        .update({
          status: 'success',
          completed_at: new Date().toISOString(),
          records_synced: recordsSynced,
        })
        .eq('id', syncLog.id);

      console.log(`Sync completed successfully: ${recordsSynced} records synced`);

      return new Response(
        JSON.stringify({
          success: true,
          project_id: project.id,
          project_name: project.name,
          records_synced: recordsSynced,
          sync_log_id: syncLog.id,
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );

    } catch (syncError) {
      // Update sync log with failure
      const errorMessage = syncError instanceof Error ? syncError.message : 'Onbekende fout';
      
      await supabase
        .from('sync_logs')
        .update({
          status: 'failed',
          completed_at: new Date().toISOString(),
          error_message: errorMessage,
        })
        .eq('id', syncLog.id);

      console.error('Sync failed:', errorMessage);

      return new Response(
        JSON.stringify({ 
          error: errorMessage,
          sync_log_id: syncLog.id,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Onbekende fout' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
