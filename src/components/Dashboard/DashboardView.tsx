import { useState } from 'react';
import { TrendingUp, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
  Legend,
} from 'recharts';
import { ProcessedCallRecord } from '@/types/dashboard';
import { Progress } from '@/components/ui/progress';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';

interface DashboardViewProps {
  data: ProcessedCallRecord[];
}

const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export const DashboardView = ({ data }: DashboardViewProps) => {
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const salesData = data.filter((d) => d.is_sale);

  const statusCounts = [
    'Sale',
    'Donateur',
    'Voicemail',
    'Weigering',
    'Geen interesse',
  ].map((status) => {
    const count = data.filter((d) => d.bc_result_naam === status).length;
    const total = data.length;
    const pct = total > 0 ? ((count / total) * 100) : 0;
    return { status, count, pct, name: status };
  }).filter(item => item.count > 0);

  const pieColors = ['hsl(var(--chart-1))', 'hsl(var(--chart-2))', 'hsl(var(--chart-3))', 'hsl(var(--chart-4))', 'hsl(var(--chart-5))'];

  const donationTypeData = [
    { name: 'Doorlopend', value: data.filter(d => d.is_recurring).length },
    { name: 'Eenmalig', value: data.filter(d => d.is_sale && !d.is_recurring).length },
  ].filter(item => item.value > 0);

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border lg:col-span-2">
          <div className="flex items-center justify-between mb-6">
            <h3 className="font-bold text-card-foreground text-lg">Jaarwaarde Ontwikkeling</h3>
            <TrendingUp className="text-primary" size={20} />
          </div>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={salesData}>
                <defs>
                  <linearGradient id="colorValue" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                <XAxis
                  dataKey="day_name"
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                />
                <YAxis
                  stroke="hsl(var(--muted-foreground))"
                  fontSize={12}
                  tickLine={false}
                  axisLine={false}
                  tickFormatter={(val) => `€${val}`}
                />
                <RechartsTooltip
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    backgroundColor: 'hsl(var(--card))',
                  }}
                />
                <Area
                  type="monotone"
                  dataKey="annual_value"
                  name="Jaarwaarde"
                  stroke="hsl(var(--primary))"
                  strokeWidth={2}
                  fill="url(#colorValue)"
                />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
          <h3 className="font-bold text-card-foreground mb-6 text-lg">Donatie Types</h3>
          <div className="h-48 flex items-center justify-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={donationTypeData}
                  cx="50%"
                  cy="50%"
                  innerRadius={50}
                  outerRadius={80}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {donationTypeData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={pieColors[index % pieColors.length]} />
                  ))}
                </Pie>
                <RechartsTooltip 
                  contentStyle={{
                    borderRadius: '12px',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                    backgroundColor: 'hsl(var(--card))',
                  }}
                />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="bg-card p-6 rounded-2xl shadow-sm border border-border">
        <h3 className="font-bold text-card-foreground mb-6 text-lg">Resultaat Verdeling</h3>
        <div className="space-y-4">
          {statusCounts.map(({ status, count, pct }, idx) => (
            <div key={status}>
              <div className="flex justify-between text-sm mb-2">
                <span className="text-foreground font-medium">{status}</span>
                <span className="font-bold text-foreground">
                  {count} <span className="text-muted-foreground">({pct.toFixed(1)}%)</span>
                </span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
          ))}
        </div>
      </div>

      {/* Detail Table with Pagination */}
      <div className="bg-card rounded-2xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border flex items-center justify-between">
          <h3 className="font-bold text-card-foreground text-lg">Recent Detail Data</h3>
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <span className="text-sm text-muted-foreground">Per pagina:</span>
              <Select value={String(pageSize)} onValueChange={(val) => { setPageSize(Number(val)); setCurrentPage(1); }}>
                <SelectTrigger className="w-20 h-8">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <SelectItem key={size} value={String(size)}>{size}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <span className="text-sm text-muted-foreground">
              {data.length} records
            </span>
          </div>
        </div>
        <div className="overflow-x-auto max-h-[500px]">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted/50 text-foreground font-semibold sticky top-0">
              <tr>
                <th className="px-6 py-3">Datum (Week)</th>
                <th className="px-6 py-3">Resultaat</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3 text-right">Jaarwaarde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {(() => {
                const totalPages = Math.ceil(data.length / pageSize);
                const startIndex = (currentPage - 1) * pageSize;
                const paginatedData = data.slice(startIndex, startIndex + pageSize);
                
                return paginatedData.map((row, idx) => (
                  <tr key={row.id} className={`hover:bg-muted/30 transition-colors ${idx % 2 === 0 ? 'bg-background' : 'bg-muted/10'}`}>
                    <td className="px-6 py-4 text-foreground font-medium">
                      {row.normalized_date || row.bc_beldatum}{' '}
                      <span className="text-xs text-muted-foreground ml-2 font-normal">(W{row.week_number})</span>
                    </td>
                    <td className="px-6 py-4">
                      <span
                        className={`px-3 py-1 rounded-full text-xs font-semibold ${
                          row.is_sale
                            ? 'bg-kpi-green text-kpi-green-text'
                            : 'bg-muted text-muted-foreground'
                        }`}
                      >
                        {row.bc_result_naam}
                      </span>
                    </td>
                    <td className="px-6 py-4 text-muted-foreground">
                      {row.is_recurring ? (
                        <span className="px-2 py-1 bg-kpi-blue text-kpi-blue-text rounded-full text-xs font-medium">Doorlopend</span>
                      ) : row.is_sale ? (
                        <span className="px-2 py-1 bg-kpi-purple text-kpi-purple-text rounded-full text-xs font-medium">Eenmalig</span>
                      ) : '-'}
                    </td>
                    <td className="px-6 py-4 text-right font-bold text-foreground">
                      {row.is_sale ? `€ ${row.annual_value.toFixed(2)}` : '-'}
                    </td>
                  </tr>
                ));
              })()}
            </tbody>
          </table>
        </div>
        
        {/* Pagination Controls */}
        {data.length > pageSize && (
          <div className="px-6 py-4 border-t border-border flex items-center justify-between">
            <span className="text-sm text-muted-foreground">
              Pagina {currentPage} van {Math.ceil(data.length / pageSize)}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                disabled={currentPage === 1}
              >
                <ChevronLeft size={16} />
                Vorige
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setCurrentPage(p => Math.min(Math.ceil(data.length / pageSize), p + 1))}
                disabled={currentPage >= Math.ceil(data.length / pageSize)}
              >
                Volgende
                <ChevronRight size={16} />
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
