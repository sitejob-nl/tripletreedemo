import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

// Return email addresses for a given list of user_ids. auth.users is only
// readable with the service_role key, so this edge function acts as a narrow
// admin-gated proxy. Called by the Klanten-tab in the admin UI to replace the
// UUID display with a recognisable email per customer.

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Verify caller is admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Missing authorization header' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !requestingUser) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single();
    if (roleError || !roleData || (roleData.role !== 'admin' && roleData.role !== 'superadmin')) {
      return new Response(JSON.stringify({ error: 'Only admins can list customer emails' }), {
        status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { userIds } = await req.json();
    if (!Array.isArray(userIds)) {
      return new Response(JSON.stringify({ error: 'userIds must be an array' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    if (userIds.length === 0) {
      return new Response(JSON.stringify({ emails: {} }), {
        status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Pull emails for each requested user_id via admin getUserById.
    // Paginated listUsers would require walking the whole auth.users table
    // and matching in JS; getUserById is O(1) per user so we fan out in
    // parallel. Invalid IDs simply resolve to null.
    const results = await Promise.all(
      userIds.map(async (id: string) => {
        try {
          const { data, error } = await supabaseAdmin.auth.admin.getUserById(id);
          if (error || !data?.user) return [id, null] as const;
          return [id, data.user.email ?? null] as const;
        } catch {
          return [id, null] as const;
        }
      })
    );

    const emails = Object.fromEntries(results);

    return new Response(JSON.stringify({ emails }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
