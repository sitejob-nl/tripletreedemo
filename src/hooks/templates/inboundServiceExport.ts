import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/integrations/supabase/client';
import {
  averageMetric,
  buildInboundServiceBreakdown,
  completeMetric,
  SERVICE_DAYS,
  type InboundServiceBreakdown,
  type InboundServiceBucket,
  type InboundServiceRecord,
  type ServiceDay,
} from '@/lib/inboundServiceMetrics';
import type { MappingConfig, ReportageWeeklyOverride } from '@/types/database';
import { getAllWeeksForYear, getISOWeekYear, parseBasiCallDate } from '@/lib/weekHelpers';
import { friendlyError } from '@/lib/friendlyError';
import { fetchYearReportageOverrides } from './reportageOverrideExportUtils';

type RawRecord = {
  beldatum: string | null;
  beldatum_date: string | null;
  gesprekstijd_sec: number;
  resultaat: string | null;
  week_number: number | null;
  raw_data: Record<string, unknown> | null;
};

type LoggedRow = {
  date: string;
  total_seconds: number | null;
  corrected_seconds: number | null;
};

type Cell = string | number | null;
type Formatter = (value: number) => string;

const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

const THIN_BORDER = {
  top: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  left: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  right: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
};

const STYLE_SECTION = (colorHex: string) => ({
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: colorHex } },
  alignment: { horizontal: 'left' as const },
  border: THIN_BORDER,
});

const STYLE_LABEL = { alignment: { horizontal: 'left' as const }, border: THIN_BORDER };
const STYLE_TOTAL = {
  font: { bold: true },
  fill: { fgColor: { rgb: 'F1F5F9' } },
  alignment: { horizontal: 'right' as const },
  border: THIN_BORDER,
};
const STYLE_TARGET = {
  font: { italic: true, color: { rgb: '64748B' } },
  alignment: { horizontal: 'right' as const },
  border: THIN_BORDER,
};
const STYLE_CELL = { alignment: { horizontal: 'right' as const }, border: THIN_BORDER };
const STYLE_TITLE = { font: { bold: true, sz: 14 }, alignment: { horizontal: 'left' as const } };

interface ExportArgs {
  projectId: string;
  projectName: string;
  mappingConfig?: MappingConfig;
  year?: number;
  reportageOverrides?: ReportageWeeklyOverride[];
  onToast?: (message: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
}

interface LoggedCoverage {
  byWeek: Record<number, Partial<Record<ServiceDay, number>>>;
}

function styleCell(ws: XLSX.WorkSheet, ref: string, style: Record<string, unknown>) {
  if (!ws[ref]) ws[ref] = { v: '', t: 's' };
  ws[ref].s = style;
}

function colLetter(index: number): string {
  let current = index;
  let result = '';
  while (true) {
    result = String.fromCharCode(65 + (current % 26)) + result;
    current = Math.floor(current / 26) - 1;
    if (current < 0) return result;
  }
}

function styleRangeRow(ws: XLSX.WorkSheet, rowIndex: number, columns: number, style: Record<string, unknown>) {
  for (let column = 0; column < columns; column += 1) styleCell(ws, `${colLetter(column)}${rowIndex + 1}`, style);
}

function getDay(date: Date): ServiceDay | null {
  const days: Record<number, ServiceDay> = {
    0: 'zondag', 1: 'maandag', 2: 'dinsdag', 3: 'woensdag',
    4: 'donderdag', 5: 'vrijdag', 6: 'zaterdag',
  };
  return days[date.getDay()] ?? null;
}

function getISOWeek(date: Date): number {
  const current = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  current.setUTCDate(current.getUTCDate() + 4 - (current.getUTCDay() || 7));
  const yearStart = new Date(Date.UTC(current.getUTCFullYear(), 0, 1));
  return Math.ceil(((current.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
}

function formatValue(value: number | null, formatter: Formatter): string {
  return value === null ? '—' : formatter(value);
}

const formatNumber: Formatter = (value) => Math.round(value).toLocaleString('nl-NL');
const formatDecimal: Formatter = (value) => value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
const formatPercent: Formatter = (value) => `${(value * 100).toLocaleString('nl-NL', { minimumFractionDigits: 1, maximumFractionDigits: 1 })}%`;

function ratio(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function withinThreshold(bucket: InboundServiceBucket): number | null {
  return completeMetric(bucket.answeredWithinThreshold, bucket.waitTimeKnown, bucket.answered);
}

function averageCallMinutes(bucket: InboundServiceBucket): number | null {
  const seconds = averageMetric(bucket.durationSec, bucket.durationKnown, bucket.answered);
  return seconds === null ? null : seconds / 60;
}

function averageAfterCallMinutes(bucket: InboundServiceBucket): number | null {
  const seconds = averageMetric(bucket.afterCallSec, bucket.afterCallKnown, bucket.answered);
  return seconds === null ? null : seconds / 60;
}

function serviceLevel(bucket: InboundServiceBucket): number | null {
  const within = withinThreshold(bucket);
  return within === null ? null : ratio(within, bucket.answered);
}

function reachability(bucket: InboundServiceBucket): number {
  return ratio(bucket.answered, Math.max(0, bucket.offered - bucket.shortAbandoned));
}

function toServiceRecord(record: RawRecord): InboundServiceRecord | null {
  const date = parseBasiCallDate(record.beldatum_date ?? record.beldatum);
  if (!date) return null;
  const day = getDay(date);
  if (!day) return null;
  return {
    week_number: record.week_number,
    day_name: day,
    bc_result_naam: record.resultaat,
    bc_gesprekstijd: Number(record.gesprekstijd_sec) || 0,
    raw_data: record.raw_data,
  };
}

function getAgentHours(
  report: InboundServiceBreakdown,
  week: number,
  logged: LoggedCoverage,
  day?: ServiceDay,
): number | null {
  const bucket = day ? report.perDay[day] : report.total;
  if (bucket.agentHoursKnown) return bucket.agentHours;
  if (day) {
    const value = logged.byWeek[week]?.[day];
    return value !== undefined ? value : bucket.offered === 0 ? 0 : null;
  }
  const activeDays = SERVICE_DAYS.filter((item) => report.perDay[item].offered > 0);
  if (activeDays.length === 0) return 0;
  const values = activeDays.map((item) => getAgentHours(report, week, logged, item));
  return values.every((value) => value !== null)
    ? values.reduce<number>((sum, value) => sum + (value ?? 0), 0)
    : null;
}

function appendSection(rows: Cell[][], title: string) {
  rows.push([title]);
}

function appendWeekRow(
  rows: Cell[][],
  report: InboundServiceBreakdown,
  label: string,
  value: (bucket: InboundServiceBucket, day?: ServiceDay) => number | null,
  formatter: Formatter,
  target: number | null = null,
) {
  rows.push([
    label,
    target === null ? '' : formatter(target),
    ...SERVICE_DAYS.map((day) => formatValue(value(report.perDay[day], day), formatter)),
    formatValue(value(report.total), formatter),
  ]);
}

function buildWeekSheet({
  week,
  report,
  logged,
  serviceLevelSec,
  targetReachability,
  targetServiceLevel,
}: {
  week: number;
  report: InboundServiceBreakdown;
  logged: LoggedCoverage;
  serviceLevelSec: number;
  targetReachability: number;
  targetServiceLevel: number;
}): XLSX.WorkSheet {
  const rows: Cell[][] = [[`Week ${String(week).padStart(2, '0')}`], [], ['Rapportage', 'Target', ...DAY_LABELS, 'Totaal'], []];

  appendSection(rows, 'UREN');
  appendWeekRow(rows, report, 'Inzet agenten (uren)', (_bucket, day) => getAgentHours(report, week, logged, day), formatDecimal);
  appendWeekRow(rows, report, 'Inzet mail (uren)', (bucket) => bucket.mailHoursKnown ? bucket.mailHours : null, formatDecimal);
  appendWeekRow(rows, report, 'Totaal uren', (bucket, day) => {
    const agent = getAgentHours(report, week, logged, day);
    const mail = bucket.mailHoursKnown ? bucket.mailHours : null;
    return agent === null || mail === null ? null : agent + mail;
  }, formatDecimal);

  appendSection(rows, 'RECORDS');
  appendWeekRow(rows, report, 'Aangeboden calls', (bucket) => bucket.offered, formatNumber);
  appendWeekRow(rows, report, 'Aangenomen calls', (bucket) => bucket.answered, formatNumber);
  appendWeekRow(rows, report, `Binnen ${serviceLevelSec} seconden`, withinThreshold, formatNumber);
  appendWeekRow(rows, report, 'Short abandoned', (bucket) => bucket.shortAbandoned, formatNumber);

  appendSection(rows, "KPI'S");
  appendWeekRow(rows, report, 'Gemiddelde gesprekstijd (min)', averageCallMinutes, formatDecimal);
  appendWeekRow(rows, report, 'Gemiddelde nawerktijd (min)', averageAfterCallMinutes, formatDecimal);
  appendWeekRow(rows, report, 'Bereikbaarheid', reachability, formatPercent, targetReachability);
  appendWeekRow(rows, report, 'Service level', serviceLevel, formatPercent, targetServiceLevel);
  appendWeekRow(rows, report, 'Short abandoned %', (bucket) => ratio(bucket.shortAbandoned, bucket.offered), formatPercent);

  if (report.reasonLabels.length > 0) {
    appendSection(rows, 'CALLREASONS');
    for (const label of report.reasonLabels) appendWeekRow(rows, report, label, (bucket) => bucket.reasons[label] ?? 0, formatNumber);
    appendWeekRow(rows, report, 'Totaal callreasons', (bucket) => Object.values(bucket.reasons).reduce((sum, value) => sum + value, 0), formatNumber);
  }

  if (report.callerLabels.length > 0) {
    appendSection(rows, 'GEBELD DOOR');
    for (const label of report.callerLabels) appendWeekRow(rows, report, label, (bucket) => bucket.callers[label] ?? 0, formatNumber);
    appendWeekRow(rows, report, 'Totaal gebeld door', (bucket) => Object.values(bucket.callers).reduce((sum, value) => sum + value, 0), formatNumber);
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const columns = SERVICE_DAYS.length + 3;
  ws['!cols'] = [{ wch: 38 }, { wch: 12 }, ...SERVICE_DAYS.map(() => ({ wch: 12 })), { wch: 14 }];
  styleRangeRow(ws, 0, columns, STYLE_TITLE);
  const sectionColors: Record<string, string> = {
    UREN: '64748B', RECORDS: '22C55E', "KPI'S": '3B82F6', CALLREASONS: '06B6D4', 'GEBELD DOOR': '8B5CF6', Rapportage: '4A7C4E',
  };
  rows.forEach((row, rowIndex) => {
    const first = String(row[0] ?? '');
    if (sectionColors[first]) {
      styleRangeRow(ws, rowIndex, columns, STYLE_SECTION(sectionColors[first]));
      return;
    }
    if (!first || row.length <= 1) return;
    styleCell(ws, `A${rowIndex + 1}`, STYLE_LABEL);
    styleCell(ws, `B${rowIndex + 1}`, STYLE_TARGET);
    for (let column = 2; column < columns - 1; column += 1) styleCell(ws, `${colLetter(column)}${rowIndex + 1}`, STYLE_CELL);
    styleCell(ws, `${colLetter(columns - 1)}${rowIndex + 1}`, STYLE_TOTAL);
  });
  return ws;
}

function buildTotalSheet({
  weeks,
  reports,
  logged,
  year,
  projectName,
  serviceLevelSec,
  targetReachability,
  targetServiceLevel,
}: {
  weeks: number[];
  reports: Record<number, InboundServiceBreakdown>;
  logged: LoggedCoverage;
  year: number;
  projectName: string;
  serviceLevelSec: number;
  targetReachability: number;
  targetServiceLevel: number;
}): XLSX.WorkSheet {
  const rows: Cell[][] = [[`Rapportage ${projectName} — ${year}`], [], ['Jaaroverzicht', 'Target', ...weeks.map((week) => `wk${String(week).padStart(2, '0')}`)], []];
  const append = (label: string, getter: (report: InboundServiceBreakdown, week: number) => number | null, formatter: Formatter, target: number | null = null) => {
    rows.push([label, target === null ? '' : formatter(target), ...weeks.map((week) => formatValue(getter(reports[week], week), formatter))]);
  };

  appendSection(rows, 'UREN');
  append('Inzet agenten (uren)', (report, week) => getAgentHours(report, week, logged), formatDecimal);
  append('Inzet mail (uren)', (report) => report.total.mailHoursKnown ? report.total.mailHours : null, formatDecimal);
  appendSection(rows, 'RECORDS');
  append('Aangeboden calls', (report) => report.total.offered, formatNumber);
  append('Aangenomen calls', (report) => report.total.answered, formatNumber);
  append(`Binnen ${serviceLevelSec} seconden`, (report) => withinThreshold(report.total), formatNumber);
  append('Short abandoned', (report) => report.total.shortAbandoned, formatNumber);
  appendSection(rows, "KPI'S");
  append('Gemiddelde gesprekstijd (min)', (report) => averageCallMinutes(report.total), formatDecimal);
  append('Gemiddelde nawerktijd (min)', (report) => averageAfterCallMinutes(report.total), formatDecimal);
  append('Bereikbaarheid', (report) => reachability(report.total), formatPercent, targetReachability);
  append('Service level', (report) => serviceLevel(report.total), formatPercent, targetServiceLevel);
  append('Short abandoned %', (report) => ratio(report.total.shortAbandoned, report.total.offered), formatPercent);

  const ws = XLSX.utils.aoa_to_sheet(rows);
  const columns = weeks.length + 2;
  ws['!cols'] = [{ wch: 38 }, { wch: 12 }, ...weeks.map(() => ({ wch: 10 }))];
  styleRangeRow(ws, 0, columns, STYLE_TITLE);
  const colors: Record<string, string> = { UREN: '64748B', RECORDS: '22C55E', "KPI'S": '3B82F6', Jaaroverzicht: '4A7C4E' };
  rows.forEach((row, rowIndex) => {
    const first = String(row[0] ?? '');
    if (colors[first]) {
      styleRangeRow(ws, rowIndex, columns, STYLE_SECTION(colors[first]));
      return;
    }
    if (!first || row.length <= 1) return;
    styleCell(ws, `A${rowIndex + 1}`, STYLE_LABEL);
    styleCell(ws, `B${rowIndex + 1}`, STYLE_TARGET);
    for (let column = 2; column < columns; column += 1) styleCell(ws, `${colLetter(column)}${rowIndex + 1}`, STYLE_CELL);
  });
  return ws;
}

export async function exportInboundServiceYear({
  projectId,
  projectName,
  mappingConfig,
  year = new Date().getFullYear(),
  reportageOverrides = [],
  onToast,
}: ExportArgs): Promise<void> {
  try {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
    const records: RawRecord[] = [];
    const pageSize = 1000;
    for (let offset = 0; ; offset += pageSize) {
      const { data, error } = await supabase
        .from('call_records')
        .select('beldatum,beldatum_date,gesprekstijd_sec,resultaat,week_number,raw_data')
        .eq('project_id', projectId)
        .gte('beldatum_date', yearStart)
        .lte('beldatum_date', yearEnd)
        .order('beldatum_date', { ascending: true })
        .range(offset, offset + pageSize - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      records.push(...(data as RawRecord[]));
      if (data.length < pageSize) break;
    }

    const { data: loggedRows, error: loggedError } = await supabase
      .from('daily_logged_time')
      .select('date,total_seconds,corrected_seconds')
      .eq('project_id', projectId)
      .gte('date', yearStart)
      .lte('date', yearEnd);
    if (loggedError) throw loggedError;

    const overrides = await fetchYearReportageOverrides(projectId, year, 'inbound_service', reportageOverrides);
    const recordsByWeek: Record<number, InboundServiceRecord[]> = {};
    for (const record of records) {
      const date = parseBasiCallDate(record.beldatum_date ?? record.beldatum);
      if (!date || getISOWeekYear(date) !== year || !record.week_number) continue;
      const converted = toServiceRecord(record);
      if (!converted) continue;
      (recordsByWeek[record.week_number] ??= []).push(converted);
    }
    const overridesByWeek = new Map<number, ReportageWeeklyOverride[]>();
    for (const override of overrides) {
      const list = overridesByWeek.get(override.week_number) ?? [];
      list.push(override);
      overridesByWeek.set(override.week_number, list);
    }

    const logged: LoggedCoverage = { byWeek: {} };
    for (const row of (loggedRows ?? []) as LoggedRow[]) {
      const date = parseBasiCallDate(row.date);
      if (!date || getISOWeekYear(date) !== year) continue;
      const day = getDay(date);
      if (!day) continue;
      const week = getISOWeek(date);
      logged.byWeek[week] ??= {};
      logged.byWeek[week][day] = Number(row.corrected_seconds ?? row.total_seconds ?? 0) / 3600;
    }

    const weeks = getAllWeeksForYear(year);
    const reports = Object.fromEntries(weeks.map((week) => [
      week,
      buildInboundServiceBreakdown(recordsByWeek[week] ?? [], mappingConfig, overridesByWeek.get(week) ?? []),
    ])) as Record<number, InboundServiceBreakdown>;
    const serviceLevelSec = mappingConfig?.service_targets?.service_level_sec ?? 30;
    const targetReachability = mappingConfig?.service_targets?.bereikbaarheid ?? 0.95;
    const targetServiceLevel = mappingConfig?.service_targets?.service_level ?? 0.70;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, buildTotalSheet({
      weeks, reports, logged, year, projectName, serviceLevelSec, targetReachability, targetServiceLevel,
    }), 'Totaal');
    for (const week of weeks) {
      XLSX.utils.book_append_sheet(workbook, buildWeekSheet({
        week,
        report: reports[week],
        logged,
        serviceLevelSec,
        targetReachability,
        targetServiceLevel,
      }), `W${String(week).padStart(2, '0')}`);
    }

    const safeName = projectName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const filename = `Rapportage_${safeName}_${year}.xlsx`;
    XLSX.writeFile(workbook, filename);
    onToast?.({ title: 'Export succesvol', description: `Jaarrapport ${year} geëxporteerd als ${filename}` });
  } catch (error) {
    console.error('Inbound service year export failed:', error);
    onToast?.({
      title: 'Export mislukt',
      description: friendlyError(error, 'Het jaarrapport kon niet gegenereerd worden. Probeer het opnieuw.'),
      variant: 'destructive',
    });
  }
}
