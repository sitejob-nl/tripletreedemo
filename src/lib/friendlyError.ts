// Translate technical errors (Supabase auth, Postgres, Resend, network) into
// Dutch one-liners that a project manager at a call center can act on.
//
// - Postgres/PostgREST errors arrive as plain objects ({ code, message, details })
//   — we read those fields, not just Error instances.
// - Known technical patterns → friendly Dutch.
// - Empty / unknown → fallback (caller-provided context).
// - Already-Dutch messages from our own backend → pass through unchanged.

interface ExtractedError {
  message: string;
  code?: string;
  details?: string;
}

// Supabase PostgrestError / FunctionsError are plain objects, not Error instances,
// so `error instanceof Error` misses them. Read message/code/details defensively.
function extractError(error: unknown): ExtractedError {
  if (error instanceof Error) return { message: error.message };
  if (typeof error === 'string') return { message: error };
  if (error && typeof error === 'object') {
    const e = error as Record<string, unknown>;
    return {
      message: typeof e.message === 'string' ? e.message : '',
      code: typeof e.code === 'string' ? e.code : undefined,
      details: typeof e.details === 'string' ? e.details : undefined,
    };
  }
  return { message: '' };
}

// Column name (from Postgres "Key (col)=(val) already exists" detail) → Dutch label.
const UNIQUE_FIELD_LABELS: Record<string, string> = {
  project_key: 'project key',
  basicall_project_id: 'BasiCall project-ID',
  email: 'e-mailadres',
  name: 'naam',
};

// Constraint name (from "unique constraint \"X\"") → Dutch label, for when the
// detail line is absent.
const UNIQUE_CONSTRAINT_LABELS: Record<string, string> = {
  projects_project_key_key: 'project key',
  projects_basicall_project_id_key: 'BasiCall project-ID',
};

// Build a field-aware message for a unique-violation (23505). Falls back to a
// generic "already exists" when we can't identify the field.
function uniqueMessage(message: string, details?: string): string {
  const column = /Key \(([^)]+)\)=/.exec(details ?? '')?.[1]?.split(',')[0]?.trim();
  const constraint = /unique constraint "([^"]+)"/.exec(message)?.[1];
  const label =
    (column && UNIQUE_FIELD_LABELS[column]) ||
    (constraint && UNIQUE_CONSTRAINT_LABELS[constraint]) ||
    null;
  return label
    ? `Er bestaat al een record met deze ${label}. Kies een unieke waarde.`
    : 'Dit bestaat al in het systeem.';
}

// Postgres SQLSTATE / PostgREST codes → friendly Dutch. More reliable than regex
// because it doesn't depend on the (English, version-specific) message text.
function messageForCode(code: string, message: string, details?: string): string | null {
  switch (code) {
    case '23505': // unique_violation
      return uniqueMessage(message, details);
    case '23503': // foreign_key_violation
      return 'Deze actie kan niet uitgevoerd worden omdat er nog andere gegevens aan gekoppeld zijn.';
    case '23502': // not_null_violation
      return 'Niet alle verplichte velden zijn ingevuld.';
    case '23514': // check_violation
      return 'Eén van de ingevoerde waarden klopt niet.';
    case '42501': // insufficient_privilege
      return 'Je hebt geen rechten voor deze actie.';
    case 'PGRST301':
    case 'PGRST302':
      return 'Je sessie is verlopen. Log opnieuw in.';
    case 'PGRST116': // no rows for single()
      return 'Er is geen resultaat gevonden.';
    default:
      return null;
  }
}

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

  // Postgres / database (text fallback when no code is present)
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
  const { message, code, details } = extractError(error);
  const trimmed = message.trim();

  // 1. Structured Postgres/PostgREST code — most reliable, works for plain-object
  //    Supabase errors even when the message text is empty or English.
  if (code) {
    const byCode = messageForCode(code, trimmed, details);
    if (byCode) return byCode;
  }

  if (!trimmed) return fallback;

  // 2. Unique-violation by message text (no code, e.g. a rethrown Error).
  if (/duplicate key|unique constraint|already exists/i.test(trimmed)) {
    return uniqueMessage(trimmed, details);
  }

  // 3. Other known technical patterns.
  for (const { match, message: friendly } of TECHNICAL_PATTERNS) {
    if (match.test(trimmed)) return friendly;
  }

  // 4. Backend-side Dutch messages flow through unchanged so we don't override
  //    the helpful context they already provide.
  if (DUTCH_HINTS.test(trimmed)) return trimmed;

  return fallback;
}
