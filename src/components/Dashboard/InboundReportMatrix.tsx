import { useMemo, useState } from 'react';
import { ProcessedCallRecord, InboundStats } from '@/types/dashboard';
import { MappingConfig } from '@/types/database';
import { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';
import { ChevronDown, ChevronUp } from 'lucide-react';
import {
  createEmptyInboundStats,
  categorizeInboundResult,
  isUnreachable,
  isExcludedFromRetention,
  calcRetentionRatio,
  calcSaveRate,
} from '@/lib/statsHelpers';
import { ceilHours } from '@/lib/hours';

interface InboundReportMatrixProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate?: number;
  selectedWeek: string | number;
  mappingConfig: MappingConfig;
  amountCol?: string;
  loggedTimeHours?: number;
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
}

const parseDutchFloat = (val: unknown): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(str) || 0;
};

export const InboundReportMatrix = ({ 
  data, 
  hourlyRate, 
  vatRate = 21, 
  selectedWeek,
  mappingConfig,
  amountCol = 'termijnbedrag',
  loggedTimeHours,
  dailyLoggedHours,
}: InboundReportMatrixProps) => {
  const [showLostReasons, setShowLostReasons] = useState(false);
  const [showRetainedReasons, setShowRetainedReasons] = useState(false);

  const days = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

  // Aggregate data by day for inbound
  const aggregated = useMemo(() => {
    const result: Record<string, InboundStats> = {};
    days.forEach((d) => (result[d] = createEmptyInboundStats()));
    result.total = createEmptyInboundStats();

    data.forEach((record) => {
      const day = record.day_name?.toLowerCase() || '';
      if (!result[day]) return;

      const rawData = record as unknown as { raw_data?: Record<string, unknown> };
      const attempts = rawData.raw_data?.bc_belpogingen ? Number(rawData.raw_data.bc_belpogingen) : 1;
      const amount = rawData.raw_data?.[amountCol] ? parseDutchFloat(rawData.raw_data[amountCol]) : 0;
      const resultName = rawData.raw_data?.bc_result_naam as string || record.bc_result_naam || 'Onbekend';
      
      // Calculate annual value based on frequency
      const annualValue = record.annual_value || amount * 12;

      // Basic counts - ensure numeric conversion for safety
      const durationSec = Number(record.bc_gesprekstijd) || 0;
      result[day].calls++;
      result[day].durationSec += durationSec;
      result[day].totalAttempts += attempts;
      result.total.calls++;
      result.total.durationSec += durationSec;
      result.total.totalAttempts += attempts;

      // Categorize based on inbound config
      const category = categorizeInboundResult(resultName, mappingConfig);

      // Track per-code exclusions from retention ratio denominator (e.g. "overleden").
      // Orthogonal to category — counted separately so we can subtract from totalDecided.
      if (isExcludedFromRetention(resultName, mappingConfig)) {
        result[day].excludedFromRetentionCount++;
        result.total.excludedFromRetentionCount++;
      }

      if (category === 'unreachable') {
        result[day].unreachableCount++;
        result.total.unreachableCount++;
      } else if (category === 'retained') {
        result[day].retained++;
        result[day].retainedValue += annualValue;
        result[day].retainedReasons[resultName] = (result[day].retainedReasons[resultName] || 0) + 1;
        result.total.retained++;
        result.total.retainedValue += annualValue;
        result.total.retainedReasons[resultName] = (result.total.retainedReasons[resultName] || 0) + 1;
      } else if (category === 'lost') {
        result[day].lost++;
        result[day].lostValue += annualValue;
        result[day].lostReasons[resultName] = (result[day].lostReasons[resultName] || 0) + 1;
        result.total.lost++;
        result.total.lostValue += annualValue;
        result.total.lostReasons[resultName] = (result.total.lostReasons[resultName] || 0) + 1;
      } else if (category === 'partial') {
        result[day].partialSuccess++;
        result[day].partialSuccessValue += annualValue;
        result.total.partialSuccess++;
        result.total.partialSuccessValue += annualValue;
      } else {
        result[day].pending++;
        result.total.pending++;
      }
    });

    return result;
  }, [data, amountCol, mappingConfig]);

  // Get all unique reasons
  const allLostReasons = useMemo(() => {
    const reasons = new Set<string>();
    Object.values(aggregated).forEach((stats) => {
      Object.keys(stats.lostReasons).forEach((r) => reasons.add(r));
    });
    return Array.from(reasons).sort();
  }, [aggregated]);

  const allRetainedReasons = useMemo(() => {
    const reasons = new Set<string>();
    Object.values(aggregated).forEach((stats) => {
      Object.keys(stats.retainedReasons).forEach((r) => reasons.add(r));
    });
    return Array.from(reasons).sort();
  }, [aggregated]);

  // Calculation helpers
  
  const getHourlyRateForDay = (dayName?: string): number => {
    if (dayName && mappingConfig?.weekday_rates) {
      const dayRate = mappingConfig.weekday_rates[dayName as keyof typeof mappingConfig.weekday_rates];
      if (dayRate !== undefined && dayRate > 0) return dayRate;
    }
    return hourlyRate;
  };
  
  const calcHours = (stats: InboundStats, dayName?: string) => {
    // Triple Tree regel: per cel naar boven afronden op hele uren.
    if (!dayName && loggedTimeHours !== undefined && loggedTimeHours > 0) return ceilHours(loggedTimeHours);
    if (dayName && dailyLoggedHours) {
      const dh = dailyLoggedHours[dayName as keyof DailyLoggedTimeBreakdown];
      if (dh !== undefined && dh > 0) return ceilHours(dh);
    }
    return ceilHours(stats.durationSec / 3600);
  };
  const calcCallsPerHour = (stats: InboundStats, dayName?: string) => {
    const hours = calcHours(stats, dayName);
    return hours > 0 ? stats.calls / hours : 0;
  };
  const calcInvestment = (stats: InboundStats, dayName?: string) => {
    if (!dayName && mappingConfig?.weekday_rates) {
      return days.reduce((sum, day) => {
        const dayHours = calcHours(aggregated[day], day);
        return sum + dayHours * getHourlyRateForDay(day);
      }, 0);
    }
    return calcHours(stats, dayName) * getHourlyRateForDay(dayName);
  };
  const calcInvestmentInclVat = (stats: InboundStats, dayName?: string) => calcInvestment(stats, dayName) * (1 + vatRate / 100);
  const calcCostPerRetained = (stats: InboundStats) =>
    stats.retained > 0 ? calcInvestment(stats) / stats.retained : 0;
  const calcNetReachable = (stats: InboundStats) => stats.calls - stats.unreachableCount;
  const calcNetRetentionRatio = (stats: InboundStats) => {
    const totalDecided = stats.retained + stats.lost + stats.partialSuccess - stats.excludedFromRetentionCount;
    if (totalDecided <= 0) return 0;
    return ((stats.retained + stats.partialSuccess) / totalDecided) * 100;
  };

  // Render helpers
  const formatCurrency = (val: number) =>
    `€ ${val.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPercent = (val: number) => `${val.toFixed(1)}%`;
  const formatDecimal = (val: number) => val.toFixed(2);

  const renderRow = (
    label: string,
    getValue: (stats: InboundStats, dayName?: string) => number,
    format: 'number' | 'currency' | 'percent' | 'decimal' = 'number',
    bgClass = ''
  ) => {
    const formatValue = (val: number) => {
      switch (format) {
        case 'currency': return formatCurrency(val);
        case 'percent': return formatPercent(val);
        case 'decimal': return formatDecimal(val);
        default: return Math.round(val).toString();
      }
    };

    return (
      <tr className={`hover:bg-muted/30 transition-colors border-b border-border/50 ${bgClass}`}>
        <td className="px-2 sm:px-4 py-2 sm:py-3 font-medium text-foreground bg-card sticky left-0 z-10 text-xs sm:text-sm whitespace-nowrap border-r border-border/30">{label}</td>
        {days.map((day) => (
          <td key={day} className="px-2 sm:px-4 py-2 sm:py-3 text-right text-foreground text-xs sm:text-sm whitespace-nowrap">
            {formatValue(getValue(aggregated[day], day))}
          </td>
        ))}
        <td className="px-2 sm:px-4 py-2 sm:py-3 text-right font-bold text-foreground bg-muted/50 text-xs sm:text-sm whitespace-nowrap">
          {formatValue(getValue(aggregated.total))}
        </td>
      </tr>
    );
  };

  const renderReasonRow = (reason: string, type: 'lost' | 'retained') => {
    const getValue = (stats: InboundStats) => {
      const source = type === 'lost' ? stats.lostReasons : stats.retainedReasons;
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
          Geen retentie-gesprekken in {selectedWeek === 'all' ? 'deze periode' : `week ${selectedWeek}`}.
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
              {selectedWeek === 'all' ? 'Retentie Totaal' : `Retentie Week ${selectedWeek}`}
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
          {/* RETENTIE OVERZICHT */}
          {renderSectionHeader('Retentie Overzicht', 'bg-kpi-green', 'text-kpi-green-text')}
          {renderRow('Totaal gesprekken', (s) => s.calls)}
          {renderRow('Behouden donateurs', (s) => s.retained)}
          {renderRow('Verloren donateurs', (s) => s.lost)}
          {renderRow('Omgezet naar eenmalig', (s) => s.partialSuccess)}
          {renderRow('Nog in behandeling', (s) => s.pending)}
          {renderRow('Niet bereikbaar', (s) => s.unreachableCount)}
          
          {/* RETENTIE RATIO */}
          {renderSectionHeader('Retentie Metrics', 'bg-kpi-blue', 'text-kpi-blue-text')}
          {renderRow('Retentie ratio', calcNetRetentionRatio, 'percent')}
          {renderRow('Save rate (alleen volledig behouden)', (s) => calcSaveRate(s), 'percent')}
          {renderRow('Bruto retentie', (s) => {
            const totalDecided = s.retained + s.lost + s.partialSuccess;
            return s.calls > 0 ? (totalDecided / s.calls) * 100 : 0;
          }, 'percent')}

          {/* FINANCIEEL - BEHOUDEN */}
          {renderSectionHeader('Behouden Waarde', 'bg-kpi-purple', 'text-kpi-purple-text')}
          {renderRow('Jaarwaarde behouden', (s) => s.retainedValue, 'currency')}
          {renderRow('Jaarwaarde eenmalig omgezet', (s) => s.partialSuccessValue, 'currency')}
          {renderRow('Totaal behouden waarde', (s) => s.retainedValue + s.partialSuccessValue, 'currency', 'bg-muted/20')}

          {/* FINANCIEEL - VERLOREN */}
          {renderSectionHeader('Verloren Waarde', 'bg-kpi-pink', 'text-kpi-pink-text')}
          {renderRow('Jaarwaarde verloren', (s) => s.lostValue, 'currency')}
          {renderRow('Netto behouden (behouden - verloren)', (s) => s.retainedValue - s.lostValue, 'currency', 'bg-muted/20')}

          {/* REDENEN BEHOUDEN */}
          {renderCollapsibleHeader(
            `Redenen Behouden (${aggregated.total.retained})`,
            showRetainedReasons,
            () => setShowRetainedReasons(!showRetainedReasons),
            'bg-kpi-green',
            'text-kpi-green-text'
          )}
          {showRetainedReasons && (
            <>
              {allRetainedReasons.map((reason) => renderReasonRow(reason, 'retained'))}
              {renderRow('Totaal', (s) => s.retained, 'number', 'bg-muted/20')}
            </>
          )}

          {/* REDENEN VERLOREN */}
          {renderCollapsibleHeader(
            `Redenen Verloren (${aggregated.total.lost})`,
            showLostReasons,
            () => setShowLostReasons(!showLostReasons),
            'bg-kpi-orange',
            'text-kpi-orange-text'
          )}
          {showLostReasons && (
            <>
              {allLostReasons.map((reason) => renderReasonRow(reason, 'lost'))}
              {renderRow('Totaal', (s) => s.lost, 'number', 'bg-muted/20')}
            </>
          )}

          {/* PRODUCTIVITEIT */}
          {renderSectionHeader('Productiviteit', 'bg-kpi-cyan', 'text-kpi-cyan-text')}
          {renderRow('Aantal beluren', (s, dayName) => calcHours(s, dayName), 'decimal')}
          {renderRow('Gesprekken per uur', (s, dayName) => calcCallsPerHour(s, dayName), 'decimal')}
          {renderRow('Behouden per uur', (s, dayName) => {
            const hours = calcHours(s, dayName);
            return hours > 0 ? s.retained / hours : 0;
          }, 'decimal')}

          {/* INVESTERING */}
          {renderSectionHeader('Investering', 'bg-muted/80', 'text-foreground')}
          {renderRow('Investering (Excl BTW)', (s, dayName) => calcInvestment(s, dayName), 'currency')}
          {renderRow('Investering (Incl BTW)', (s, dayName) => calcInvestmentInclVat(s, dayName), 'currency')}
          {renderRow('Kosten per behouden donateur', (s) => s.retained > 0 ? calcInvestment(s) / s.retained : 0, 'currency')}
        </tbody>
      </table>
    </div>
  );
};