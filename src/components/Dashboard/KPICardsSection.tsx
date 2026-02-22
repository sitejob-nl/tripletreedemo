import { CheckCircle, DollarSign, TrendingUp, Users, Shield, Target, Headphones, PhoneCall } from 'lucide-react';
import { KPICard } from './KPICard';
import { Progress } from '@/components/ui/progress';
import { ProjectType } from '@/types/database';

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
}: KPICardsSectionProps) {
  const showProgress = totalToCall && totalToCall > 0;
  const progressPercent = showProgress ? Math.min((totalRecords / totalToCall) * 100, 100) : 0;

  const isInboundProject = projectType === 'inbound';
  const isServiceProject = projectType === 'inbound_service';

  // Klantenservice KPIs
  if (isServiceProject) {
    const handledTotal = totalHandled + totalNotHandled;
    const handledPercent = handledTotal > 0 ? (totalHandled / handledTotal) * 100 : 0;
    const callsPerHour = totalHours > 0 ? totalRecords / totalHours : 0;

    return (
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
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
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
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
          subtext="Jaarwaarde behouden"
          icon={DollarSign}
          variant="blue"
          isLoading={isLoading}
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
    <div className="space-y-4 mb-6 sm:mb-8">
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
          subtext="Totale opbrengst"
          icon={DollarSign}
          variant="blue"
          isLoading={isLoading}
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
