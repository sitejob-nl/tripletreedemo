import { useState, useEffect, useMemo } from 'react';
import { CheckCircle, DollarSign, TrendingUp, Users, FileSpreadsheet, AlertCircle } from 'lucide-react';
import { RoleSelection } from '@/components/Dashboard/RoleSelection';
import { Sidebar } from '@/components/Dashboard/Sidebar';
import { Header } from '@/components/Dashboard/Header';
import { KPICard } from '@/components/Dashboard/KPICard';
import { MappingTool } from '@/components/Dashboard/MappingTool';
import { ReportMatrix } from '@/components/Dashboard/ReportMatrix';
import { DashboardView } from '@/components/Dashboard/DashboardView';
import { Role, ViewMode, Project, ProjectMapping, ProcessedCallRecord } from '@/types/dashboard';
import { MOCK_BASICALL_DATA, INITIAL_MAPPINGS } from '@/data/mockData';
import { processCallData } from '@/lib/dataProcessing';
import { useToast } from '@/hooks/use-toast';

const Index = () => {
  const [role, setRole] = useState<Role | null>(null);
  const [selectedProject, setSelectedProject] = useState<Project>('hersenstichting');
  const [mappings, setMappings] = useState<Record<Project, ProjectMapping>>(INITIAL_MAPPINGS);
  const [processedData, setProcessedData] = useState<ProcessedCallRecord[]>([]);
  const [viewMode, setViewMode] = useState<ViewMode>('report');
  const [selectedWeek, setSelectedWeek] = useState<string | number>('all');
  const { toast } = useToast();

  const projects = Object.keys(MOCK_BASICALL_DATA) as Project[];

  // Process data when project or mappings change
  useEffect(() => {
    if (selectedProject && MOCK_BASICALL_DATA[selectedProject]) {
      const raw = MOCK_BASICALL_DATA[selectedProject];
      const mapConfig = mappings[selectedProject];
      const processed = processCallData(raw, mapConfig);
      setProcessedData(processed);
    }
  }, [selectedProject, mappings]);

  // Filter Data based on selected Week
  const filteredData = useMemo(() => {
    if (selectedWeek === 'all') return processedData;
    return processedData.filter((d) => d.week_number === Number(selectedWeek));
  }, [processedData, selectedWeek]);

  // Extract available weeks for the dropdown
  const availableWeeks = useMemo(() => {
    const weeks = new Set(processedData.map((d) => d.week_number));
    return Array.from(weeks).sort((a, b) => a - b);
  }, [processedData]);

  const handleSaveMapping = (project: Project, newMapping: ProjectMapping) => {
    setMappings((prev) => ({ ...prev, [project]: newMapping }));
    toast({
      title: 'Mapping opgeslagen',
      description: 'De configuratie is succesvol bijgewerkt.',
    });
  };

  // Calculate totals for Top Cards (based on FILTERED data)
  const totalSales = filteredData.filter((d) => d.is_sale).length;
  const totalAnnualValue = filteredData.reduce(
    (acc, curr) => acc + (curr.is_sale ? curr.annual_value : 0),
    0
  );
  const totalHours = filteredData.reduce((acc, c) => acc + c.bc_gesprekstijd, 0) / 3600;
  const hourlyRate = mappings[selectedProject].hourly_rate;
  const totalCost = totalHours * hourlyRate;
  const costPerDonor = totalSales > 0 ? totalCost / totalSales : 0;

  if (!role) {
    return <RoleSelection onSelectRole={setRole} />;
  }

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <Sidebar
        selectedProject={selectedProject}
        onProjectChange={setSelectedProject}
        projects={projects}
        role={role}
        onLogout={() => setRole(null)}
      />

      <main className="flex-1 overflow-y-auto">
        <Header
          project={selectedProject}
          role={role}
          selectedWeek={selectedWeek}
          availableWeeks={availableWeeks}
          viewMode={viewMode}
          onWeekChange={(week) => setSelectedWeek(week)}
          onViewModeChange={setViewMode}
        />

        <div className="p-8 max-w-7xl mx-auto">
          {role === 'admin' && (
            <div className="mb-8">
              {!mappings[selectedProject].amount_col && (
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
                project={selectedProject}
                data={MOCK_BASICALL_DATA[selectedProject]}
                mapping={mappings[selectedProject]}
                onSave={handleSaveMapping}
              />
            </div>
          )}

          {/* Top KPI Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <KPICard
              title="Aantal Positief"
              value={totalSales}
              subtext={
                selectedWeek === 'all' ? 'Totaal 2025' : `Sales in Week ${selectedWeek}`
              }
              icon={CheckCircle}
              variant="success"
            />
            <KPICard
              title="Jaarwaarde"
              value={`€ ${totalAnnualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`}
              subtext="Totale opbrengst"
              icon={DollarSign}
              variant="primary"
            />
            <KPICard
              title="Kosten per Donateur"
              value={`€ ${costPerDonor.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}`}
              subtext={`O.b.v. €${hourlyRate}/u`}
              icon={TrendingUp}
              variant={costPerDonor > 50 ? 'destructive' : 'warning'}
            />
            <KPICard
              title="Inzet Uren"
              value={`${totalHours.toFixed(1)} u`}
              subtext="Totale beltijd"
              icon={Users}
              variant="primary"
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
                data={filteredData}
                hourlyRate={hourlyRate}
                selectedWeek={selectedWeek}
              />
            </div>
          ) : (
            <DashboardView data={filteredData} />
          )}
        </div>
      </main>
    </div>
  );
};

export default Index;
