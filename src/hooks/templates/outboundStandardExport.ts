import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/integrations/supabase/client';
import { MappingConfig } from '@/types/database';
import { detectFrequencyFromConfig, FrequencyType } from '@/lib/statsHelpers';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { getAllWeeksForYear, getISOWeekYear } from '@/lib/weekHelpers';

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

interface WeekStats {
  calls: number;
  sales: number;
  recurring: number;
  oneoff: number;
  annualValue: number;
  annualValueRecurring: number;
  durationSec: number;
  loggedSeconds: number;
  freqCounts: Record<FrequencyType, number>;
  unreachable: number;
  upgradeSales: number; // sales where Nbedrag > Bedrag (opwaardering detected)
}

interface DailyWeekStats {
  perDay: Record<DayKey, WeekStats>;
  total: WeekStats;
}

interface VoorraadSnapshot {
  supplied: number;
  handled: number;
  remaining: number;
  reach: number;
}

const DAYS: DayKey[] = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
const DAY_LABELS = ['Maandag', 'Dinsdag', 'Woensdag', 'Donderdag', 'Vrijdag', 'Zaterdag', 'Zondag'];

const emptyStats = (): WeekStats => ({
  calls: 0,
  sales: 0,
  recurring: 0,
  oneoff: 0,
  annualValue: 0,
  annualValueRecurring: 0,
  durationSec: 0,
  loggedSeconds: 0,
  freqCounts: { monthly: 0, quarterly: 0, halfYearly: 0, yearly: 0, oneoff: 0 },
  unreachable: 0,
  upgradeSales: 0,
});

const emptyWeek = (): DailyWeekStats => ({
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
// Mirrors the palette from useExcelExport.ts (single-week export) so the
// template export looks like the rest of our dashboard — green header, blue
// section colors, subtle borders, bold totals.
const THIN_BORDER = {
  top: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  left: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  right: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
};

const STYLE_HEADER = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4A7C4E' } },
  alignment: { horizontal: 'center' as const },
  border: THIN_BORDER,
};

const STYLE_SECTION = (colorHex: string) => ({
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: colorHex } },
  alignment: { horizontal: 'left' as const },
  border: THIN_BORDER,
});

const STYLE_VOORRAAD_HEADER = {
  font: { bold: true, color: { rgb: '334155' } },
  fill: { fgColor: { rgb: 'E2E8F0' } },
  alignment: { horizontal: 'left' as const },
  border: THIN_BORDER,
};

const STYLE_VOORRAAD_VALUE = {
  font: { bold: true },
  alignment: { horizontal: 'right' as const },
  border: THIN_BORDER,
};

const STYLE_CELL = { border: THIN_BORDER };

const STYLE_TOTAL_COL = {
  font: { bold: true },
  fill: { fgColor: { rgb: 'F1F5F9' } },
  alignment: { horizontal: 'right' as const },
  border: THIN_BORDER,
};

const STYLE_LABEL = {
  font: { bold: false },
  alignment: { horizontal: 'left' as const },
  border: THIN_BORDER,
};

const STYLE_TITLE = {
  font: { bold: true, sz: 14 },
  alignment: { horizontal: 'left' as const },
};

// Apply a style to a cell reference, creating it if missing.
function styleCell(ws: XLSX.WorkSheet, ref: string, style: Record<string, unknown>) {
  if (!ws[ref]) ws[ref] = { v: '', t: 's' };
  ws[ref].s = style;
}

function colLetter(idx: number): string {
  // idx is 0-based. Supports up to ZZ (enough for 52 week cols + padding).
  let n = idx;
  let s = '';
  while (true) {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
    if (n < 0) break;
  }
  return s;
}

interface ExportArgs {
  projectId: string;
  projectName: string;
  hourlyRate: number;
  vatRate: number;
  mappingConfig?: MappingConfig;
  year?: number;
  onToast?: (msg: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
}

export async function exportOutboundStandardYear(args: ExportArgs): Promise<void> {
  const {
    projectId,
    projectName,
    hourlyRate,
    vatRate,
    mappingConfig,
    year = new Date().getFullYear(),
    onToast,
  } = args;

  try {
    // 1. Fetch year records (paged 1000)
    const yearStart = `${year}-01-01`;
    const yearEnd = `${year}-12-31`;
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

    // 2. Fetch daily logged time for the year
    const { data: loggedRows, error: loggedErr } = await supabase
      .from('daily_logged_time')
      .select('date, total_seconds, corrected_seconds')
      .eq('project_id', projectId)
      .gte('date', yearStart)
      .lte('date', yearEnd);
    if (loggedErr) throw loggedErr;

    // 3. Fetch batches (with created_at) for voorraad calculations
    const { data: batches } = await supabase
      .from('batches')
      .select('total, handled, remaining, status, created_at')
      .eq('project_id', projectId);
    const activeBatches = (batches ?? []).filter((b) => (b.status ?? 1) === 1);
    const voorraadTotalCurrent = activeBatches.reduce((s, b) => s + (b.total ?? 0), 0);
    const voorraadHandledCurrent = activeBatches.reduce((s, b) => s + (b.handled ?? 0), 0);

    // 4. Aggregate per week
    const weeks = getAllWeeksForYear(year);
    const weekStats: Record<number, DailyWeekStats> = {};
    weeks.forEach((w) => (weekStats[w] = emptyWeek()));

    const yearTotal: DailyWeekStats = emptyWeek();

    records.forEach((record) => {
      const dateStr = record.beldatum_date ?? record.beldatum;
      if (!dateStr) return;
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) return;

      const isoYear = getISOWeekYear(date);
      if (isoYear !== year) return;

      const week = record.week_number ?? null;
      if (!week || !weekStats[week]) return;

      const dayKey = getDayKey(date);
      if (!dayKey) return;

      const rawData = record.raw_data ?? {};
      const resultName = record.resultaat ?? (rawData['bc_result_naam'] as string) ?? 'Onbekend';
      const isSale = mappingConfig?.sale_results?.includes(resultName) ?? false;
      const isUnreachable = mappingConfig?.unreachable_results?.includes(resultName) ?? false;

      // Frequency + amount (old)
      const freqRaw = rawData['frequency'] ?? (mappingConfig ? rawData[mappingConfig.freq_col] : undefined) ?? rawData['frequentie'] ?? rawData['Frequentie'];
      const freq = detectFrequencyFromConfig(freqRaw, mappingConfig?.freq_map ?? {}, resultName);

      const amountRaw = rawData['amount'] ?? (mappingConfig ? rawData[mappingConfig.amount_col] : undefined) ?? rawData['termijnbedrag'] ?? rawData['Bedrag'];
      const amount = amountRaw ? parseDutchFloat(amountRaw) : 0;
      const annualValue = isSale ? amount * freq.multiplier : 0;

      // Upgrade detection: Nbedrag (new) > Bedrag (old) on the same record.
      // Only meaningful for winback/upgrade campaigns that populate both fields.
      const nBedragRaw = rawData['Nbedrag'];
      const oldAmount = rawData['Bedrag'] ? parseDutchFloat(rawData['Bedrag']) : 0;
      const newAmount = nBedragRaw ? parseDutchFloat(nBedragRaw) : 0;
      const isUpgrade = isSale && newAmount > 0 && oldAmount > 0 && newAmount > oldAmount;

      const dayStats = weekStats[week].perDay[dayKey];
      const weekTotal = weekStats[week].total;
      [dayStats, weekTotal, yearTotal.perDay[dayKey], yearTotal.total].forEach((s) => {
        s.calls++;
        s.durationSec += Number(record.gesprekstijd_sec) || 0;
        if (isUnreachable) s.unreachable++;
        if (isSale) {
          s.sales++;
          s.annualValue += annualValue;
          s.freqCounts[freq.type]++;
          if (freq.isOneOff) {
            s.oneoff++;
          } else {
            s.recurring++;
            s.annualValueRecurring += annualValue;
          }
          if (isUpgrade) s.upgradeSales++;
        }
      });
    });

    // 5. Apply logged time per day/week
    (loggedRows ?? []).forEach((row) => {
      const date = new Date(row.date);
      if (isNaN(date.getTime())) return;
      const isoYear = getISOWeekYear(date);
      if (isoYear !== year) return;
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

    // 6. Build per-week voorraad snapshots.
    // We don't persist weekly snapshots of batches.handled in DB, so approximate:
    //   - supplied(week) = sum of batches.total where batch.created_at <= end-of-week
    //     (batches rarely get added, so this captures the "which batches existed then").
    //   - handled(week) = cumulative call_records processed through end-of-week (year scope)
    //   - remaining(week) = max(0, supplied - handled)
    //   - reach(week) = handled / supplied
    // Footer note in the sheet makes the approximation explicit.
    const voorraadByWeek: Record<number, VoorraadSnapshot> = {};
    let cumulativeHandled = 0;
    for (const w of weeks) {
      cumulativeHandled += weekStats[w].total.calls;
      const endOfWeek = endOfISOWeek(year, w);
      const suppliedAtWeek = activeBatches.reduce((sum, b) => {
        const createdAt = b.created_at ? new Date(b.created_at) : null;
        // If no created_at, assume the batch existed from the start (legacy rows).
        if (!createdAt || createdAt <= endOfWeek) {
          return sum + (b.total ?? 0);
        }
        return sum;
      }, 0);
      const supplied = suppliedAtWeek > 0 ? suppliedAtWeek : voorraadTotalCurrent;
      const remaining = Math.max(0, supplied - cumulativeHandled);
      const reach = supplied > 0 ? cumulativeHandled / supplied : 0;
      voorraadByWeek[w] = { supplied, handled: cumulativeHandled, remaining, reach };
    }

    // Year-total voorraad: use current state (what the client would expect "now").
    const voorraadYear: VoorraadSnapshot = {
      supplied: voorraadTotalCurrent,
      handled: voorraadHandledCurrent,
      remaining: Math.max(0, voorraadTotalCurrent - voorraadHandledCurrent),
      reach: voorraadTotalCurrent > 0 ? voorraadHandledCurrent / voorraadTotalCurrent : 0,
    };

    // 7. Build workbook
    const wb = XLSX.utils.book_new();
    const getHourlyRateForDay = (dayName?: string) => {
      if (dayName && mappingConfig?.weekday_rates) {
        const r = mappingConfig.weekday_rates[dayName as keyof typeof mappingConfig.weekday_rates];
        if (r !== undefined && r > 0) return r;
      }
      return hourlyRate;
    };
    const getHours = (s: WeekStats): number =>
      s.loggedSeconds > 0 ? s.loggedSeconds / 3600 : s.durationSec / 3600;

    // Totaal-tab
    const totaalSheet = buildTotaalSheet({
      weeks,
      weekStats,
      yearTotal,
      year,
      getHours,
      getHourlyRateForDay,
      vatRate,
      voorraadYear,
      voorraadByWeek,
      projectName,
    });
    XLSX.utils.book_append_sheet(wb, totaalSheet, 'Totaal');

    // 52/53 weektabs
    weeks.forEach((w) => {
      const ws = buildWeekSheet({
        week: w,
        year,
        weekStats: weekStats[w],
        getHours,
        getHourlyRateForDay,
        vatRate,
        voorraad: voorraadByWeek[w],
      });
      XLSX.utils.book_append_sheet(wb, ws, `W${String(w).padStart(2, '0')}`);
    });

    // 8. Write file
    const safeName = projectName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const filename = `Rapportage_${safeName}_${year}.xlsx`;
    XLSX.writeFile(wb, filename);

    onToast?.({
      title: 'Export succesvol',
      description: `Jaarrapport ${year} geëxporteerd als ${filename}`,
    });
  } catch (err) {
    console.error('Outbound year export failed:', err);
    onToast?.({
      title: 'Export mislukt',
      description: err instanceof Error ? err.message : 'Onbekende fout',
      variant: 'destructive',
    });
  }
}

// End of ISO week W in year Y (Sunday 23:59:59 UTC).
function endOfISOWeek(year: number, week: number): Date {
  // ISO week 1 = week containing the first Thursday of the year.
  const jan4 = new Date(Date.UTC(year, 0, 4));
  const dayOfWeek = jan4.getUTCDay() || 7;
  const week1Monday = new Date(jan4);
  week1Monday.setUTCDate(jan4.getUTCDate() - (dayOfWeek - 1));
  const sunday = new Date(week1Monday);
  sunday.setUTCDate(week1Monday.getUTCDate() + (week - 1) * 7 + 6);
  sunday.setUTCHours(23, 59, 59, 999);
  return sunday;
}

// ========== Sheet builders ==========

interface TotaalArgs {
  weeks: number[];
  weekStats: Record<number, DailyWeekStats>;
  yearTotal: DailyWeekStats;
  year: number;
  getHours: (s: WeekStats, dayName?: string) => number;
  getHourlyRateForDay: (dayName?: string) => number;
  vatRate: number;
  voorraadYear: VoorraadSnapshot;
  voorraadByWeek: Record<number, VoorraadSnapshot>;
  projectName: string;
}

function buildTotaalSheet(args: TotaalArgs): XLSX.WorkSheet {
  const { weeks, weekStats, yearTotal, year, getHours, getHourlyRateForDay, vatRate, voorraadYear, voorraadByWeek, projectName } = args;

  const fmtEuro = (v: number) => v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toLocaleString('nl-NL');

  const weekTotals = weeks.map((w) => weekStats[w].total);

  const nettoConv = (s: WeekStats) => {
    const denom = s.calls - s.unreachable;
    return denom > 0 ? s.sales / denom : 0;
  };
  const brutoConv = (s: WeekStats) => (s.calls > 0 ? s.sales / s.calls : 0);
  const opwaardeer = (s: WeekStats) => (s.sales > 0 ? s.upgradeSales / s.sales : 0);
  const investment = (s: WeekStats, dayName?: string) => getHours(s, dayName) * getHourlyRateForDay(dayName);
  const costPerDonor = (s: WeekStats, dayName?: string) => (s.sales > 0 ? investment(s, dayName) / s.sales : 0);
  const costPerDonorInclVat = (s: WeekStats, dayName?: string) => costPerDonor(s, dayName) * (1 + vatRate / 100);
  const upgradePerDonor = (s: WeekStats) => (s.sales > 0 ? s.annualValue / s.sales : 0);
  const paybackExcl = (s: WeekStats, dayName?: string) => {
    const up = upgradePerDonor(s);
    return up > 0 ? costPerDonor(s, dayName) / (up / 12) : 0;
  };
  const paybackIncl = (s: WeekStats, dayName?: string) => {
    const up = upgradePerDonor(s);
    return up > 0 ? costPerDonorInclVat(s, dayName) / (up / 12) : 0;
  };

  const row = (label: string, fn: (s: WeekStats) => number, fmt: (n: number) => string = fmtNum): (string | number)[] => [
    label,
    '',
    '',
    fmt(fn(yearTotal.total)),
    '',
    ...weekTotals.map((s) => fmt(fn(s))),
  ];

  const voorraadRow = (label: string, pick: (v: VoorraadSnapshot) => string): (string | number)[] => [
    label,
    '',
    '',
    pick(voorraadYear),
    '',
    ...weeks.map((w) => pick(voorraadByWeek[w])),
  ];

  const rows: (string | number)[][] = [];
  // Title
  rows.push([`Rapportage ${projectName} — ${year}`]);
  rows.push([]);
  // Voorraad section
  rows.push(['VOORRAAD']);
  rows.push(voorraadRow('Totaal aangeleverd', (v) => fmtNum(v.supplied)));
  rows.push(voorraadRow('Afgehandeld', (v) => fmtNum(v.handled)));
  rows.push(voorraadRow('Nog te bellen', (v) => fmtNum(v.remaining)));
  rows.push(voorraadRow('Bereikpercentage', (v) => fmtPct(v.reach)));
  rows.push([]);
  // Column header
  const weekLabels = weeks.map((w) => `wk${String(w).padStart(2, '0')}`);
  rows.push(['Totaal overzicht', '', '', String(year), '', ...weekLabels]);
  rows.push([]);
  rows.push(['RESULTATEN']);
  rows.push(row('Aantal positief', (s) => s.sales));
  rows.push(row('Aantal doorlopende machtigingen', (s) => s.recurring));
  rows.push(row('Aantal eenmalige machtigingen', (s) => s.oneoff));
  rows.push(row('Jaarwaarde', (s) => s.annualValue, fmtEuro));
  rows.push(row('Jaarwaarde doorlopende machtigingen', (s) => s.annualValueRecurring, fmtEuro));
  rows.push(row('Opwaardeerpercentage', opwaardeer, fmtPct));
  rows.push(row('Bruto conversie', brutoConv, fmtPct));
  rows.push(row('Netto conversie', nettoConv, fmtPct));
  rows.push([]);
  rows.push(['PRODUCTIVITEIT']);
  rows.push(row('Aantal beluren', (s) => getHours(s), (v) => v.toFixed(1)));
  rows.push(row('Gesprekken per uur', (s) => { const h = getHours(s); return h > 0 ? s.calls / h : 0; }, (v) => v.toFixed(1)));
  rows.push(row('Score per uur', (s) => { const h = getHours(s); return h > 0 ? s.sales / h : 0; }, (v) => v.toFixed(2)));
  rows.push([]);
  rows.push(['INVESTERING']);
  rows.push(row('Investering per donateur (Excl BTW)', (s) => costPerDonor(s), fmtEuro));
  rows.push(row('Investering per donateur (Incl BTW)', (s) => costPerDonorInclVat(s), fmtEuro));
  rows.push(row('Upgrade per donateur', upgradePerDonor, fmtEuro));
  rows.push(row('Terugverdientijd in maanden (Excl BTW)', (s) => paybackExcl(s), (v) => v.toFixed(1)));
  rows.push(row('Terugverdientijd in maanden (Incl BTW)', (s) => paybackIncl(s), (v) => v.toFixed(1)));
  rows.push([]);
  rows.push(['POSITIEF PER FREQUENTIE']);
  rows.push(row('Machtiging per Maand', (s) => s.freqCounts.monthly));
  rows.push(row('Machtiging per Kwartaal', (s) => s.freqCounts.quarterly));
  rows.push(row('Machtiging per Half jaar', (s) => s.freqCounts.halfYearly));
  rows.push(row('Machtiging per Jaar', (s) => s.freqCounts.yearly));
  rows.push(row('Eenmalige machtiging', (s) => s.freqCounts.oneoff));

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths: label | spacer | spacer | year-total | spacer | per-week cols
  ws['!cols'] = [
    { wch: 38 },
    { wch: 3 },
    { wch: 3 },
    { wch: 14 },
    { wch: 3 },
    ...weeks.map(() => ({ wch: 10 })),
  ];

  // Apply styling — iterate rows and decide style per row type.
  const totalCols = 5 + weeks.length;
  styleRangeRow(ws, 0, totalCols, STYLE_TITLE);

  const sectionColors: Record<string, string> = {
    'VOORRAAD': '64748B',
    'RESULTATEN': '22C55E',
    'PRODUCTIVITEIT': '8B5CF6',
    'INVESTERING': '06B6D4',
    'POSITIEF PER FREQUENTIE': '3B82F6',
    'Totaal overzicht': '4A7C4E',
  };

  for (let r = 0; r < rows.length; r++) {
    const first = String(rows[r][0] ?? '');
    if (first && sectionColors[first]) {
      styleRangeRow(ws, r, totalCols, STYLE_SECTION(sectionColors[first]));
      continue;
    }
    // Voorraad rows = first data rows after VOORRAAD section (indices 3-6)
    if (r >= 3 && r <= 6 && first) {
      styleCell(ws, `${colLetter(0)}${r + 1}`, STYLE_VOORRAAD_HEADER);
      styleCell(ws, `${colLetter(3)}${r + 1}`, STYLE_VOORRAAD_VALUE);
      for (let c = 5; c < totalCols; c++) {
        styleCell(ws, `${colLetter(c)}${r + 1}`, STYLE_CELL);
      }
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
  weekStats: DailyWeekStats;
  getHours: (s: WeekStats, dayName?: string) => number;
  getHourlyRateForDay: (dayName?: string) => number;
  vatRate: number;
  voorraad: VoorraadSnapshot;
}

function buildWeekSheet(args: WeekArgs): XLSX.WorkSheet {
  const { week, weekStats, getHours, getHourlyRateForDay, vatRate, voorraad } = args;

  const fmtEuro = (v: number) => v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toLocaleString('nl-NL');

  const total = weekStats.total;

  const row = (
    label: string,
    fn: (s: WeekStats, dayName?: string) => number,
    fmt: (n: number) => string = fmtNum
  ): (string | number)[] => [
    label,
    '',
    '',
    fmt(fn(total)),
    '',
    ...DAYS.map((d) => fmt(fn(weekStats.perDay[d], d))),
  ];

  const brutoConv = (s: WeekStats) => (s.calls > 0 ? s.sales / s.calls : 0);
  const nettoConv = (s: WeekStats) => {
    const denom = s.calls - s.unreachable;
    return denom > 0 ? s.sales / denom : 0;
  };
  const opwaardeer = (s: WeekStats) => (s.sales > 0 ? s.upgradeSales / s.sales : 0);
  const investment = (s: WeekStats, dayName?: string) => getHours(s, dayName) * getHourlyRateForDay(dayName);
  const costPerDonor = (s: WeekStats, dayName?: string) => (s.sales > 0 ? investment(s, dayName) / s.sales : 0);
  const costPerDonorInclVat = (s: WeekStats, dayName?: string) => costPerDonor(s, dayName) * (1 + vatRate / 100);
  const upgradePerDonor = (s: WeekStats) => (s.sales > 0 ? s.annualValue / s.sales : 0);
  const paybackExcl = (s: WeekStats, dayName?: string) => {
    const up = upgradePerDonor(s);
    return up > 0 ? costPerDonor(s, dayName) / (up / 12) : 0;
  };
  const paybackIncl = (s: WeekStats, dayName?: string) => {
    const up = upgradePerDonor(s);
    return up > 0 ? costPerDonorInclVat(s, dayName) / (up / 12) : 0;
  };

  const rows: (string | number)[][] = [];
  // Voorraad-header (week-specific snapshot: cumulative handled through end of week)
  rows.push([`Week ${String(week).padStart(2, '0')}`]);
  rows.push([]);
  rows.push(['VOORRAAD']);
  rows.push(['Totaal aangeleverd:', fmtNum(voorraad.supplied)]);
  rows.push(['Afgehandeld:', fmtNum(voorraad.handled)]);
  rows.push(['Nog te bellen:', fmtNum(voorraad.remaining)]);
  rows.push(['Bereikpercentage:', fmtPct(voorraad.reach)]);
  rows.push([]);
  rows.push(['Weekoverzicht', '', '', 'Totaal', '', ...DAY_LABELS]);
  rows.push([]);
  rows.push(['RESULTATEN']);
  rows.push(row('Aantal positief', (s) => s.sales));
  rows.push(row('Aantal doorlopende machtigingen', (s) => s.recurring));
  rows.push(row('Aantal eenmalige machtigingen', (s) => s.oneoff));
  rows.push(row('Jaarwaarde', (s) => s.annualValue, fmtEuro));
  rows.push(row('Jaarwaarde doorlopende machtigingen', (s) => s.annualValueRecurring, fmtEuro));
  rows.push(row('Opwaardeerpercentage', opwaardeer, fmtPct));
  rows.push(row('Bruto conversie', brutoConv, fmtPct));
  rows.push(row('Netto conversie', nettoConv, fmtPct));
  rows.push([]);
  rows.push(['PRODUCTIVITEIT']);
  rows.push(row('Aantal beluren', (s, d) => getHours(s, d), (v) => v.toFixed(1)));
  rows.push(row('Gesprekken per uur', (s, d) => { const h = getHours(s, d); return h > 0 ? s.calls / h : 0; }, (v) => v.toFixed(1)));
  rows.push(row('Score per uur', (s, d) => { const h = getHours(s, d); return h > 0 ? s.sales / h : 0; }, (v) => v.toFixed(2)));
  rows.push([]);
  rows.push(['INVESTERING']);
  rows.push(row('Investering per donateur (Excl BTW)', (s, d) => costPerDonor(s, d), fmtEuro));
  rows.push(row('Investering per donateur (Incl BTW)', (s, d) => costPerDonorInclVat(s, d), fmtEuro));
  rows.push(row('Upgrade per donateur', upgradePerDonor, fmtEuro));
  rows.push(row('Terugverdientijd in maanden (Excl BTW)', (s, d) => paybackExcl(s, d), (v) => v.toFixed(1)));
  rows.push(row('Terugverdientijd in maanden (Incl BTW)', (s, d) => paybackIncl(s, d), (v) => v.toFixed(1)));
  rows.push([]);
  rows.push(['POSITIEF PER FREQUENTIE']);
  rows.push(row('Machtiging per Maand', (s) => s.freqCounts.monthly));
  rows.push(row('Machtiging per Kwartaal', (s) => s.freqCounts.quarterly));
  rows.push(row('Machtiging per Half jaar', (s) => s.freqCounts.halfYearly));
  rows.push(row('Machtiging per Jaar', (s) => s.freqCounts.yearly));
  rows.push(row('Eenmalige machtiging', (s) => s.freqCounts.oneoff));

  const ws = XLSX.utils.aoa_to_sheet(rows);

  // Column widths: label | spacer | spacer | total | spacer | 7 days
  ws['!cols'] = [
    { wch: 38 },
    { wch: 3 },
    { wch: 3 },
    { wch: 14 },
    { wch: 3 },
    ...DAY_LABELS.map(() => ({ wch: 11 })),
  ];

  const totalCols = 5 + DAY_LABELS.length;

  // Title row
  styleRangeRow(ws, 0, totalCols, STYLE_TITLE);

  const sectionColors: Record<string, string> = {
    'VOORRAAD': '64748B',
    'RESULTATEN': '22C55E',
    'PRODUCTIVITEIT': '8B5CF6',
    'INVESTERING': '06B6D4',
    'POSITIEF PER FREQUENTIE': '3B82F6',
    'Weekoverzicht': '4A7C4E',
  };

  for (let r = 0; r < rows.length; r++) {
    const first = String(rows[r][0] ?? '');
    if (first && sectionColors[first]) {
      styleRangeRow(ws, r, totalCols, STYLE_SECTION(sectionColors[first]));
      continue;
    }
    // Voorraad data rows (after VOORRAAD section header): 4 rows starting at index 3
    if (r >= 3 && r <= 6 && first) {
      styleCell(ws, `${colLetter(0)}${r + 1}`, STYLE_VOORRAAD_HEADER);
      styleCell(ws, `${colLetter(1)}${r + 1}`, STYLE_VOORRAAD_VALUE);
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

function styleRangeRow(ws: XLSX.WorkSheet, rowIdx: number, numCols: number, style: Record<string, unknown>) {
  for (let c = 0; c < numCols; c++) {
    styleCell(ws, `${colLetter(c)}${rowIdx + 1}`, style);
  }
}
