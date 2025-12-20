import { useState, useMemo } from 'react';
import { CheckCircle, DollarSign, TrendingUp, Users, FileSpreadsheet, AlertCircle, Loader2 } from 'lucide-react';
import { RoleSelection } from '@/components/Dashboard/RoleSelection';
import { Sidebar } from '@/components/Dashboard/Sidebar';
import { Header } from '@/components/Dashboard/Header';
import { KPICard } from '@/components/Dashboard/KPICard';
import { MappingTool } from '@/components/Dashboard/MappingTool';
import { ReportMatrix } from '@/components/Dashboard/ReportMatrix';
import { DashboardView } from '@/components/Dashboard/DashboardView';
import { SyncStatus } from '@/components/Dashboard/SyncStatus';
import { Role, ViewMode, ProjectMapping, ProcessedCallRecord } from '@/types/dashboard';
import { useProjects } from '@/hooks/useProjects';
import { useCallRecords, useAvailableWeeks } from '@/hooks/useCallRecords';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [role, setRole] = useState<Role | null>(null);
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('hersenstichting');
  const [viewMode, setViewMode] = useState<ViewMode>('report');
  const [selectedWeek, setSelectedWeek] = useState<string | number>('all');
  const { toast } = useToast();

  // Fetch projects from Supabase
  const { data: projects = [], isLoading: projectsLoading, error: projectsError } = useProjects();

  // Find current project
  const currentProject = useMemo(
    () => projects.find((p) => p.project_key === selectedProjectKey),
    [projects, selectedProjectKey]
  );

  // Fetch call records for current project
  const { 
    data: callRecords = [], 
    isLoading: recordsLoading,
    error: recordsError 
  } = useCallRecords(currentProject, { weekNumber: selectedWeek === 'all' ? 'all' : Number(selectedWeek) });

  // Get available weeks
  const { data: availableWeeks = [] } = useAvailableWeeks(currentProject?.id);

  // Convert DB records to ProcessedCallRecord format for existing components
  const processedData: ProcessedCallRecord[] = useMemo(() => {
    return callRecords.map((record) => ({
      id: parseInt(record.basicall_record_id.toString()),
      bc_result_naam: record.resultaat || '',
      bc_gesprekstijd: record.gesprekstijd_sec,
      bc_beldatum: record.beldatum || '',
      normalized_date: record.beldatum || '',
      day_name: record.day_name,
      week_number: record.week_number || 0,
      annual_value: record.annual_value,
      is_recurring: record.is_recurring,
      is_sale: record.is_sale,
      call_duration_min: Math.round(record.gesprekstijd_sec / 60),
      // Spread raw_data for compatibility
      ...(record.raw_data || {}),
    }));
  }, [callRecords]);

  // Create mapping from project config for existing components
  const currentMapping: ProjectMapping = useMemo(() => {
    if (!currentProject) {
      return {
        amount_col: '',
        freq_col: '',
        hourly_rate: 35,
        freq_map: {},
      };
    }
    return {
      amount_col: currentProject.mapping_config.amount_col,
      freq_col: currentProject.mapping_config.freq_col,
      hourly_rate: currentProject.hourly_rate,
      freq_map: currentProject.mapping_config.freq_map,
    };
  }, [currentProject]);

  const handleSaveMapping = () => {
    // TODO: Implement save to Supabase
    toast({
      title: 'Mapping opgeslagen',
      description: 'De configuratie is succesvol bijgewerkt.',
    });
  };

  // Calculate totals for KPI cards
  const totalSales = processedData.filter((d) => d.is_sale).length;
  const totalAnnualValue = processedData.reduce(
    (acc, curr) => acc + (curr.is_sale ? curr.annual_value : 0),
    0
  );
  const totalHours = processedData.reduce((acc, c) => acc + c.bc_gesprekstijd, 0) / 3600;
  const hourlyRate = currentMapping.hourly_rate;
  const totalCost = totalHours * hourlyRate;
  const costPerDonor = totalSales > 0 ? totalCost / totalSales : 0;

  // Project keys for sidebar (from database)
  const projectKeys = projects.map((p) => p.project_key);

  if (!role) {
    return <RoleSelection onSelectRole={setRole} />;
  }

  const isLoading = projectsLoading || recordsLoading;
  const error = projectsError || recordsError;

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <Sidebar
        selectedProject={selectedProjectKey as any}
        onProjectChange={(key) => setSelectedProjectKey(key)}
        projects={projectKeys as any}
        role={role}
        onLogout={() => setRole(null)}
      />

      <main className="flex-1 overflow-y-auto">
        <Header
          project={selectedProjectKey as any}
          role={role}
          selectedWeek={selectedWeek}
          availableWeeks={availableWeeks}
          viewMode={viewMode}
          onWeekChange={(week) => setSelectedWeek(week)}
          onViewModeChange={setViewMode}
        />

        <div className="p-8 max-w-7xl mx-auto">
          {/* Sync Status */}
          <div className="flex justify-end mb-4">
            <SyncStatus projectId={currentProject?.id} />
          </div>

          {/* Error State */}
          {error && (
            <div className="bg-destructive/10 border border-destructive/20 rounded-lg p-4 mb-4 flex items-start gap-3">
              <AlertCircle className="text-destructive mt-0.5" size={20} />
              <div>
                <h4 className="text-destructive font-bold text-sm">Fout bij laden</h4>
                <p className="text-destructive text-sm">{error.message}</p>
              </div>
            </div>
          )}

          {/* Loading State */}
          {isLoading && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Data laden...</span>
            </div>
          )}

          {/* Main Content */}
          {!isLoading && !error && (
            <>
              {role === 'admin' && (
                <div className="mb-8">
                  {!currentMapping.amount_col && (
                    <div className="bg-warning/10 border border-warning/20 rounded-lg p-4 mb-4 flex items-start gap-3">
                      <AlertCircle className="text-warning mt-0.5" size={20} />
                      <div>
                        <h4 className="text-warning font-bold text-sm">Setup Vereist</h4>
                        <p className="text-warning text-sm">
                          Configureer de kolommen en tarieven om de rapportage te activeren.
                        </p>
                      </div>
                    </div>
                  )}
                  <MappingTool
                    project={selectedProjectKey as any}
                    data={[]}
                    mapping={currentMapping}
                    onSave={handleSaveMapping}
                  />
                </div>
              )}

              {/* Empty State */}
              {processedData.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-lg font-medium">Geen data beschikbaar</p>
                  <p className="text-sm mt-2">
                    De data wordt automatisch gesynchroniseerd via de VPS sync engine.
                  </p>
                </div>
              )}

              {/* Top KPI Cards */}
              {processedData.length > 0 && (
                <>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
                    <KPICard
                      title="Aantal Positief"
                      value={totalSales}
                      subtext={
                        selectedWeek === 'all' ? 'Totaal 2025' : `Sales in Week ${selectedWeek}`
                      }
                      icon={CheckCircle}
                      variant="green"
                    />
                    <KPICard
                      title="Jaarwaarde"
                      value={`€ ${totalAnnualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`}
                      subtext="Totale opbrengst"
                      icon={DollarSign}
                      variant="blue"
                    />
                    <KPICard
                      title="Kosten per Donateur"
                      value={`€ ${costPerDonor.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`}
                      subtext={`O.b.v. €${hourlyRate}/u`}
                      icon={TrendingUp}
                      variant={costPerDonor > 50 ? 'pink' : 'orange'}
                    />
                    <KPICard
                      title="Inzet Uren"
                      value={`${totalHours.toFixed(1)} u`}
                      subtext="Totale beltijd"
                      icon={Users}
                      variant="cyan"
                    />
                  </div>

                  {/* MAIN VIEW SWITCHER */}
                  {viewMode === 'report' ? (
                    <div>
                      <div className="flex justify-between items-end mb-4">
                        <h3 className="font-bold text-foreground text-lg">
                          {selectedWeek === 'all'
                            ? 'Totaaloverzicht 2025'
                            : `Weekoverzicht - Week ${selectedWeek}`}
                        </h3>
                        <button className="text-primary text-sm font-medium hover:underline flex items-center gap-1">
                          <FileSpreadsheet size={16} /> Exporteer naar Excel
                        </button>
                      </div>
                      <ReportMatrix
                        data={processedData}
                        hourlyRate={hourlyRate}
                        selectedWeek={selectedWeek}
                      />
                    </div>
                  ) : (
                    <DashboardView data={processedData} />
                  )}
                </>
              )}
            </>
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
