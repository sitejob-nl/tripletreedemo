import { AlertTriangle, CheckCircle2, History, ShieldAlert } from 'lucide-react';
import type { ProjectDataQuality } from '@/types/database';
import { cn } from '@/lib/utils';

interface DataQualityBannerProps {
  quality?: ProjectDataQuality;
  isLoading?: boolean;
  isAdmin?: boolean;
}

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'nog niet vastgesteld';
  return new Intl.DateTimeFormat('nl-NL', { day: 'numeric', month: 'long', year: 'numeric' })
    .format(new Date(`${value}T12:00:00`));
};

export function DataQualityBanner({ quality, isLoading, isAdmin }: DataQualityBannerProps) {
  if (isLoading) {
    return <div className="h-11 animate-pulse rounded-lg border bg-muted/40 mb-4" />;
  }
  if (!quality) return null;

  const config = {
    verified: {
      icon: CheckCircle2,
      title: `Gecontroleerd t/m ${formatDate(quality.verified_through)}`,
      className: 'border-emerald-500/30 bg-emerald-500/10 text-emerald-800 dark:text-emerald-200',
    },
    attention: {
      icon: AlertTriangle,
      title: `Gecontroleerd t/m ${formatDate(quality.verified_through)}`,
      className: 'border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-100',
    },
    blocked: {
      icon: ShieldAlert,
      title: `Cijfers worden gecontroleerd — compleet t/m ${formatDate(quality.verified_through)}`,
      className: 'border-destructive/30 bg-destructive/10 text-destructive',
    },
    historical: {
      icon: History,
      title: `Historische campagne — data t/m ${formatDate(quality.verified_through)}`,
      className: 'border-blue-500/30 bg-blue-500/10 text-blue-900 dark:text-blue-100',
    },
  }[quality.status];

  const Icon = config.icon;
  const primaryMessage = quality.messages[0]?.text;

  return (
    <div className={cn('rounded-lg border px-4 py-3 mb-4 flex items-start gap-3', config.className)} role="status">
      <Icon className="h-5 w-5 shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold">{config.title}</p>
        {primaryMessage && <p className="text-xs mt-0.5 opacity-90">{primaryMessage}</p>}
        {isAdmin && quality.messages.length > 1 && (
          <p className="text-xs mt-1 opacity-80">Nog {quality.messages.length - 1} controlepunt(en) zichtbaar in Beheer.</p>
        )}
      </div>
    </div>
  );
}

interface QualityBlockedPanelProps {
  message?: string;
}

export function QualityBlockedPanel({ message }: QualityBlockedPanelProps) {
  return (
    <div className="rounded-xl border border-destructive/30 bg-destructive/5 px-6 py-10 text-center">
      <ShieldAlert className="h-8 w-8 text-destructive mx-auto mb-3" />
      <h3 className="font-semibold text-foreground">Dit onderdeel wordt gecontroleerd</h3>
      <p className="text-sm text-muted-foreground mt-2 max-w-xl mx-auto">
        {message ?? 'Zodra de ontbrekende gegevens compleet en gecontroleerd zijn, verschijnt dit onderdeel automatisch weer.'}
      </p>
    </div>
  );
}

