import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    
    // Create admin client for user creation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Create client with user's token to verify their role
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });
    
    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !requestingUser) {
      console.error('Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Check if requesting user is admin or superadmin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single();

    if (roleError || !roleData || (roleData.role !== 'admin' && roleData.role !== 'superadmin')) {
      console.error('Role check failed:', roleError, roleData);
      return new Response(
        JSON.stringify({ error: 'Only admins can invite customers' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const { email, projectIds } = await req.json();
    
    if (!email) {
      return new Response(
        JSON.stringify({ error: 'Email is required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Inviting customer with email: ${email}`);

    // Store pending invitation with project IDs (for trigger to link after signup).
    // CRITICAL: if this fails we must NOT proceed — the handle_new_user_from_invite
    // trigger reads this row to assign the 'user' role and link customer_projects.
    // Without it the invited user would activate their account but end up with
    // zero permissions and no linked projects (silently broken).
    const { error: pendingError } = await supabaseAdmin
      .from('pending_invitations')
      .upsert({
        email: email.toLowerCase(),
        project_ids: projectIds || [],
        invited_by: requestingUser.id
      }, {
        onConflict: 'email'
      });

    if (pendingError) {
      console.error('Pending invitation error:', pendingError);
      return new Response(
        JSON.stringify({
          error: `Kon uitnodiging niet voorbereiden: ${pendingError.message}. Probeer opnieuw.`,
        }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get the site URL for redirect. Fallback is the production portal so
    // een magic link die server-side wordt gegenereerd nooit op een doodlopend
    // domein landt.
    const siteUrl = req.headers.get('origin') || 'https://app.ttcallcenters.nl';

    // Invite the user using Supabase Auth admin API
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.inviteUserByEmail(
      email,
      {
        redirectTo: `${siteUrl}/set-password`,
        data: {
          invited_by: requestingUser.id,
          project_ids: projectIds
        }
      }
    );

    if (inviteError) {
      console.error('Invite error:', inviteError);

      // Supabase returns "User already registered" (or status 422 / code email_exists)
      // when the email already has an auth.users row. The invite trigger has
      // therefore already fired once — pending_invitations is either empty (user
      // activated) or we're re-inviting someone who abandoned activation. Either
      // way, the invite API won't re-send a magic link; surface a clear message
      // so admin knows what action to take instead of retrying.
      const msg = (inviteError.message || '').toLowerCase();
      const alreadyRegistered =
        msg.includes('already') ||
        msg.includes('registered') ||
        msg.includes('exists') ||
        (inviteError as { code?: string }).code === 'email_exists';

      if (alreadyRegistered) {
        // Keep the pending_invitations row intact: if the user re-confirms via a
        // "wachtwoord vergeten"-flow, a password update alone won't fire our INSERT
        // trigger. Admin may need to manually link projects via "Koppelen".
        return new Response(
          JSON.stringify({
            error:
              'Dit e-mailadres heeft al een account in het systeem. Vraag de klant om via "Wachtwoord vergeten" in te loggen, of koppel extra projecten via de Koppelen-knop zodra het account zichtbaar is in de Actief-tab.',
            code: 'already_registered',
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Any other invite failure: clean up the pending row so we don't have a
      // stale entry with no matching auth.users.
      await supabaseAdmin
        .from('pending_invitations')
        .delete()
        .eq('email', email.toLowerCase());

      return new Response(
        JSON.stringify({ error: inviteError.message }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`Invitation sent successfully to: ${email}`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        message: `Uitnodiging verstuurd naar ${email}`,
        user: {
          id: inviteData.user.id,
          email: inviteData.user.email
        }
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
