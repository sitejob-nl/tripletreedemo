import { useMemo, useState } from 'react';
import { ProcessedCallRecord, DayStats } from '@/types/dashboard';
import { MappingConfig } from '@/types/database';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  createEmptyStats,
  detectFrequencyFromConfig,
  categorizeNegativeResult,
  isUnreachable,
  isExcludedFromNet,
  getFrequencyLabel,
  FrequencyType
} from '@/lib/statsHelpers';
import { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';

interface ReportMatrixProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate?: number;
  selectedWeek: string | number;
  amountCol?: string;
  freqCol?: string;
  mappingConfig?: MappingConfig;
  /** If provided, use logged time (agent hours) instead of gesprekstijd for investment calculations */
  loggedTimeHours?: number;
  /** Daily breakdown of logged hours per weekday */
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
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
  freqCol = 'frequentie',
  mappingConfig,
  loggedTimeHours,
  dailyLoggedHours
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

      // Basic counts - ensure numeric conversion for safety
      const durationSec = Number(record.bc_gesprekstijd) || 0;
      result[day].calls++;
      result[day].durationSec += durationSec;
      result[day].totalAttempts += attempts;
      result.total.calls++;
      result.total.durationSec += durationSec;
      result.total.totalAttempts += attempts;

      if (record.is_sale) {
        result[day].sales++;
        result[day].annualValue += record.annual_value;
        result[day].totalAmount += amount;
        result.total.sales++;
        result.total.annualValue += record.annual_value;
        result.total.totalAmount += amount;

        // Frequency breakdown
        const freqType = detectFrequencyFromConfig(frequency, mappingConfig?.freq_map || {}, record.bc_result_naam || resultName).type;
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
        if (isUnreachable(resultName, mappingConfig)) {
          result[day].unreachableCount++;
          result.total.unreachableCount++;
        }

        // Check per-code exclusion from netto (orthogonal to unreachable/category)
        // Avoid double-counting when the code is already unreachable.
        if (!isUnreachable(resultName, mappingConfig) && isExcludedFromNet(resultName, mappingConfig)) {
          result[day].excludedFromNetCount++;
          result.total.excludedFromNetCount++;
        }

        // Categorize negative
        const category = categorizeNegativeResult(resultName, mappingConfig);
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
  // For gesprekstijd-based calculations (calls per hour, etc.)
  const calcGesprekstijdHours = (stats: DayStats) => stats.durationSec / 3600;
  
  // For investment calculations, prefer logged time if available
  // Uses daily breakdown for individual days, total for the totals column
  const calcHours = (stats: DayStats, isTotal = false, dayName?: string) => {
    if (isTotal) {
      // Use total logged time if available
      if (loggedTimeHours !== undefined && loggedTimeHours > 0) {
        return loggedTimeHours;
      }
    } else if (dayName && dailyLoggedHours) {
      // Use daily logged time for specific day if available
      const dailyHours = dailyLoggedHours[dayName as keyof DailyLoggedTimeBreakdown];
      if (dailyHours !== undefined && dailyHours > 0) {
        return dailyHours;
      }
    }
    // Fallback to gesprekstijd
    return stats.durationSec / 3600;
  };
  
  const calcSalesPerHour = (stats: DayStats, isTotal = false, dayName?: string) => {
    const hours = calcHours(stats, isTotal, dayName);
    return hours > 0 ? stats.sales / hours : 0;
  };
  const calcCallsPerHour = (stats: DayStats, isTotal = false, dayName?: string) => {
    const hours = calcHours(stats, isTotal, dayName);
    return hours > 0 ? stats.calls / hours : 0;
  };
  const getHourlyRateForDay = (dayName?: string): number => {
    if (dayName && mappingConfig?.weekday_rates) {
      const dayRate = mappingConfig.weekday_rates[dayName as keyof typeof mappingConfig.weekday_rates];
      if (dayRate !== undefined && dayRate > 0) return dayRate;
    }
    return hourlyRate;
  };
  
  const calcInvestment = (stats: DayStats, isTotal = false, dayName?: string) => {
    if (isTotal && mappingConfig?.weekday_rates) {
      // Sum investment per day using day-specific rates
      return days.reduce((sum, day) => {
        const dayHours = calcHours(aggregated[day], false, day);
        const dayRate = getHourlyRateForDay(day);
        return sum + dayHours * dayRate;
      }, 0);
    }
    return calcHours(stats, isTotal, dayName) * getHourlyRateForDay(dayName);
  };
  const calcInvestmentInclVat = (stats: DayStats, isTotal = false, dayName?: string) => calcInvestment(stats, isTotal, dayName) * (1 + vatRate / 100);
  const calcBtwAmount = (stats: DayStats, isTotal = false, dayName?: string) => calcInvestment(stats, isTotal, dayName) * (vatRate / 100);
  const calcCostPerDonor = (stats: DayStats, isTotal = false, dayName?: string) =>
    stats.sales > 0 ? calcInvestment(stats, isTotal, dayName) / stats.sales : 0;
  const calcCostPerDonorInclVat = (stats: DayStats, isTotal = false, dayName?: string) =>
    stats.sales > 0 ? calcInvestmentInclVat(stats, isTotal, dayName) / stats.sales : 0;
  const calcBrutoConversion = (stats: DayStats) =>
    stats.calls > 0 ? (stats.sales / stats.calls) * 100 : 0;
  const calcNettoConversion = (stats: DayStats) => {
    const denom = stats.calls - stats.unreachableCount - stats.excludedFromNetCount;
    return denom > 0 ? (stats.sales / denom) * 100 : 0;
  };
  const calcAvgAmount = (stats: DayStats) =>
    stats.sales > 0 ? stats.totalAmount / stats.sales : 0;
  const calcROI = (stats: DayStats, isTotal = false, dayName?: string) => {
    const investment = calcInvestment(stats, isTotal, dayName);
    return investment > 0 ? stats.annualValue / investment : 0;
  };
  const calcPaybackMonths = (stats: DayStats, isTotal = false, dayName?: string) => {
    const investment = calcInvestment(stats, isTotal, dayName);
    const monthlyValue = stats.annualValue / 12;
    return monthlyValue > 0 ? investment / monthlyValue : 0;
  };
  const calcPaybackMonthsInclVat = (stats: DayStats, isTotal = false, dayName?: string) => {
    const investment = calcInvestmentInclVat(stats, isTotal, dayName);
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

  // Render row with optional special total calculation
  // getValue can take (stats, isTotal, dayName) to use daily logged hours
  const renderRow = (
    label: string,
    getValue: ((stats: DayStats, isTotal?: boolean, dayName?: string) => number),
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
        <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium text-foreground bg-card sticky left-0 z-10 text-xs sm:text-sm whitespace-nowrap border-r border-border/30">{label}</td>
        {days.map((day) => (
          <td key={day} className="px-2 sm:px-4 py-2 sm:py-3 text-right text-foreground text-xs sm:text-sm whitespace-nowrap">
            {formatValue(getValue(aggregated[day], false, day))}
          </td>
        ))}
        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-foreground bg-muted/50 text-xs sm:text-sm whitespace-nowrap">
          {formatValue(getValue(aggregated.total, true, undefined))}
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
        <td className="px-2 sm:px-4 py-1.5 sm:py-2 pl-4 sm:pl-8 text-muted-foreground bg-card sticky left-0 z-10 text-[10px] sm:text-xs truncate max-w-[120px] sm:max-w-none border-r border-border/30">{reason}</td>
        {days.map((day) => (
          <td key={day} className="px-2 sm:px-4 py-1.5 sm:py-2 text-right text-muted-foreground text-[10px] sm:text-xs">
            {getValue(aggregated[day]) || '-'}
          </td>
        ))}
        <td className="px-2 sm:px-4 py-1.5 sm:py-2 text-right font-semibold text-muted-foreground bg-muted/30 text-[10px] sm:text-xs">
          {getValue(aggregated.total) || '-'}
        </td>
      </tr>
    );
  };

  const renderSectionHeader = (title: string, bgClass: string, textClass: string) => (
    <tr>
      <td colSpan={days.length + 2} className={`px-2 sm:px-4 py-2 sm:py-3 ${bgClass} ${textClass} font-bold text-[10px] sm:text-xs uppercase tracking-wider`}>
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
    <tr
      className="cursor-pointer focus-within:outline focus-within:outline-2 focus-within:outline-ring"
      onClick={onToggle}
      role="button"
      tabIndex={0}
      aria-expanded={isOpen}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onToggle();
        }
      }}
    >
      <td colSpan={days.length + 2} className={`px-2 sm:px-4 py-2 sm:py-3 ${bgClass} ${textClass} font-bold text-[10px] sm:text-xs uppercase tracking-wider`}>
        <div className="flex items-center justify-between">
          <span>{title}</span>
          {isOpen ? <ChevronUp className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" /> : <ChevronDown className="h-3 w-3 sm:h-4 sm:w-4" aria-hidden="true" />}
        </div>
      </td>
    </tr>
  );

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl sm:rounded-2xl p-8 sm:p-12 text-center shadow-sm">
        <p className="text-sm sm:text-base text-muted-foreground">
          Geen gesprekken in {selectedWeek === 'all' ? 'deze periode' : `week ${selectedWeek}`}.
        </p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto bg-card rounded-xl sm:rounded-2xl border border-border shadow-sm -mx-4 sm:mx-0">
      <table className="w-full text-xs sm:text-sm">
        <thead className="bg-muted/50 text-foreground font-semibold">
          <tr>
            <th scope="col" className="px-2 sm:px-4 py-3 sm:py-4 text-left sticky left-0 bg-muted/50 z-10 rounded-tl-xl sm:rounded-tl-2xl min-w-[100px] sm:min-w-[200px] text-xs sm:text-sm">
              {selectedWeek === 'all' ? 'Totaal 2025' : `Week ${selectedWeek}`}
            </th>
            {days.map((day) => (
              <th key={day} scope="col" title={day} className="px-2 sm:px-4 py-3 sm:py-4 text-right capitalize min-w-[50px] sm:min-w-[100px] text-xs sm:text-sm">
                {day.slice(0, 2)}
              </th>
            ))}
            <th scope="col" className="px-2 sm:px-4 py-3 sm:py-4 text-right rounded-tr-xl sm:rounded-tr-2xl bg-muted/70 min-w-[60px] sm:min-w-[100px] text-xs sm:text-sm">Totaal</th>
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
          {renderRow('Aantal beluren', (s, isTotal, dayName) => calcHours(s, isTotal, dayName), 'decimal')}
          {renderRow('Gesprekken per uur', (s, isTotal, dayName) => calcCallsPerHour(s, isTotal, dayName), 'decimal')}
          {renderRow('Score per uur', (s, isTotal, dayName) => calcSalesPerHour(s, isTotal, dayName), 'decimal')}
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
          {renderRow('Positief per uur', (s, isTotal, dayName) => calcSalesPerHour(s, isTotal, dayName), 'decimal')}
          {renderRow('Negatief bearg. per uur', (s, isTotal, dayName) => {
            const hours = calcHours(s, isTotal, dayName);
            return hours > 0 ? s.negativeArgumentedCount / hours : 0;
          }, 'decimal')}
          {renderRow('Negatief niet bearg. per uur', (s, isTotal, dayName) => {
            const hours = calcHours(s, isTotal, dayName);
            return hours > 0 ? s.negativeNotArgumentedCount / hours : 0;
          }, 'decimal')}
          {renderRow('Gesprekken per uur', (s, isTotal, dayName) => calcCallsPerHour(s, isTotal, dayName), 'decimal', 'bg-muted/20')}

          {/* INVESTERING */}
          {renderSectionHeader('Investering', 'bg-kpi-cyan', 'text-kpi-cyan-text')}
          {renderRow('Investering (Excl BTW)', (s, isTotal, dayName) => calcInvestment(s, isTotal, dayName), 'currency')}
          {renderRow(`BTW ${vatRate}%`, (s, isTotal, dayName) => calcBtwAmount(s, isTotal, dayName), 'currency')}
          {renderRow('Investering (Incl BTW)', (s, isTotal, dayName) => calcInvestmentInclVat(s, isTotal, dayName), 'currency')}
          {renderRow('Investering per donateur (Excl BTW)', (s, isTotal, dayName) => calcCostPerDonor(s, isTotal, dayName), 'currency')}
          {renderRow('Investering per donateur (Incl BTW)', (s, isTotal, dayName) => calcCostPerDonorInclVat(s, isTotal, dayName), 'currency')}
          {renderRow('Terugverdientijd (Excl BTW)', (s, isTotal, dayName) => calcPaybackMonths(s, isTotal, dayName), 'months')}
          {renderRow('Terugverdientijd (Incl BTW)', (s, isTotal, dayName) => calcPaybackMonthsInclVat(s, isTotal, dayName), 'months')}
          {renderRow('ROI', (s, isTotal, dayName) => calcROI(s, isTotal, dayName), 'multiplier')}

          {/* BELPOGINGEN */}
          {renderSectionHeader('Belpogingen', 'bg-muted/80', 'text-foreground')}
          {renderRow('Totaal belpogingen', (s) => s.totalAttempts)}
        </tbody>
      </table>
    </div>
  );
};
