import { useMemo, useState } from 'react';
import { ProcessedCallRecord, DayStats } from '@/types/dashboard';
import { ArrowUpRight, ArrowDownRight, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from 'recharts';
import { createEmptyStats } from '@/lib/statsHelpers';

import { WeekYear } from '@/hooks/useCallRecords';

interface WeekComparisonProps {
  data: ProcessedCallRecord[];
  hourlyRate: number;
  availableWeeks: WeekYear[];
  amountCol?: string;
}

const parseDutchFloat = (val: unknown): number => {
  if (typeof val === 'number') return val;
  if (!val) return 0;
  const str = String(val).replace(/[^\d,.-]/g, '').replace(',', '.');
  return parseFloat(str) || 0;
};

interface WeekStats extends DayStats {
  weekNumber: number;
  year: number;
  weekYearKey: string; // "2026-01" format
}

export const WeekComparison = ({ data, hourlyRate, availableWeeks, amountCol = 'termijnbedrag' }: WeekComparisonProps) => {
  const [selectedWeeks, setSelectedWeeks] = useState<string[]>(() => {
    // Default: select last 2 available weeks (by value, e.g., "2026-01")
    return availableWeeks.slice(0, Math.min(2, availableWeeks.length)).map(w => w.value);
  });

  const [sortColumn, setSortColumn] = useState<string>('weekNumber');
  const [sortDirection, setSortDirection] = useState<'asc' | 'desc'>('desc');

  // Aggregate stats per week-year combination
  const weekStats = useMemo(() => {
    const stats: Record<string, WeekStats> = {};
    
    data.forEach((record) => {
      const weekNum = record.week_number;
      // Extract year from normalized_date or bc_beldatum
      const dateStr = record.normalized_date || record.bc_beldatum;
      let year = new Date().getFullYear();
      
      if (dateStr) {
        // Handle both "2026-01-04" and "04-01-2026" formats
        const isoMatch = dateStr.match(/^(\d{4})-/);
        const nlMatch = dateStr.match(/-(\d{4})$/);
        if (isoMatch) {
          year = parseInt(isoMatch[1]);
        } else if (nlMatch) {
          year = parseInt(nlMatch[1]);
        }
      }
      
      const weekYearKey = `${year}-${String(weekNum).padStart(2, '0')}`;
      
      if (!stats[weekYearKey]) {
        stats[weekYearKey] = { 
          ...createEmptyStats(), 
          weekNumber: weekNum, 
          year, 
          weekYearKey 
        };
      }

      const rawData = record as unknown as { raw_data?: Record<string, unknown> };
      const attempts = rawData.raw_data?.bc_belpogingen ? Number(rawData.raw_data.bc_belpogingen) : 1;
      const amount = rawData.raw_data?.[amountCol] ? parseDutchFloat(rawData.raw_data[amountCol]) : 0;
      const resultName = rawData.raw_data?.bc_result_naam as string || record.bc_result_naam || 'Onbekend';

      stats[weekYearKey].calls++;
      stats[weekYearKey].durationSec += record.bc_gesprekstijd;
      stats[weekYearKey].totalAttempts += attempts;

      if (record.is_sale) {
        stats[weekYearKey].sales++;
        stats[weekYearKey].annualValue += record.annual_value;
        stats[weekYearKey].totalAmount += amount;

        if (record.is_recurring) {
          stats[weekYearKey].recurring++;
          stats[weekYearKey].annualValueRecurring += record.annual_value;
        } else {
          stats[weekYearKey].oneoff++;
          stats[weekYearKey].annualValueOneoff += record.annual_value;
        }
      } else {
        stats[weekYearKey].negativeCount++;
        stats[weekYearKey].negativeResults[resultName] = (stats[weekYearKey].negativeResults[resultName] || 0) + 1;
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

  // Toggle week selection (now using string keys like "2026-01")
  const toggleWeek = (weekValue: string) => {
    setSelectedWeeks(prev => {
      if (prev.includes(weekValue)) {
        return prev.filter(w => w !== weekValue);
      }
      return [...prev, weekValue].sort((a, b) => b.localeCompare(a));
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
    { key: 'calls', label: 'Aantal gesprekken', getValue: (s: WeekStats) => s.calls, format: 'number', color: '#22c55e' },
    { key: 'sales', label: 'Aantal positief', getValue: (s: WeekStats) => s.sales, format: 'number', color: '#16a34a' },
    { key: 'recurring', label: 'Doorlopende machtigingen', getValue: (s: WeekStats) => s.recurring, format: 'number', color: '#15803d' },
    { key: 'oneoff', label: 'Eenmalige machtigingen', getValue: (s: WeekStats) => s.oneoff, format: 'number', color: '#166534' },
    { key: 'attempts', label: 'Totaal belpogingen', getValue: (s: WeekStats) => s.totalAttempts, format: 'number', color: '#14532d' },
    { key: 'negative', label: 'Aantal negatief', getValue: (s: WeekStats) => s.negativeCount, format: 'number', inverse: true, color: '#ef4444' },
    { key: 'annualValue', label: 'Jaarwaarde Totaal', getValue: (s: WeekStats) => s.annualValue, format: 'currency', color: '#3b82f6' },
    { key: 'annualValueRecurring', label: 'Jaarwaarde Doorlopend', getValue: (s: WeekStats) => s.annualValueRecurring, format: 'currency', color: '#2563eb' },
    { key: 'avgAmount', label: 'Gemiddeld donatiebedrag', getValue: (s: WeekStats) => calcAvgAmount(s), format: 'currency', color: '#1d4ed8' },
    { key: 'hours', label: 'Aantal beluren', getValue: (s: WeekStats) => calcHours(s), format: 'decimal', color: '#8b5cf6' },
    { key: 'salesPerHour', label: 'Sales per uur', getValue: (s: WeekStats) => calcSalesPerHour(s), format: 'decimal', color: '#7c3aed' },
    { key: 'conversion', label: 'Bruto Conversie', getValue: (s: WeekStats) => calcConversion(s), format: 'percent', color: '#6d28d9' },
    { key: 'investment', label: 'Investering (Excl BTW)', getValue: (s: WeekStats) => calcInvestment(s), format: 'currency', inverse: true, color: '#06b6d4' },
    { key: 'costPerDonor', label: 'Investering per donateur', getValue: (s: WeekStats) => calcCostPerDonor(s), format: 'currency', inverse: true, color: '#0891b2' },
    { key: 'roi', label: 'ROI', getValue: (s: WeekStats) => calcROI(s), format: 'multiplier', color: '#0e7490' },
  ];

  // Chart metric options grouped by category
  const chartMetricOptions = [
    { group: 'Resultaten', options: metrics.slice(0, 6) },
    { group: 'Financieel', options: metrics.slice(6, 9) },
    { group: 'Productiviteit', options: metrics.slice(9, 12) },
    { group: 'Investering', options: metrics.slice(12) },
  ];

  const [selectedChartMetrics, setSelectedChartMetrics] = useState<string[]>(['sales', 'annualValue', 'conversion']);

  // Chart data - all weeks sorted chronologically for the trend
  const chartData = useMemo(() => {
    return Object.values(weekStats)
      .sort((a, b) => a.weekNumber - b.weekNumber)
      .map(stats => {
        const dataPoint: Record<string, number | string> = { week: `Week ${stats.weekNumber}` };
        metrics.forEach(metric => {
          dataPoint[metric.key] = metric.getValue(stats);
        });
        return dataPoint;
      });
  }, [weekStats]);

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

  const toggleChartMetric = (key: string) => {
    setSelectedChartMetrics(prev => {
      if (prev.includes(key)) {
        return prev.filter(k => k !== key);
      }
      if (prev.length >= 4) {
        return [...prev.slice(1), key];
      }
      return [...prev, key];
    });
  };

  return (
    <div className="space-y-6">
      {/* Week Selection */}
      <div className="bg-card rounded-xl border border-border p-4">
        <h3 className="text-sm font-semibold text-foreground mb-3">Selecteer weken om te vergelijken</h3>
        <div className="flex flex-wrap gap-2">
          {availableWeeks.map((week) => (
            <button
              key={week.value}
              onClick={() => toggleWeek(week.value)}
              className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                selectedWeeks.includes(week.value)
                  ? 'bg-primary text-primary-foreground'
                  : 'bg-muted text-muted-foreground hover:bg-muted/80'
              }`}
            >
              {week.label}
            </button>
          ))}
        </div>
        {selectedWeeks.length === 0 && (
          <p className="text-sm text-muted-foreground mt-2">Selecteer minimaal één week om te vergelijken.</p>
        )}
      </div>

      {/* Trend Chart */}
      {chartData.length > 1 && (
        <div className="bg-card rounded-xl border border-border p-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 mb-4">
            <h3 className="text-sm font-semibold text-foreground">Trend over weken</h3>
            <div className="flex flex-wrap gap-2">
              {chartMetricOptions.map(group => (
                <div key={group.group} className="flex flex-wrap gap-1">
                  {group.options.map(metric => (
                    <button
                      key={metric.key}
                      onClick={() => toggleChartMetric(metric.key)}
                      className={`px-2 py-1 rounded text-xs font-medium transition-colors ${
                        selectedChartMetrics.includes(metric.key)
                          ? 'text-white'
                          : 'bg-muted text-muted-foreground hover:bg-muted/80'
                      }`}
                      style={selectedChartMetrics.includes(metric.key) ? { backgroundColor: metric.color } : {}}
                    >
                      {metric.label.length > 15 ? metric.label.substring(0, 15) + '...' : metric.label}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
          
          <div className="h-80">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="week" 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis 
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip
                  contentStyle={{
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                    color: 'hsl(var(--foreground))',
                  }}
                  formatter={(value: number, name: string) => {
                    const metric = metrics.find(m => m.key === name);
                    if (metric) {
                      return [formatValue(value, metric.format), metric.label];
                    }
                    return [value, name];
                  }}
                />
                <Legend 
                  formatter={(value) => {
                    const metric = metrics.find(m => m.key === value);
                    return metric?.label || value;
                  }}
                />
                {selectedChartMetrics.map(key => {
                  const metric = metrics.find(m => m.key === key);
                  if (!metric) return null;
                  return (
                    <Line
                      key={key}
                      type="monotone"
                      dataKey={key}
                      stroke={metric.color}
                      strokeWidth={2}
                      dot={{ fill: metric.color, strokeWidth: 2, r: 4 }}
                      activeDot={{ r: 6, strokeWidth: 0 }}
                    />
                  );
                })}
              </LineChart>
            </ResponsiveContainer>
          </div>
          <p className="text-xs text-muted-foreground mt-2">Klik op de metrics hierboven om ze aan de grafiek toe te voegen of te verwijderen (max 4).</p>
        </div>
      )}

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
