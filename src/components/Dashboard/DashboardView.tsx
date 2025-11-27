import { FileSpreadsheet } from 'lucide-react';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  ResponsiveContainer,
} from 'recharts';
import { ProcessedCallRecord } from '@/types/dashboard';

interface DashboardViewProps {
  data: ProcessedCallRecord[];
}

export const DashboardView = ({ data }: DashboardViewProps) => {
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
    const pct = total > 0 ? ((count / total) * 100).toFixed(0) : 0;
    return { status, count, pct };
  }).filter(item => item.count > 0);

  return (
    <div className="space-y-8">
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="bg-card p-6 rounded-xl shadow-sm border border-border lg:col-span-2">
          <h3 className="font-bold text-card-foreground mb-6">Jaarwaarde per Dag</h3>
          <div className="h-64">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={salesData}>
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
                    borderRadius: '8px',
                    border: 'none',
                    boxShadow: '0 4px 6px -1px rgb(0 0 0 / 0.1)',
                  }}
                />
                <Bar
                  dataKey="annual_value"
                  name="Jaarwaarde"
                  fill="hsl(var(--primary))"
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>

        <div className="bg-card p-6 rounded-xl shadow-sm border border-border">
          <h3 className="font-bold text-card-foreground mb-6">Resultaat Verdeling</h3>
          <div className="space-y-4">
            {statusCounts.map(({ status, count, pct }) => (
              <div key={status}>
                <div className="flex justify-between text-sm mb-1">
                  <span className="text-muted-foreground">{status}</span>
                  <span className="font-bold text-foreground">
                    {count} ({pct}%)
                  </span>
                </div>
                <div className="w-full bg-muted rounded-full h-2">
                  <div
                    className="bg-primary h-2 rounded-full transition-all"
                    style={{ width: `${pct}%` }}
                  ></div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Detail Table */}
      <div className="bg-card rounded-xl shadow-sm border border-border overflow-hidden">
        <div className="px-6 py-4 border-b border-border">
          <h3 className="font-bold text-card-foreground">Detail Data (Gefilterd)</h3>
        </div>
        <div className="overflow-x-auto max-h-64">
          <table className="w-full text-sm text-left">
            <thead className="bg-muted text-muted-foreground font-medium sticky top-0">
              <tr>
                <th className="px-6 py-3">Datum (Week)</th>
                <th className="px-6 py-3">Resultaat</th>
                <th className="px-6 py-3">Type</th>
                <th className="px-6 py-3 text-right">Jaarwaarde</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {data.map((row) => (
                <tr key={row.id} className="hover:bg-muted/50">
                  <td className="px-6 py-3 text-foreground">
                    {row.bc_beldatum}{' '}
                    <span className="text-xs text-muted-foreground ml-2">(W{row.week_number})</span>
                  </td>
                  <td className="px-6 py-3">
                    <span
                      className={`px-2 py-1 rounded text-xs font-semibold ${
                        row.is_sale
                          ? 'bg-success/10 text-success'
                          : 'bg-muted text-muted-foreground'
                      }`}
                    >
                      {row.bc_result_naam}
                    </span>
                  </td>
                  <td className="px-6 py-3 text-muted-foreground">
                    {row.is_recurring ? 'Doorlopend' : row.is_sale ? 'Eenmalig' : '-'}
                  </td>
                  <td className="px-6 py-3 text-right font-bold text-foreground">
                    {row.is_sale ? `€ ${row.annual_value.toFixed(2)}` : '-'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};
