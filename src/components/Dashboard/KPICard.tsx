import { LucideIcon } from 'lucide-react';

interface KPICardProps {
  title: string;
  value: string | number;
  subtext?: string;
  icon: LucideIcon;
  variant?: 'primary' | 'success' | 'warning' | 'destructive';
}

export const KPICard = ({ title, value, subtext, icon: Icon, variant = 'primary' }: KPICardProps) => {
  const variantStyles = {
    primary: 'bg-primary/10 text-primary',
    success: 'bg-success/10 text-success',
    warning: 'bg-warning/10 text-warning',
    destructive: 'bg-destructive/10 text-destructive',
  };

  const subtextColor = variant === 'destructive' ? 'text-destructive' : 'text-success';

  return (
    <div className="bg-card p-6 rounded-xl shadow-sm border border-border flex items-start justify-between">
      <div>
        <p className="text-sm font-medium text-muted-foreground mb-1">{title}</p>
        <h3 className="text-2xl font-bold text-card-foreground">{value}</h3>
        {subtext && <p className={`text-xs mt-2 ${subtextColor}`}>{subtext}</p>}
      </div>
      <div className={`p-3 rounded-lg ${variantStyles[variant]}`}>
        <Icon size={24} />
      </div>
    </div>
  );
};
