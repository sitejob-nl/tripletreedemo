import { CheckCircle, DollarSign, TrendingUp, Users, Shield } from 'lucide-react';
import { KPICard } from './KPICard';

interface KPICardsSectionProps {
  isInboundProject: boolean;
  totalSales: number;
  totalAnnualValue: number;
  totalRecords: number;
  totalHours: number;
  costPerDonor: number;
  hourlyRate: number;
  selectedWeek: string | number;
  isLoading: boolean;
}

export function KPICardsSection({
  isInboundProject,
  totalSales,
  totalAnnualValue,
  totalRecords,
  totalHours,
  costPerDonor,
  hourlyRate,
  selectedWeek,
  isLoading,
}: KPICardsSectionProps) {
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

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-6 mb-6 sm:mb-8">
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
  );
}
