import { useMemo, useState } from 'react';
import { ProcessedCallRecord, DayStats } from '@/types/dashboard';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { 
  createEmptyStats, 
  detectFrequency, 
  categorizeNegativeResult, 
  isUnreachable,
  getFrequencyLabel,
  FrequencyType
} from '@/lib/statsHelpers';

interface ReportMatrixProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate?: number;
  selectedWeek: string | number;
  amountCol?: string;
  freqCol?: string;
}

const parseDutchFloat = (val: unknown): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(str) || 0;
};

export const ReportMatrix = ({ 
  data, 
  hourlyRate, 
  vatRate = 21, 
  selectedWeek, 
  amountCol = 'termijnbedrag',
  freqCol = 'frequentie'
}: ReportMatrixProps) => {
  const [showNegativeArgumented, setShowNegativeArgumented] = useState(false);
  const [showNegativeNotArgumented, setShowNegativeNotArgumented] = useState(false);

  const days = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

  // Aggregate data by day
  const aggregated = useMemo(() => {
    const result: Record<string, DayStats> = {};
    days.forEach((d) => (result[d] = createEmptyStats()));
    result.total = createEmptyStats();

    data.forEach((record) => {
      const day = record.day_name?.toLowerCase() || '';
      if (!result[day]) return;

      // Get raw_data fields
      const rawData = record as unknown as { raw_data?: Record<string, unknown> };
      const attempts = rawData.raw_data?.bc_belpogingen ? Number(rawData.raw_data.bc_belpogingen) : 1;
      const amount = rawData.raw_data?.[amountCol] ? parseDutchFloat(rawData.raw_data[amountCol]) : 0;
      const resultName = rawData.raw_data?.bc_result_naam as string || record.bc_result_naam || 'Onbekend';
      const frequency = rawData.raw_data?.[freqCol];

      // Basic counts
      result[day].calls++;
      result[day].durationSec += record.bc_gesprekstijd;
      result[day].totalAttempts += attempts;
      result.total.calls++;
      result.total.durationSec += record.bc_gesprekstijd;
      result.total.totalAttempts += attempts;

      if (record.is_sale) {
        result[day].sales++;
        result[day].annualValue += record.annual_value;
        result[day].totalAmount += amount;
        result.total.sales++;
        result.total.annualValue += record.annual_value;
        result.total.totalAmount += amount;

        // Frequency breakdown
        const freqType = detectFrequency(frequency);
        result[day].freqBreakdown[freqType].count++;
        result[day].freqBreakdown[freqType].annualValue += record.annual_value;
        result.total.freqBreakdown[freqType].count++;
        result.total.freqBreakdown[freqType].annualValue += record.annual_value;

        if (record.is_recurring) {
          result[day].recurring++;
          result[day].annualValueRecurring += record.annual_value;
          result.total.recurring++;
          result.total.annualValueRecurring += record.annual_value;
        } else {
          result[day].oneoff++;
          result[day].annualValueOneoff += record.annual_value;
          result.total.oneoff++;
          result.total.annualValueOneoff += record.annual_value;
        }
      } else {
        // Negative result handling
        result[day].negativeCount++;
        result[day].negativeResults[resultName] = (result[day].negativeResults[resultName] || 0) + 1;
        result.total.negativeCount++;
        result.total.negativeResults[resultName] = (result.total.negativeResults[resultName] || 0) + 1;

        // Check if unreachable
        if (isUnreachable(resultName)) {
          result[day].unreachableCount++;
          result.total.unreachableCount++;
        }

        // Categorize negative
        const category = categorizeNegativeResult(resultName);
        if (category === 'argumentated') {
          result[day].negativeArgumented[resultName] = (result[day].negativeArgumented[resultName] || 0) + 1;
          result[day].negativeArgumentedCount++;
          result.total.negativeArgumented[resultName] = (result.total.negativeArgumented[resultName] || 0) + 1;
          result.total.negativeArgumentedCount++;
        } else {
          result[day].negativeNotArgumented[resultName] = (result[day].negativeNotArgumented[resultName] || 0) + 1;
          result[day].negativeNotArgumentedCount++;
          result.total.negativeNotArgumented[resultName] = (result.total.negativeNotArgumented[resultName] || 0) + 1;
          result.total.negativeNotArgumentedCount++;
        }
      }
    });

    return result;
  }, [data, amountCol, freqCol]);

  // Get all unique negative reasons per category
  const allNegativeArgumentedReasons = useMemo(() => {
    const reasons = new Set<string>();
    Object.values(aggregated).forEach((stats) => {
      Object.keys(stats.negativeArgumented).forEach((r) => reasons.add(r));
    });
    return Array.from(reasons).sort();
  }, [aggregated]);

  const allNegativeNotArgumentedReasons = useMemo(() => {
    const reasons = new Set<string>();
    Object.values(aggregated).forEach((stats) => {
      Object.keys(stats.negativeNotArgumented).forEach((r) => reasons.add(r));
    });
    return Array.from(reasons).sort();
  }, [aggregated]);

  // Calculation helpers
  const calcHours = (stats: DayStats) => stats.durationSec / 3600;
  const calcSalesPerHour = (stats: DayStats) => {
    const hours = calcHours(stats);
    return hours > 0 ? stats.sales / hours : 0;
  };
  const calcCallsPerHour = (stats: DayStats) => {
    const hours = calcHours(stats);
    return hours > 0 ? stats.calls / hours : 0;
  };
  const calcInvestment = (stats: DayStats) => calcHours(stats) * hourlyRate;
  const calcInvestmentInclVat = (stats: DayStats) => calcInvestment(stats) * (1 + vatRate / 100);
  const calcBtwAmount = (stats: DayStats) => calcInvestment(stats) * (vatRate / 100);
  const calcCostPerDonor = (stats: DayStats) =>
    stats.sales > 0 ? calcInvestment(stats) / stats.sales : 0;
  const calcCostPerDonorInclVat = (stats: DayStats) =>
    stats.sales > 0 ? calcInvestmentInclVat(stats) / stats.sales : 0;
  const calcBrutoConversion = (stats: DayStats) =>
    stats.calls > 0 ? (stats.sales / stats.calls) * 100 : 0;
  const calcNettoConversion = (stats: DayStats) => {
    const reachable = stats.calls - stats.unreachableCount;
    return reachable > 0 ? (stats.sales / reachable) * 100 : 0;
  };
  const calcAvgAmount = (stats: DayStats) =>
    stats.sales > 0 ? stats.totalAmount / stats.sales : 0;
  const calcROI = (stats: DayStats) => {
    const investment = calcInvestment(stats);
    return investment > 0 ? stats.annualValue / investment : 0;
  };
  const calcPaybackMonths = (stats: DayStats) => {
    const investment = calcInvestment(stats);
    const monthlyValue = stats.annualValue / 12;
    return monthlyValue > 0 ? investment / monthlyValue : 0;
  };
  const calcPaybackMonthsInclVat = (stats: DayStats) => {
    const investment = calcInvestmentInclVat(stats);
    const monthlyValue = stats.annualValue / 12;
    return monthlyValue > 0 ? investment / monthlyValue : 0;
  };

  // Render helpers
  const formatCurrency = (val: number) =>
    `€ ${val.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPercent = (val: number) => `${val.toFixed(1)}%`;
  const formatDecimal = (val: number) => val.toFixed(2);
  const formatMultiplier = (val: number) => `${val.toFixed(2)}x`;
  const formatMonths = (val: number) => `${val.toFixed(1)} mnd`;

  const renderRow = (
    label: string,
    getValue: (stats: DayStats) => number,
    format: 'number' | 'currency' | 'percent' | 'decimal' | 'multiplier' | 'months' = 'number',
    bgClass = ''
  ) => {
    const formatValue = (val: number) => {
      switch (format) {
        case 'currency': return formatCurrency(val);
        case 'percent': return formatPercent(val);
        case 'decimal': return formatDecimal(val);
        case 'multiplier': return formatMultiplier(val);
        case 'months': return formatMonths(val);
        default: return Math.round(val).toString();
      }
    };

    return (
      <tr className={`hover:bg-muted/30 transition-colors border-b border-border/50 ${bgClass}`}>
        <td className="px-4 py-3 font-medium text-foreground bg-muted/30 sticky left-0 text-sm">{label}</td>
        {days.map((day) => (
          <td key={day} className="px-4 py-3 text-right text-foreground text-sm">
            {formatValue(getValue(aggregated[day]))}
          </td>
        ))}
        <td className="px-4 py-3 text-right font-bold text-foreground bg-muted/50 text-sm">
          {formatValue(getValue(aggregated.total))}
        </td>
      </tr>
    );
  };

  const renderFreqRow = (
    label: string,
    freqType: FrequencyType,
    valueType: 'count' | 'annualValue'
  ) => {
    const getValue = (stats: DayStats) => stats.freqBreakdown[freqType][valueType];
    const format = valueType === 'annualValue' ? 'currency' : 'number';
    return renderRow(label, getValue, format);
  };

  const renderNegativeReasonRow = (reason: string, category: 'argumentated' | 'not_argumentated') => {
    const getValue = (stats: DayStats) => {
      const source = category === 'argumentated' ? stats.negativeArgumented : stats.negativeNotArgumented;
      return source[reason] || 0;
    };
    return (
      <tr key={reason} className="hover:bg-muted/30 transition-colors border-b border-border/50 bg-muted/10">
        <td className="px-4 py-2 pl-8 text-muted-foreground bg-muted/20 sticky left-0 text-xs">{reason}</td>
        {days.map((day) => (
          <td key={day} className="px-4 py-2 text-right text-muted-foreground text-xs">
            {getValue(aggregated[day]) || '-'}
          </td>
        ))}
        <td className="px-4 py-2 text-right font-semibold text-muted-foreground bg-muted/30 text-xs">
          {getValue(aggregated.total) || '-'}
        </td>
      </tr>
    );
  };

  const renderSectionHeader = (title: string, bgClass: string, textClass: string) => (
    <tr>
      <td colSpan={days.length + 2} className={`px-4 py-3 ${bgClass} ${textClass} font-bold text-xs uppercase tracking-wider`}>
        {title}
      </td>
    </tr>
  );

  const renderCollapsibleHeader = (
    title: string,
    isOpen: boolean,
    onToggle: () => void,
    bgClass: string,
    textClass: string
  ) => (
    <tr className="cursor-pointer" onClick={onToggle}>
      <td colSpan={days.length + 2} className={`px-4 py-3 ${bgClass} ${textClass} font-bold text-xs uppercase tracking-wider`}>
        <div className="flex items-center justify-between">
          <span>{title}</span>
          {isOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </div>
      </td>
    </tr>
  );

  return (
    <div className="overflow-x-auto bg-card rounded-2xl border border-border shadow-sm">
      <table className="w-full text-sm">
        <thead className="bg-muted/50 text-foreground font-semibold">
          <tr>
            <th className="px-4 py-4 text-left sticky left-0 bg-muted/50 z-10 rounded-tl-2xl min-w-[200px]">
              {selectedWeek === 'all' ? 'Totaal 2025' : `Week ${selectedWeek}`}
            </th>
            {days.map((day) => (
              <th key={day} className="px-4 py-4 text-right capitalize min-w-[100px]">
                {day.slice(0, 2)}
              </th>
            ))}
            <th className="px-4 py-4 text-right rounded-tr-2xl bg-muted/70 min-w-[100px]">Totaal</th>
          </tr>
        </thead>
        <tbody>
          {/* TOTAAL OVERZICHT */}
          {renderSectionHeader('Totaal Overzicht', 'bg-kpi-green', 'text-kpi-green-text')}
          {renderRow('Aantal positief', (s) => s.sales)}
          {renderRow('Doorlopende machtigingen', (s) => s.recurring)}
          {renderRow('Eenmalige machtigingen', (s) => s.oneoff)}
          {renderRow('Jaarwaarde totaal', (s) => s.annualValue, 'currency')}
          {renderRow('Jaarwaarde doorlopend', (s) => s.annualValueRecurring, 'currency')}
          {renderRow('Jaarwaarde eenmalig', (s) => s.annualValueOneoff, 'currency')}
          {renderRow('Bruto conversie', calcBrutoConversion, 'percent')}
          {renderRow('Netto conversie', calcNettoConversion, 'percent')}
          {renderRow('Aantal beluren', calcHours, 'decimal')}
          {renderRow('Gesprekken per uur', calcCallsPerHour, 'decimal')}
          {renderRow('Score per uur', calcSalesPerHour, 'decimal')}
          {renderRow('Gemiddeld donatiebedrag', calcAvgAmount, 'currency')}

          {/* POSITIEF - FREQUENTIE BREAKDOWN */}
          {renderSectionHeader('Positief per Frequentie', 'bg-kpi-blue', 'text-kpi-blue-text')}
          {renderFreqRow(getFrequencyLabel('monthly'), 'monthly', 'count')}
          {renderFreqRow(getFrequencyLabel('quarterly'), 'quarterly', 'count')}
          {renderFreqRow(getFrequencyLabel('halfYearly'), 'halfYearly', 'count')}
          {renderFreqRow(getFrequencyLabel('yearly'), 'yearly', 'count')}
          {renderFreqRow(getFrequencyLabel('oneoff'), 'oneoff', 'count')}
          {renderRow('Totaal', (s) => s.sales, 'number', 'bg-muted/20')}

          {/* OPBRENGST PER FREQUENTIE */}
          {renderSectionHeader('Opbrengst per Frequentie (jaarwaarde)', 'bg-kpi-purple', 'text-kpi-purple-text')}
          {renderFreqRow(getFrequencyLabel('monthly'), 'monthly', 'annualValue')}
          {renderFreqRow(getFrequencyLabel('quarterly'), 'quarterly', 'annualValue')}
          {renderFreqRow(getFrequencyLabel('halfYearly'), 'halfYearly', 'annualValue')}
          {renderFreqRow(getFrequencyLabel('yearly'), 'yearly', 'annualValue')}
          {renderFreqRow(getFrequencyLabel('oneoff'), 'oneoff', 'annualValue')}
          {renderRow('Totaal', (s) => s.annualValue, 'currency', 'bg-muted/20')}

          {/* NEGATIEF BEARGUMENTEERD */}
          {renderCollapsibleHeader(
            `Negatief Beargumenteerd (${aggregated.total.negativeArgumentedCount})`,
            showNegativeArgumented,
            () => setShowNegativeArgumented(!showNegativeArgumented),
            'bg-kpi-orange',
            'text-kpi-orange-text'
          )}
          {showNegativeArgumented && (
            <>
              {allNegativeArgumentedReasons.map((reason) => renderNegativeReasonRow(reason, 'argumentated'))}
              {renderRow('Totaal', (s) => s.negativeArgumentedCount, 'number', 'bg-muted/20')}
            </>
          )}

          {/* NEGATIEF NIET BEARGUMENTEERD */}
          {renderCollapsibleHeader(
            `Negatief Niet Beargumenteerd (${aggregated.total.negativeNotArgumentedCount})`,
            showNegativeNotArgumented,
            () => setShowNegativeNotArgumented(!showNegativeNotArgumented),
            'bg-kpi-pink',
            'text-kpi-pink-text'
          )}
          {showNegativeNotArgumented && (
            <>
              {allNegativeNotArgumentedReasons.map((reason) => renderNegativeReasonRow(reason, 'not_argumentated'))}
              {renderRow('Totaal', (s) => s.negativeNotArgumentedCount, 'number', 'bg-muted/20')}
            </>
          )}

          {/* CONTACTEN */}
          {renderSectionHeader('Contacten', 'bg-kpi-cyan', 'text-kpi-cyan-text')}
          {renderRow('Positief', (s) => s.sales)}
          {renderRow('Negatief beargumenteerd', (s) => s.negativeArgumentedCount)}
          {renderRow('Negatief niet beargumenteerd', (s) => s.negativeNotArgumentedCount)}
          {renderRow('Totaal', (s) => s.calls, 'number', 'bg-muted/20')}

          {/* CONVERSIE PER UUR */}
          {renderSectionHeader('Conversie per Uur', 'bg-kpi-purple', 'text-kpi-purple-text')}
          {renderRow('Positief per uur', calcSalesPerHour, 'decimal')}
          {renderRow('Negatief bearg. per uur', (s) => {
            const hours = calcHours(s);
            return hours > 0 ? s.negativeArgumentedCount / hours : 0;
          }, 'decimal')}
          {renderRow('Negatief niet bearg. per uur', (s) => {
            const hours = calcHours(s);
            return hours > 0 ? s.negativeNotArgumentedCount / hours : 0;
          }, 'decimal')}
          {renderRow('Gesprekken per uur', calcCallsPerHour, 'decimal', 'bg-muted/20')}

          {/* INVESTERING */}
          {renderSectionHeader('Investering', 'bg-kpi-cyan', 'text-kpi-cyan-text')}
          {renderRow('Investering (Excl BTW)', calcInvestment, 'currency')}
          {renderRow(`BTW ${vatRate}%`, calcBtwAmount, 'currency')}
          {renderRow('Investering (Incl BTW)', calcInvestmentInclVat, 'currency')}
          {renderRow('Investering per donateur (Excl BTW)', calcCostPerDonor, 'currency')}
          {renderRow('Investering per donateur (Incl BTW)', calcCostPerDonorInclVat, 'currency')}
          {renderRow('Terugverdientijd (Excl BTW)', calcPaybackMonths, 'months')}
          {renderRow('Terugverdientijd (Incl BTW)', calcPaybackMonthsInclVat, 'months')}
          {renderRow('ROI', calcROI, 'multiplier')}

          {/* BELPOGINGEN */}
          {renderSectionHeader('Belpogingen', 'bg-muted/80', 'text-foreground')}
          {renderRow('Totaal belpogingen', (s) => s.totalAttempts)}
        </tbody>
      </table>
    </div>
  );
};
