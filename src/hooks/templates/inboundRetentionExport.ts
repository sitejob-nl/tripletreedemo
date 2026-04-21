import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/integrations/supabase/client';
import { MappingConfig } from '@/types/database';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { detectFrequencyFromConfig } from '@/lib/statsHelpers';
import { getAllWeeksForYear, getISOWeekYear, parseBasiCallDate } from '@/lib/weekHelpers';

type RawRecord = {
  basicall_record_id: number;
  beldatum: string | null;
  beldatum_date: string | null;
  gesprekstijd_sec: number;
  resultaat: string | null;
  week_number: number | null;
  raw_data: Record<string, unknown> | null;
};

type DayKey = 'maandag' | 'dinsdag' | 'woensdag' | 'donderdag' | 'vrijdag' | 'zaterdag' | 'zondag';

interface RetentionStats {
  calls: number;
  retained: number;
  lost: number;
  partial: number;
  unreachable: number;
  retainedValue: number;
  lostValue: number;
  partialValue: number;
  durationSec: number;
  loggedSeconds: number;
  // Reden-breakdown: category-name -> count
  reasonCounts: Record<string, number>;
}

interface DailyRetentionStats {
  perDay: Record<DayKey, RetentionStats>;
  total: RetentionStats;
}

const DAYS: DayKey[] = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

const emptyStats = (categories: string[]): RetentionStats => ({
  calls: 0,
  retained: 0,
  lost: 0,
  partial: 0,
  unreachable: 0,
  retainedValue: 0,
  lostValue: 0,
  partialValue: 0,
  durationSec: 0,
  loggedSeconds: 0,
  reasonCounts: Object.fromEntries(categories.map((c) => [c, 0])),
});

const emptyWeek = (categories: string[]): DailyRetentionStats => ({
  perDay: {
    maandag: emptyStats(categories),
    dinsdag: emptyStats(categories),
    woensdag: emptyStats(categories),
    donderdag: emptyStats(categories),
    vrijdag: emptyStats(categories),
    zaterdag: emptyStats(categories),
    zondag: emptyStats(categories),
  },
  total: emptyStats(categories),
});

const getDayKey = (date: Date): DayKey | null => {
  const map: Record<number, DayKey> = {
    0: 'zondag', 1: 'maandag', 2: 'dinsdag', 3: 'woensdag',
    4: 'donderdag', 5: 'vrijdag', 6: 'zaterdag',
  };
  return map[date.getDay()] ?? null;
};

// ========== Styling ==========
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

const STYLE_LABEL = {
  alignment: { horizontal: 'left' as const },
  border: THIN_BORDER,
};

const STYLE_TOTAL_COL = {
  font: { bold: true },
  fill: { fgColor: { rgb: 'F1F5F9' } },
  alignment: { horizontal: 'right' as const },
  border: THIN_BORDER,
};

const STYLE_CELL = { border: THIN_BORDER };

const STYLE_TITLE = {
  font: { bold: true, sz: 14 },
  alignment: { horizontal: 'left' as const },
};

function styleCell(ws: XLSX.WorkSheet, ref: string, style: Record<string, unknown>) {
  if (!ws[ref]) ws[ref] = { v: '', t: 's' };
  ws[ref].s = style;
}

function colLetter(idx: number): string {
  let n = idx;
  let s = '';
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return s;
}

function styleRangeRow(ws: XLSX.WorkSheet, rowIdx: number, numCols: number, style: Record<string, unknown>) {
  for (let c = 0; c < numCols; c++) {
    styleCell(ws, `${colLetter(c)}${rowIdx + 1}`, style);
  }
}

interface ExportArgs {
  projectId: string;
  projectName: string;
  mappingConfig?: MappingConfig;
  year?: number;
  onToast?: (msg: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
}

export async function exportInboundRetentionYear(args: ExportArgs): Promise<void> {
  const {
    projectId,
    projectName,
    mappingConfig,
    year = new Date().getFullYear(),
    onToast,
  } = args;

  try {
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;

    const retentionSet = new Set(mappingConfig?.retention_results ?? []);
    const lostSet = new Set(mappingConfig?.lost_results ?? []);
    const partialSet = new Set(mappingConfig?.partial_success_results ?? []);
    const unreachableSet = new Set(mappingConfig?.unreachable_results ?? []);
    const reasonCategories = mappingConfig?.reason_categories ?? {};
    const categoryNames = Object.keys(reasonCategories);
    // Reverse map: code -> category
    const codeToCategory = new Map<string, string>();
    for (const [cat, codes] of Object.entries(reasonCategories)) {
      codes.forEach((c) => codeToCategory.set(c, cat));
    }

    // 1. Fetch records
    const records: RawRecord[] = [];
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('call_records')
        .select('basicall_record_id, beldatum, beldatum_date, gesprekstijd_sec, resultaat, week_number, raw_data')
        .eq('project_id', projectId)
        .gte('beldatum_date', yearStart)
        .lte('beldatum_date', yearEnd)
        .order('beldatum_date', { ascending: true })
        .range(offset, offset + PAGE - 1);
      if (error) throw error;
      if (!data || data.length === 0) break;
      records.push(...(data as RawRecord[]));
      if (data.length < PAGE) break;
      offset += PAGE;
    }

    // 2. Fetch logged time
    const { data: loggedRows, error: loggedErr } = await supabase
      .from('daily_logged_time')
      .select('date, total_seconds, corrected_seconds')
      .eq('project_id', projectId)
      .gte('date', yearStart)
      .lte('date', yearEnd);
    if (loggedErr) throw loggedErr;

    // 3. Aggregate per week
    const weeks = getAllWeeksForYear(year);
    const weekStats: Record<number, DailyRetentionStats> = {};
    weeks.forEach((w) => (weekStats[w] = emptyWeek(categoryNames)));
    const yearTotal = emptyWeek(categoryNames);

    const amountCol = mappingConfig?.amount_col ?? 'termijnbedrag';
    const freqCol = mappingConfig?.freq_col ?? 'frequentie';
    const freqMap = mappingConfig?.freq_map ?? {};

    records.forEach((record) => {
      const date = parseBasiCallDate(record.beldatum_date ?? record.beldatum);
      if (!date) return;
      if (getISOWeekYear(date) !== year) return;
      const week = record.week_number ?? null;
      if (!week || !weekStats[week]) return;
      const dayKey = getDayKey(date);
      if (!dayKey) return;

      const rawData = record.raw_data ?? {};
      const resultName = record.resultaat ?? ((rawData['bc_result_naam'] as string) ?? 'Onbekend');
      const amountRaw = rawData[amountCol] ?? rawData['Bedrag'] ?? rawData['termijnbedrag'];
      const amount = amountRaw ? parseDutchFloat(amountRaw as string | number) : 0;
      // Detect frequency per record — donors may be monthly/quarterly/yearly.
      // Uses the same logic as the rest of the dashboard (statsHelpers).
      const freqRaw = rawData[freqCol] ?? rawData['frequentie'] ?? rawData['Frequentie'] ?? rawData['Termijn'];
      const freq = detectFrequencyFromConfig(freqRaw, freqMap, resultName);
      const annualValue = amount * freq.multiplier;
      const durationSec = Number(record.gesprekstijd_sec) || 0;
      const reasonCat = codeToCategory.get(resultName);

      [
        weekStats[week].perDay[dayKey],
        weekStats[week].total,
        yearTotal.perDay[dayKey],
        yearTotal.total,
      ].forEach((s) => {
        s.calls++;
        s.durationSec += durationSec;
        if (retentionSet.has(resultName)) {
          s.retained++;
          s.retainedValue += annualValue;
        } else if (lostSet.has(resultName)) {
          s.lost++;
          s.lostValue += annualValue;
        } else if (partialSet.has(resultName)) {
          s.partial++;
          s.partialValue += annualValue;
        } else if (unreachableSet.has(resultName)) {
          s.unreachable++;
        }
        if (reasonCat) {
          s.reasonCounts[reasonCat] = (s.reasonCounts[reasonCat] ?? 0) + 1;
        }
      });
    });

    (loggedRows ?? []).forEach((row) => {
      const date = parseBasiCallDate(row.date);
      if (!date) return;
      if (getISOWeekYear(date) !== year) return;
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStartUtc = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((d.getTime() - yearStartUtc.getTime()) / 86400000 + 1) / 7);
      if (!weekStats[week]) return;
      const dayKey = getDayKey(date);
      if (!dayKey) return;
      const seconds = Number(row.corrected_seconds ?? row.total_seconds) || 0;
      weekStats[week].perDay[dayKey].loggedSeconds += seconds;
      weekStats[week].total.loggedSeconds += seconds;
      yearTotal.perDay[dayKey].loggedSeconds += seconds;
      yearTotal.total.loggedSeconds += seconds;
    });

    // 4. Build workbook
    const wb = XLSX.utils.book_new();
    const getHours = (s: RetentionStats) =>
      s.loggedSeconds > 0 ? s.loggedSeconds / 3600 : s.durationSec / 3600;

    const totaalSheet = buildTotaalSheet({
      weeks,
      weekStats,
      yearTotal,
      year,
      projectName,
      getHours,
      categoryNames,
    });
    XLSX.utils.book_append_sheet(wb, totaalSheet, 'Totaal');

    weeks.forEach((w) => {
      const ws = buildWeekSheet({
        week: w,
        year,
        weekStats: weekStats[w],
        getHours,
        categoryNames,
      });
      XLSX.utils.book_append_sheet(wb, ws, `W${String(w).padStart(2, '0')}`);
    });

    const safeName = projectName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const filename = `Rapportage_${safeName}_${year}.xlsx`;
    XLSX.writeFile(wb, filename);

    onToast?.({
      title: 'Export succesvol',
      description: `Jaarrapport ${year} geëxporteerd als ${filename}`,
    });
  } catch (err) {
    console.error('Inbound retention year export failed:', err);
    onToast?.({
      title: 'Export mislukt',
      description: err instanceof Error ? err.message : 'Onbekende fout',
      variant: 'destructive',
    });
  }
}

// ========== Sheet builders ==========

interface TotaalArgs {
  weeks: number[];
  weekStats: Record<number, DailyRetentionStats>;
  yearTotal: DailyRetentionStats;
  year: number;
  projectName: string;
  getHours: (s: RetentionStats) => number;
  categoryNames: string[];
}

function buildTotaalSheet(args: TotaalArgs): XLSX.WorkSheet {
  const { weeks, weekStats, yearTotal, year, projectName, getHours, categoryNames } = args;

  const fmtEuro = (v: number) => v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toLocaleString('nl-NL');

  const weekTotals = weeks.map((w) => weekStats[w].total);

  const retentionRatio = (s: RetentionStats) => {
    const dec = s.retained + s.lost + s.partial;
    return dec > 0 ? (s.retained + s.partial) / dec : 0;
  };
  const netRetained = (s: RetentionStats) => s.retainedValue - s.lostValue;

  const row = (label: string, fn: (s: RetentionStats) => number, fmt: (n: number) => string = fmtNum): (string | number)[] => [
    label,
    '',
    '',
    fmt(fn(yearTotal.total)),
    '',
    ...weekTotals.map((s) => fmt(fn(s))),
  ];

  const reasonRow = (cat: string): (string | number)[] => [
    cat,
    '',
    '',
    fmtNum(yearTotal.total.reasonCounts[cat] ?? 0),
    '',
    ...weekTotals.map((s) => fmtNum(s.reasonCounts[cat] ?? 0)),
  ];

  const rows: (string | number)[][] = [];
  rows.push([`Rapportage ${projectName} — ${year}`]);
  rows.push([]);
  const weekLabels = weeks.map((w) => `wk${String(w).padStart(2, '0')}`);
  rows.push(['Totaal overzicht', '', '', String(year), '', ...weekLabels]);
  rows.push([]);

  rows.push(['RETENTIE OVERZICHT']);
  rows.push(row('Totaal gesprekken', (s) => s.calls));
  rows.push(row('Behouden donateurs', (s) => s.retained));
  rows.push(row('Verloren donateurs', (s) => s.lost));
  rows.push(row('Omgezet naar eenmalig', (s) => s.partial));
  rows.push(row('Niet bereikbaar', (s) => s.unreachable));
  rows.push([]);

  rows.push(['RATIO']);
  rows.push(row('Retentie ratio', retentionRatio, fmtPct));
  rows.push([]);

  rows.push(['BEHOUDEN WAARDE']);
  rows.push(row('Jaarwaarde behouden', (s) => s.retainedValue, fmtEuro));
  rows.push(row('Jaarwaarde verloren', (s) => s.lostValue, fmtEuro));
  rows.push(row('Netto behouden', netRetained, fmtEuro));
  rows.push([]);

  rows.push(['PRODUCTIVITEIT']);
  rows.push(row('Aantal beluren', (s) => getHours(s), (v) => v.toFixed(2)));
  rows.push(row('Gesprekken per uur', (s) => { const h = getHours(s); return h > 0 ? s.calls / h : 0; }, (v) => v.toFixed(1)));
  rows.push([]);

  if (categoryNames.length > 0) {
    rows.push(['REDEN-BREAKDOWN']);
    categoryNames.forEach((cat) => rows.push(reasonRow(cat)));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 36 },
    { wch: 3 },
    { wch: 3 },
    { wch: 14 },
    { wch: 3 },
    ...weeks.map(() => ({ wch: 10 })),
  ];

  const totalCols = 5 + weeks.length;
  styleRangeRow(ws, 0, totalCols, STYLE_TITLE);

  const sectionColors: Record<string, string> = {
    'RETENTIE OVERZICHT': '22C55E',
    'RATIO': '3B82F6',
    'BEHOUDEN WAARDE': '8B5CF6',
    'PRODUCTIVITEIT': '06B6D4',
    'REDEN-BREAKDOWN': '64748B',
    'Totaal overzicht': '4A7C4E',
  };

  for (let r = 0; r < rows.length; r++) {
    const first = String(rows[r][0] ?? '');
    if (first && sectionColors[first]) {
      styleRangeRow(ws, r, totalCols, STYLE_SECTION(sectionColors[first]));
      continue;
    }
    if (first && rows[r].length > 1) {
      styleCell(ws, `${colLetter(0)}${r + 1}`, STYLE_LABEL);
      styleCell(ws, `${colLetter(3)}${r + 1}`, STYLE_TOTAL_COL);
      for (let c = 5; c < totalCols; c++) {
        styleCell(ws, `${colLetter(c)}${r + 1}`, STYLE_CELL);
      }
    }
  }

  return ws;
}

interface WeekArgs {
  week: number;
  year: number;
  weekStats: DailyRetentionStats;
  getHours: (s: RetentionStats) => number;
  categoryNames: string[];
}

function buildWeekSheet(args: WeekArgs): XLSX.WorkSheet {
  const { week, weekStats, getHours, categoryNames } = args;

  const fmtEuro = (v: number) => v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toLocaleString('nl-NL');

  const total = weekStats.total;

  const retentionRatio = (s: RetentionStats) => {
    const dec = s.retained + s.lost + s.partial;
    return dec > 0 ? (s.retained + s.partial) / dec : 0;
  };
  const netRetained = (s: RetentionStats) => s.retainedValue - s.lostValue;

  const row = (label: string, fn: (s: RetentionStats) => number, fmt: (n: number) => string = fmtNum): (string | number)[] => [
    label,
    '',
    '',
    fmt(fn(total)),
    '',
    ...DAYS.map((d) => fmt(fn(weekStats.perDay[d]))),
  ];

  const reasonRow = (cat: string): (string | number)[] => [
    cat,
    '',
    '',
    fmtNum(total.reasonCounts[cat] ?? 0),
    '',
    ...DAYS.map((d) => fmtNum(weekStats.perDay[d].reasonCounts[cat] ?? 0)),
  ];

  const rows: (string | number)[][] = [];
  rows.push([`Week ${String(week).padStart(2, '0')}`]);
  rows.push([]);
  rows.push(['Weekoverzicht', '', '', 'Totaal', '', ...DAY_LABELS]);
  rows.push([]);

  rows.push(['RETENTIE OVERZICHT']);
  rows.push(row('Totaal gesprekken', (s) => s.calls));
  rows.push(row('Behouden donateurs', (s) => s.retained));
  rows.push(row('Verloren donateurs', (s) => s.lost));
  rows.push(row('Omgezet naar eenmalig', (s) => s.partial));
  rows.push(row('Niet bereikbaar', (s) => s.unreachable));
  rows.push([]);
  rows.push(['RATIO']);
  rows.push(row('Retentie ratio', retentionRatio, fmtPct));
  rows.push([]);
  rows.push(['BEHOUDEN WAARDE']);
  rows.push(row('Jaarwaarde behouden', (s) => s.retainedValue, fmtEuro));
  rows.push(row('Jaarwaarde verloren', (s) => s.lostValue, fmtEuro));
  rows.push(row('Netto behouden', netRetained, fmtEuro));
  rows.push([]);
  rows.push(['PRODUCTIVITEIT']);
  rows.push(row('Aantal beluren', (s) => getHours(s), (v) => v.toFixed(2)));
  rows.push(row('Gesprekken per uur', (s) => { const h = getHours(s); return h > 0 ? s.calls / h : 0; }, (v) => v.toFixed(1)));
  rows.push([]);
  if (categoryNames.length > 0) {
    rows.push(['REDEN-BREAKDOWN']);
    categoryNames.forEach((cat) => rows.push(reasonRow(cat)));
  }

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 36 },
    { wch: 3 },
    { wch: 3 },
    { wch: 14 },
    { wch: 3 },
    ...DAY_LABELS.map(() => ({ wch: 11 })),
  ];

  const totalCols = 5 + DAY_LABELS.length;
  styleRangeRow(ws, 0, totalCols, STYLE_TITLE);

  const sectionColors: Record<string, string> = {
    'RETENTIE OVERZICHT': '22C55E',
    'RATIO': '3B82F6',
    'BEHOUDEN WAARDE': '8B5CF6',
    'PRODUCTIVITEIT': '06B6D4',
    'REDEN-BREAKDOWN': '64748B',
    'Weekoverzicht': '4A7C4E',
  };

  for (let r = 0; r < rows.length; r++) {
    const first = String(rows[r][0] ?? '');
    if (first && sectionColors[first]) {
      styleRangeRow(ws, r, totalCols, STYLE_SECTION(sectionColors[first]));
      continue;
    }
    if (first && rows[r].length > 1) {
      styleCell(ws, `${colLetter(0)}${r + 1}`, STYLE_LABEL);
      styleCell(ws, `${colLetter(3)}${r + 1}`, STYLE_TOTAL_COL);
      for (let c = 5; c < totalCols; c++) {
        styleCell(ws, `${colLetter(c)}${r + 1}`, STYLE_CELL);
      }
    }
  }

  return ws;
}
