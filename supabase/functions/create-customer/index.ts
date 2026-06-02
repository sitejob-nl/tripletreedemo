import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_URL = 'https://api.resend.com/emails';
const DEFAULT_SITE_URL = 'https://app.ttcallcenters.nl';
const DEFAULT_FROM_EMAIL = 'tripletree@sitejob.nl';
const DEFAULT_FROM_NAME = 'Triple Tree';
const DEFAULT_REPLY_TO_EMAIL = 'info@ttcallcenters.nl';

// An invite is for a brand-new auth user; a recovery is a fresh activation/login
// link for an account that already exists (expired invite, forgotten password).
// Invite links land on /set-password, recovery links on /reset-password — only
// the email copy and OTP type differ.
type LinkMode = 'invite' | 'recovery';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

const jsonResponse = (body: unknown, status: number) =>
  new Response(
    JSON.stringify(body),
    { status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
  );

// The activation/recovery link is baked into the outbound email, so its host must
// NEVER come from a client-controlled header unchecked: a forged Origin could put
// a live token on a foreign origin. Pin to the production portal, allowing only
// the known prod origin and localhost (for local dev). Anything else → prod.
const resolveSiteUrl = (origin: string | null) => {
  if (!origin) return DEFAULT_SITE_URL;
  if (origin === DEFAULT_SITE_URL) return origin;
  if (/^http:\/\/localhost(:\d+)?$/.test(origin)) return origin;
  if (/^http:\/\/127\.0\.0\.1(:\d+)?$/.test(origin)) return origin;
  return DEFAULT_SITE_URL;
};

// GoTrue's admin generateLink returns user_not_found for an email with no
// auth.users row. We use that as the authoritative "this is a new account" signal.
const isUserNotFound = (error: { code?: string; status?: number; message?: string } | null) => {
  if (!error) return false;
  const message = (error.message || '').toLowerCase();
  return (
    error.code === 'user_not_found' ||
    error.status === 404 ||
    message.includes('user not found') ||
    message.includes('not found')
  );
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

const emailCopy = (mode: LinkMode) =>
  mode === 'recovery'
    ? {
        subject: 'Je nieuwe inloglink voor het Triple Tree dashboard',
        heading: 'Nieuwe inloglink',
        intro:
          'Er staat een nieuwe link voor je klaar voor het Triple Tree rapportageportaal. ' +
          'Je vorige link was verlopen of je was je wachtwoord kwijt — geen probleem.',
        cta: 'Klik op de knop hieronder om een nieuw wachtwoord in te stellen en weer in te loggen:',
        button: 'Wachtwoord instellen',
      }
    : {
        subject: 'Welkom bij het Triple Tree dashboard',
        heading: 'Welkom bij je dashboard',
        intro:
          'Je bent uitgenodigd om toegang te krijgen tot het Triple Tree rapportageportaal. ' +
          'Hiermee kun je live de voortgang en resultaten van je campagnes volgen.',
        cta: 'Klik op de knop hieronder om een wachtwoord in te stellen en je account te activeren:',
        button: 'Account activeren',
      };

const buildInvitationEmailHtml = (email: string, activationUrl: string, mode: LinkMode) => {
  const escapedEmail = escapeHtml(email);
  const escapedActivationUrl = escapeHtml(activationUrl);
  const copy = emailCopy(mode);

  return `<!doctype html>
<html lang="nl">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(copy.subject)}</title>
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
                <h1 style="font-size:22px;margin:0 0 12px 0;">${escapeHtml(copy.heading)}</h1>
                <p style="font-size:15px;line-height:1.5;margin:0 0 16px 0;color:#374151;">
                  ${escapeHtml(copy.intro)}
                </p>
                <p style="font-size:15px;line-height:1.5;margin:0 0 24px 0;color:#374151;">
                  ${escapeHtml(copy.cta)}
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 24px 32px;">
                <a href="${escapedActivationUrl}" style="display:inline-block;background:#0f766e;color:#ffffff;text-decoration:none;padding:14px 28px;border-radius:8px;font-weight:600;font-size:15px;">
                  ${escapeHtml(copy.button)}
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

const buildInvitationEmailText = (email: string, activationUrl: string, mode: LinkMode) => {
  const copy = emailCopy(mode);
  return [
    copy.heading,
    '',
    copy.intro,
    copy.cta,
    activationUrl,
    '',
    `Deze e-mail is verstuurd naar ${email} omdat iemand van Triple Tree je heeft uitgenodigd.`,
    'Verwacht je deze mail niet? Dan kun je hem negeren.',
    '',
    'Triple Tree - ttcallcenters.nl',
  ].join('\n');
};

const sendInvitationEmail = async ({
  apiKey,
  fromEmail,
  fromName,
  replyToEmail,
  toEmail,
  activationUrl,
  mode,
}: {
  apiKey: string;
  fromEmail: string;
  fromName: string;
  replyToEmail: string;
  toEmail: string;
  activationUrl: string;
  mode: LinkMode;
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
      subject: emailCopy(mode).subject,
      html: buildInvitationEmailHtml(toEmail, activationUrl, mode),
      text: buildInvitationEmailText(toEmail, activationUrl, mode),
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
  supabaseAdmin: SupabaseClient,
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

// For a brand-new user the handle_new_user_from_invite trigger assigns the
// 'user' role and links projects on INSERT. That trigger NEVER fires for an
// account that already exists, so when we re-activate an existing user we link
// role + projects ourselves — otherwise they'd come back in with zero
// permissions and no projects (the silent-broken state we keep hitting).
//
// NOTE: this is additive only (matches the invite trigger's ON CONFLICT DO
// NOTHING). Re-inviting with a narrower project set does NOT revoke access —
// revocation is a separate explicit action via the Unlink button in the admin UI.
const ensureCustomerAccess = async (
  supabaseAdmin: SupabaseClient,
  userId: string,
  projectIds: string[],
  invitedBy: string,
) => {
  const { data: existingRoles, error: roleSelectError } = await supabaseAdmin
    .from('user_roles')
    .select('role')
    .eq('user_id', userId);

  if (roleSelectError) {
    // Be conservative: if we can't read the current roles, don't mutate this
    // account — better to skip linking than to risk polluting a staff account.
    console.error('Could not read existing roles for re-activated account:', roleSelectError);
    return;
  }

  const roles = (existingRoles || []).map((row) => (row as { role: string }).role);

  // Never bolt customer state (a 'user' role or project links) onto an
  // admin/superadmin whose address was re-invited by mistake.
  if (roles.includes('admin') || roles.includes('superadmin')) {
    console.log('Re-invited address belongs to a staff account — skipping customer access linking.');
    return;
  }

  if (roles.length === 0) {
    const { error: roleInsertError } = await supabaseAdmin
      .from('user_roles')
      .insert({ user_id: userId, role: 'user' });
    if (roleInsertError) {
      console.error('Could not assign user role to re-activated account:', roleInsertError);
    }
  }

  if (projectIds.length > 0) {
    const rows = projectIds.map((projectId) => ({
      user_id: userId,
      project_id: projectId,
      created_by: invitedBy,
    }));
    const { error: linkError } = await supabaseAdmin
      .from('customer_projects')
      .upsert(rows, { onConflict: 'user_id,project_id', ignoreDuplicates: true });
    if (linkError) {
      console.error('Could not link projects to re-activated account:', linkError);
    }
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

    // Check if requesting user is admin or superadmin. Read all role rows
    // (a user may hold more than one) instead of .single(), which would throw
    // for any account with multiple roles and wrongly deny access.
    const { data: requesterRoles, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', requestingUser.id);

    const requesterIsStaff =
      !roleError &&
      (requesterRoles || []).some(
        (row) => (row as { role: string }).role === 'admin' || (row as { role: string }).role === 'superadmin'
      );

    if (!requesterIsStaff) {
      console.error('Role check failed:', roleError, requesterRoles);
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

    // Pin the link host to a trusted origin (never trust the raw Origin header).
    const siteUrl = resolveSiteUrl(req.headers.get('origin'));

    // ── Step 1: does an account already exist? ────────────────────────────────
    // generateLink type:'recovery' succeeds for ANY existing user (confirmed or
    // unconfirmed) and returns user_not_found for a brand-new email. We use it as
    // the authoritative existence probe so we branch deterministically instead of
    // parsing invite error strings — and so existing UNCONFIRMED users (whose
    // invite link expired) reliably get a working link too.
    const { data: recoveryData, error: recoveryError } = await supabaseAdmin.auth.admin.generateLink({
      type: 'recovery',
      email: normalizedEmail,
      options: {
        redirectTo: `${siteUrl}/reset-password`,
      },
    });

    const recoveryTokenHash = recoveryData?.properties?.hashed_token;
    const existingUser = recoveryData?.user;

    if (!recoveryError && recoveryTokenHash && existingUser) {
      // ── Existing-account path ───────────────────────────────────────────────
      console.log(`Account already exists for ${normalizedEmail} — sending recovery link.`);

      const recoveryUrl = `${siteUrl}/reset-password?token_hash=${encodeURIComponent(recoveryTokenHash)}&type=recovery`;

      const { error: recoveryResendError, id: recoveryResendId } = await sendInvitationEmail({
        apiKey: resendApiKey,
        fromEmail: resendFromEmail,
        fromName: resendFromName,
        replyToEmail: resendReplyToEmail,
        toEmail: normalizedEmail,
        activationUrl: recoveryUrl,
        mode: 'recovery',
      });

      if (recoveryResendError) {
        // Nothing has been mutated yet — admin can safely retry.
        console.error('Resend recovery error:', recoveryResendError);
        return jsonResponse(
          { error: 'De inlogmail kon niet verstuurd worden. Probeer het zo opnieuw.' },
          502
        );
      }

      // Only mutate state after the mail actually went out, so a failed send
      // never silently grants access the admin believes failed.
      await ensureCustomerAccess(
        supabaseAdmin,
        existingUser.id,
        invitationProjectIds,
        requestingUser.id,
      );

      // No INSERT trigger fires for an existing user, so any pending_invitations
      // row for this email would linger forever in the "Uitnodigingen" tab. Drop it.
      await supabaseAdmin
        .from('pending_invitations')
        .delete()
        .eq('email', normalizedEmail);

      console.log(`Recovery link sent successfully to: ${normalizedEmail}${recoveryResendId ? ` via Resend (${recoveryResendId})` : ''}`);

      return jsonResponse(
        {
          success: true,
          mode: 'recovery',
          message: `Nieuwe inloglink verstuurd naar ${normalizedEmail}`,
          user: {
            id: existingUser.id,
            email: existingUser.email,
          },
          emailProvider: 'resend',
          from: resendFromEmail,
          replyTo: resendReplyToEmail,
        },
        200
      );
    }

    // A recovery error that is NOT "user does not exist" is a real failure.
    if (recoveryError && !isUserNotFound(recoveryError)) {
      console.error('Existence probe (recovery generateLink) failed:', recoveryError);
      return jsonResponse(
        { error: 'Kon de uitnodiging niet voorbereiden. Probeer het zo opnieuw.' },
        500
      );
    }

    // ── Step 2: brand-new account → invite path ───────────────────────────────
    // Store the pending invitation FIRST: the handle_new_user_from_invite
    // AFTER INSERT trigger reads this row to assign the 'user' role and link
    // customer_projects when generateLink creates the auth user. Without it the
    // invited user would activate but end up with zero permissions (silently broken).
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
      // Clean up the pending row so we don't leave a stale entry with no auth user.
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
      await cleanupGeneratedInvite(supabaseAdmin, normalizedEmail, invitedUser?.id ?? null);

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
      mode: 'invite',
    });

    if (resendError) {
      console.error('Resend invite error:', resendError);
      await cleanupGeneratedInvite(supabaseAdmin, normalizedEmail, invitedUser.id);

      return jsonResponse(
        { error: 'De uitnodigingsmail kon niet verstuurd worden. Probeer het zo opnieuw.' },
        502
      );
    }

    console.log(`Invitation sent successfully to: ${normalizedEmail}${resendId ? ` via Resend (${resendId})` : ''}`);

    return jsonResponse(
      {
        success: true,
        mode: 'invite',
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
