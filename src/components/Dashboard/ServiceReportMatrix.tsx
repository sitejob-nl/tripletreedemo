import { useMemo } from 'react';
import { ProcessedCallRecord } from '@/types/dashboard';
import { MappingConfig } from '@/types/database';
import { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';

interface ServiceReportMatrixProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate?: number;
  selectedWeek: string | number;
  mappingConfig: MappingConfig;
  loggedTimeHours?: number;
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
  /** Show the Investering section (admin-only — klanten zien geen kostenberekening voor klantenservice) */
  showInvestment?: boolean;
}

interface ServiceDayStats {
  calls: number;
  durationSec: number;
  handled: number;
  notHandled: number;
  other: number;
  handledReasons: Record<string, number>;
  notHandledReasons: Record<string, number>;
}

const createEmptyServiceStats = (): ServiceDayStats => ({
  calls: 0,
  durationSec: 0,
  handled: 0,
  notHandled: 0,
  other: 0,
  handledReasons: {},
  notHandledReasons: {},
});

export const ServiceReportMatrix = ({
  data,
  hourlyRate,
  vatRate = 21,
  selectedWeek,
  mappingConfig,
  loggedTimeHours,
  dailyLoggedHours,
  showInvestment = false,
}: ServiceReportMatrixProps) => {
  const days = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];

  const handledSet = useMemo(() => new Set(mappingConfig.handled_results || []), [mappingConfig]);
  const notHandledSet = useMemo(() => new Set(mappingConfig.not_handled_results || []), [mappingConfig]);

  const aggregated = useMemo(() => {
    const result: Record<string, ServiceDayStats> = {};
    days.forEach((d) => (result[d] = createEmptyServiceStats()));
    result.total = createEmptyServiceStats();

    data.forEach((record) => {
      const day = record.day_name?.toLowerCase() || '';
      if (!result[day]) return;

      const durationSec = Number(record.bc_gesprekstijd) || 0;
      const resultName = record.bc_result_naam || 'Onbekend';

      result[day].calls++;
      result[day].durationSec += durationSec;
      result.total.calls++;
      result.total.durationSec += durationSec;

      if (handledSet.has(resultName)) {
        result[day].handled++;
        result[day].handledReasons[resultName] = (result[day].handledReasons[resultName] || 0) + 1;
        result.total.handled++;
        result.total.handledReasons[resultName] = (result.total.handledReasons[resultName] || 0) + 1;
      } else if (notHandledSet.has(resultName)) {
        result[day].notHandled++;
        result[day].notHandledReasons[resultName] = (result[day].notHandledReasons[resultName] || 0) + 1;
        result.total.notHandled++;
        result.total.notHandledReasons[resultName] = (result.total.notHandledReasons[resultName] || 0) + 1;
      } else {
        result[day].other++;
        result.total.other++;
      }
    });

    return result;
  }, [data, handledSet, notHandledSet]);

  // Calculation helpers
  const getHourlyRateForDay = (dayName?: string): number => {
    if (dayName && mappingConfig?.weekday_rates) {
      const dayRate = mappingConfig.weekday_rates[dayName as keyof typeof mappingConfig.weekday_rates];
      if (dayRate !== undefined && dayRate > 0) return dayRate;
    }
    return hourlyRate;
  };

  const calcHours = (stats: ServiceDayStats, isTotal = false, dayName?: string) => {
    if (isTotal && loggedTimeHours !== undefined && loggedTimeHours > 0) return loggedTimeHours;
    if (!isTotal && dayName && dailyLoggedHours) {
      const dh = dailyLoggedHours[dayName as keyof DailyLoggedTimeBreakdown];
      if (dh !== undefined && dh > 0) return dh;
    }
    return stats.durationSec / 3600;
  };

  const calcInvestment = (stats: ServiceDayStats, isTotal = false, dayName?: string) => {
    if (isTotal && mappingConfig?.weekday_rates) {
      return days.reduce((sum, day) => {
        const dh = calcHours(aggregated[day], false, day);
        return sum + dh * getHourlyRateForDay(day);
      }, 0);
    }
    return calcHours(stats, isTotal, dayName) * getHourlyRateForDay(dayName);
  };

  const calcHandledRatio = (stats: ServiceDayStats) => {
    const total = stats.handled + stats.notHandled;
    return total > 0 ? (stats.handled / total) * 100 : 0;
  };

  const calcCallsPerHour = (stats: ServiceDayStats, isTotal = false, dayName?: string) => {
    const hours = calcHours(stats, isTotal, dayName);
    return hours > 0 ? stats.calls / hours : 0;
  };

  const calcAvgDuration = (stats: ServiceDayStats) =>
    stats.calls > 0 ? stats.durationSec / stats.calls : 0;

  // Formatters
  const formatCurrency = (val: number) =>
    `€ ${val.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const formatPercent = (val: number) => `${val.toFixed(1)}%`;
  const formatDecimal = (val: number) => val.toFixed(2);
  const formatDuration = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = Math.round(sec % 60);
    return `${m}:${s.toString().padStart(2, '0')}`;
  };

  const renderRow = (
    label: string,
    getValue: (stats: ServiceDayStats, isTotal?: boolean, dayName?: string) => number,
    format: 'number' | 'currency' | 'percent' | 'decimal' | 'duration' = 'number',
    bgClass = ''
  ) => {
    const formatValue = (val: number) => {
      switch (format) {
        case 'currency': return formatCurrency(val);
        case 'percent': return formatPercent(val);
        case 'decimal': return formatDecimal(val);
        case 'duration': return formatDuration(val);
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

  const renderSectionHeader = (title: string, bgClass: string, textClass: string) => (
    <tr>
      <td colSpan={days.length + 2} className={`px-2 sm:px-4 py-2 sm:py-3 ${bgClass} ${textClass} font-bold text-[10px] sm:text-xs uppercase tracking-wider`}>
        {title}
      </td>
    </tr>
  );

  if (data.length === 0) {
    return (
      <div className="bg-card border border-border rounded-xl sm:rounded-2xl p-8 sm:p-12 text-center shadow-sm">
        <p className="text-sm sm:text-base text-muted-foreground">
          Geen klantenservice-gesprekken in {selectedWeek === 'all' ? 'deze periode' : `week ${selectedWeek}`}.
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
              {selectedWeek === 'all' ? 'Klantenservice Totaal' : `Klantenservice Week ${selectedWeek}`}
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
          {/* OVERZICHT */}
          {renderSectionHeader('Overzicht', 'bg-kpi-green', 'text-kpi-green-text')}
          {renderRow('Totaal gesprekken', (s) => s.calls)}
          {renderRow('Afgehandeld', (s) => s.handled)}
          {renderRow('Niet afgehandeld', (s) => s.notHandled)}
          {renderRow('Overig / onbekend', (s) => s.other)}

          {/* RATIO'S */}
          {renderSectionHeader("Ratio's", 'bg-kpi-blue', 'text-kpi-blue-text')}
          {renderRow('Afhandel ratio', calcHandledRatio, 'percent')}
          {renderRow('Niet-afgehandeld ratio', (s) => {
            const total = s.handled + s.notHandled;
            return total > 0 ? (s.notHandled / total) * 100 : 0;
          }, 'percent')}

          {/* PRODUCTIVITEIT */}
          {renderSectionHeader('Productiviteit', 'bg-kpi-cyan', 'text-kpi-cyan-text')}
          {renderRow('Aantal beluren', (s, isTotal, dayName) => calcHours(s, isTotal, dayName), 'decimal')}
          {renderRow('Gesprekken per uur', (s, isTotal, dayName) => calcCallsPerHour(s, isTotal, dayName), 'decimal')}
          {renderRow('Gem. gespreksduur', calcAvgDuration, 'duration')}
          {renderRow('Afgehandeld per uur', (s, isTotal, dayName) => {
            const hours = calcHours(s, isTotal, dayName);
            return hours > 0 ? s.handled / hours : 0;
          }, 'decimal')}

          {/* INVESTERING (admin-only) */}
          {showInvestment && (
            <>
              {renderSectionHeader('Investering (intern)', 'bg-muted/80', 'text-foreground')}
              {renderRow('Investering (Excl BTW)', (s, isTotal, dayName) => calcInvestment(s, isTotal, dayName), 'currency')}
              {renderRow('Investering (Incl BTW)', (s, isTotal, dayName) => calcInvestment(s, isTotal, dayName) * (1 + vatRate / 100), 'currency')}
              {renderRow('Kosten per gesprek', (s, isTotal, dayName) => {
                const inv = calcInvestment(s, isTotal, dayName);
                return s.calls > 0 ? inv / s.calls : 0;
              }, 'currency')}
              {renderRow('Kosten per afgehandeld', (s, isTotal, dayName) => {
                const inv = calcInvestment(s, isTotal, dayName);
                return s.handled > 0 ? inv / s.handled : 0;
              }, 'currency')}
            </>
          )}
        </tbody>
      </table>
    </div>
  );
};
