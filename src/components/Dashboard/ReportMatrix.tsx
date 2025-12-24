import { useMemo, useState } from 'react';
import { ProcessedCallRecord, DayStats } from '@/types/dashboard';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';

interface ReportMatrixProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  selectedWeek: string | number;
  amountCol?: string;
}

const parseDutchFloat = (val: unknown): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(str) || 0;
};

const createEmptyStats = (): DayStats => ({
  calls: 0,
  sales: 0,
  recurring: 0,
  oneoff: 0,
  annualValue: 0,
  annualValueRecurring: 0,
  annualValueOneoff: 0,
  durationSec: 0,
  totalAttempts: 0,
  totalAmount: 0,
  negativeResults: {},
  negativeCount: 0,
});

export const ReportMatrix = ({ data, hourlyRate, selectedWeek, amountCol = 'termijnbedrag' }: ReportMatrixProps) => {
  const [showNegativeDetails, setShowNegativeDetails] = useState(false);
  const days = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

  const aggregated = useMemo(() => {
    const result: Record<string, DayStats> = {};
    days.forEach((d) => (result[d] = createEmptyStats()));
    result.total = createEmptyStats();

    data.forEach((record) => {
      const day = record.day_name.toLowerCase();
      if (!result[day]) return;

      const rawData = record as unknown as { raw_data?: Record<string, unknown> };
      const attempts = rawData.raw_data?.bc_belpogingen ? Number(rawData.raw_data.bc_belpogingen) : 1;
      const amount = rawData.raw_data?.[amountCol] ? parseDutchFloat(rawData.raw_data[amountCol]) : 0;
      const resultName = rawData.raw_data?.bc_result_naam as string || record.bc_result_naam || 'Onbekend';

      // Day stats
      result[day].calls++;
      result[day].durationSec += record.bc_gesprekstijd;
      result[day].totalAttempts += attempts;

      if (record.is_sale) {
        result[day].sales++;
        result[day].annualValue += record.annual_value;
        result[day].totalAmount += amount;

        if (record.is_recurring) {
          result[day].recurring++;
          result[day].annualValueRecurring += record.annual_value;
        } else {
          result[day].oneoff++;
          result[day].annualValueOneoff += record.annual_value;
        }
      } else {
        result[day].negativeCount++;
        result[day].negativeResults[resultName] = (result[day].negativeResults[resultName] || 0) + 1;
      }

      // Total stats
      result.total.calls++;
      result.total.durationSec += record.bc_gesprekstijd;
      result.total.totalAttempts += attempts;

      if (record.is_sale) {
        result.total.sales++;
        result.total.annualValue += record.annual_value;
        result.total.totalAmount += amount;
        if (record.is_recurring) {
          result.total.recurring++;
          result.total.annualValueRecurring += record.annual_value;
        } else {
          result.total.oneoff++;
          result.total.annualValueOneoff += record.annual_value;
        }
      } else {
        result.total.negativeCount++;
        result.total.negativeResults[resultName] = (result.total.negativeResults[resultName] || 0) + 1;
      }
    });
    return result;
  }, [data, amountCol]);

  // Get all unique negative result reasons
  const allNegativeReasons = useMemo(() => {
    const reasons = new Set<string>();
    Object.values(aggregated).forEach(stats => {
      Object.keys(stats.negativeResults).forEach(reason => reasons.add(reason));
    });
    return Array.from(reasons).sort();
  }, [aggregated]);

  const calcHours = (stats: DayStats) => stats.durationSec / 3600;
  const calcSalesPerHour = (stats: DayStats) => {
    const hours = calcHours(stats);
    return hours > 0 ? (stats.sales / hours).toFixed(2) : '0.00';
  };
  const calcInvestment = (stats: DayStats) => calcHours(stats) * hourlyRate;
  const calcCostPerDonor = (stats: DayStats) =>
    stats.sales > 0 ? calcInvestment(stats) / stats.sales : 0;
  const calcConversion = (stats: DayStats) =>
    stats.calls > 0 ? (stats.sales / stats.calls) * 100 : 0;
  const calcAvgAmount = (stats: DayStats) =>
    stats.sales > 0 ? stats.totalAmount / stats.sales : 0;
  const calcROI = (stats: DayStats) => {
    const investment = calcInvestment(stats);
    return investment > 0 ? stats.annualValue / investment : 0;
  };

  const renderRow = (
    label: string,
    valueKey: keyof DayStats | null,
    isCurrency = false,
    isPercent = false,
    isCalculation: ((stats: DayStats) => number | string) | null = null,
    isMultiplier = false
  ) => (
    <tr className="hover:bg-muted/30 transition-colors border-b border-border/50">
      <td className="px-6 py-4 font-medium text-foreground bg-muted/30 sticky left-0">{label}</td>
      {days.map((day) => {
        let val: number | string = 0;
        if (isCalculation) {
          val = isCalculation(aggregated[day]);
        } else if (valueKey && valueKey !== 'negativeResults') {
          val = aggregated[day][valueKey] as number;
        }

        return (
          <td key={day} className="px-6 py-4 text-right text-foreground">
            {isCurrency
              ? `€ ${(typeof val === 'number' ? val : parseFloat(val as string)).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
              : isPercent
              ? `${(typeof val === 'number' ? val : parseFloat(val as string)).toFixed(1)}%`
              : isMultiplier
              ? `${(typeof val === 'number' ? val : parseFloat(val as string)).toFixed(2)}x`
              : val}
          </td>
        );
      })}
      <td className="px-6 py-4 text-right font-bold text-foreground bg-muted/30">
        {isCalculation
          ? (() => {
              const totalVal = isCalculation(aggregated.total);
              const numVal = typeof totalVal === 'number' ? totalVal : parseFloat(totalVal as string);
              if (isCurrency) {
                return `€ ${numVal.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
              }
              if (isMultiplier) {
                return `${numVal.toFixed(2)}x`;
              }
              return totalVal;
            })()
          : valueKey && valueKey !== 'negativeResults'
          ? isCurrency
            ? `€ ${(aggregated.total[valueKey] as number).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
            : aggregated.total[valueKey]
          : ''}
      </td>
    </tr>
  );

  const renderNegativeReasonRow = (reason: string) => (
    <tr key={reason} className="hover:bg-muted/30 transition-colors border-b border-border/50">
      <td className="px-6 py-3 pl-10 text-sm text-muted-foreground bg-muted/20 sticky left-0">{reason}</td>
      {days.map((day) => (
        <td key={day} className="px-6 py-3 text-right text-sm text-muted-foreground">
          {aggregated[day].negativeResults[reason] || 0}
        </td>
      ))}
      <td className="px-6 py-3 text-right font-medium text-muted-foreground bg-muted/20">
        {aggregated.total.negativeResults[reason] || 0}
      </td>
    </tr>
  );

  return (
    <div className="overflow-x-auto bg-card rounded-2xl border border-border shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-foreground font-semibold">
          <tr>
            <th className="px-6 py-4 text-left sticky left-0 bg-muted/50 z-10 rounded-tl-2xl">
              Week {selectedWeek === 'all' ? 'Totaal' : selectedWeek}
            </th>
            {days.map((d) => (
              <th key={d} className="px-6 py-4 text-right capitalize">
                {d}
              </th>
            ))}
            <th className="px-6 py-4 text-right font-bold rounded-tr-2xl">Totaal</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td colSpan={9} className="px-6 py-3 bg-kpi-green text-kpi-green-text font-bold text-xs uppercase tracking-wider">
              Resultaten
            </td>
          </tr>
          {renderRow('Aantal positief', 'sales')}
          {renderRow('Aantal doorlopende machtigingen', 'recurring')}
          {renderRow('Aantal eenmalige machtigingen', 'oneoff')}
          {renderRow('Totaal belpogingen', 'totalAttempts')}
          {renderRow('Aantal negatief', 'negativeCount')}

          {/* Negative Results Detail Section */}
          {allNegativeReasons.length > 0 && (
            <>
              <tr>
                <td colSpan={9} className="px-0 py-0">
                  <Collapsible open={showNegativeDetails} onOpenChange={setShowNegativeDetails}>
                    <CollapsibleTrigger className="w-full px-6 py-3 bg-destructive/10 text-destructive font-bold text-xs uppercase tracking-wider flex items-center gap-2 hover:bg-destructive/20 transition-colors">
                      {showNegativeDetails ? <ChevronDown className="h-4 w-4" /> : <ChevronRight className="h-4 w-4" />}
                      Negatieve Resultaten per Reden ({allNegativeReasons.length})
                    </CollapsibleTrigger>
                    <CollapsibleContent>
                      <table className="w-full text-sm">
                        <tbody>
                          {allNegativeReasons.map(renderNegativeReasonRow)}
                        </tbody>
                      </table>
                    </CollapsibleContent>
                  </Collapsible>
                </td>
              </tr>
            </>
          )}

          <tr>
            <td colSpan={9} className="px-6 py-3 bg-kpi-blue text-kpi-blue-text font-bold text-xs uppercase tracking-wider">
              Financieel
            </td>
          </tr>
          {renderRow('Jaarwaarde Totaal', 'annualValue', true)}
          {renderRow('Jaarwaarde Doorlopend', 'annualValueRecurring', true)}
          {renderRow('Jaarwaarde Eenmalig', 'annualValueOneoff', true)}
          {renderRow('Gemiddeld donatiebedrag', null, true, false, calcAvgAmount)}

          <tr>
            <td colSpan={9} className="px-6 py-3 bg-kpi-purple text-kpi-purple-text font-bold text-xs uppercase tracking-wider">
              Productiviteit & Conversie
            </td>
          </tr>
          {renderRow('Aantal beluren', null, false, false, (s) => calcHours(s).toFixed(1))}
          {renderRow('Sales per uur', null, false, false, calcSalesPerHour)}
          {renderRow('Bruto Conversie', null, false, true, calcConversion)}

          <tr>
            <td colSpan={9} className="px-6 py-3 bg-kpi-cyan text-kpi-cyan-text font-bold text-xs uppercase tracking-wider">
              Investering (o.b.v. €{hourlyRate}/u)
            </td>
          </tr>
          {renderRow('Investering (Excl BTW)', null, true, false, calcInvestment)}
          {renderRow('Investering per donateur', null, true, false, calcCostPerDonor)}
          {renderRow('ROI (Jaarwaarde / Investering)', null, false, false, calcROI, true)}
        </tbody>
      </table>
    </div>
  );
};
