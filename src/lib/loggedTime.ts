import { getDay, getISOWeek, getISOWeekYear } from 'date-fns';
import { ceilHours } from './hours';

export type HoursDay = 'maandag' | 'dinsdag' | 'woensdag' | 'donderdag' | 'vrijdag' | 'zaterdag' | 'zondag';
export type DailyLoggedTimeBreakdown = Partial<Record<HoursDay, number>>;

export interface LoggedTimeRow {
  date: string;
  total_seconds: number | null;
  corrected_seconds: number | null;
}

// Een expliciete nulcorrectie is een waarde. Een lege urensync is geen bewijs
// van nul inzet en moet de bestaande gesprekstijd-fallback beschikbaar houden.
export function resolvedLoggedSeconds(row: Pick<LoggedTimeRow, 'total_seconds' | 'corrected_seconds'>, factor = 1): number | undefined {
  const seconds = row.corrected_seconds ?? row.total_seconds;
  if (seconds == null || !Number.isFinite(seconds) || seconds < 0) return undefined;
  if (seconds === 0 && row.corrected_seconds == null) return undefined;
  return seconds * factor;
}

const weekdays: HoursDay[] = ['zondag', 'maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag'];

export function summarizeLoggedTime(rows: LoggedTimeRow[], factor = 1) {
  const dailyHours: DailyLoggedTimeBreakdown = {};
  const weeklyHours: Record<string, number> = {};
  let totalSeconds = 0;
  let hasData = false;
  for (const row of rows) {
    const seconds = resolvedLoggedSeconds(row, factor);
    if (seconds === undefined) continue;
    hasData = true;
    totalSeconds += seconds;
    const date = new Date(`${row.date}T12:00:00`);
    const day = weekdays[getDay(date)];
    const hours = seconds / 3600;
    dailyHours[day] = (dailyHours[day] ?? 0) + hours;
    const week = `${getISOWeekYear(date)}-${String(getISOWeek(date)).padStart(2, '0')}`;
    weeklyHours[week] = (weeklyHours[week] ?? 0) + ceilHours(hours);
  }
  return { totalSeconds, totalHours: totalSeconds / 3600, hasData, dailyHours, weeklyHours };
}
