import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Sidebar } from '@/components/Dashboard/Sidebar';
import { Header } from '@/components/Dashboard/Header';
import { MappingTool } from '@/components/Dashboard/MappingTool';
import { DashboardView } from '@/components/Dashboard/DashboardView';
import { SyncStatus } from '@/components/Dashboard/SyncStatus';
import { WelcomeScreen } from '@/components/Dashboard/WelcomeScreen';
import { KPICardsSection } from '@/components/Dashboard/KPICardsSection';
import { ReportViewSection } from '@/components/Dashboard/ReportViewSection';
import { AnalysisViewSection } from '@/components/Dashboard/AnalysisViewSection';
import { AdminViewToggle } from '@/components/Dashboard/AdminViewToggle';
import { Role, ViewMode, ProjectMapping, ProcessedCallRecord } from '@/types/dashboard';
import { useProjects, useUpdateProject } from '@/hooks/useProjects';
import { MappingConfig, ProjectType } from '@/types/database';
import { useCallRecords, useAvailableWeeks } from '@/hooks/useCallRecords';
import { useAllCallRecordsForAnalysis } from '@/hooks/useAllCallRecordsForAnalysis';
import { useTotalRecordCount } from '@/hooks/useTotalRecordCount';
import { useKPIAggregates } from '@/hooks/useKPIAggregates';
import { useLoggedTime } from '@/hooks/useLoggedTime';
import { useReportMatrixData } from '@/hooks/useReportMatrixData';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole, useIsSuperAdmin } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { useExcelExport } from '@/hooks/useExcelExport';
import { Navigate } from 'react-router-dom';
import { DateFilterType, DateRange } from '@/components/Dashboard/DateFilterSelector';

const Index = () => {
  const [selectedProjectKey, setSelectedProjectKeyState] = useState<string>('');
  const [viewMode, setViewMode] = useState<ViewMode>('report');
  const [selectedWeek, setSelectedWeek] = useState<string | number>('all');
  const [viewAsClient, setViewAsClient] = useState(false);
  const [dashboardPage, setDashboardPage] = useState(1);
  const [dashboardPageSize, setDashboardPageSize] = useState(100);
  
  // Date filter state
  const [dateFilterType, setDateFilterType] = useState<DateFilterType>('week');
  const [dateRange, setDateRange] = useState<DateRange>({ start: null, end: null });
  
  const { user, signOut, loading: authLoading } = useAuth();
  const { data: userRole, isLoading: roleLoading } = useUserRole(user?.id);
  const { isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin(user?.id);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isLoggingOutRef = useRef(false);

  // Determine effective role based on database role and viewAsClient toggle
  const isDbAdmin = userRole?.role === 'admin' || userRole?.role === 'superadmin';
  const effectiveRole: Role = viewAsClient ? 'client' : (isDbAdmin ? 'admin' : 'client');

  // Fetch projects from Supabase - only when user is authenticated
  const { projects, isLoading: projectsLoading, error: projectsError } = useProjects(true, user?.id);
  const updateProject = useUpdateProject();

  // Find current project
  const currentProject = useMemo(
    () => projects.find((p) => p.project_key === selectedProjectKey),
    [projects, selectedProjectKey]
  );

  // Fetch call records for current project with server-side pagination
  const { 
    data: callRecords = [], 
    isLoading: recordsLoading,
    error: recordsError 
  } = useCallRecords(currentProject, { 
    weekYearValue: selectedWeek === 'all' ? 'all' : String(selectedWeek),
    page: dashboardPage,
    pageSize: dashboardPageSize
  });

  // Fetch total record count for pagination
  const { data: totalRecordCount = 0 } = useTotalRecordCount(
    currentProject?.id, 
    selectedWeek === 'all' ? 'all' : String(selectedWeek)
  );

  // Get available weeks
  const { data: availableWeeks = [] } = useAvailableWeeks(currentProject?.id);

  // Project-data query keys that should be invalidated on project switch
  const PROJECT_DATA_KEYS = ['call_records', 'available_weeks', 'kpi_aggregates', 'logged_time', 'report_matrix_data', 'total_record_count'];

  // Atomic project switch: cancel in-flight, remove cache, reset UI state, refetch
  const setSelectedProjectKey = useCallback((newProjectKey: string) => {
    if (newProjectKey === selectedProjectKey) {
      setSelectedProjectKeyState(newProjectKey);
      return;
    }

    // Predicate to match all project-related queries
    const projectQueryPredicate = (query: { queryKey: readonly unknown[] }) => {
      const key = query.queryKey[0];
      return typeof key === 'string' && PROJECT_DATA_KEYS.includes(key);
    };

    // 1. Cancel any in-flight queries
    queryClient.cancelQueries({ predicate: projectQueryPredicate });

    // 2. Remove cached data (hard refresh, not stale-while-revalidate)
    queryClient.removeQueries({ predicate: projectQueryPredicate });

    // 3. Reset UI state to avoid cross-project filter pollution
    setSelectedWeek('all');
    setDashboardPage(1);
    setDateFilterType('week');
    setDateRange({ start: null, end: null });

    // 4. Update project selection
    setSelectedProjectKeyState(newProjectKey);

    // 5. Refetch will happen automatically due to query dependencies
    setTimeout(() => {
      queryClient.refetchQueries({ queryKey: ['available_weeks'] });
    }, 0);

    console.log('[ProjectSwitch] Switched to:', newProjectKey, '- cache cleared, UI reset');
  }, [selectedProjectKey, queryClient]);

  // Auto-select first project when projects are loaded and none selected
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectKey) {
      setSelectedProjectKey(projects[0].project_key);
    }
  }, [projects, selectedProjectKey, setSelectedProjectKey]);

  // Auto-select most recent week when available weeks change
  useEffect(() => {
    if (availableWeeks.length > 0) {
      const isCurrentWeekValid = availableWeeks.some(w => w.value === selectedWeek);
      
      if (selectedWeek === 'all' || !isCurrentWeekValid) {
        setSelectedWeek(availableWeeks[0].value);
      }
    }
  }, [availableWeeks]);

  // Fetch KPI aggregates (totals over ALL records, not paginated)
  const { data: kpiAggregates, isLoading: kpiLoading } = useKPIAggregates({
    projectId: currentProject?.id,
    weekYearValue: selectedWeek === 'all' ? 'all' : String(selectedWeek),
    mappingConfig: currentProject?.mapping_config
  });

  // Fetch logged time for accurate cost calculation
  const { data: loggedTime, isLoading: loggedTimeLoading } = useLoggedTime({
    projectId: currentProject?.id,
    weekYearValue: selectedWeek === 'all' ? 'all' : String(selectedWeek)
  });

  // Fetch ALL records for selected week for ReportMatrix (no pagination)
  const { 
    data: reportMatrixData = [], 
    isLoading: reportMatrixLoading 
  } = useReportMatrixData(
    currentProject,
    selectedWeek === 'all' ? 'all' : String(selectedWeek)
  );

  // Fetch ALL records for analysis views
  const { 
    data: allRecordsForAnalysis = [], 
    isLoading: analysisLoading 
  } = useAllCallRecordsForAnalysis(
    currentProject,
    selectedWeek === 'all' ? 'all' : String(selectedWeek)
  );

  // Convert DB records to ProcessedCallRecord format for DashboardView (paginated)
  const processedData: ProcessedCallRecord[] = useMemo(() => {
    return callRecords.map((record) => ({
      ...(record.raw_data || {}),
      id: parseInt(record.basicall_record_id.toString()),
      bc_result_naam: record.resultaat || '',
      bc_gesprekstijd: Number(record.gesprekstijd_sec) || 0,
      bc_beldatum: record.beldatum || '',
      normalized_date: record.beldatum || '',
      day_name: record.day_name,
      week_number: record.week_number || 0,
      annual_value: record.annual_value,
      is_recurring: record.is_recurring,
      is_sale: record.is_sale,
      call_duration_min: Math.round((Number(record.gesprekstijd_sec) || 0) / 60),
    }));
  }, [callRecords]);

  // Convert report matrix data to ProcessedCallRecord format
  const reportMatrixProcessedData: ProcessedCallRecord[] = useMemo(() => {
    return reportMatrixData.map((record) => ({
      ...(record.raw_data || {}),
      raw_data: record.raw_data,
      id: parseInt(record.basicall_record_id.toString()),
      bc_result_naam: record.resultaat || '',
      bc_gesprekstijd: Number(record.gesprekstijd_sec) || 0,
      bc_beldatum: record.beldatum || '',
      normalized_date: record.beldatum || '',
      day_name: record.day_name,
      week_number: record.week_number || 0,
      annual_value: record.annual_value,
      is_recurring: record.is_recurring,
      is_sale: record.is_sale,
      call_duration_min: Math.round((Number(record.gesprekstijd_sec) || 0) / 60),
    }));
  }, [reportMatrixData]);

  // Convert ALL analysis records to ProcessedCallRecord format
  const analysisProcessedData: ProcessedCallRecord[] = useMemo(() => {
    return allRecordsForAnalysis.map((record) => ({
      ...(record.raw_data || {}),
      raw_data: record.raw_data,
      id: parseInt(record.basicall_record_id.toString()),
      bc_result_naam: record.resultaat || '',
      bc_gesprekstijd: Number(record.gesprekstijd_sec) || 0,
      bc_beldatum: record.beldatum || '',
      normalized_date: record.beldatum || '',
      day_name: record.day_name,
      week_number: record.week_number || 0,
      annual_value: record.annual_value,
      is_recurring: record.is_recurring,
      is_sale: record.is_sale,
      call_duration_min: Math.round((Number(record.gesprekstijd_sec) || 0) / 60),
    }));
  }, [allRecordsForAnalysis]);

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

  // KPI values from aggregated data
  const totalSales = kpiAggregates?.totalSales ?? 0;
  const totalAnnualValue = kpiAggregates?.totalAnnualValue ?? 0;
  const hourlyRate = currentMapping.hourly_rate;
  
  // Prefer logged time (agent login hours) over gesprekstijd (call duration)
  const totalHours = loggedTime?.hasData 
    ? loggedTime.totalHours 
    : (kpiAggregates?.totalGesprekstijdSec ?? 0) / 3600;
  const totalCost = totalHours * hourlyRate;
  const costPerDonor = totalSales > 0 ? totalCost / totalSales : 0;

  // Check if current project is inbound type
  const isInboundProject = currentProject?.project_type === 'inbound';

  // Excel export hook
  const { handleExportToExcel } = useExcelExport({
    data: reportMatrixProcessedData,
    hourlyRate,
    selectedWeek,
    projectName: currentProject?.name || selectedProjectKey,
  });

  const handleSaveMapping = async (projectId: string, hourlyRate: number, mappingConfig: MappingConfig, projectType: ProjectType) => {
    try {
      await updateProject.mutateAsync({
        projectId,
        hourlyRate,
        mappingConfig,
        projectType,
      });
      toast({
        title: 'Configuratie opgeslagen',
        description: 'De project configuratie is succesvol bijgewerkt.',
      });
    } catch (error) {
      toast({
        title: 'Fout bij opslaan',
        description: error instanceof Error ? error.message : 'Onbekende fout',
        variant: 'destructive',
      });
    }
  };

  // Robust logout handler with timeout and error handling
  const handleLogout = useCallback(async () => {
    if (isLoggingOutRef.current) return;
    isLoggingOutRef.current = true;
    
    try {
      const timeoutPromise = new Promise<void>((_, reject) => 
        setTimeout(() => reject(new Error('Logout timeout')), 3000)
      );
      
      await Promise.race([
        signOut(),
        timeoutPromise
      ]);
    } catch (error) {
      console.warn('Logout warning (ignored):', error);
    } finally {
      queryClient.clear();
      window.location.replace('/auth');
    }
  }, [signOut, queryClient]);

  // Project keys for sidebar (from database)
  const projectKeys = projects.map((p) => p.project_key);

  // Redirect to auth if not logged in
  if (!authLoading && !user) {
    return <Navigate to="/auth" replace />;
  }

  // Show loading while checking auth and role
  if (authLoading || roleLoading || superAdminLoading) {
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

  return (
    <div className="min-h-screen bg-background flex flex-col md:flex-row font-sans">
      {/* Mobile spacer for fixed header */}
      <div className="h-14 md:hidden flex-shrink-0" />
      
      <Sidebar
        selectedProject={selectedProjectKey as any}
        onProjectChange={(key) => setSelectedProjectKey(key)}
        projects={projectKeys as any}
        role={effectiveRole}
        onLogout={handleLogout}
        isSuperAdmin={isSuperAdmin}
        isAdmin={isDbAdmin}
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
          dateFilterType={dateFilterType}
          onDateFilterTypeChange={setDateFilterType}
          dateRange={dateRange}
          onDateRangeChange={setDateRange}
        />
        
        {/* Admin toggle to view as client */}
        {isDbAdmin && (
          <AdminViewToggle 
            viewAsClient={viewAsClient} 
            onViewAsClientChange={setViewAsClient} 
          />
        )}

        <div className="p-4 sm:p-8 max-w-7xl mx-auto">
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

          {/* Welcome Screen - Show when no project selected */}
          {!currentProject && !isLoading && !error && (
            <WelcomeScreen />
          )}

          {/* Loading State */}
          {isLoading && currentProject && (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-8 w-8 animate-spin text-primary" />
              <span className="ml-3 text-muted-foreground">Data laden...</span>
            </div>
          )}

          {/* Main Content - Only show when project is selected */}
          {!isLoading && !error && currentProject && (
            <>
              {/* Admin Mapping Tool */}
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
                    project={currentProject}
                    onSave={handleSaveMapping}
                    isSaving={updateProject.isPending}
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
                  <KPICardsSection
                    isInboundProject={isInboundProject}
                    totalSales={totalSales}
                    totalAnnualValue={totalAnnualValue}
                    totalRecords={kpiAggregates?.totalRecords ?? 0}
                    totalHours={totalHours}
                    costPerDonor={costPerDonor}
                    hourlyRate={hourlyRate}
                    selectedWeek={selectedWeek}
                    isLoading={kpiLoading}
                  />

                  {/* MAIN VIEW SWITCHER */}
                  {viewMode === 'report' ? (
                    <ReportViewSection
                      isInboundProject={isInboundProject}
                      selectedWeek={selectedWeek}
                      data={reportMatrixProcessedData}
                      hourlyRate={hourlyRate}
                      vatRate={currentProject?.vat_rate || 21}
                      mappingConfig={currentProject?.mapping_config}
                      loggedTimeHours={loggedTime?.hasData ? loggedTime.totalHours : undefined}
                      dailyLoggedHours={loggedTime?.dailyHours}
                      isLoading={reportMatrixLoading}
                      onExportToExcel={handleExportToExcel}
                    />
                  ) : viewMode === 'dashboard' ? (
                    <DashboardView 
                      data={processedData} 
                      totalRecords={totalRecordCount}
                      currentPage={dashboardPage}
                      pageSize={dashboardPageSize}
                      onPageChange={setDashboardPage}
                      onPageSizeChange={setDashboardPageSize}
                    />
                  ) : (
                    <AnalysisViewSection
                      data={analysisProcessedData}
                      isLoading={analysisLoading}
                      hourlyRate={hourlyRate}
                      availableWeeks={availableWeeks}
                      mappingConfig={currentProject?.mapping_config}
                    />
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
