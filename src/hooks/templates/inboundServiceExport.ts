import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/integrations/supabase/client';
import { MappingConfig } from '@/types/database';
import { getAllWeeksForYear, getISOWeekYear, parseBasiCallDate } from '@/lib/weekHelpers';

type RawRecord = {
  basicall_record_id: number;
  beldatum: string | null;
  beldatum_date: string | null;
  beltijd: string | null;
  gesprekstijd_sec: number;
  resultaat: string | null;
  week_number: number | null;
  raw_data: Record<string, unknown> | null;
};

type DayKey = 'maandag' | 'dinsdag' | 'woensdag' | 'donderdag' | 'vrijdag' | 'zaterdag' | 'zondag';

interface ServiceStats {
  calls: number;
  handled: number;
  notHandled: number;
  durationSec: number;
  fastAnswered: number;      // calls with gesprekstijd_sec < serviceLevelSec
  after17Sec: number;        // duration of calls starting at/after 17:00
  loggedSeconds: number;
}

interface DailyServiceStats {
  perDay: Record<DayKey, ServiceStats>;
  total: ServiceStats;
}

const DAYS: DayKey[] = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

const emptyStats = (): ServiceStats => ({
  calls: 0,
  handled: 0,
  notHandled: 0,
  durationSec: 0,
  fastAnswered: 0,
  after17Sec: 0,
  loggedSeconds: 0,
});

const emptyWeek = (): DailyServiceStats => ({
  perDay: {
    maandag: emptyStats(),
    dinsdag: emptyStats(),
    woensdag: emptyStats(),
    donderdag: emptyStats(),
    vrijdag: emptyStats(),
    zaterdag: emptyStats(),
    zondag: emptyStats(),
  },
  total: emptyStats(),
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

const STYLE_TARGET_COL = {
  font: { italic: true, color: { rgb: '64748B' } },
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

export async function exportInboundServiceYear(args: ExportArgs): Promise<void> {
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
    const handledSet = new Set(mappingConfig?.handled_results ?? []);
    const notHandledSet = new Set(mappingConfig?.not_handled_results ?? []);
    const targets = mappingConfig?.service_targets;
    const targetBereikbaarheid = targets?.bereikbaarheid ?? 0.95;
    const targetServiceLevel = targets?.service_level ?? 0.70;
    const serviceLevelSec = targets?.service_level_sec ?? 30;

    // 1. Fetch year records (paged)
    const records: RawRecord[] = [];
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('call_records')
        .select('basicall_record_id, beldatum, beldatum_date, beltijd, gesprekstijd_sec, resultaat, week_number, raw_data')
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

    // 2. Fetch daily logged time
    const { data: loggedRows, error: loggedErr } = await supabase
      .from('daily_logged_time')
      .select('date, total_seconds, corrected_seconds')
      .eq('project_id', projectId)
      .gte('date', yearStart)
      .lte('date', yearEnd);
    if (loggedErr) throw loggedErr;

    // 3. Aggregate per week
    const weeks = getAllWeeksForYear(year);
    const weekStats: Record<number, DailyServiceStats> = {};
    weeks.forEach((w) => (weekStats[w] = emptyWeek()));
    const yearTotal: DailyServiceStats = emptyWeek();

    records.forEach((record) => {
      const date = parseBasiCallDate(record.beldatum_date ?? record.beldatum);
      if (!date) return;
      if (getISOWeekYear(date) !== year) return;
      const week = record.week_number ?? null;
      if (!week || !weekStats[week]) return;
      const dayKey = getDayKey(date);
      if (!dayKey) return;

      const resultName = record.resultaat ??
        ((record.raw_data?.['bc_result_naam'] as string) ?? 'Onbekend');
      const durationSec = Number(record.gesprekstijd_sec) || 0;
      const isHandled = handledSet.has(resultName);
      const isNotHandled = notHandledSet.has(resultName);

      // Hour from beltijd or raw_data.bc_beltijd
      const beltijd = record.beltijd ?? (record.raw_data?.['bc_beltijd'] as string | undefined) ?? '';
      const hourMatch = beltijd.match(/^(\d{1,2}):/);
      const hour = hourMatch ? parseInt(hourMatch[1], 10) : NaN;
      const isAfter17 = !isNaN(hour) && hour >= 17;

      [
        weekStats[week].perDay[dayKey],
        weekStats[week].total,
        yearTotal.perDay[dayKey],
        yearTotal.total,
      ].forEach((s) => {
        s.calls++;
        s.durationSec += durationSec;
        if (isHandled) s.handled++;
        else if (isNotHandled) s.notHandled++;
        if (durationSec > 0 && durationSec < serviceLevelSec) s.fastAnswered++;
        if (isAfter17) s.after17Sec += durationSec;
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

    const getHours = (s: ServiceStats) =>
      s.loggedSeconds > 0 ? s.loggedSeconds / 3600 : s.durationSec / 3600;

    const totaalSheet = buildTotaalSheet({
      weeks,
      weekStats,
      yearTotal,
      year,
      projectName,
      getHours,
      targetBereikbaarheid,
      targetServiceLevel,
      serviceLevelSec,
    });
    XLSX.utils.book_append_sheet(wb, totaalSheet, 'Totaal');

    weeks.forEach((w) => {
      const ws = buildWeekSheet({
        week: w,
        year,
        weekStats: weekStats[w],
        getHours,
        targetBereikbaarheid,
        targetServiceLevel,
        serviceLevelSec,
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
    console.error('Inbound service year export failed:', err);
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
  weekStats: Record<number, DailyServiceStats>;
  yearTotal: DailyServiceStats;
  year: number;
  projectName: string;
  getHours: (s: ServiceStats) => number;
  targetBereikbaarheid: number;
  targetServiceLevel: number;
  serviceLevelSec: number;
}

function buildTotaalSheet(args: TotaalArgs): XLSX.WorkSheet {
  const { weeks, weekStats, yearTotal, year, projectName, getHours, targetBereikbaarheid, targetServiceLevel, serviceLevelSec } = args;

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toLocaleString('nl-NL');

  const weekTotals = weeks.map((w) => weekStats[w].total);

  const bereikbaarheid = (s: ServiceStats) => {
    const decided = s.handled + s.notHandled;
    return decided > 0 ? s.handled / decided : 0;
  };
  const serviceLevel = (s: ServiceStats) => (s.calls > 0 ? s.fastAnswered / s.calls : 0);
  const avgDurationMin = (s: ServiceStats) => (s.calls > 0 ? s.durationSec / s.calls / 60 : 0);
  const toeslag17 = (s: ServiceStats) => s.after17Sec / 3600;
  const toeslagZa = (d: DailyServiceStats) => getHours(d.perDay.zaterdag);
  const toeslagZo = (d: DailyServiceStats) => getHours(d.perDay.zondag);

  const row = (label: string, fn: (s: ServiceStats) => number, fmt: (n: number) => string = fmtNum, target?: string): (string | number)[] => [
    label,
    '',
    target ?? '',
    fmt(fn(yearTotal.total)),
    '',
    ...weekTotals.map((s) => fmt(fn(s))),
  ];

  const weekRow = (label: string, fn: (d: DailyServiceStats) => number, fmt: (n: number) => string = fmtNum): (string | number)[] => [
    label,
    '',
    '',
    fmt(fn(yearTotal)),
    '',
    ...weeks.map((w) => fmt(fn(weekStats[w]))),
  ];

  const rows: (string | number)[][] = [];
  rows.push([`Rapportage ${projectName} — ${year}`]);
  rows.push([]);
  const weekLabels = weeks.map((w) => `wk${String(w).padStart(2, '0')}`);
  rows.push(['Totaal overzicht', 'Target', '', String(year), '', ...weekLabels]);
  rows.push([]);
  rows.push(['UREN']);
  rows.push(weekRow('Inzet agenten (uren)', (d) => getHours(d.total), (v) => v.toFixed(2)));
  rows.push([]);
  rows.push(['RECORDS']);
  rows.push(row('Aangenomen calls', (s) => s.calls));
  rows.push(row(`Binnen ${serviceLevelSec} seconden`, (s) => s.fastAnswered));
  rows.push([]);
  rows.push(["KPI'S"]);
  rows.push(row('Gemiddelde gesprekstijd (min)', avgDurationMin, (v) => v.toFixed(2)));
  rows.push(row('Bereikbaarheid', bereikbaarheid, fmtPct, fmtPct(targetBereikbaarheid)));
  rows.push(row('Service level', serviceLevel, fmtPct, fmtPct(targetServiceLevel)));
  rows.push([]);
  rows.push(['TOESLAG-UREN']);
  rows.push(row('Na 17:00 uur', toeslag17, (v) => v.toFixed(2)));
  rows.push(weekRow('Op zaterdag', toeslagZa, (v) => v.toFixed(2)));
  rows.push(weekRow('Op zondag', toeslagZo, (v) => v.toFixed(2)));

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 36 },
    { wch: 10 },
    { wch: 3 },
    { wch: 14 },
    { wch: 3 },
    ...weeks.map(() => ({ wch: 10 })),
  ];

  const totalCols = 5 + weeks.length;
  styleRangeRow(ws, 0, totalCols, STYLE_TITLE);

  const sectionColors: Record<string, string> = {
    'UREN': '64748B',
    'RECORDS': '22C55E',
    "KPI'S": '8B5CF6',
    'TOESLAG-UREN': '06B6D4',
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
      styleCell(ws, `${colLetter(1)}${r + 1}`, STYLE_TARGET_COL);
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
  weekStats: DailyServiceStats;
  getHours: (s: ServiceStats) => number;
  targetBereikbaarheid: number;
  targetServiceLevel: number;
  serviceLevelSec: number;
}

function buildWeekSheet(args: WeekArgs): XLSX.WorkSheet {
  const { week, weekStats, getHours, targetBereikbaarheid, targetServiceLevel, serviceLevelSec } = args;

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toLocaleString('nl-NL');

  const total = weekStats.total;

  const bereikbaarheid = (s: ServiceStats) => {
    const decided = s.handled + s.notHandled;
    return decided > 0 ? s.handled / decided : 0;
  };
  const serviceLevel = (s: ServiceStats) => (s.calls > 0 ? s.fastAnswered / s.calls : 0);
  const avgDurationMin = (s: ServiceStats) => (s.calls > 0 ? s.durationSec / s.calls / 60 : 0);
  const toeslag17 = (s: ServiceStats) => s.after17Sec / 3600;

  const row = (label: string, fn: (s: ServiceStats) => number, fmt: (n: number) => string = fmtNum, target?: string): (string | number)[] => [
    label,
    '',
    target ?? '',
    fmt(fn(total)),
    '',
    ...DAYS.map((d) => fmt(fn(weekStats.perDay[d]))),
  ];

  const rows: (string | number)[][] = [];
  rows.push([`Week ${String(week).padStart(2, '0')}`]);
  rows.push([]);
  rows.push(['Weekoverzicht', 'Target', '', 'Totaal', '', ...DAY_LABELS]);
  rows.push([]);
  rows.push(['UREN']);
  rows.push(row('Inzet agenten (uren)', (s) => getHours(s), (v) => v.toFixed(2)));
  rows.push([]);
  rows.push(['RECORDS']);
  rows.push(row('Aangenomen calls', (s) => s.calls));
  rows.push(row(`Binnen ${serviceLevelSec} seconden`, (s) => s.fastAnswered));
  rows.push([]);
  rows.push(["KPI'S"]);
  rows.push(row('Gemiddelde gesprekstijd (min)', avgDurationMin, (v) => v.toFixed(2)));
  rows.push(row('Bereikbaarheid', bereikbaarheid, fmtPct, fmtPct(targetBereikbaarheid)));
  rows.push(row('Service level', serviceLevel, fmtPct, fmtPct(targetServiceLevel)));
  rows.push([]);
  rows.push(['TOESLAG-UREN']);
  rows.push(row('Na 17:00 uur', toeslag17, (v) => v.toFixed(2)));

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [
    { wch: 36 },
    { wch: 10 },
    { wch: 3 },
    { wch: 14 },
    { wch: 3 },
    ...DAY_LABELS.map(() => ({ wch: 11 })),
  ];

  const totalCols = 5 + DAY_LABELS.length;
  styleRangeRow(ws, 0, totalCols, STYLE_TITLE);

  const sectionColors: Record<string, string> = {
    'UREN': '64748B',
    'RECORDS': '22C55E',
    "KPI'S": '8B5CF6',
    'TOESLAG-UREN': '06B6D4',
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
      styleCell(ws, `${colLetter(1)}${r + 1}`, STYLE_TARGET_COL);
      styleCell(ws, `${colLetter(3)}${r + 1}`, STYLE_TOTAL_COL);
      for (let c = 5; c < totalCols; c++) {
        styleCell(ws, `${colLetter(c)}${r + 1}`, STYLE_CELL);
      }
    }
  }

  return ws;
}
