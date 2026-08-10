// Controleert de foutmeldingen die gebruikers te zien krijgen: Nederlands, met een
// concrete vervolgstap, en met de juiste vertaling per technische fout.
//
// WAAROM: op 03-08-2026 kreeg een klant drie keer "Dit e-mailadres is niet geldig" te zien
// terwijl zijn inloglink verlopen was — een regex voor e-mailadressen stond boven de regel
// voor verlopen links en won. Die volgorde is niet te zien aan de code; wel aan een test.
//
// Draaien:
//   npx vite-node scripts/check-error-messages.mjs
//
// Exit-code 1 bij afwijkingen, zodat het ook in CI kan.
import { describeError } from '../src/lib/friendlyError.ts';

// Echte foutteksten uit Supabase, Postgres, de browser en het sync-script,
// met de kop die de gebruiker hoort te zien.
const CASES = [
  // Inloggen en links — de categorie waar het op 3 augustus misging.
  ['Email link is invalid or has expired', 'Link is verlopen'],
  ['Recovery link is invalid or has expired', 'Link is verlopen'],
  ['Token has expired or is invalid', 'Link is verlopen'],
  ['otp_expired', 'Link is verlopen'],
  ['Invalid login credentials', 'Inloggen mislukt'],
  ['Email not confirmed', 'E-mail nog niet bevestigd'],
  ['User already registered', 'Account bestaat al'],
  ['Signups not allowed for otp', 'Zelf registreren kan niet'],
  ['Database error saving new user', 'Account aanmaken mislukt'],
  ['Password should be at least 6 characters', 'Wachtwoord te kort'],
  ['For security purposes, you can only request this after 51 seconds.', 'Nog even wachten'],

  // Rechten en sessie
  ['new row violates row-level security policy for table "projects"', 'Geen rechten'],
  ['permission denied for table call_records', 'Geen rechten'],
  ['unauthorized', 'Geen toegang'],
  ['JWT expired', 'Sessie verlopen'],

  // Netwerk
  ['Failed to fetch', 'Geen verbinding'],
  ['Load failed', 'Geen verbinding'],
  ['NetworkError when attempting to fetch resource.', 'Geen verbinding'],
  ['canceling statement due to statement timeout', 'Duurt te lang'],

  // Database
  ['duplicate key value violates unique constraint "projects_project_key_key"', 'Bestaat al'],
  ['JSON object requested, multiple (or no) rows returned', 'Niets gevonden'],
  ['null value in column "name" violates not-null constraint', 'Verplicht veld leeg'],

  // BasiCall / synchronisatie — teksten uit sync_logs.error_message
  ['Request failed with status code 500', 'BasiCall gaf een storing'],
  ['[Mogelijk token-/auth-probleem] Request failed with status code 401', 'BasiCall weigert de toegang'],
  ['135 van 401 records ontbreken (135 zonder bruikbare datum overgeslagen).', 'Niet alle records opgehaald'],
  ['25 van 86 records konden niet worden opgehaald.', 'Niet alle records opgehaald'],

  // E-mail
  ['Unable to validate email address: invalid format', 'Ongeldig e-mailadres'],
  ['Email rate limit exceeded', 'Te veel pogingen'],
];

// Elke melding moet de gebruiker vertellen wat hij nu kan doen.
const ACTIE_WOORDEN = /\b(probeer|controleer|vraag|kies|wacht|log |vul|start|open|laat|ontkoppel|meld|herlaad|pas |stel |gebruik|verwijder|actie is)/i;

// Een melding die nog Engels is, is niet vertaald.
const ENGELSE_WOORDEN = /\b(invalid|expired|failed|error|denied|violates|constraint|request|unable|not allowed|rate limit)\b/i;

let fouten = 0;
const fout = (tekst) => { fouten += 1; console.error(`✗ ${tekst}`); };

for (const [invoer, verwachteKop] of CASES) {
  const { title, description } = describeError(invoer, '[FALLBACK]');

  if (title !== verwachteKop) {
    fout(`${JSON.stringify(invoer)}\n    kop "${title}", verwacht "${verwachteKop}"`);
  }
  if (description === '[FALLBACK]') {
    fout(`${JSON.stringify(invoer)} valt terug op de standaardtekst — patroon ontbreekt.`);
  }
  if (ENGELSE_WOORDEN.test(description)) {
    fout(`${JSON.stringify(invoer)} levert nog Engelse tekst op: "${description}"`);
  }
  if (!ACTIE_WOORDEN.test(description)) {
    fout(`${JSON.stringify(invoer)} zegt niet wat de gebruiker moet doen: "${description}"`);
  }
}

// Onbekende fouten mogen de technische tekst nooit doorlaten naar het scherm.
const onbekend = describeError('ECONNRESET while reading upstream', 'Er ging iets mis. Probeer het opnieuw.');
if (onbekend.description.includes('ECONNRESET')) {
  fout('Een onbekende technische fout lekt door naar de gebruiker.');
}

if (fouten > 0) {
  console.error(`\n${fouten} probleem(en) in de foutmeldingen.`);
  process.exit(1);
}
console.log(`✓ ${CASES.length} foutmeldingen: Nederlands, juiste categorie, met vervolgstap.`);
