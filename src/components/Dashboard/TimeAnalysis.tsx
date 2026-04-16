import { useMemo } from 'react';
import { ProcessedCallRecord } from '@/types/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Clock, TrendingUp, Star } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from 'recharts';

interface TimeAnalysisProps {
  data: ProcessedCallRecord[];
}

const HOURS = Array.from({ length: 15 }, (_, i) => i + 8); // 8:00 - 22:00

export const TimeAnalysis = ({ data }: TimeAnalysisProps) => {
  const timeData = useMemo(() => {
    const byHour: Record<number, { calls: number; sales: number; durationSec: number }> = {};
    let recordsWithTime = 0;

    // Initialize hours
    HOURS.forEach((h) => {
      byHour[h] = { calls: 0, sales: 0, durationSec: 0 };
    });

    data.forEach((record) => {
      // Try to get time from bc_starttijd_gesprek or beltijd
      const timeStr = (record as any).bc_starttijd_gesprek || (record as any).beltijd;
      
      if (timeStr) {
        recordsWithTime++;
        // Parse hour from time string (format: HH:MM:SS or HH:MM)
        const match = String(timeStr).match(/^(\d{1,2})/);
        if (match) {
          let hour = parseInt(match[1]);
          // Clamp to valid range
          if (hour < 8) hour = 8;
          if (hour > 22) hour = 22;
          
          if (byHour[hour]) {
            byHour[hour].calls++;
            byHour[hour].durationSec += record.bc_gesprekstijd || 0;
            if (record.is_sale) {
              byHour[hour].sales++;
            }
          }
        }
      }
    });

    // Convert to chart data
    const chartData = HOURS.map((hour) => {
      const stats = byHour[hour];
      return {
        hour: `${hour}:00`,
        hourNum: hour,
        calls: stats.calls,
        sales: stats.sales,
        conversion: stats.calls > 0 ? (stats.sales / stats.calls) * 100 : 0,
        avgDuration: stats.calls > 0 ? stats.durationSec / stats.calls / 60 : 0, // in minutes
      };
    });

    // Find best hour (highest conversion with at least 20 calls)
    const validHours = chartData.filter((h) => h.calls >= 20);
    const bestHour = validHours.length > 0
      ? validHours.reduce((best, curr) => curr.conversion > best.conversion ? curr : best)
      : null;

    // Find peak hour (most calls)
    const peakHour = chartData.reduce((peak, curr) => curr.calls > peak.calls ? curr : peak);

    // Calculate overall conversion by time of day segments
    const morning = chartData.filter((h) => h.hourNum >= 8 && h.hourNum < 12);
    const afternoon = chartData.filter((h) => h.hourNum >= 12 && h.hourNum < 17);
    const evening = chartData.filter((h) => h.hourNum >= 17 && h.hourNum <= 22);

    const calcSegmentStats = (segment: typeof chartData) => {
      const totalCalls = segment.reduce((acc, h) => acc + h.calls, 0);
      const totalSales = segment.reduce((acc, h) => acc + h.sales, 0);
      return {
        calls: totalCalls,
        sales: totalSales,
        conversion: totalCalls > 0 ? (totalSales / totalCalls) * 100 : 0,
      };
    };

    return {
      chartData,
      bestHour,
      peakHour,
      segments: {
        morning: calcSegmentStats(morning),
        afternoon: calcSegmentStats(afternoon),
        evening: calcSegmentStats(evening),
      },
      recordsWithTime,
      totalRecords: data.length,
    };
  }, [data]);

  const bestHourNum = timeData.bestHour?.hourNum ?? -1;

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <Star className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Beste Uur</p>
                <p className="text-2xl font-bold">
                  {timeData.bestHour ? timeData.bestHour.hour : '-'}
                </p>
                <p className="text-xs text-muted-foreground">
                  {timeData.bestHour ? `${timeData.bestHour.conversion.toFixed(1)}% conversie` : 'Onvoldoende data'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <TrendingUp className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Piek Uur</p>
                <p className="text-2xl font-bold">{timeData.peakHour.hour}</p>
                <p className="text-xs text-muted-foreground">{timeData.peakHour.calls} calls</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-500/10 to-purple-500/5 border-purple-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-purple-500/20 rounded-lg">
                <Clock className="h-5 w-5 text-purple-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Data Beschikbaar</p>
                <p className="text-2xl font-bold">
                  {((timeData.recordsWithTime / timeData.totalRecords) * 100).toFixed(0)}%
                </p>
                <p className="text-xs text-muted-foreground">
                  {timeData.recordsWithTime} van {timeData.totalRecords} records
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Time of Day Segments */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Dagdeel Vergelijking</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-3 gap-4">
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Ochtend (08-12u)</p>
              <p className="text-xl font-bold">{timeData.segments.morning.conversion.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">
                {timeData.segments.morning.sales} / {timeData.segments.morning.calls} calls
              </p>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Middag (12-17u)</p>
              <p className="text-xl font-bold">{timeData.segments.afternoon.conversion.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">
                {timeData.segments.afternoon.sales} / {timeData.segments.afternoon.calls} calls
              </p>
            </div>
            <div className="text-center p-4 bg-muted/30 rounded-lg">
              <p className="text-sm text-muted-foreground mb-1">Avond (17-22u)</p>
              <p className="text-xl font-bold">{timeData.segments.evening.conversion.toFixed(1)}%</p>
              <p className="text-xs text-muted-foreground">
                {timeData.segments.evening.sales} / {timeData.segments.evening.calls} calls
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Hourly Breakdown Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Calls per Hour */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Calls per Uur</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeData.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [value, 'Calls']}
                  />
                  <Bar dataKey="calls" radius={[4, 4, 0, 0]}>
                    {timeData.chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.hourNum === bestHourNum ? 'hsl(142 76% 36%)' : 'hsl(var(--primary))'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Conversion per Hour */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Conversie per Uur</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[240px] sm:h-[300px]">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={timeData.chartData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis 
                    dataKey="hour" 
                    tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: 11 }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    interval={0}
                    angle={-45}
                    textAnchor="end"
                    height={50}
                  />
                  <YAxis 
                    tick={{ fill: 'hsl(var(--muted-foreground))' }}
                    axisLine={{ stroke: 'hsl(var(--border))' }}
                    tickFormatter={(value) => `${value}%`}
                  />
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [`${value.toFixed(1)}%`, 'Conversie']}
                  />
                  <Bar dataKey="conversion" radius={[4, 4, 0, 0]}>
                    {timeData.chartData.map((entry, index) => (
                      <Cell 
                        key={`cell-${index}`} 
                        fill={entry.hourNum === bestHourNum ? 'hsl(142 76% 36%)' : 'hsl(217 91% 60%)'}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <p className="text-sm text-muted-foreground mt-4 text-center">
              Groene balk = beste uur (gebaseerd op conversie bij minimaal 20 calls)
            </p>
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
