import { useMemo } from 'react';
import { ProcessedCallRecord } from '@/types/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Phone, Target, TrendingUp, Zap } from 'lucide-react';
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ComposedChart,
  Legend,
} from 'recharts';

interface CallAttemptsAnalysisProps {
  data: ProcessedCallRecord[];
}

export const CallAttemptsAnalysis = ({ data }: CallAttemptsAnalysisProps) => {
  const attemptsData = useMemo(() => {
    const byAttempts: Record<number, { calls: number; sales: number; annualValue: number }> = {};
    let totalWithAttempts = 0;

    data.forEach((record) => {
      const attempts = (record as any).bc_belpogingen;
      if (attempts !== undefined && attempts !== null) {
        totalWithAttempts++;
        const attemptsNum = Math.min(Number(attempts), 10); // Cap at 10+ for display
        
        if (!byAttempts[attemptsNum]) {
          byAttempts[attemptsNum] = { calls: 0, sales: 0, annualValue: 0 };
        }
        
        byAttempts[attemptsNum].calls++;
        if (record.is_sale) {
          byAttempts[attemptsNum].sales++;
          byAttempts[attemptsNum].annualValue += record.annual_value;
        }
      }
    });

    // Convert to array for charts
    const chartData = [];
    for (let i = 1; i <= 10; i++) {
      const stats = byAttempts[i] || { calls: 0, sales: 0, annualValue: 0 };
      chartData.push({
        attempts: i === 10 ? '10+' : i.toString(),
        attemptsNum: i,
        calls: stats.calls,
        sales: stats.sales,
        conversion: stats.calls > 0 ? (stats.sales / stats.calls) * 100 : 0,
        annualValue: stats.annualValue,
      });
    }

    // Find optimal attempts (highest conversion with meaningful sample)
    const validData = chartData.filter((d) => d.calls >= 10);
    const optimal = validData.length > 0 
      ? validData.reduce((best, curr) => curr.conversion > best.conversion ? curr : best)
      : null;

    // Calculate averages
    const salesRecords = data.filter((d) => d.is_sale);
    const nonSalesRecords = data.filter((d) => !d.is_sale);
    
    const avgAttemptsSale = salesRecords.length > 0
      ? salesRecords.reduce((acc, d) => acc + (Number((d as any).bc_belpogingen) || 0), 0) / salesRecords.length
      : 0;
    
    const avgAttemptsNoSale = nonSalesRecords.length > 0
      ? nonSalesRecords.reduce((acc, d) => acc + (Number((d as any).bc_belpogingen) || 0), 0) / nonSalesRecords.length
      : 0;

    return {
      chartData,
      optimal,
      avgAttemptsSale,
      avgAttemptsNoSale,
      totalWithAttempts,
      totalRecords: data.length,
    };
  }, [data]);

  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-primary/10 to-primary/5 border-primary/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-primary/20 rounded-lg">
                <Target className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Optimaal Aantal</p>
                <p className="text-2xl font-bold">
                  {attemptsData.optimal ? attemptsData.optimal.attempts : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-500/10 to-green-500/5 border-green-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-green-500/20 rounded-lg">
                <TrendingUp className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Hoogste Conversie</p>
                <p className="text-2xl font-bold">
                  {attemptsData.optimal ? `${attemptsData.optimal.conversion.toFixed(1)}%` : '-'}
                </p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-blue-500/10 to-blue-500/5 border-blue-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-500/20 rounded-lg">
                <Phone className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gem. Pogingen (Sale)</p>
                <p className="text-2xl font-bold">{attemptsData.avgAttemptsSale.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-500/10 to-orange-500/5 border-orange-500/20">
          <CardContent className="pt-6">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-500/20 rounded-lg">
                <Zap className="h-5 w-5 text-orange-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Gem. Pogingen (Geen Sale)</p>
                <p className="text-2xl font-bold">{attemptsData.avgAttemptsNoSale.toFixed(1)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Distribution Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Verdeling Belpogingen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={attemptsData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="attempts" 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
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
                  formatter={(value: number, name: string) => {
                    if (name === 'calls') return [value, 'Calls'];
                    if (name === 'sales') return [value, 'Sales'];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar dataKey="calls" fill="hsl(var(--primary))" name="Calls" radius={[4, 4, 0, 0]} />
                <Bar dataKey="sales" fill="hsl(142 76% 36%)" name="Sales" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      {/* Conversion by Attempts Chart */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-lg">Conversie per Aantal Pogingen</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="h-[300px]">
            <ResponsiveContainer width="100%" height="100%">
              <ComposedChart data={attemptsData.chartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis 
                  dataKey="attempts" 
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  label={{ value: 'Aantal Pogingen', position: 'insideBottom', offset: -5 }}
                />
                <YAxis 
                  yAxisId="left"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  label={{ value: 'Conversie %', angle: -90, position: 'insideLeft' }}
                />
                <YAxis 
                  yAxisId="right"
                  orientation="right"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                  label={{ value: 'Calls', angle: 90, position: 'insideRight' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string) => {
                    if (name === 'Conversie') return [`${value.toFixed(1)}%`, name];
                    return [value, name];
                  }}
                />
                <Legend />
                <Bar 
                  yAxisId="right" 
                  dataKey="calls" 
                  fill="hsl(var(--muted))" 
                  name="Calls" 
                  radius={[4, 4, 0, 0]}
                  opacity={0.5}
                />
                <Line 
                  yAxisId="left" 
                  type="monotone" 
                  dataKey="conversion" 
                  stroke="hsl(var(--primary))" 
                  strokeWidth={3}
                  dot={{ fill: 'hsl(var(--primary))', strokeWidth: 2 }}
                  name="Conversie"
                />
              </ComposedChart>
            </ResponsiveContainer>
          </div>
          <p className="text-sm text-muted-foreground mt-4 text-center">
            Optimaal aantal pogingen is gebaseerd op conversiepercentage bij minimaal 10 calls
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
