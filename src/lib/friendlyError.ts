// Vertaalt technische fouten (Supabase auth, Postgres, Resend, BasiCall, netwerk) naar
// Nederlandse meldingen die een projectmanager bij een callcenter kan begrijpen én opvolgen.
//
// Uitgangspunten:
// - Elke melding zegt WAT er mis is én WAT de gebruiker nu moet doen. Een melding zonder
//   vervolgstap laat iemand met lege handen achter ("Fout" → en dan?).
// - Nooit Engelse brontekst doorlaten naar het scherm. Onbekende fouten vallen terug op de
//   context die de aanroeper meegeeft.
// - Postgres/PostgREST-fouten komen binnen als gewone objecten ({ code, message, details }) —
//   die velden lezen we uit, niet alleen Error-instanties.
// - Meldingen die onze eigen backend al in het Nederlands stuurt, gaan ongewijzigd door.

export interface FriendlyError {
  /** Korte kop voor een toast. Benoemt het probleem, niet "Fout". */
  title: string;
  /** Wat er mis is + wat de gebruiker nu moet doen. */
  description: string;
}

interface ExtractedError {
  message: string;
  code?: string;
  details?: string;
}

// Supabase PostgrestError / FunctionsError zijn gewone objecten, geen Error-instanties,
// dus `error instanceof Error` mist ze. Defensief message/code/details uitlezen.
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

// Kolomnaam (uit Postgres "Key (col)=(val) already exists") → Nederlands label.
const UNIQUE_FIELD_LABELS: Record<string, string> = {
  project_key: 'project key',
  basicall_project_id: 'BasiCall project-ID',
  email: 'e-mailadres',
  name: 'naam',
};

// Constraint-naam (uit "unique constraint \"X\"") → Nederlands label, voor als de
// detailregel ontbreekt.
const UNIQUE_CONSTRAINT_LABELS: Record<string, string> = {
  projects_project_key_key: 'project key',
  projects_basicall_project_id_key: 'BasiCall project-ID',
};

function uniqueMessage(message: string, details?: string): FriendlyError {
  const column = /Key \(([^)]+)\)=/.exec(details ?? '')?.[1]?.split(',')[0]?.trim();
  const constraint = /unique constraint "([^"]+)"/.exec(message)?.[1];
  const label =
    (column && UNIQUE_FIELD_LABELS[column]) ||
    (constraint && UNIQUE_CONSTRAINT_LABELS[constraint]) ||
    null;
  return {
    title: 'Bestaat al',
    description: label
      ? `Er is al een record met deze ${label}. Kies een andere waarde en sla opnieuw op.`
      : 'Dit bestaat al in het systeem. Pas de gegevens aan of open het bestaande item.',
  };
}

// Postgres SQLSTATE / PostgREST-codes → Nederlands. Betrouwbaarder dan een regex op de
// (Engelse, versie-afhankelijke) tekst.
function messageForCode(code: string, message: string, details?: string): FriendlyError | null {
  switch (code) {
    case '23505': // unique_violation
      return uniqueMessage(message, details);
    case '23503': // foreign_key_violation
      return {
        title: 'Nog in gebruik',
        description: 'Er zijn nog andere gegevens aan dit item gekoppeld. Ontkoppel of verwijder die eerst en probeer het daarna opnieuw.',
      };
    case '23502': // not_null_violation
      return {
        title: 'Verplicht veld leeg',
        description: 'Niet alle verplichte velden zijn ingevuld. Vul de ontbrekende velden aan en sla opnieuw op.',
      };
    case '23514': // check_violation
      return {
        title: 'Ongeldige waarde',
        description: 'Eén van de ingevulde waarden valt buiten wat is toegestaan. Controleer de invoer — vaak gaat het om een bedrag, percentage of datum.',
      };
    case '42501': // insufficient_privilege
      return NO_RIGHTS;
    case '57014': // query_canceled (statement timeout)
      return TIMEOUT;
    case 'PGRST301':
    case 'PGRST302':
      return SESSION_EXPIRED;
    case 'PGRST116': // geen rij voor single()
      return NOTHING_FOUND;
    default:
      return null;
  }
}

const NO_RIGHTS: FriendlyError = {
  title: 'Geen rechten',
  description: 'Je account mag deze actie niet uitvoeren. Vraag een beheerder bij Triple Tree om je rechten aan te passen.',
};

const SESSION_EXPIRED: FriendlyError = {
  title: 'Sessie verlopen',
  description: 'Je bent automatisch uitgelogd omdat je even niets deed. Log opnieuw in; je gegevens zijn bewaard.',
};

const NOTHING_FOUND: FriendlyError = {
  title: 'Niets gevonden',
  description: 'Er zijn geen gegevens voor deze selectie. Kies een andere periode of een ander project.',
};

const TIMEOUT: FriendlyError = {
  title: 'Duurt te lang',
  description: 'De server reageerde niet op tijd. Kies een kortere periode (bijvoorbeeld één week in plaats van een heel jaar) of probeer het over een minuut opnieuw.',
};

const EXPIRED_LINK: FriendlyError = {
  title: 'Link is verlopen',
  description: 'Deze inlog- of activatielink is verlopen of al een keer gebruikt. Vraag Triple Tree om een nieuwe link te sturen.',
};

const CONTACT_SUPPORT = 'Blijft het misgaan, meld het dan bij Kas (info@sitejob.nl).';

// Volgorde telt: de eerste match wint. Specifieke patronen staan daarom bóven de
// algemene. Zo mag /email.*invalid/ nooit vóór de verlopen-link-regel staan — dat gaf
// bij een verlopen inloglink de volstrekt misleidende melding "Dit e-mailadres is niet
// geldig" (waargebeurd, 03-08-2026, drie mislukte inlogpogingen van een klant).
const TECHNICAL_PATTERNS: Array<{ match: RegExp; result: FriendlyError | ((m: string) => FriendlyError) }> = [
  // --- Inloggen en links ---
  {
    match: /(email|magic|recovery|confirmation) link is invalid|link is invalid or has expired|otp_expired|token.*(expired|invalid)|invalid.*token|expired.*token|access_denied/i,
    result: EXPIRED_LINK,
  },
  {
    match: /invalid login credentials/i,
    result: {
      title: 'Inloggen mislukt',
      description: 'E-mailadres of wachtwoord klopt niet. Let op hoofdletters, of stel via "Wachtwoord vergeten" een nieuw wachtwoord in.',
    },
  },
  {
    match: /email not confirmed/i,
    result: {
      title: 'E-mail nog niet bevestigd',
      description: 'Dit account is nog niet geactiveerd. Open de activatiemail in je inbox (kijk ook in de spam) en stel je wachtwoord in.',
    },
  },
  {
    match: /user not found|user_not_found/i,
    result: {
      title: 'Account bestaat niet',
      description: 'Er hoort geen account bij dit e-mailadres. Controleer de spelling, of vraag Triple Tree om een uitnodiging.',
    },
  },
  {
    match: /user already (registered|exists)|email_exists|already (registered|exists)/i,
    result: {
      title: 'Account bestaat al',
      description: 'Dit e-mailadres heeft al een account. Laat de gebruiker inloggen via "Wachtwoord vergeten" in plaats van een nieuwe uitnodiging.',
    },
  },
  {
    match: /signups? not allowed|signup_disabled/i,
    result: {
      title: 'Zelf registreren kan niet',
      description: 'Accounts worden aangemaakt door Triple Tree. Vraag daar een uitnodiging aan.',
    },
  },
  {
    match: /database error saving new user/i,
    result: {
      title: 'Account aanmaken mislukt',
      description: `Het account kon niet worden aangemaakt. Controleer of dit e-mailadres nog niet bestaat en probeer het opnieuw. ${CONTACT_SUPPORT}`,
    },
  },
  {
    match: /password.*(at least|short|characters|length)|minimum.*characters/i,
    result: {
      title: 'Wachtwoord te kort',
      description: 'Kies een wachtwoord van minimaal 6 tekens.',
    },
  },
  {
    match: /weak.password|password.*weak/i,
    result: {
      title: 'Wachtwoord te zwak',
      description: 'Kies een langere combinatie van letters, cijfers en leestekens.',
    },
  },
  {
    match: /for security purposes.*after (\d+) seconds?/i,
    result: (m: string) => {
      const seconds = /after (\d+) seconds?/i.exec(m)?.[1] ?? '60';
      return {
        title: 'Nog even wachten',
        description: `Uit veiligheid kan dit pas over ${seconds} seconden opnieuw. Wacht even en probeer het dan nog een keer.`,
      };
    },
  },
  { match: /missing authorization|jwt|no api key|session.*(expired|missing)/i, result: SESSION_EXPIRED },

  // --- BasiCall / synchronisatie ---
  // Staat vóór de rechten- en netwerkregels: die zijn ruimer geformuleerd en zouden
  // deze anders opslokken.
  {
    match: /status code 500|basicall.*(500|storing)/i,
    result: {
      title: 'BasiCall gaf een storing',
      description: 'BasiCall was tijdelijk niet bereikbaar. De herstelronde van 13:30 haalt de gemiste dag vanzelf op — actie is pas nodig als hetzelfde project meerdere dagen achter elkaar faalt.',
    },
  },
  {
    match: /status code 40[13]|mogelijk token-?\/?auth-?probleem/i,
    result: {
      title: 'BasiCall weigert de toegang',
      description: 'BasiCall accepteerde het token niet. Controleer bij BasiCall of dit project openstaat voor onze koppeling; meld het anders bij Kas (info@sitejob.nl).',
    },
  },
  {
    match: /zonder bruikbare datum|records? (konden niet|ontbreken)|niet opgehaald/i,
    result: {
      title: 'Niet alle records opgehaald',
      description: 'Een deel van de records kwam niet binnen. Start een handmatige synchronisatie voor die dag via Beheer → Synchronisatie.',
    },
  },

  // --- Rechten ---
  { match: /row.level security|violates row-level|rls|policy/i, result: NO_RIGHTS },
  { match: /permission denied|forbidden|insufficient.privilege/i, result: NO_RIGHTS },
  {
    // Alleen een kále 401/unauthorized. Een los "401" ergens in een zin is géén
    // inlogfout — "135 van 401 records ontbreken" werd zo eerst als uitgelogd gemeld.
    match: /^unauthori[sz]ed\b|^401$|\bhttp 401\b/i,
    result: {
      title: 'Geen toegang',
      description: 'Je bent niet (meer) ingelogd. Log opnieuw in en probeer het daarna nog eens.',
    },
  },

  // --- Netwerk ---
  {
    match: /failed to fetch|network ?error|fetch failed|err_network|load failed|networkerror when attempting/i,
    result: {
      title: 'Geen verbinding',
      description: 'De app kan de server niet bereiken. Controleer je internetverbinding en probeer het opnieuw.',
    },
  },
  { match: /timeout|timed out|etimedout|canceling statement/i, result: TIMEOUT },
  {
    match: /aborted|abortcontroller/i,
    result: {
      title: 'Aanvraag afgebroken',
      description: 'De aanvraag is onderbroken, meestal doordat de pagina te snel wisselde. Probeer het opnieuw.',
    },
  },

  // --- Database (tekst-fallback als er geen code is) ---
  {
    match: /duplicate key|unique constraint|already exists/i,
    result: (m: string) => uniqueMessage(m),
  },
  {
    match: /foreign key|violates foreign/i,
    result: {
      title: 'Nog in gebruik',
      description: 'Er zijn nog andere gegevens aan dit item gekoppeld. Ontkoppel of verwijder die eerst.',
    },
  },
  {
    match: /not.null|null value/i,
    result: {
      title: 'Verplicht veld leeg',
      description: 'Niet alle verplichte velden zijn ingevuld. Vul ze aan en sla opnieuw op.',
    },
  },
  {
    match: /check constraint|violates check/i,
    result: {
      title: 'Ongeldige waarde',
      description: 'Eén van de ingevulde waarden valt buiten wat is toegestaan. Controleer de invoer.',
    },
  },
  { match: /multiple \(or no\) rows returned|no rows returned/i, result: NOTHING_FOUND },
  {
    match: /pgrst\d+/i,
    result: {
      title: 'Aanvraag mislukt',
      description: `De database kon deze aanvraag niet verwerken. Herlaad de pagina en probeer het opnieuw. ${CONTACT_SUPPORT}`,
    },
  },

  // --- E-mail / Resend ---
  {
    match: /rate limit|too many requests|429/i,
    result: {
      title: 'Te veel pogingen',
      description: 'Er zijn te veel pogingen achter elkaar gedaan. Wacht een minuut en probeer het opnieuw.',
    },
  },
  {
    match: /invalid.*email|email.*invalid|unable to validate email/i,
    result: {
      title: 'Ongeldig e-mailadres',
      description: 'Dit e-mailadres heeft geen geldige indeling. Controleer op typefouten, bijvoorbeeld een ontbrekende @ of punt.',
    },
  },
  {
    match: /resend/i,
    result: {
      title: 'E-mail niet verstuurd',
      description: `De mail kon niet verstuurd worden. Probeer het zo opnieuw. ${CONTACT_SUPPORT}`,
    },
  },

  // --- Algemene 5xx ---
  {
    match: /internal server error|^5\d\d$|5\d\d internal|server error/i,
    result: {
      title: 'Serverfout',
      description: `Er ging iets mis aan onze kant. Probeer het opnieuw. ${CONTACT_SUPPORT}`,
    },
  },
];

const DUTCH_HINTS = /\b(niet|geen|deze|moet|kan|wordt|aangemaakt|verstuurd|verwijderd|opnieuw|controleer|probeer|ingesteld|bestaat|nodig|sessie|toegang|rechten|systeem|gebruiker|uitnodiging|wachtwoord|ontbreekt|mislukt)\b/i;

/**
 * Zet een willekeurige fout om in een kop + vervolgstap. Gebruik deze in toasts, zodat de
 * kop het probleem benoemt in plaats van "Fout".
 *
 * @param fallback Wat er staat als we de fout niet herkennen. Schrijf ook hier een
 *   vervolgstap: dit is precies het geval waarin de gebruiker niets anders heeft.
 */
export function describeError(error: unknown, fallback: string, fallbackTitle = 'Er ging iets mis'): FriendlyError {
  const { message, code, details } = extractError(error);
  const trimmed = message.trim();

  // 1. Structurele Postgres/PostgREST-code — betrouwbaarst, werkt ook als de tekst leeg
  //    of Engels is.
  if (code) {
    const byCode = messageForCode(code, trimmed, details);
    if (byCode) return byCode;
  }

  if (!trimmed) return { title: fallbackTitle, description: fallback };

  // 2. Bekende technische patronen.
  for (const { match, result } of TECHNICAL_PATTERNS) {
    if (match.test(trimmed)) {
      return typeof result === 'function' ? result(trimmed) : result;
    }
  }

  // 3. Meldingen die onze eigen backend al in het Nederlands stuurt, gaan ongewijzigd door:
  //    die bevatten context die wij hier niet kunnen verzinnen.
  if (DUTCH_HINTS.test(trimmed)) return { title: fallbackTitle, description: trimmed };

  return { title: fallbackTitle, description: fallback };
}

/**
 * Zelfde vertaling, alleen de tekst. Voor plekken waar al een passende kop staat.
 */
export function friendlyError(error: unknown, fallback: string): string {
  return describeError(error, fallback).description;
}
