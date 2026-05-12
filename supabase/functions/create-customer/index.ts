import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_SITE_URL = 'https://app.ttcallcenters.nl';
const DEFAULT_FROM_EMAIL = 'tripletree@sitejob.nl';
const DEFAULT_FROM_NAME = 'Triple Tree';
const DEFAULT_REPLY_TO_EMAIL = 'info@ttcallcenters.nl';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const buildInvitationEmailHtml = (email: string, activationUrl: string) => {
  const escapedEmail = escapeHtml(email);
  const escapedActivationUrl = escapeHtml(activationUrl);

  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Welkom bij het Triple Tree dashboard</title>
  </head>
  <body style="margin:0;padding:0;background:#f5f5f5;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;color:#1a1a1a;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f5f5f5;padding:24px 0;">
      <tr>
        <td align="center">
          <table role="presentation" width="560" cellpadding="0" cellspacing="0" style="background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 8px rgba(0,0,0,0.04);">
            <tr>
              <td style="padding:32px 32px 0 32px;">
                <div style="font-size:20px;font-weight:700;color:#0f766e;">Triple Tree</div>
                <div style="font-size:13px;color:#6b7280;margin-top:2px;">Call center rapportage</div>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 8px 32px;">
                <h1 style="font-size:22px;margin:0 0 12px 0;">Welkom bij je dashboard</h1>
                <p style="font-size:15px;line-height:1.5;margin:0 0 16px 0;color:#374151;">
                  Je bent uitgenodigd om toegang te krijgen tot het Triple Tree rapportageportaal.
                  Hiermee kun je live de voortgang en resultaten van je campagnes volgen.
                </p>
                <p style="font-size:15px;line-height:1.5;margin:0 0 24px 0;color:#374151;">
                  Klik op de knop hieronder om een wachtwoord in te stellen en je account te activeren:
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 24px 32px;">
                <a href="${escapedActivationUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
                  Account activeren
                </a>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <p style="font-size:13px;line-height:1.5;margin:0;color:#6b7280;">
                  Werkt de knop niet? Kopieer dan deze link in je browser:<br/>
                  <span style="word-break:break-all;color:#0f766e;">${escapedActivationUrl}</span>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;background:#f9fafb;border-top:1px solid #e5e7eb;">
                <h2 style="font-size:15px;margin:0 0 10px 0;">Tip: zet het dashboard op je startscherm</h2>
                <p style="font-size:13px;line-height:1.5;margin:0 0 8px 0;color:#4b5563;">
                  Na het activeren krijg je een korte uitleg om het dashboard als app op je telefoon of
                  laptop te pinnen. Dan opent het sneller en voelt het als een eigen app.
                </p>
                <p style="font-size:13px;line-height:1.5;margin:0;color:#4b5563;">
                  Werkt het ook gewoon in de browser? Ja, zowel op je laptop als telefoon.
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:16px 32px 24px 32px;">
                <p style="font-size:12px;line-height:1.5;margin:0;color:#9ca3af;">
                  Deze e-mail is verstuurd naar ${escapedEmail} omdat iemand van Triple Tree je heeft uitgenodigd.
                  Verwacht je deze mail niet? Dan kun je hem negeren; zonder activatie gebeurt er niks met
                  je adres.
                </p>
                <p style="font-size:12px;line-height:1.5;margin:12px 0 0 0;color:#9ca3af;">
                  Triple Tree &middot; Bogert 31-05, Eindhoven &middot; <a href="https://ttcallcenters.nl" style="color:#0f766e;text-decoration:none;">ttcallcenters.nl</a>
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
};

const buildInvitationEmailText = (email: string, activationUrl: string) =>
  [
    'Welkom bij je Triple Tree dashboard',
    '',
    'Je bent uitgenodigd om toegang te krijgen tot het Triple Tree rapportageportaal.',
    'Open deze link om een wachtwoord in te stellen en je account te activeren:',
    activationUrl,
    '',
    `Deze e-mail is verstuurd naar ${email} omdat iemand van Triple Tree je heeft uitgenodigd.`,
    'Verwacht je deze mail niet? Dan kun je hem negeren.',
    '',
    'Triple Tree - ttcallcenters.nl',
  ].join('\n');

const sendInvitationEmail = async ({
  apiKey,
  fromEmail,
  fromName,
  replyToEmail,
  toEmail,
  activationUrl,
}: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  toEmail: string;
  activationUrl: string;
}) => {
  const response = await fetch(RESEND_API_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: `${fromName} <${fromEmail}>`,
      to: [toEmail],
      reply_to: replyToEmail,
      subject: 'Welkom bij het Triple Tree dashboard',
      html: buildInvitationEmailHtml(toEmail, activationUrl),
      text: buildInvitationEmailText(toEmail, activationUrl),
    }),
  });

  const responseBody = await response.text();

  if (!response.ok) {
    return {
      error: `Resend returned ${response.status}: ${responseBody}`,
      id: null,
    };
  }

  try {
    const data = JSON.parse(responseBody) as { id?: string };
    return { error: null, id: data.id ?? null };
  } catch (_error) {
    return { error: null, id: null };
  }
};

const cleanupGeneratedInvite = async (
  supabaseAdmin: ReturnType<typeof createClient>,
  email: string,
  userId: string | null,
) => {
  await supabaseAdmin
    .from('pending_invitations')
    .delete()
    .eq('email', email);

  if (!userId) return;

  const { error: customerProjectsError } = await supabaseAdmin
    .from('customer_projects')
    .delete()
    .eq('user_id', userId);

  if (customerProjectsError) {
    console.error('Could not clean up customer projects after failed invite:', customerProjectsError);
  }

  const { error: deleteUserError } = await supabaseAdmin.auth.admin.deleteUser(userId);
  if (deleteUserError) {
    console.error('Could not clean up invited auth user after failed invite:', deleteUserError);
  }
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
    const resendApiKey = Deno.env.get('RESEND_API_KEY');
    const resendFromEmail = Deno.env.get('RESEND_FROM_EMAIL') || DEFAULT_FROM_EMAIL;
    const resendFromName = Deno.env.get('RESEND_FROM_NAME') || DEFAULT_FROM_NAME;
    const resendReplyToEmail = Deno.env.get('RESEND_REPLY_TO_EMAIL') || DEFAULT_REPLY_TO_EMAIL;
    
    // Create admin client for user creation
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    
    // Verify the requesting user is an admin
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return jsonResponse({ error: 'Je sessie is verlopen. Log opnieuw in.' }, 401);
    }

    // Create client with user's token to verify their role
    const supabaseClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } }
    });

    const { data: { user: requestingUser }, error: userError } = await supabaseClient.auth.getUser();
    if (userError || !requestingUser) {
      console.error('Auth error:', userError);
      return jsonResponse({ error: 'Je sessie is verlopen. Log opnieuw in.' }, 401);
    }

    // Check if requesting user is admin or superadmin
    const { data: roleData, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id)
      .single();

    if (roleError || !roleData || (roleData.role !== 'admin' && roleData.role !== 'superadmin')) {
      console.error('Role check failed:', roleError, roleData);
      return jsonResponse({ error: 'Alleen beheerders kunnen klanten uitnodigen.' }, 403);
    }

    // Parse request body
    const { email, projectIds } = await req.json();
    const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
    const invitationProjectIds = Array.isArray(projectIds) ? projectIds : [];

    if (!normalizedEmail) {
      return jsonResponse({ error: 'Vul een e-mailadres in.' }, 400);
    }

    if (!resendApiKey) {
      return jsonResponse(
        { error: 'De e-mailservice is nog niet ingesteld. Neem contact op met Kas (info@sitejob.nl).' },
        500
      );
    }

    console.log(`Inviting customer with email: ${normalizedEmail}`);

    const { data: existingPendingInvitation, error: existingPendingError } = await supabaseAdmin
      .from('pending_invitations')
      .select('id')
      .eq('email', normalizedEmail)
      .maybeSingle();

    if (existingPendingError) {
      console.error('Pending invitation lookup error:', existingPendingError);
      return jsonResponse(
        { error: 'Kon de uitnodiging niet voorbereiden. Probeer het zo opnieuw.' },
        500
      );
    }

    // Store pending invitation with project IDs (for trigger to link after signup).
    // CRITICAL: if this fails we must NOT proceed — the handle_new_user_from_invite
    // trigger reads this row to assign the 'user' role and link customer_projects.
    // Without it the invited user would activate their account but end up with
    // zero permissions and no linked projects (silently broken).
    const { error: pendingError } = await supabaseAdmin
      .from('pending_invitations')
      .upsert({
        email: normalizedEmail,
        project_ids: invitationProjectIds,
        invited_by: requestingUser.id
      }, {
        onConflict: 'email'
      });

    if (pendingError) {
      console.error('Pending invitation error:', pendingError);
      return jsonResponse(
        { error: 'Kon de uitnodiging niet opslaan. Probeer het zo opnieuw.' },
        500
      );
    }

    // Get the site URL for redirect. Fallback is the production portal so
    // een magic link die server-side wordt gegenereerd nooit op een doodlopend
    // domein landt.
    const siteUrl = req.headers.get('origin') || DEFAULT_SITE_URL;

    // Generate the Supabase invite link without letting Supabase send email.
    // Resend handles the delivery below, so the sender can be tripletree@sitejob.nl.
    const { data: inviteData, error: inviteError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'invite',
      email: normalizedEmail,
      options: {
        redirectTo: `${siteUrl}/set-password`,
        data: {
          invited_by: requestingUser.id,
          project_ids: invitationProjectIds
        },
      }
    });

    if (inviteError) {
      console.error('Invite error:', inviteError);

      // Supabase returns "User already registered" (or status 422 / code email_exists)
      // when the email already has an auth.users row. Surface a clear message
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
        return jsonResponse(
          {
            error:
              'Dit e-mailadres heeft al een account in het systeem. Vraag de klant om via "Wachtwoord vergeten" in te loggen, of koppel extra projecten via de Koppelen-knop zodra het account zichtbaar is in de Actief-tab.',
            code: 'already_registered',
          },
          409
        );
      }

      // Any other invite failure: clean up the pending row so we don't have a
      // stale entry with no matching auth.users.
      await supabaseAdmin
        .from('pending_invitations')
        .delete()
        .eq('email', normalizedEmail);

      return jsonResponse(
        { error: 'Kon de uitnodiging niet aanmaken. Controleer het e-mailadres en probeer opnieuw.' },
        400
      );
    }

    const tokenHash = inviteData?.properties?.hashed_token;
    const invitedUser = inviteData?.user;

    if (!tokenHash || !invitedUser) {
      console.error('Invite link generation returned incomplete data');
      if (!existingPendingInvitation?.id) {
        await cleanupGeneratedInvite(supabaseAdmin, normalizedEmail, invitedUser?.id ?? null);
      }

      return jsonResponse(
        { error: 'Kon geen activatielink aanmaken. Probeer opnieuw.' },
        500
      );
    }

    const activationUrl = `${siteUrl}/set-password?token_hash=${encodeURIComponent(tokenHash)}&type=invite`;

    const { error: resendError, id: resendId } = await sendInvitationEmail({
      apiKey: resendApiKey,
      fromEmail: resendFromEmail,
      fromName: resendFromName,
      replyToEmail: resendReplyToEmail,
      toEmail: normalizedEmail,
      activationUrl,
    });

    if (resendError) {
      console.error('Resend invite error:', resendError);

      if (!existingPendingInvitation?.id) {
        await cleanupGeneratedInvite(supabaseAdmin, normalizedEmail, invitedUser.id);
      }

      return jsonResponse(
        { error: 'De uitnodigingsmail kon niet verstuurd worden. Probeer het zo opnieuw.' },
        502
      );
    }

    console.log(`Invitation sent successfully to: ${normalizedEmail}${resendId ? ` via Resend (${resendId})` : ''}`);

    return jsonResponse(
      {
        success: true,
        message: `Uitnodiging verstuurd naar ${normalizedEmail}`,
        user: {
          id: invitedUser.id,
          email: invitedUser.email
        },
        emailProvider: 'resend',
        from: resendFromEmail,
        replyTo: resendReplyToEmail,
      },
      200
    );

  } catch (error) {
    console.error('Unexpected error:', error);
    return jsonResponse(
      { error: 'Er ging iets mis aan onze kant. Probeer het opnieuw of neem contact op met Kas (info@sitejob.nl).' },
      500
    );
  }
});
