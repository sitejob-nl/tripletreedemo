import { LucideIcon } from 'lucide-react';
import { Skeleton } from '@/components/ui/skeleton';

interface KPICardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  variant?: 'green' | 'pink' | 'purple' | 'blue' | 'cyan' | 'orange';
  trend?: {
    value: number;
    isPositive: boolean;
  };
  isLoading?: boolean;
}

export const KPICard = ({ title, value, subtext, icon: Icon, variant = 'green', trend, isLoading = false }: KPICardProps) => {
  const variantStyles = {
    green: { bg: 'bg-kpi-green', text: 'text-kpi-green-text', iconBg: 'bg-kpi-green', iconText: 'text-kpi-green-text' },
    pink: { bg: 'bg-kpi-pink', text: 'text-kpi-pink-text', iconBg: 'bg-kpi-pink', iconText: 'text-kpi-pink-text' },
    purple: { bg: 'bg-kpi-purple', text: 'text-kpi-purple-text', iconBg: 'bg-kpi-purple', iconText: 'text-kpi-purple-text' },
    blue: { bg: 'bg-kpi-blue', text: 'text-kpi-blue-text', iconBg: 'bg-kpi-blue', iconText: 'text-kpi-blue-text' },
    cyan: { bg: 'bg-kpi-cyan', text: 'text-kpi-cyan-text', iconBg: 'bg-kpi-cyan', iconText: 'text-kpi-cyan-text' },
    orange: { bg: 'bg-kpi-orange', text: 'text-kpi-orange-text', iconBg: 'bg-kpi-orange', iconText: 'text-kpi-orange-text' },
  };

  const styles = variantStyles[variant];

  return (
    <div className={`${styles.bg} p-6 rounded-2xl shadow-sm border border-border/50 flex items-start justify-between hover:shadow-md transition-shadow`}>
      <div className="flex-1">
        <p className="text-sm font-medium text-muted-foreground mb-2">{title}</p>
        {isLoading ? (
          <Skeleton className="h-9 w-24 mb-2" />
        ) : (
          <h3 className={`text-3xl font-bold ${styles.text} mb-2`}>{value}</h3>
        )}
        <div className="flex items-center gap-2">
          {trend && !isLoading && (
            <span className={`text-xs font-semibold ${trend.isPositive ? 'text-success' : 'text-destructive'}`}>
              {trend.isPositive ? '▲' : '▼'} {Math.abs(trend.value)}%
            </span>
          )}
          {subtext && <p className="text-xs text-muted-foreground">{subtext}</p>}
        </div>
      </div>
      <div className={`p-4 rounded-xl ${styles.iconBg} ${styles.iconText}`}>
        <Icon size={28} strokeWidth={2} />
      </div>
    </div>
  );
};
