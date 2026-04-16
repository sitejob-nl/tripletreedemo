import { useMemo, useState } from 'react';
import { useIsMobile } from '@/hooks/use-mobile';
import { ProcessedCallRecord } from '@/types/dashboard';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { PieChart as PieChartIcon, Filter } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';

interface ResultsBreakdownProps {
  data: ProcessedCallRecord[];
}

// Categorize results
const categorizeResult = (result: string): 'positive' | 'neutral' | 'negative' => {
  const lowerResult = result.toLowerCase();
  
  // Positive: sales, donations, agreements, frequencies (indicate sales)
  if (
    lowerResult.includes('sale') ||
    lowerResult.includes('donateur') ||
    lowerResult.includes('toezegging') ||
    lowerResult.includes('akkoord') ||
    lowerResult.includes('positief') ||
    lowerResult.includes('machtiging') ||
    lowerResult.includes('maandelijks') ||
    lowerResult.includes('jaarlijks') ||
    lowerResult.includes('kwartaal') ||
    lowerResult.includes('wil lid') ||
    lowerResult.includes('afspraak') ||
    lowerResult.includes('behouden')
  ) {
    return 'positive';
  }
  
  // Negative: refusals, cancellations
  if (
    lowerResult.includes('weiger') ||
    lowerResult.includes('niet akkoord') ||
    lowerResult.includes('geen interesse') ||
    lowerResult.includes('opzeg') ||
    lowerResult.includes('negatief') ||
    lowerResult.includes('afwijzing') ||
    lowerResult.includes('niet bereikt')
  ) {
    return 'negative';
  }
  
  // Neutral: voicemail, callback, etc.
  return 'neutral';
};

const CATEGORY_COLORS = {
  positive: 'hsl(142 76% 36%)',
  neutral: 'hsl(var(--muted-foreground))',
  negative: 'hsl(0 84% 60%)',
};

const CATEGORY_LABELS = {
  positive: 'Positief',
  neutral: 'Neutraal',
  negative: 'Negatief',
};

export const ResultsBreakdown = ({ data }: ResultsBreakdownProps) => {
  const [showCount, setShowCount] = useState<string>('10');
  const isMobile = useIsMobile();

  const resultsData = useMemo(() => {
    const byResult: Record<string, { count: number; annualValue: number; category: string }> = {};
    const byCategory: Record<string, number> = { positive: 0, neutral: 0, negative: 0 };

    data.forEach((record) => {
      const result = record.bc_result_naam || 'Onbekend';
      const category = categorizeResult(result);
      
      if (!byResult[result]) {
        byResult[result] = { count: 0, annualValue: 0, category };
      }
      
      byResult[result].count++;
      byResult[result].annualValue += record.is_sale ? record.annual_value : 0;
      byCategory[category]++;
    });

    // Convert to array and sort by count
    const resultsArray = Object.entries(byResult)
      .map(([name, stats]) => ({
        name,
        count: stats.count,
        annualValue: stats.annualValue,
        category: stats.category,
        percentage: (stats.count / data.length) * 100,
      }))
      .sort((a, b) => b.count - a.count);

    // Category pie data
    const categoryData = Object.entries(byCategory).map(([category, count]) => ({
      name: CATEGORY_LABELS[category as keyof typeof CATEGORY_LABELS],
      value: count,
      percentage: data.length > 0 ? (count / data.length) * 100 : 0,
      color: CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS],
    }));

    return { resultsArray, categoryData, total: data.length };
  }, [data]);

  const displayLimit = showCount === 'all' ? resultsData.resultsArray.length : parseInt(showCount);
  const displayedResults = resultsData.resultsArray.slice(0, displayLimit);

  // Bar colors based on category
  const getBarColor = (category: string) => {
    return CATEGORY_COLORS[category as keyof typeof CATEGORY_COLORS] || 'hsl(var(--primary))';
  };

  return (
    <div className="space-y-6">
      {/* Category Overview */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Pie Chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="flex items-center gap-2 text-lg">
              <PieChartIcon size={20} className="text-primary" />
              Categorieverdeling
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="h-[280px]">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={resultsData.categoryData}
                    cx="50%"
                    cy="50%"
                    innerRadius={60}
                    outerRadius={100}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percentage }) => `${name} (${percentage.toFixed(1)}%)`}
                    labelLine={false}
                  >
                    {resultsData.categoryData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.color} />
                    ))}
                  </Pie>
                  <Tooltip 
                    contentStyle={{ 
                      backgroundColor: 'hsl(var(--card))',
                      border: '1px solid hsl(var(--border))',
                      borderRadius: '8px',
                    }}
                    formatter={(value: number) => [value, 'Calls']}
                  />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* Category Stats */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-lg">Statistieken per Categorie</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {resultsData.categoryData.map((cat) => (
              <div key={cat.name} className="flex items-center gap-4">
                <div 
                  className="w-4 h-4 rounded-full flex-shrink-0"
                  style={{ backgroundColor: cat.color }}
                />
                <div className="flex-1">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium">{cat.name}</span>
                    <span className="text-muted-foreground">{cat.value} ({cat.percentage.toFixed(1)}%)</span>
                  </div>
                  <div className="h-2 bg-muted rounded-full overflow-hidden">
                    <div 
                      className="h-full rounded-full transition-all"
                      style={{ 
                        width: `${cat.percentage}%`,
                        backgroundColor: cat.color,
                      }}
                    />
                  </div>
                </div>
              </div>
            ))}
            <div className="pt-4 border-t border-border">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Totaal calls</span>
                <span className="font-bold">{resultsData.total}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Detailed Results Bar Chart */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">Resultaten Verdeling</CardTitle>
            <div className="flex items-center gap-2">
              <Filter size={16} className="text-muted-foreground" />
              <Select value={showCount} onValueChange={setShowCount}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="5">Top 5</SelectItem>
                  <SelectItem value="10">Top 10</SelectItem>
                  <SelectItem value="20">Top 20</SelectItem>
                  <SelectItem value="all">Alle</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="h-[320px] sm:h-[400px]">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={displayedResults}
                layout="vertical"
                margin={{ left: isMobile ? 10 : 120, right: 20 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis
                  type="number"
                  tick={{ fill: 'hsl(var(--muted-foreground))' }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <YAxis
                  type="category"
                  dataKey="name"
                  width={isMobile ? 90 : 110}
                  tick={{ fill: 'hsl(var(--muted-foreground))', fontSize: isMobile ? 10 : 12 }}
                  axisLine={{ stroke: 'hsl(var(--border))' }}
                />
                <Tooltip 
                  contentStyle={{ 
                    backgroundColor: 'hsl(var(--card))',
                    border: '1px solid hsl(var(--border))',
                    borderRadius: '8px',
                  }}
                  formatter={(value: number, name: string, props: any) => {
                    const item = props.payload;
                    return [
                      <div key="tooltip">
                        <p><strong>Aantal:</strong> {item.count}</p>
                        <p><strong>Percentage:</strong> {item.percentage.toFixed(1)}%</p>
                        {item.annualValue > 0 && (
                          <p><strong>Jaarwaarde:</strong> €{item.annualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}</p>
                        )}
                      </div>,
                      '',
                    ];
                  }}
                />
                <Bar 
                  dataKey="count" 
                  radius={[0, 4, 4, 0]}
                  fill="hsl(var(--primary))"
                >
                  {displayedResults.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={getBarColor(entry.category)} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
