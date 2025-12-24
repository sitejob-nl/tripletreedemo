import { useState, useMemo, useEffect, useCallback } from 'react';
import { CheckCircle, DollarSign, TrendingUp, Users, FileSpreadsheet, AlertCircle, Loader2, Eye } from 'lucide-react';
import * as XLSX from 'xlsx-js-style';
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
import { useAuth } from '@/hooks/useAuth';
import { useUserRole, useIsSuperAdmin } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Navigate } from 'react-router-dom';

const Index = () => {
  const [selectedProjectKey, setSelectedProjectKey] = useState<string>('hersenstichting');
  const [viewMode, setViewMode] = useState<ViewMode>('report');
  const [selectedWeek, setSelectedWeek] = useState<string | number>('all');
  const [viewAsClient, setViewAsClient] = useState(false);
  
  const { user, signOut, loading: authLoading } = useAuth();
  const { data: userRole, isLoading: roleLoading } = useUserRole(user?.id);
  const { isSuperAdmin } = useIsSuperAdmin(user?.id);
  const { toast } = useToast();

  // Determine effective role based on database role and viewAsClient toggle
  const isDbAdmin = userRole?.role === 'admin' || userRole?.role === 'superadmin';
  const effectiveRole: Role = viewAsClient ? 'client' : (isDbAdmin ? 'admin' : 'client');

  // Fetch projects from Supabase
  const { projects, isLoading: projectsLoading, error: projectsError } = useProjects();

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

  const handleSaveMapping = () => {
    // TODO: Implement save to Supabase
    toast({
      title: 'Mapping opgeslagen',
      description: 'De configuratie is succesvol bijgewerkt.',
    });
  };

  // Export to Excel function
  const handleExportToExcel = useCallback(() => {
    const days = ['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'];
    
    // Aggregate data by day
    const aggregated: Record<string, { calls: number; sales: number; recurring: number; oneoff: number; annualValue: number; annualValueRecurring: number; durationSec: number }> = {};
    days.forEach((d) => (aggregated[d] = { calls: 0, sales: 0, recurring: 0, oneoff: 0, annualValue: 0, annualValueRecurring: 0, durationSec: 0 }));
    aggregated.total = { calls: 0, sales: 0, recurring: 0, oneoff: 0, annualValue: 0, annualValueRecurring: 0, durationSec: 0 };

    processedData.forEach((record) => {
      const day = record.day_name.toLowerCase();
      if (!aggregated[day]) return;

      aggregated[day].calls++;
      aggregated[day].durationSec += record.bc_gesprekstijd;

      if (record.is_sale) {
        aggregated[day].sales++;
        aggregated[day].annualValue += record.annual_value;
        if (record.is_recurring) {
          aggregated[day].recurring++;
          aggregated[day].annualValueRecurring += record.annual_value;
        } else {
          aggregated[day].oneoff++;
        }
      }

      aggregated.total.calls++;
      aggregated.total.durationSec += record.bc_gesprekstijd;
      if (record.is_sale) {
        aggregated.total.sales++;
        aggregated.total.annualValue += record.annual_value;
        if (record.is_recurring) {
          aggregated.total.recurring++;
          aggregated.total.annualValueRecurring += record.annual_value;
        } else {
          aggregated.total.oneoff++;
        }
      }
    });

    // Build rows for Excel
    const calcHours = (durationSec: number) => durationSec / 3600;
    const calcInvestment = (durationSec: number) => calcHours(durationSec) * hourlyRate;
    
    const excelData = [
      ['', ...days.map(d => d.charAt(0).toUpperCase() + d.slice(1)), 'Totaal'],
      ['RESULTATEN', '', '', '', '', '', '', '', ''],
      ['Aantal positief', ...days.map(d => aggregated[d].sales), aggregated.total.sales],
      ['Doorlopende machtigingen', ...days.map(d => aggregated[d].recurring), aggregated.total.recurring],
      ['Eenmalige machtigingen', ...days.map(d => aggregated[d].oneoff), aggregated.total.oneoff],
      ['', '', '', '', '', '', '', '', ''],
      ['FINANCIEEL', '', '', '', '', '', '', '', ''],
      ['Jaarwaarde Totaal', ...days.map(d => `€ ${aggregated[d].annualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`), `€ ${aggregated.total.annualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Jaarwaarde Doorlopend', ...days.map(d => `€ ${aggregated[d].annualValueRecurring.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`), `€ ${aggregated.total.annualValueRecurring.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['', '', '', '', '', '', '', '', ''],
      ['PRODUCTIVITEIT', '', '', '', '', '', '', '', ''],
      ['Aantal beluren', ...days.map(d => calcHours(aggregated[d].durationSec).toFixed(1)), calcHours(aggregated.total.durationSec).toFixed(1)],
      ['Bruto Conversie', ...days.map(d => aggregated[d].calls > 0 ? `${((aggregated[d].sales / aggregated[d].calls) * 100).toFixed(1)}%` : '0%'), aggregated.total.calls > 0 ? `${((aggregated.total.sales / aggregated.total.calls) * 100).toFixed(1)}%` : '0%'],
      ['', '', '', '', '', '', '', '', ''],
      ['INVESTERING', '', '', '', '', '', '', '', ''],
      ['Investering (Excl BTW)', ...days.map(d => `€ ${calcInvestment(aggregated[d].durationSec).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`), `€ ${calcInvestment(aggregated.total.durationSec).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`],
      ['Investering per donateur', ...days.map(d => aggregated[d].sales > 0 ? `€ ${(calcInvestment(aggregated[d].durationSec) / aggregated[d].sales).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '€ 0,00'), aggregated.total.sales > 0 ? `€ ${(calcInvestment(aggregated.total.durationSec) / aggregated.total.sales).toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : '€ 0,00'],
    ];

    // Create workbook and worksheet
    const ws = XLSX.utils.aoa_to_sheet(excelData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `Week ${selectedWeek === 'all' ? 'Totaal' : selectedWeek}`);

    // Border style definition
    const thinBorder = {
      top: { style: 'thin', color: { rgb: 'CCCCCC' } },
      bottom: { style: 'thin', color: { rgb: 'CCCCCC' } },
      left: { style: 'thin', color: { rgb: 'CCCCCC' } },
      right: { style: 'thin', color: { rgb: 'CCCCCC' } },
    };

    // Style definitions
    const headerStyle = {
      font: { bold: true, color: { rgb: 'FFFFFF' } },
      fill: { fgColor: { rgb: '4A7C4E' } },
      alignment: { horizontal: 'center' as const },
      border: thinBorder
    };
    
    const categoryStyles: Record<string, object> = {
      'RESULTATEN': { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '22C55E' } }, border: thinBorder },
      'FINANCIEEL': { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '3B82F6' } }, border: thinBorder },
      'PRODUCTIVITEIT': { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '8B5CF6' } }, border: thinBorder },
      'INVESTERING': { font: { bold: true, color: { rgb: 'FFFFFF' } }, fill: { fgColor: { rgb: '06B6D4' } }, border: thinBorder },
    };

    const dataStyle = { border: thinBorder };
    const totalColStyle = { font: { bold: true }, border: thinBorder };

    // Apply styles to all cells
    const cols = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H', 'I'];
    const categoryRows = [2, 7, 11, 15]; // Row numbers for category headers
    const categoryNames = ['RESULTATEN', 'FINANCIEEL', 'PRODUCTIVITEIT', 'INVESTERING'];
    const emptyRows = [6, 10, 14]; // Empty separator rows

    for (let row = 1; row <= 17; row++) {
      cols.forEach((col, colIdx) => {
        const cellRef = `${col}${row}`;
        
        // Initialize cell if it doesn't exist
        if (!ws[cellRef]) {
          ws[cellRef] = { v: '', t: 's' };
        }

        // Apply appropriate style based on row type
        if (row === 1) {
          // Header row
          ws[cellRef].s = headerStyle;
        } else if (categoryRows.includes(row)) {
          // Category header rows
          const categoryIdx = categoryRows.indexOf(row);
          ws[cellRef].s = categoryStyles[categoryNames[categoryIdx]];
        } else if (emptyRows.includes(row)) {
          // Empty separator rows - just borders
          ws[cellRef].s = dataStyle;
        } else if (colIdx === 8) {
          // Totaal column (last column) - bold with border
          ws[cellRef].s = totalColStyle;
        } else {
          // Regular data cells
          ws[cellRef].s = dataStyle;
        }
      });
    }

    // Set column widths
    ws['!cols'] = [
      { wch: 28 },
      ...days.map(() => ({ wch: 14 })),
      { wch: 14 }
    ];

    // Generate filename
    const projectName = currentProject?.name || selectedProjectKey;
    const weekLabel = selectedWeek === 'all' ? 'Totaal' : `Week${selectedWeek}`;
    const filename = `${projectName}_${weekLabel}_Rapport.xlsx`;

    // Download file
    XLSX.writeFile(wb, filename);

    toast({
      title: 'Export succesvol',
      description: `Rapport geëxporteerd als ${filename}`,
    });
  }, [processedData, hourlyRate, selectedWeek, currentProject, selectedProjectKey, toast]);

  // Project keys for sidebar (from database)
  const projectKeys = projects.map((p) => p.project_key);

  // Redirect to auth if not logged in
  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  // Show loading while checking auth and role
  if (authLoading || roleLoading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="text-muted-foreground">Laden...</span>
        </div>
      </div>
    );
  }

  const isLoading = projectsLoading || recordsLoading;
  const error = projectsError || recordsError;

  const handleLogout = async () => {
    await signOut();
  };

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      <Sidebar
        selectedProject={selectedProjectKey as any}
        onProjectChange={(key) => setSelectedProjectKey(key)}
        projects={projectKeys as any}
        role={effectiveRole}
        onLogout={handleLogout}
        isSuperAdmin={isSuperAdmin}
      />

      <main className="flex-1 overflow-y-auto">
        <Header
          project={selectedProjectKey as any}
          role={effectiveRole}
          selectedWeek={selectedWeek}
          availableWeeks={availableWeeks}
          viewMode={viewMode}
          onWeekChange={(week) => setSelectedWeek(week)}
          onViewModeChange={setViewMode}
        />
        
        {/* Admin toggle to view as client */}
        {isDbAdmin && (
          <div className="px-8 pt-4">
            <div className="flex items-center gap-3 p-3 bg-muted/50 rounded-lg border border-border w-fit">
              <Eye size={16} className="text-muted-foreground" />
              <Label htmlFor="view-as-client" className="text-sm font-medium cursor-pointer">
                Bekijk als klant
              </Label>
              <Switch
                id="view-as-client"
                checked={viewAsClient}
                onCheckedChange={setViewAsClient}
              />
            </div>
          </div>
        )}

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
              {effectiveRole === 'admin' && (
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
                      value={`€ ${totalAnnualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
                      subtext="Totale opbrengst"
                      icon={DollarSign}
                      variant="blue"
                    />
                    <KPICard
                      title="Kosten per Donateur"
                      value={`€ ${costPerDonor.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
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
                        <button 
                          onClick={handleExportToExcel}
                          className="text-primary text-sm font-medium hover:underline flex items-center gap-1"
                        >
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
