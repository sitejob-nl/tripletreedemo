import { CheckCircle, DollarSign, TrendingUp, Users, Shield, Target, Headphones, PhoneCall } from 'lucide-react';
import { KPICard } from './KPICard';
import { Progress } from '@/components/ui/progress';
import { ProjectType } from '@/types/database';

export interface AnnualValueBreakdown {
  monthly: { count: number; value: number; totalAmount: number };
  quarterly: { count: number; value: number; totalAmount: number };
  halfYearly: { count: number; value: number; totalAmount: number };
  yearly: { count: number; value: number; totalAmount: number };
  oneoff: { count: number; value: number; totalAmount: number };
}

interface KPICardsSectionProps {
  projectType: ProjectType;
  totalSales: number;
  totalAnnualValue: number;
  totalRecords: number;
  totalHours: number;
  costPerDonor: number;
  hourlyRate: number;
  selectedWeek: string | number;
  isLoading: boolean;
  totalToCall?: number | null;
  totalHandled?: number;
  totalNotHandled?: number;
  annualValueBreakdown?: AnnualValueBreakdown;
}

export function KPICardsSection({
  projectType,
  totalSales,
  totalAnnualValue,
  totalRecords,
  totalHours,
  costPerDonor,
  hourlyRate,
  selectedWeek,
  isLoading,
  totalToCall,
  totalHandled = 0,
  totalNotHandled = 0,
  annualValueBreakdown,
}: KPICardsSectionProps) {
  const showProgress = totalToCall && totalToCall > 0;
  const progressPercent = showProgress ? Math.min((totalRecords / totalToCall) * 100, 100) : 0;

  const isInboundProject = projectType === 'inbound';
  const isServiceProject = projectType === 'inbound_service';

  const fmt = (v: number) => `€ ${v.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  const freqLabels: Record<string, { label: string; multiplier: number }> = {
    monthly: { label: 'Maandelijks', multiplier: 12 },
    quarterly: { label: 'Per kwartaal', multiplier: 4 },
    halfYearly: { label: 'Halfjaarlijks', multiplier: 2 },
    yearly: { label: 'Jaarlijks', multiplier: 1 },
    oneoff: { label: 'Eenmalig', multiplier: 0 },
  };

  const breakdownPopover = annualValueBreakdown ? (
    <div className="space-y-3 min-w-[280px]">
      <h4 className="font-semibold text-sm text-foreground">Opbouw Jaarwaarde</h4>
      <div className="space-y-3">
        {(['monthly', 'quarterly', 'halfYearly', 'yearly', 'oneoff'] as const).map((key) => {
          const item = annualValueBreakdown[key];
          if (item.count === 0) return null;
          const { label, multiplier } = freqLabels[key];
          const isOneOff = key === 'oneoff';
          return (
            <div key={key} className="space-y-0.5">
              <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
                {label} {!isOneOff && `(×${multiplier})`}
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">
                  {item.count} {item.count === 1 ? 'donateur' : 'donateurs'} | {fmt(item.totalAmount)}
                  {!isOneOff && ` × ${multiplier}`}
                </span>
                <span className="font-medium text-foreground">{fmt(item.value)}</span>
              </div>
            </div>
          );
        })}
      </div>
      <div className="border-t border-border pt-2 flex justify-between text-sm font-bold">
        <span>Totaal</span>
        <span>{fmt(totalAnnualValue)}</span>
      </div>
    </div>
  ) : undefined;

  // Klantenservice KPIs
  if (isServiceProject) {
    const handledTotal = totalHandled + totalNotHandled;
    const handledPercent = handledTotal > 0 ? (totalHandled / handledTotal) * 100 : 0;
    const callsPerHour = totalHours > 0 ? totalRecords / totalHours : 0;

    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8" data-tour="kpi-cards">
        <KPICard
          title="Afgehandeld"
          value={`${handledPercent.toFixed(1)}%`}
          subtext={`${totalHandled} van ${handledTotal} calls`}
          icon={Headphones}
          variant="green"
          isLoading={isLoading}
        />
        <KPICard
          title="Totaal Calls"
          value={totalRecords}
          subtext={selectedWeek === 'all' ? 'Alle weken' : `Week ${selectedWeek}`}
          icon={PhoneCall}
          variant="blue"
          isLoading={isLoading}
        />
        <KPICard
          title="Calls per Uur"
          value={callsPerHour.toFixed(1)}
          subtext="Productiviteit"
          icon={TrendingUp}
          variant="purple"
          isLoading={isLoading}
        />
        <KPICard
          title="Inzet Uren"
          value={`${totalHours.toFixed(1)} u`}
          subtext="Totale beltijd"
          icon={Users}
          variant="cyan"
          isLoading={isLoading}
        />
      </div>
    );
  }

  // Inbound retentie KPIs
  if (isInboundProject) {
    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8" data-tour="kpi-cards">
        <KPICard
          title="Behouden"
          value={totalSales}
          subtext={selectedWeek === 'all' ? 'Alle weken' : `Week ${selectedWeek}`}
          icon={Shield}
          variant="green"
          isLoading={isLoading}
        />
        <KPICard
          title="Behouden Waarde"
          value={`€ ${totalAnnualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtext={annualValueBreakdown ? 'Klik voor details' : 'Jaarwaarde behouden'}
          icon={DollarSign}
          variant="blue"
          isLoading={isLoading}
          popoverContent={breakdownPopover}
        />
        <KPICard
          title="Retentie Ratio"
          value={totalRecords ? `${((totalSales / totalRecords) * 100).toFixed(1)}%` : '0%'}
          subtext="Behouden / Totaal"
          icon={TrendingUp}
          variant="purple"
          isLoading={isLoading}
        />
        <KPICard
          title="Inzet Uren"
          value={`${totalHours.toFixed(1)} u`}
          subtext="Totale beltijd"
          icon={Users}
          variant="cyan"
          isLoading={isLoading}
        />
      </div>
    );
  }

  // Outbound KPIs
  return (
    <div className="space-y-4 mb-6 sm:mb-8" data-tour="kpi-cards">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6">
        <KPICard
          title="Aantal Positief"
          value={totalSales}
          subtext={selectedWeek === 'all' ? 'Alle weken' : `Sales in Week ${selectedWeek}`}
          icon={CheckCircle}
          variant="green"
          isLoading={isLoading}
        />
        <KPICard
          title="Jaarwaarde"
          value={`€ ${totalAnnualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtext={annualValueBreakdown ? 'Klik voor details' : 'Totale opbrengst'}
          icon={DollarSign}
          variant="blue"
          isLoading={isLoading}
          popoverContent={breakdownPopover}
        />
        <KPICard
          title="Kosten per Donateur"
          value={`€ ${costPerDonor.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          subtext={`O.b.v. €${hourlyRate}/u`}
          icon={TrendingUp}
          variant={costPerDonor > 50 ? 'pink' : 'orange'}
          isLoading={isLoading}
        />
        <KPICard
          title="Inzet Uren"
          value={`${totalHours.toFixed(1)} u`}
          subtext="Totale beltijd"
          icon={Users}
          variant="cyan"
          isLoading={isLoading}
        />
      </div>
      
      {showProgress && (
        <div className="bg-card rounded-xl border border-border p-4 shadow-sm">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <Target size={16} className="text-primary" />
              <span className="text-sm font-semibold text-foreground">Voortgang</span>
            </div>
            <span className="text-sm font-bold text-foreground">
              {totalRecords.toLocaleString('nl-NL')} / {totalToCall!.toLocaleString('nl-NL')} ({progressPercent.toFixed(1)}%)
            </span>
          </div>
          <Progress value={progressPercent} className="h-2" />
          <p className="text-xs text-muted-foreground mt-1">
            Nog {Math.max(totalToCall! - totalRecords, 0).toLocaleString('nl-NL')} te bellen
          </p>
        </div>
      )}
    </div>
  );
}
