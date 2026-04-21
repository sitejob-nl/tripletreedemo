import { useMemo } from 'react';
import { ListTree } from 'lucide-react';
import { InboundReportMatrix } from '../InboundReportMatrix';
import { ProcessedCallRecord } from '@/types/dashboard';
import { MappingConfig } from '@/types/database';
import { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';

interface InboundRetentionMatrixProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate?: number;
  selectedWeek: string | number;
  mappingConfig?: MappingConfig;
  loggedTimeHours?: number;
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
}

// Variant 2 of the historical rapportages (Hersenstichting Retentie). Wraps
// InboundReportMatrix (retained/lost/partial + behouden waarde) and adds a
// "Reden-breakdown" card matching the historical 11-category split
// (Overleden, Hoge leeftijd, Financiele redenen, etc.). Admin configures the
// mapping of BasiCall result-codes to categories via
// mapping_config.reason_categories.
//
// Service-level telefonie-metrics (calls offered, waittime, handlingtime,
// abandoned rate, service level%) are deliberately omitted — BasiCall's
// Record.get doesn't provide them. Documented in plan as a known gap.
export function InboundRetentionMatrix({
  data,
  hourlyRate,
  vatRate,
  selectedWeek,
  mappingConfig,
  loggedTimeHours,
  dailyLoggedHours,
}: InboundRetentionMatrixProps) {
  const reasonCategories = mappingConfig?.reason_categories;

  const reasonCounts = useMemo(() => {
    if (!reasonCategories) return null;
    const counts: Record<string, number> = {};
    const categorySets: Record<string, Set<string>> = {};
    for (const [cat, codes] of Object.entries(reasonCategories)) {
      counts[cat] = 0;
      categorySets[cat] = new Set(codes);
    }

    let totalCategorized = 0;
    for (const record of data) {
      const resultName = record.bc_result_naam || 'Onbekend';
      for (const [cat, set] of Object.entries(categorySets)) {
        if (set.has(resultName)) {
          counts[cat]++;
          totalCategorized++;
          break;
        }
      }
    }
    return { counts, totalCategorized };
  }, [data, reasonCategories]);

  return (
    <div className="space-y-4">
      {mappingConfig && (
        <InboundReportMatrix
          data={data}
          hourlyRate={hourlyRate}
          vatRate={vatRate}
          selectedWeek={selectedWeek}
          mappingConfig={mappingConfig}
          amountCol={mappingConfig.amount_col}
          loggedTimeHours={loggedTimeHours}
          dailyLoggedHours={dailyLoggedHours}
        />
      )}

      <ReasonBreakdownCard reasonCategories={reasonCategories} reasonCounts={reasonCounts} />
    </div>
  );
}

function ReasonBreakdownCard({
  reasonCategories,
  reasonCounts,
}: {
  reasonCategories: Record<string, string[]> | undefined;
  reasonCounts: { counts: Record<string, number>; totalCategorized: number } | null;
}) {
  if (!reasonCategories || !reasonCounts) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-card p-4 shadow-sm">
        <h3 className="mb-2 flex items-center gap-2 text-sm font-semibold text-foreground">
          <ListTree size={16} className="text-primary" aria-hidden="true" />
          Reden-breakdown
        </h3>
        <p className="text-xs text-muted-foreground">
          Configureer de reden-categorieën in de Mapping Tool (bv. "Overleden", "Hoge leeftijd",
          "Financiele redenen") om de historische retentie-breakdown te tonen.
        </p>
      </div>
    );
  }

  const { counts, totalCategorized } = reasonCounts;
  const entries = Object.entries(reasonCategories).map(([cat, codes]) => ({
    cat,
    codes,
    count: counts[cat] ?? 0,
  }));
  const fmtNum = (v: number) => v.toLocaleString('nl-NL');
  const fmtPct = (v: number) => `${(v * 100).toFixed(1)}%`;

  return (
    <div className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <h3 className="mb-3 flex items-center gap-2 text-sm font-semibold text-foreground">
        <ListTree size={16} className="text-primary" aria-hidden="true" />
        Reden-breakdown
      </h3>
      <div className="overflow-x-auto">
        <table className="w-full text-xs sm:text-sm">
          <thead className="bg-muted/50 text-foreground font-semibold">
            <tr>
              <th scope="col" className="px-3 py-2 text-left">Reden</th>
              <th scope="col" className="px-3 py-2 text-right">Aantal</th>
              <th scope="col" className="px-3 py-2 text-right">%</th>
              <th scope="col" className="px-3 py-2 text-left text-[10px] text-muted-foreground">
                Gekoppelde codes
              </th>
            </tr>
          </thead>
          <tbody>
            {entries.map(({ cat, codes, count }) => (
              <tr key={cat} className="border-b border-border/50 hover:bg-muted/20">
                <td className="px-3 py-2 font-medium">{cat}</td>
                <td className="px-3 py-2 text-right">{fmtNum(count)}</td>
                <td className="px-3 py-2 text-right text-muted-foreground">
                  {totalCategorized > 0 ? fmtPct(count / totalCategorized) : '—'}
                </td>
                <td className="px-3 py-2 text-[10px] text-muted-foreground truncate max-w-[200px]">
                  {codes.length === 0 ? <em>(geen codes)</em> : codes.join(', ')}
                </td>
              </tr>
            ))}
            <tr className="bg-primary/10 font-bold">
              <td className="px-3 py-2">Totaal gecategoriseerd</td>
              <td className="px-3 py-2 text-right">{fmtNum(totalCategorized)}</td>
              <td className="px-3 py-2 text-right">{totalCategorized > 0 ? '100%' : '—'}</td>
              <td />
            </tr>
          </tbody>
        </table>
      </div>
      <p className="mt-2 text-[11px] text-muted-foreground">
        Records die niet in een categorie vallen blijven zichtbaar in de retentie-matrix hierboven
        (Behouden/Verloren/Gedeeltelijk). Configureer extra codes per reden via de Mapping Tool.
      </p>
    </div>
  );
}
