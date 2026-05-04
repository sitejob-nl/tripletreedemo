import { ProcessedCallRecord } from '@/types/dashboard';
import { ReportageOverrideMetrics, ReportageWeeklyOverride } from '@/types/database';

export const REPORTAGE_OVERRIDE_YEAR = 2026;
export const REPORTAGE_OVERRIDE_THROUGH_WEEK = 15;
export const REPORTAGE_DAYS = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const;

export function metricNumber(metrics: ReportageOverrideMetrics | undefined, key: string, fallback = 0): number {
  const value = metrics?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    if (Number.isFinite(parsed)) return parsed;
  }
  return fallback;
}

export function overridesByWeek(overrides?: ReportageWeeklyOverride[]): Map<number, ReportageWeeklyOverride> {
  return new Map((overrides ?? []).map((override) => [override.week_number, override]));
}

export function overriddenWeeks(overrides?: ReportageWeeklyOverride[]): Set<number> {
  return new Set((overrides ?? []).map((override) => override.week_number));
}

export function rawRecordsWithoutOverrideWeeks<T extends Pick<ProcessedCallRecord, 'week_number'>>(
  data: T[],
  overrides?: ReportageWeeklyOverride[],
): T[] {
  const weeks = overriddenWeeks(overrides);
  if (weeks.size === 0) return data;
  return data.filter((record) => !weeks.has(Number(record.week_number)));
}

export function deriveCalls(metrics: ReportageOverrideMetrics | undefined): number {
  const explicitCalls = metricNumber(metrics, 'calls', NaN);
  if (Number.isFinite(explicitCalls)) return explicitCalls;
  const answered = metricNumber(metrics, 'answered', NaN);
  if (Number.isFinite(answered)) return answered;
  const sales = metricNumber(metrics, 'sales', 0);
  const bruto = metricNumber(metrics, 'brutoConversion', 0);
  if (sales > 0 && bruto > 0) return sales / bruto;
  return sales;
}

export function deriveUnreachable(metrics: ReportageOverrideMetrics | undefined): number {
  const sales = metricNumber(metrics, 'sales', 0);
  const calls = deriveCalls(metrics);
  const netto = metricNumber(metrics, 'nettoConversion', 0);
  if (sales > 0 && netto > 0) return Math.max(0, calls - sales / netto);
  return 0;
}

export function overrideHasExcelData(overrides?: ReportageWeeklyOverride[]): boolean {
  return (overrides?.length ?? 0) > 0;
}
