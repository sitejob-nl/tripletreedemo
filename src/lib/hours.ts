// Triple Tree business rule (Willem Geerts, 2026-04-24):
// Elk uur-getal dat in dashboard of rapportage getoond wordt, wordt per cel naar
// boven afgerond op hele uren. Kosten (tarief x uren) gebruiken diezelfde
// afgeronde waarde. Reden: call center factureert per vol uur.
//
// Gebruik één van:
//   - ceilHours(hours)            voor een numeriek uur-getal
//   - ceilHoursFromSeconds(sec)   voor secondes uit `durationSec` / `loggedSeconds`
//
// Afronding is per-cel: dag-cel en week-totaal worden afzonderlijk afgerond op
// hun eigen raw-waarde. Dat kan betekenen dat `som(dag-cellen)` niet exact
// gelijk is aan de week-totaal-cel; dat is bewust — elke zichtbare cel moet
// zelf de heel-uur-regel volgen.

export function ceilHours(hours: number): number {
  if (!Number.isFinite(hours) || hours <= 0) return 0;
  return Math.ceil(hours);
}

export function ceilHoursFromSeconds(seconds: number): number {
  if (!Number.isFinite(seconds) || seconds <= 0) return 0;
  return Math.ceil(seconds / 3600);
}
