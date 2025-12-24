import { useMemo, useState } from 'react';
import { ProcessedCallRecord, InboundStats } from '@/types/dashboard';
import { MappingConfig } from '@/types/database';
import { ChevronDown, ChevronUp } from 'lucide-react';
import { 
  createEmptyInboundStats, 
  categorizeInboundResult,
  isUnreachable,
  calcRetentionRatio,
  calcSaveRate,
} from '@/lib/statsHelpers';

interface InboundReportMatrixProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate?: number;
  selectedWeek: string | number;
  mappingConfig: MappingConfig;
  amountCol?: string;
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

      // Basic counts
      result[day].calls++;
      result[day].durationSec += record.bc_gesprekstijd;
      result[day].totalAttempts += attempts;
      result.total.calls++;
      result.total.durationSec += record.bc_gesprekstijd;
      result.total.totalAttempts += attempts;

      // Categorize based on inbound config
      const category = categorizeInboundResult(resultName, mappingConfig);
      
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
  const calcHours = (stats: InboundStats) => stats.durationSec / 3600;
  const calcCallsPerHour = (stats: InboundStats) => {
    const hours = calcHours(stats);
    return hours > 0 ? stats.calls / hours : 0;
  };
  const calcInvestment = (stats: InboundStats) => calcHours(stats) * hourlyRate;
  const calcInvestmentInclVat = (stats: InboundStats) => calcInvestment(stats) * (1 + vatRate / 100);
  const calcCostPerRetained = (stats: InboundStats) =>
    stats.retained > 0 ? calcInvestment(stats) / stats.retained : 0;
  const calcNetReachable = (stats: InboundStats) => stats.calls - stats.unreachableCount;
  const calcNetRetentionRatio = (stats: InboundStats) => {
    const reachable = calcNetReachable(stats);
    const totalDecided = stats.retained + stats.lost + stats.partialSuccess;
    if (totalDecided === 0) return 0;
    return ((stats.retained + stats.partialSuccess) / totalDecided) * 100;
  };

  // Render helpers
  const formatCurrency = (val: number) =>
    `€ ${val.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPercent = (val: number) => `${val.toFixed(1)}%`;
  const formatDecimal = (val: number) => val.toFixed(2);

  const renderRow = (
    label: string,
    getValue: (stats: InboundStats) => number,
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

  const renderReasonRow = (reason: string, type: 'lost' | 'retained') => {
    const getValue = (stats: InboundStats) => {
      const source = type === 'lost' ? stats.lostReasons : stats.retainedReasons;
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
              {selectedWeek === 'all' ? 'Retentie Totaal 2025' : `Retentie Week ${selectedWeek}`}
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
          {renderRow('Aantal beluren', calcHours, 'decimal')}
          {renderRow('Gesprekken per uur', calcCallsPerHour, 'decimal')}
          {renderRow('Behouden per uur', (s) => {
            const hours = calcHours(s);
            return hours > 0 ? s.retained / hours : 0;
          }, 'decimal')}

          {/* INVESTERING */}
          {renderSectionHeader('Investering', 'bg-muted/80', 'text-foreground')}
          {renderRow('Investering (Excl BTW)', calcInvestment, 'currency')}
          {renderRow('Investering (Incl BTW)', calcInvestmentInclVat, 'currency')}
          {renderRow('Kosten per behouden donateur', calcCostPerRetained, 'currency')}
        </tbody>
      </table>
    </div>
  );
};