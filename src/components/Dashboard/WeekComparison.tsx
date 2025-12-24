import { useMemo, useState } from 'react';
import { ProcessedCallRecord, DayStats } from '@/types/dashboard';
import { ChevronDown, ChevronUp, ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';

interface WeekComparisonProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  availableWeeks: number[];
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

interface WeekStats extends DayStats {
  weekNumber: number;
}

export const WeekComparison = ({ data, hourlyRate, availableWeeks, amountCol = 'termijnbedrag' }: WeekComparisonProps) => {
  const [selectedWeeks, setSelectedWeeks] = useState<number[]>(() => {
    // Default: select last 2 available weeks
    const sorted = [...availableWeeks].sort((a, b) => b - a);
    return sorted.slice(0, Math.min(2, sorted.length));
  });

  const [sortColumn, setSortColumn] = useState<string>('weekNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Aggregate stats per week
  const weekStats = useMemo(() => {
    const stats: Record<number, WeekStats> = {};
    
    data.forEach((record) => {
      const weekNum = record.week_number;
      if (!stats[weekNum]) {
        stats[weekNum] = { ...createEmptyStats(), weekNumber: weekNum };
      }

      const rawData = record as unknown as { raw_data?: Record<string, unknown> };
      const attempts = rawData.raw_data?.bc_belpogingen ? Number(rawData.raw_data.bc_belpogingen) : 1;
      const amount = rawData.raw_data?.[amountCol] ? parseDutchFloat(rawData.raw_data[amountCol]) : 0;
      const resultName = rawData.raw_data?.bc_result_naam as string || record.bc_result_naam || 'Onbekend';

      stats[weekNum].calls++;
      stats[weekNum].durationSec += record.bc_gesprekstijd;
      stats[weekNum].totalAttempts += attempts;

      if (record.is_sale) {
        stats[weekNum].sales++;
        stats[weekNum].annualValue += record.annual_value;
        stats[weekNum].totalAmount += amount;

        if (record.is_recurring) {
          stats[weekNum].recurring++;
          stats[weekNum].annualValueRecurring += record.annual_value;
        } else {
          stats[weekNum].oneoff++;
          stats[weekNum].annualValueOneoff += record.annual_value;
        }
      } else {
        stats[weekNum].negativeCount++;
        stats[weekNum].negativeResults[resultName] = (stats[weekNum].negativeResults[resultName] || 0) + 1;
      }
    });

    return stats;
  }, [data, amountCol]);

  // Filter to selected weeks
  const filteredStats = useMemo(() => {
    return selectedWeeks
      .filter(w => weekStats[w])
      .map(w => weekStats[w])
      .sort((a, b) => {
        if (sortDirection === 'asc') {
          return a.weekNumber - b.weekNumber;
        }
        return b.weekNumber - a.weekNumber;
      });
  }, [selectedWeeks, weekStats, sortDirection]);

  // Calculation helpers
  const calcHours = (stats: DayStats) => stats.durationSec / 3600;
  const calcSalesPerHour = (stats: DayStats) => {
    const hours = calcHours(stats);
    return hours > 0 ? stats.sales / hours : 0;
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

  // Toggle week selection
  const toggleWeek = (week: number) => {
    setSelectedWeeks(prev => {
      if (prev.includes(week)) {
        return prev.filter(w => w !== week);
      }
      return [...prev, week].sort((a, b) => b - a);
    });
  };

  // Calculate change percentage between two values
  const calcChange = (current: number, previous: number): { value: number; direction: 'up' | 'down' | 'neutral' } => {
    if (previous === 0) return { value: 0, direction: 'neutral' };
    const change = ((current - previous) / previous) * 100;
    return {
      value: Math.abs(change),
      direction: change > 0.5 ? 'up' : change < -0.5 ? 'down' : 'neutral'
    };
  };

  // Render change indicator
  const renderChange = (current: number, previous: number | undefined, inverse = false) => {
    if (previous === undefined) return null;
    const change = calcChange(current, previous);
    
    if (change.direction === 'neutral') {
      return <Minus className="h-3 w-3 text-muted-foreground inline ml-1" />;
    }
    
    const isPositive = inverse ? change.direction === 'down' : change.direction === 'up';
    
    return (
      <span className={`inline-flex items-center ml-1 text-xs ${isPositive ? 'text-green-600' : 'text-red-600'}`}>
        {change.direction === 'up' ? (
          <ArrowUpRight className="h-3 w-3" />
        ) : (
          <ArrowDownRight className="h-3 w-3" />
        )}
        <span>{change.value.toFixed(0)}%</span>
      </span>
    );
  };

  const metrics = [
    { label: 'Aantal gesprekken', getValue: (s: WeekStats) => s.calls, format: 'number' },
    { label: 'Aantal positief', getValue: (s: WeekStats) => s.sales, format: 'number' },
    { label: 'Doorlopende machtigingen', getValue: (s: WeekStats) => s.recurring, format: 'number' },
    { label: 'Eenmalige machtigingen', getValue: (s: WeekStats) => s.oneoff, format: 'number' },
    { label: 'Totaal belpogingen', getValue: (s: WeekStats) => s.totalAttempts, format: 'number' },
    { label: 'Aantal negatief', getValue: (s: WeekStats) => s.negativeCount, format: 'number', inverse: true },
    { label: 'Jaarwaarde Totaal', getValue: (s: WeekStats) => s.annualValue, format: 'currency' },
    { label: 'Jaarwaarde Doorlopend', getValue: (s: WeekStats) => s.annualValueRecurring, format: 'currency' },
    { label: 'Gemiddeld donatiebedrag', getValue: (s: WeekStats) => calcAvgAmount(s), format: 'currency' },
    { label: 'Aantal beluren', getValue: (s: WeekStats) => calcHours(s), format: 'decimal' },
    { label: 'Sales per uur', getValue: (s: WeekStats) => calcSalesPerHour(s), format: 'decimal' },
    { label: 'Bruto Conversie', getValue: (s: WeekStats) => calcConversion(s), format: 'percent' },
    { label: 'Investering (Excl BTW)', getValue: (s: WeekStats) => calcInvestment(s), format: 'currency', inverse: true },
    { label: 'Investering per donateur', getValue: (s: WeekStats) => calcCostPerDonor(s), format: 'currency', inverse: true },
    { label: 'ROI', getValue: (s: WeekStats) => calcROI(s), format: 'multiplier' },
  ];

  const formatValue = (value: number, format: string) => {
    switch (format) {
      case 'currency':
        return `€ ${value.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
      case 'percent':
        return `${value.toFixed(1)}%`;
      case 'decimal':
        return value.toFixed(2);
      case 'multiplier':
        return `${value.toFixed(2)}x`;
      default:
        return Math.round(value).toString();
    }
  };

  return (
    <div className="space-y-4">
      {/* Week Selection */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Selecteer weken om te vergelijken</h3>
        <div className="flex flex-wrap gap-2">
          {availableWeeks.sort((a, b) => b - a).map((week) => (
            <button
              key={week}
              onClick={() => toggleWeek(week)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedWeeks.includes(week)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              Week {week}
            </button>
          ))}
        </div>
        {selectedWeeks.length === 0 && (
          <p className="text-sm text-muted-foreground mt-2">Selecteer minimaal één week om te vergelijken.</p>
        )}
      </div>

      {/* Comparison Table */}
      {filteredStats.length > 0 && (
        <div className="overflow-x-auto bg-card rounded-2xl border border-border shadow-sm">
          <table className="w-full text-sm">
            <thead className="bg-muted/50 text-foreground font-semibold">
              <tr>
                <th className="px-6 py-4 text-left sticky left-0 bg-muted/50 z-10 rounded-tl-2xl">
                  Metric
                </th>
                {filteredStats.map((stats, idx) => (
                  <th key={stats.weekNumber} className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-2">
                      Week {stats.weekNumber}
                      {idx === 0 && filteredStats.length > 1 && (
                        <Badge variant="secondary" className="text-xs">Nieuwste</Badge>
                      )}
                    </div>
                  </th>
                ))}
                {filteredStats.length > 1 && (
                  <th className="px-6 py-4 text-right rounded-tr-2xl">Δ Verschil</th>
                )}
              </tr>
            </thead>
            <tbody>
              {/* Resultaten Section */}
              <tr>
                <td colSpan={filteredStats.length + (filteredStats.length > 1 ? 2 : 1)} className="px-6 py-3 bg-kpi-green text-kpi-green-text font-bold text-xs uppercase tracking-wider">
                  Resultaten
                </td>
              </tr>
              {metrics.slice(0, 6).map((metric) => (
                <tr key={metric.label} className="hover:bg-muted/30 transition-colors border-b border-border/50">
                  <td className="px-6 py-4 font-medium text-foreground bg-muted/30 sticky left-0">{metric.label}</td>
                  {filteredStats.map((stats, idx) => {
                    const value = metric.getValue(stats);
                    const prevStats = filteredStats[idx + 1];
                    const prevValue = prevStats ? metric.getValue(prevStats) : undefined;
                    
                    return (
                      <td key={stats.weekNumber} className="px-6 py-4 text-right text-foreground">
                        {formatValue(value, metric.format)}
                        {idx === 0 && renderChange(value, prevValue, metric.inverse)}
                      </td>
                    );
                  })}
                  {filteredStats.length > 1 && (
                    <td className="px-6 py-4 text-right text-muted-foreground bg-muted/20">
                      {(() => {
                        const newest = metric.getValue(filteredStats[0]);
                        const oldest = metric.getValue(filteredStats[filteredStats.length - 1]);
                        const diff = newest - oldest;
                        const sign = diff > 0 ? '+' : '';
                        return `${sign}${formatValue(diff, metric.format)}`;
                      })()}
                    </td>
                  )}
                </tr>
              ))}

              {/* Financieel Section */}
              <tr>
                <td colSpan={filteredStats.length + (filteredStats.length > 1 ? 2 : 1)} className="px-6 py-3 bg-kpi-blue text-kpi-blue-text font-bold text-xs uppercase tracking-wider">
                  Financieel
                </td>
              </tr>
              {metrics.slice(6, 9).map((metric) => (
                <tr key={metric.label} className="hover:bg-muted/30 transition-colors border-b border-border/50">
                  <td className="px-6 py-4 font-medium text-foreground bg-muted/30 sticky left-0">{metric.label}</td>
                  {filteredStats.map((stats, idx) => {
                    const value = metric.getValue(stats);
                    const prevStats = filteredStats[idx + 1];
                    const prevValue = prevStats ? metric.getValue(prevStats) : undefined;
                    
                    return (
                      <td key={stats.weekNumber} className="px-6 py-4 text-right text-foreground">
                        {formatValue(value, metric.format)}
                        {idx === 0 && renderChange(value, prevValue, metric.inverse)}
                      </td>
                    );
                  })}
                  {filteredStats.length > 1 && (
                    <td className="px-6 py-4 text-right text-muted-foreground bg-muted/20">
                      {(() => {
                        const newest = metric.getValue(filteredStats[0]);
                        const oldest = metric.getValue(filteredStats[filteredStats.length - 1]);
                        const diff = newest - oldest;
                        const sign = diff > 0 ? '+' : '';
                        return `${sign}${formatValue(diff, metric.format)}`;
                      })()}
                    </td>
                  )}
                </tr>
              ))}

              {/* Productiviteit Section */}
              <tr>
                <td colSpan={filteredStats.length + (filteredStats.length > 1 ? 2 : 1)} className="px-6 py-3 bg-kpi-purple text-kpi-purple-text font-bold text-xs uppercase tracking-wider">
                  Productiviteit & Conversie
                </td>
              </tr>
              {metrics.slice(9, 12).map((metric) => (
                <tr key={metric.label} className="hover:bg-muted/30 transition-colors border-b border-border/50">
                  <td className="px-6 py-4 font-medium text-foreground bg-muted/30 sticky left-0">{metric.label}</td>
                  {filteredStats.map((stats, idx) => {
                    const value = metric.getValue(stats);
                    const prevStats = filteredStats[idx + 1];
                    const prevValue = prevStats ? metric.getValue(prevStats) : undefined;
                    
                    return (
                      <td key={stats.weekNumber} className="px-6 py-4 text-right text-foreground">
                        {formatValue(value, metric.format)}
                        {idx === 0 && renderChange(value, prevValue, metric.inverse)}
                      </td>
                    );
                  })}
                  {filteredStats.length > 1 && (
                    <td className="px-6 py-4 text-right text-muted-foreground bg-muted/20">
                      {(() => {
                        const newest = metric.getValue(filteredStats[0]);
                        const oldest = metric.getValue(filteredStats[filteredStats.length - 1]);
                        const diff = newest - oldest;
                        const sign = diff > 0 ? '+' : '';
                        return `${sign}${formatValue(diff, metric.format)}`;
                      })()}
                    </td>
                  )}
                </tr>
              ))}

              {/* Investering Section */}
              <tr>
                <td colSpan={filteredStats.length + (filteredStats.length > 1 ? 2 : 1)} className="px-6 py-3 bg-kpi-cyan text-kpi-cyan-text font-bold text-xs uppercase tracking-wider">
                  Investering (o.b.v. €{hourlyRate}/u)
                </td>
              </tr>
              {metrics.slice(12).map((metric) => (
                <tr key={metric.label} className="hover:bg-muted/30 transition-colors border-b border-border/50">
                  <td className="px-6 py-4 font-medium text-foreground bg-muted/30 sticky left-0">{metric.label}</td>
                  {filteredStats.map((stats, idx) => {
                    const value = metric.getValue(stats);
                    const prevStats = filteredStats[idx + 1];
                    const prevValue = prevStats ? metric.getValue(prevStats) : undefined;
                    
                    return (
                      <td key={stats.weekNumber} className="px-6 py-4 text-right text-foreground">
                        {formatValue(value, metric.format)}
                        {idx === 0 && renderChange(value, prevValue, metric.inverse)}
                      </td>
                    );
                  })}
                  {filteredStats.length > 1 && (
                    <td className="px-6 py-4 text-right text-muted-foreground bg-muted/20">
                      {(() => {
                        const newest = metric.getValue(filteredStats[0]);
                        const oldest = metric.getValue(filteredStats[filteredStats.length - 1]);
                        const diff = newest - oldest;
                        const sign = diff > 0 ? '+' : '';
                        return `${sign}${formatValue(diff, metric.format)}`;
                      })()}
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {filteredStats.length === 0 && selectedWeeks.length > 0 && (
        <div className="text-center py-8 text-muted-foreground bg-card rounded-xl border border-border">
          <p>Geen data beschikbaar voor de geselecteerde weken.</p>
        </div>
      )}
    </div>
  );
};
