// Translate technical errors (Supabase auth, Postgres, Resend, network) into
// Dutch one-liners that a project manager at a call center can act on.
//
// - Known technical patterns → friendly Dutch.
// - Empty / unknown → fallback (caller-provided context).
// - Already-Dutch messages from our own backend → pass through unchanged.

const TECHNICAL_PATTERNS: Array<{ match: RegExp; message: string }> = [
  // Auth
  { match: /invalid login credentials/i, message: 'Onjuist e-mailadres of wachtwoord.' },
  { match: /email not confirmed/i, message: 'Je e-mailadres is nog niet bevestigd. Check je inbox.' },
  { match: /user not found|user_not_found/i, message: 'Dit account bestaat niet.' },
  { match: /user already (registered|exists)|email_exists|already (registered|exists)/i, message: 'Dit e-mailadres heeft al een account. Vraag de gebruiker om via "Wachtwoord vergeten" in te loggen.' },
  { match: /password.*(at least|short|characters|length)/i, message: 'Het wachtwoord is te kort. Kies er een van minimaal 6 tekens.' },
  { match: /weak.password|password.*weak/i, message: 'Dit wachtwoord is te zwak. Kies een langere combinatie.' },
  { match: /token.*(expired|invalid)|invalid.*token|expired.*token/i, message: 'De link is verlopen of niet meer geldig. Vraag een nieuwe uitnodiging.' },
  { match: /missing authorization|jwt|no api key/i, message: 'Je sessie is verlopen. Log opnieuw in.' },

  // Permissions / RLS
  { match: /row.level security|rls|policy/i, message: 'Je hebt geen rechten voor deze actie.' },
  { match: /permission denied|forbidden|insufficient.privilege/i, message: 'Je hebt geen rechten voor deze actie.' },
  { match: /^unauthori[sz]ed$/i, message: 'Je hebt geen toegang. Log opnieuw in en probeer het nog eens.' },

  // Network
  { match: /failed to fetch|network ?error|fetch failed|err_network/i, message: 'Geen verbinding met de server. Controleer je internet en probeer opnieuw.' },
  { match: /timeout|timed out|etimedout/i, message: 'De server reageert niet. Probeer het zo opnieuw.' },
  { match: /aborted|abortcontroller/i, message: 'De aanvraag is afgebroken. Probeer het opnieuw.' },

  // Postgres / database
  { match: /duplicate key|unique constraint|already exists/i, message: 'Dit bestaat al in het systeem.' },
  { match: /foreign key|violates foreign/i, message: 'Deze actie kan niet uitgevoerd worden omdat er andere gegevens aan gekoppeld zijn.' },
  { match: /not.null|null value/i, message: 'Niet alle verplichte velden zijn ingevuld.' },
  { match: /check constraint|violates check/i, message: 'Eén van de ingevoerde waarden klopt niet.' },
  { match: /pgrst\d+/i, message: 'De database kon de aanvraag niet verwerken. Probeer het opnieuw.' },

  // Email / Resend
  { match: /rate limit|too many requests|429/i, message: 'Te veel pogingen achter elkaar. Wacht even en probeer het opnieuw.' },
  { match: /invalid.*email|email.*invalid/i, message: 'Dit e-mailadres is niet geldig.' },
  { match: /resend/i, message: 'De uitnodigingsmail kon niet verstuurd worden. Probeer het zo opnieuw.' },

  // Generic 5xx / unknown
  { match: /internal server error|^500$|500 internal/i, message: 'Er ging iets mis aan onze kant. Probeer het opnieuw of neem contact op met Kas (info@sitejob.nl).' },
];

const DUTCH_HINTS = /\b(niet|geen|deze|moet|kan|wordt|aangemaakt|verstuurd|verwijderd|opnieuw|controleer|probeer|ingesteld|bestaat|nodig|sessie|toegang|rechten|systeem|gebruiker|uitnodiging|wachtwoord)\b/i;

export function friendlyError(error: unknown, fallback: string): string {
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : '';

  const trimmed = raw.trim();
  if (!trimmed) return fallback;

  for (const { match, message } of TECHNICAL_PATTERNS) {
    if (match.test(trimmed)) return message;
  }

  // Backend-side Dutch messages flow through unchanged so we don't override
  // the helpful context they already provide.
  if (DUTCH_HINTS.test(trimmed)) return trimmed;

  return fallback;
}
