import * as XLSX from 'xlsx-js-style';
import { supabase } from '@/integrations/supabase/client';
import { MappingConfig } from '@/types/database';
import { getAllWeeksForYear, getISOWeekYear, parseBasiCallDate } from '@/lib/weekHelpers';
import { ceilHours } from '@/lib/hours';

type RawRecord = {
  basicall_record_id: number;
  beldatum: string | null;
  beldatum_date: string | null;
  resultaat: string | null;
  week_number: number | null;
  raw_data: Record<string, unknown> | null;
};

type ResultKind = 'sale' | 'negatief' | 'voicemail' | 'nawt';

interface WeekBucket {
  // resultaat -> { count, kind }
  results: Map<string, { count: number; kind: ResultKind }>;
  loggedSeconds: number;
}

const THIN_BORDER = {
  top: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  bottom: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  left: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
  right: { style: 'thin' as const, color: { rgb: 'CCCCCC' } },
};

const STYLE_HEADER = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4A7C4E' } },
  alignment: { horizontal: 'left' as const },
  border: THIN_BORDER,
};

const STYLE_SUBTOTAL = {
  font: { bold: true },
  fill: { fgColor: { rgb: 'F1F5F9' } },
  border: THIN_BORDER,
};

const STYLE_TOTAL = {
  font: { bold: true, color: { rgb: 'FFFFFF' } },
  fill: { fgColor: { rgb: '4A7C4E' } },
  border: THIN_BORDER,
};

const STYLE_SALE = {
  font: { bold: true, color: { rgb: '166534' } },
  fill: { fgColor: { rgb: 'DCFCE7' } },
  border: THIN_BORDER,
};

const STYLE_VOICEMAIL_OR_NAWT = {
  font: { italic: true, color: { rgb: '64748B' } },
  fill: { fgColor: { rgb: 'F8FAFC' } },
  border: THIN_BORDER,
};

const STYLE_FOOTER = {
  font: { bold: true },
  fill: { fgColor: { rgb: 'E2E8F0' } },
  border: THIN_BORDER,
};

const STYLE_CELL = { border: THIN_BORDER };

function styleCell(ws: XLSX.WorkSheet, ref: string, style: Record<string, unknown>) {
  if (!ws[ref]) ws[ref] = { v: '', t: 's' };
  ws[ref].s = style;
}

interface ExportArgs {
  projectId: string;
  projectName: string;
  mappingConfig?: MappingConfig;
  year?: number;
  onToast?: (msg: { title: string; description?: string; variant?: 'default' | 'destructive' }) => void;
}

export async function exportFlatYear(args: ExportArgs): Promise<void> {
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
    const saleSet = new Set(mappingConfig?.sale_results ?? []);
    const voicemailSet = new Set(mappingConfig?.flat_voicemail_results ?? []);
    const nawtSet = new Set(mappingConfig?.flat_nawt_results ?? []);

    const classify = (name: string): ResultKind => {
      if (saleSet.has(name)) return 'sale';
      if (voicemailSet.has(name)) return 'voicemail';
      if (nawtSet.has(name)) return 'nawt';
      return 'negatief';
    };

    // 1. Fetch year records (paged)
    const records: RawRecord[] = [];
    const PAGE = 1000;
    let offset = 0;
    while (true) {
      const { data, error } = await supabase
        .from('call_records')
        .select('basicall_record_id, beldatum, beldatum_date, resultaat, week_number, raw_data')
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

    // 2. Fetch logged time for the year
    const { data: loggedRows, error: loggedErr } = await supabase
      .from('daily_logged_time')
      .select('date, total_seconds, corrected_seconds')
      .eq('project_id', projectId)
      .gte('date', yearStart)
      .lte('date', yearEnd);
    if (loggedErr) throw loggedErr;

    // 3. Bucket per week
    const weeks = getAllWeeksForYear(year);
    const weekBuckets: Record<number, WeekBucket> = {};
    weeks.forEach((w) => (weekBuckets[w] = { results: new Map(), loggedSeconds: 0 }));

    records.forEach((record) => {
      const date = parseBasiCallDate(record.beldatum_date ?? record.beldatum);
      if (!date) return;
      if (getISOWeekYear(date) !== year) return;
      const week = record.week_number ?? null;
      if (!week || !weekBuckets[week]) return;

      const rawData = record.raw_data ?? {};
      const resultName =
        record.resultaat ??
        (rawData['bc_result_naam'] as string) ??
        'Onbekend';
      const kind = classify(resultName);
      const existing = weekBuckets[week].results.get(resultName);
      if (existing) {
        existing.count++;
      } else {
        weekBuckets[week].results.set(resultName, { count: 1, kind });
      }
    });

    (loggedRows ?? []).forEach((row) => {
      const date = parseBasiCallDate(row.date);
      if (!date) return;
      if (getISOWeekYear(date) !== year) return;
      const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
      d.setUTCDate(d.getUTCDate() + 4 - (d.getUTCDay() || 7));
      const yearStartUtc = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
      const week = Math.ceil(((d.getTime() - yearStartUtc.getTime()) / 86400000 + 1) / 7);
      if (!weekBuckets[week]) return;
      const seconds = Number(row.corrected_seconds ?? row.total_seconds) || 0;
      weekBuckets[week].loggedSeconds += seconds;
    });

    // 4. Build workbook: Totaal first, then a sheet per non-empty week
    const wb = XLSX.utils.book_new();

    const totalBucket: WeekBucket = { results: new Map(), loggedSeconds: 0 };
    weeks.forEach((w) => {
      weekBuckets[w].results.forEach((val, key) => {
        const existing = totalBucket.results.get(key);
        if (existing) {
          existing.count += val.count;
        } else {
          totalBucket.results.set(key, { count: val.count, kind: val.kind });
        }
      });
      totalBucket.loggedSeconds += weekBuckets[w].loggedSeconds;
    });

    XLSX.utils.book_append_sheet(wb, buildFlatSheet(totalBucket, `Totaal ${year}`), 'Totaal');

    weeks.forEach((w) => {
      const bucket = weekBuckets[w];
      if (bucket.results.size === 0 && bucket.loggedSeconds === 0) return;
      const label = `week ${String(w).padStart(2, '0')} ${year}`;
      XLSX.utils.book_append_sheet(wb, buildFlatSheet(bucket, label), `W${String(w).padStart(2, '0')}`);
    });

    // 5. Write
    const safeName = projectName.replace(/[^\w\s-]/g, '').replace(/\s+/g, '_');
    const filename = `Rapportage_${safeName}_${year}.xlsx`;
    XLSX.writeFile(wb, filename);

    onToast?.({
      title: 'Export succesvol',
      description: `Jaarrapport ${year} geëxporteerd als ${filename}`,
    });
  } catch (err) {
    console.error('Flat year export failed:', err);
    onToast?.({
      title: 'Export mislukt',
      description: err instanceof Error ? err.message : 'Onbekende fout',
      variant: 'destructive',
    });
  }
}

function buildFlatSheet(bucket: WeekBucket, title: string): XLSX.WorkSheet {
  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toLocaleString('nl-NL');

  const entries = Array.from(bucket.results.entries()).map(([name, val]) => ({
    name,
    count: val.count,
    kind: val.kind,
  }));

  const negatief = entries.filter((r) => r.kind === 'negatief').sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const voicemail = entries.filter((r) => r.kind === 'voicemail').sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const nawt = entries.filter((r) => r.kind === 'nawt').sort((a, b) => a.name.localeCompare(b.name, 'nl'));
  const sales = entries.filter((r) => r.kind === 'sale').sort((a, b) => a.name.localeCompare(b.name, 'nl'));

  const totalNegatief = negatief.reduce((s, r) => s + r.count, 0);
  const totalVoicemail = voicemail.reduce((s, r) => s + r.count, 0);
  const totalNawt = nawt.reduce((s, r) => s + r.count, 0);
  const totalSale = sales.reduce((s, r) => s + r.count, 0);
  // Historical convention: Totaal afgehandeld = negatief + sale, excludes voicemail + NAWT.
  const totalAfgehandeld = totalNegatief + totalSale;

  // Triple Tree regel: uren per cel naar boven afronden, productiviteitsratios
  // gebruiken de afgeronde uren.
  const hours = ceilHours(bucket.loggedSeconds / 3600);
  const callsPerHour = hours > 0 ? totalAfgehandeld / hours : 0;
  const salesPerHour = hours > 0 ? totalSale / hours : 0;
  const conversie = totalAfgehandeld > 0 ? totalSale / totalAfgehandeld : 0;

  const rows: (string | number)[][] = [];
  rows.push([title]);
  rows.push([]);
  rows.push(['Omschrijving', 'Type', 'Aantal', '%']);

  // Track row ranges for styling
  const negatiefStart = rows.length + 1; // 1-based
  negatief.forEach((r) => {
    rows.push([
      r.name,
      'Negatief effectief afgehandeld',
      r.count,
      totalAfgehandeld > 0 ? fmtPct(r.count / totalAfgehandeld) : '',
    ]);
  });
  const negatiefEnd = rows.length;

  // Subtotaal negatief
  rows.push([
    'Totaal',
    '',
    totalNegatief,
    totalAfgehandeld > 0 ? fmtPct(totalNegatief / totalAfgehandeld) : '',
  ]);
  const subtotaalNegatiefRow = rows.length;

  rows.push([]);

  // Voicemail + NAWT (no percentage — historical convention)
  const voicemailRowIdx = voicemail.length > 0 ? rows.length + 1 : null;
  if (voicemail.length > 0) {
    rows.push([
      'Max voicemail',
      voicemail.length === 1 ? voicemail[0].name : `${voicemail.length} codes`,
      totalVoicemail,
      '',
    ]);
  }
  const nawtRowIdx = nawt.length > 0 ? rows.length + 1 : null;
  if (nawt.length > 0) {
    rows.push([
      'NAWT fout',
      nawt.length === 1 ? nawt[0].name : `${nawt.length} codes`,
      totalNawt,
      '',
    ]);
  }
  if (voicemail.length > 0 || nawt.length > 0) {
    rows.push([]);
  }

  // Sales
  const salesStart = rows.length + 1;
  sales.forEach((r) => {
    rows.push([
      r.name,
      'Sale',
      r.count,
      totalAfgehandeld > 0 ? fmtPct(r.count / totalAfgehandeld) : '',
    ]);
  });
  const salesEnd = rows.length;

  rows.push([
    'Totaal afgehandeld',
    '',
    totalAfgehandeld,
    totalAfgehandeld > 0 ? '100,00%' : '',
  ]);
  const totalAfgehandeldRow = rows.length;

  rows.push([]);
  const footerStart = rows.length + 1;
  rows.push(['Bel uren', '', hours.toFixed(2), '']);
  rows.push(['Calls p/u', '', callsPerHour.toFixed(2), '']);
  rows.push(['Leden p/u', '', salesPerHour.toFixed(2), '']);
  rows.push(['Conversie', '', fmtPct(conversie), '']);
  const footerEnd = rows.length;

  const ws = XLSX.utils.aoa_to_sheet(rows);
  ws['!cols'] = [{ wch: 42 }, { wch: 34 }, { wch: 12 }, { wch: 10 }];

  // Styling
  if (ws['A1']) ws['A1'].s = { font: { bold: true, sz: 14 } };
  ['A3', 'B3', 'C3', 'D3'].forEach((ref) => styleCell(ws, ref, STYLE_HEADER));

  for (let r = negatiefStart; r <= negatiefEnd; r++) {
    ['A', 'B', 'C', 'D'].forEach((c) => styleCell(ws, `${c}${r}`, STYLE_CELL));
  }
  ['A', 'B', 'C', 'D'].forEach((c) => styleCell(ws, `${c}${subtotaalNegatiefRow}`, STYLE_SUBTOTAL));

  if (voicemailRowIdx) {
    ['A', 'B', 'C', 'D'].forEach((c) => styleCell(ws, `${c}${voicemailRowIdx}`, STYLE_VOICEMAIL_OR_NAWT));
  }
  if (nawtRowIdx) {
    ['A', 'B', 'C', 'D'].forEach((c) => styleCell(ws, `${c}${nawtRowIdx}`, STYLE_VOICEMAIL_OR_NAWT));
  }

  for (let r = salesStart; r <= salesEnd; r++) {
    ['A', 'B', 'C', 'D'].forEach((c) => styleCell(ws, `${c}${r}`, STYLE_SALE));
  }

  ['A', 'B', 'C', 'D'].forEach((c) => styleCell(ws, `${c}${totalAfgehandeldRow}`, STYLE_TOTAL));

  for (let r = footerStart; r <= footerEnd; r++) {
    ['A', 'B', 'C', 'D'].forEach((c) => styleCell(ws, `${c}${r}`, STYLE_FOOTER));
  }

  return ws;
}
