import { useMemo } from 'react';
import { ProcessedCallRecord } from '@/types/dashboard';
import { MappingConfig, ReportageWeeklyOverride } from '@/types/database';
import { metricNumber, rawRecordsWithoutOverrideWeeks } from '@/lib/reportageOverrideUtils';

interface FlatReportMatrixProps {
  data: ProcessedCallRecord[];
  mappingConfig?: MappingConfig;
  selectedWeek: string | number;
  loggedTimeHours?: number;
  reportageOverrides?: ReportageWeeklyOverride[];
}

type RowType = 'sale' | 'negatief' | 'voicemail' | 'nawt';

interface ResultRow {
  omschrijving: string;
  type: RowType;
  aantal: number;
}

// Variant 4 (flat / TTG / ANBO). Historical ANBO rapportages are one sheet per
// week with rows "Omschrijving | Type | Aantal | %" and a footer of
// productivity metrics.
//
// Admin configures which BasiCall result-codes are "Max voicemail" and "NAWT fout"
// via mapping_config.flat_voicemail_results / flat_nawt_results. Those counters
// are shown separately and are NOT included in Totaal afgehandeld (denominator
// for percentages), matching the historical convention.
export function FlatReportMatrix({
  data,
  mappingConfig,
  selectedWeek,
  loggedTimeHours,
  reportageOverrides = [],
}: FlatReportMatrixProps) {
  const { rows, totalNegatief, totalSale, totalVoicemail, totalNawt, totalAfgehandeld, overrideHours } = useMemo(() => {
    const counts = new Map<string, { count: number; type: RowType }>();
    const saleSet = new Set(mappingConfig?.sale_results ?? []);
    const voicemailSet = new Set(mappingConfig?.flat_voicemail_results ?? []);
    const nawtSet = new Set(mappingConfig?.flat_nawt_results ?? []);

    for (const record of rawRecordsWithoutOverrideWeeks(data, reportageOverrides)) {
      const rawData = (record as unknown as { raw_data?: Record<string, unknown> }).raw_data ?? {};
      const resultName =
        (rawData['bc_result_naam'] as string) ??
        record.bc_result_naam ??
        'Onbekend';

      let type: RowType;
      if (saleSet.has(resultName)) type = 'sale';
      else if (voicemailSet.has(resultName)) type = 'voicemail';
      else if (nawtSet.has(resultName)) type = 'nawt';
      else type = 'negatief';

      const existing = counts.get(resultName);
      if (existing) {
        existing.count++;
      } else {
        counts.set(resultName, { count: 1, type });
      }
    }

    let overrideHoursTotal = 0;
    for (const override of reportageOverrides) {
      overrideHoursTotal += metricNumber(override.metrics, 'hours', 0);
      for (const row of override.result_rows ?? []) {
        const typeKey = row.type.toLowerCase();
        let type: RowType;
        if (typeKey.includes('sale') || typeKey.includes('positief')) type = 'sale';
        else if (row.label.toLowerCase().includes('voicemail')) type = 'voicemail';
        else if (row.label.toLowerCase().includes('nawt')) type = 'nawt';
        else type = 'negatief';
        const existing = counts.get(row.label);
        if (existing) {
          existing.count += row.count;
        } else {
          counts.set(row.label, { count: row.count, type });
        }
      }
      const voicemail = metricNumber(override.metrics, 'voicemail', 0);
      if (voicemail > 0) {
        const existing = counts.get('Max voicemail');
        if (existing) existing.count += voicemail;
        else counts.set('Max voicemail', { count: voicemail, type: 'voicemail' });
      }
      const nawt = metricNumber(override.metrics, 'nawt', 0);
      if (nawt > 0) {
        const existing = counts.get('NAWT fout');
        if (existing) existing.count += nawt;
        else counts.set('NAWT fout', { count: nawt, type: 'nawt' });
      }
    }

    const list: ResultRow[] = Array.from(counts.entries())
      .map(([omschrijving, { count, type }]) => ({ omschrijving, type, aantal: count }));

    // Sort: negatief alphabetical, then voicemail, nawt, sale
    const order: Record<RowType, number> = { negatief: 0, voicemail: 1, nawt: 2, sale: 3 };
    list.sort((a, b) => {
      if (a.type !== b.type) return order[a.type] - order[b.type];
      return a.omschrijving.localeCompare(b.omschrijving, 'nl');
    });

    const negatief = list.filter((r) => r.type === 'negatief').reduce((s, r) => s + r.aantal, 0);
    const sale = list.filter((r) => r.type === 'sale').reduce((s, r) => s + r.aantal, 0);
    const voicemail = list.filter((r) => r.type === 'voicemail').reduce((s, r) => s + r.aantal, 0);
    const nawt = list.filter((r) => r.type === 'nawt').reduce((s, r) => s + r.aantal, 0);

    return {
      rows: list,
      totalNegatief: negatief,
      totalSale: sale,
      totalVoicemail: voicemail,
      totalNawt: nawt,
      // Historical convention: Totaal afgehandeld = negatief + sale, excluding voicemail and NAWT.
      totalAfgehandeld: negatief + sale,
      overrideHours: overrideHoursTotal > 0 ? overrideHoursTotal : null,
    };
  }, [data, mappingConfig, reportageOverrides]);

  if (data.length === 0 && reportageOverrides.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl p-8 text-center shadow-sm">
        <p className="text-sm text-muted-foreground">
          Geen gesprekken in {selectedWeek === 'all' ? 'deze periode' : `week ${selectedWeek}`}.
        </p>
      </div>
    );
  }

  const hours = overrideHours ?? loggedTimeHours ?? 0;
  const callsPerHour = hours > 0 ? totalAfgehandeld / hours : 0;
  const salesPerHour = hours > 0 ? totalSale / hours : 0;
  const conversie = totalAfgehandeld > 0 ? totalSale / totalAfgehandeld : 0;

  const fmtPct = (v: number) => `${(v * 100).toFixed(2)}%`;
  const fmtNum = (v: number) => v.toLocaleString('nl-NL');
  const fmtDec = (v: number, d = 2) => v.toFixed(d);

  const negatiefRows = rows.filter((r) => r.type === 'negatief');
  const voicemailRows = rows.filter((r) => r.type === 'voicemail');
  const nawtRows = rows.filter((r) => r.type === 'nawt');
  const saleRows = rows.filter((r) => r.type === 'sale');

  return (
    <div className="overflow-x-auto bg-card rounded-xl border border-border shadow-sm">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-muted/50 text-foreground font-semibold">
          <tr>
            <th scope="col" className="px-4 py-3 text-left">Omschrijving</th>
            <th scope="col" className="px-4 py-3 text-left">Type</th>
            <th scope="col" className="px-4 py-3 text-right">Aantal</th>
            <th scope="col" className="px-4 py-3 text-right">%</th>
          </tr>
        </thead>
        <tbody>
          {negatiefRows.map((r) => (
            <tr key={r.omschrijving} className="border-b border-border/50 hover:bg-muted/20">
              <td className="px-4 py-2">{r.omschrijving}</td>
              <td className="px-4 py-2 text-muted-foreground">Negatief effectief afgehandeld</td>
              <td className="px-4 py-2 text-right">{fmtNum(r.aantal)}</td>
              <td className="px-4 py-2 text-right text-muted-foreground">
                {totalAfgehandeld > 0 ? fmtPct(r.aantal / totalAfgehandeld) : '-'}
              </td>
            </tr>
          ))}
          <tr className="bg-muted/30 font-semibold border-b border-border">
            <td className="px-4 py-2">Totaal negatief</td>
            <td className="px-4 py-2" />
            <td className="px-4 py-2 text-right">{fmtNum(totalNegatief)}</td>
            <td className="px-4 py-2 text-right">
              {totalAfgehandeld > 0 ? fmtPct(totalNegatief / totalAfgehandeld) : '-'}
            </td>
          </tr>

          {voicemailRows.length > 0 && (
            <tr className="bg-muted/20 italic border-b border-border/50">
              <td className="px-4 py-2">Max voicemail</td>
              <td className="px-4 py-2 text-muted-foreground text-xs">
                {voicemailRows.length === 1 ? voicemailRows[0].omschrijving : `${voicemailRows.length} codes`}
              </td>
              <td className="px-4 py-2 text-right">{fmtNum(totalVoicemail)}</td>
              <td className="px-4 py-2 text-right text-muted-foreground">—</td>
            </tr>
          )}
          {nawtRows.length > 0 && (
            <tr className="bg-muted/20 italic border-b border-border/50">
              <td className="px-4 py-2">NAWT fout</td>
              <td className="px-4 py-2 text-muted-foreground text-xs">
                {nawtRows.length === 1 ? nawtRows[0].omschrijving : `${nawtRows.length} codes`}
              </td>
              <td className="px-4 py-2 text-right">{fmtNum(totalNawt)}</td>
              <td className="px-4 py-2 text-right text-muted-foreground">—</td>
            </tr>
          )}

          {saleRows.map((r) => (
            <tr key={r.omschrijving} className="border-b border-border/50 hover:bg-muted/20 bg-kpi-green/10">
              <td className="px-4 py-2 font-medium">{r.omschrijving}</td>
              <td className="px-4 py-2 text-kpi-green-text font-semibold">Sale</td>
              <td className="px-4 py-2 text-right">{fmtNum(r.aantal)}</td>
              <td className="px-4 py-2 text-right">
                {totalAfgehandeld > 0 ? fmtPct(r.aantal / totalAfgehandeld) : '-'}
              </td>
            </tr>
          ))}

          <tr className="bg-primary/10 font-bold border-b-2 border-border">
            <td className="px-4 py-2">Totaal afgehandeld</td>
            <td className="px-4 py-2" />
            <td className="px-4 py-2 text-right">{fmtNum(totalAfgehandeld)}</td>
            <td className="px-4 py-2 text-right">{totalAfgehandeld > 0 ? '100,00%' : '-'}</td>
          </tr>

          <tr><td colSpan={4} className="h-3" /></tr>

          <tr className="bg-muted/20">
            <td className="px-4 py-2 font-semibold">Bel uren</td>
            <td />
            <td className="px-4 py-2 text-right font-mono">{fmtDec(hours, 2)}</td>
            <td />
          </tr>
          <tr className="bg-muted/20">
            <td className="px-4 py-2 font-semibold">Calls p/u</td>
            <td />
            <td className="px-4 py-2 text-right font-mono">{fmtDec(callsPerHour, 2)}</td>
            <td />
          </tr>
          <tr className="bg-muted/20">
            <td className="px-4 py-2 font-semibold">Leden p/u</td>
            <td />
            <td className="px-4 py-2 text-right font-mono">{fmtDec(salesPerHour, 2)}</td>
            <td />
          </tr>
          <tr className="bg-muted/20">
            <td className="px-4 py-2 font-semibold">Conversie</td>
            <td />
            <td className="px-4 py-2 text-right font-mono">{fmtPct(conversie)}</td>
            <td />
          </tr>
        </tbody>
      </table>
    </div>
  );
}
