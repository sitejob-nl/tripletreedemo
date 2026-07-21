/**
 * Client-side mirror of the SQL function `public.client_visible_cutoff()`.
 *
 * IMPORTANT: the SQL function is the SINGLE SOURCE OF TRUTH. The embargo is
 * enforced server-side via RLS on call_records / daily_logged_time, so real
 * clients are capped regardless of the frontend. This helper exists ONLY for
 * the admin "bekijk als klant" (view-as-client) preview: the admin queries the
 * database as admin and therefore bypasses the RLS embargo, so we reproduce the
 * cutoff client-side to show what a client would actually see.
 *
 * Rule (Europe/Amsterdam): a calendar day's data is released to clients at
 * 09:00 the next morning. The max inclusive visible date is therefore:
 *   - from 09:00 onward : yesterday   (today - 1)
 *   - before 09:00      : the day before (today - 2)
 *
 * Keep this in sync with migration
 * supabase/migrations/20260625131500_client_embargo_publication_window.sql.
 */
export function getClientVisibleCutoff(now: Date = new Date()): string {
  // Read Amsterdam wall-clock parts regardless of the runtime timezone.
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Europe/Amsterdam',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    hour12: false,
  }).formatToParts(now);

  const get = (type: string) => parts.find((p) => p.type === type)?.value ?? '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  let hour = Number(get('hour'));
  if (hour === 24) hour = 0; // some runtimes emit '24' for midnight

  const daysBack = hour >= 9 ? 1 : 2;

  // Use a UTC anchor so the day subtraction is timezone-safe.
  const anchor = new Date(Date.UTC(year, month - 1, day));
  anchor.setUTCDate(anchor.getUTCDate() - daysBack);

  const yyyy = anchor.getUTCFullYear();
  const mm = String(anchor.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(anchor.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}
