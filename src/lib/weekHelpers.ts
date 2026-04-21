// Shared helpers for year/week handling in report templates.
// ISO-8601 week numbering — same logic as sync.js (`getWeekNumber`) so front/back agree.

export const getISOWeekCount = (year: number): 52 | 53 => {
  // A year has 53 ISO weeks iff Jan 1 is a Thursday, or it's a leap year and Jan 1 is a Wednesday.
  const jan1 = new Date(Date.UTC(year, 0, 1)).getUTCDay();
  const isLeap = (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
  if (jan1 === 4) return 53;
  if (jan1 === 3 && isLeap) return 53;
  return 52;
};

export const getAllWeeksForYear = (year: number): number[] => {
  const count = getISOWeekCount(year);
  return Array.from({ length: count }, (_, i) => i + 1);
};

export const getISOWeekNumber = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
  return Math.ceil(((d.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
};

export const getISOWeekYear = (date: Date): number => {
  const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
  return d.getUTCFullYear();
};

export const formatWeekLabel = (weekNumber: number, padding = 2): string => {
  return `W${String(weekNumber).padStart(padding, '0')}`;
};

// Parse a BasiCall date string (YYYY-MM-DD or DD-MM-YYYY) as a local-time Date.
// Using new Date('YYYY-MM-DD') would treat the string as UTC midnight, which
// then shifts to the previous calendar day in negative-UTC timezones when
// reading back via getDay()/getMonth(). Returning a local-midnight Date keeps
// day/month/year stable across timezones. Returns null on unrecognised input.
export const parseBasiCallDate = (str: string | null | undefined): Date | null => {
  if (!str) return null;
  // YYYY-MM-DD (ISO from beldatum_date trigger)
  let m = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return new Date(parseInt(m[1], 10), parseInt(m[2], 10) - 1, parseInt(m[3], 10));
  // DD-MM-YYYY (legacy beldatum text)
  m = str.match(/^(\d{2})-(\d{2})-(\d{4})/);
  if (m) return new Date(parseInt(m[3], 10), parseInt(m[2], 10) - 1, parseInt(m[1], 10));
  // Fallback: let JS parse it (may still have timezone shift for other ISO variants)
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
};
