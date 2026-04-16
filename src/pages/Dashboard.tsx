import { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Sidebar } from '@/components/Dashboard/Sidebar';
import { Header } from '@/components/Dashboard/Header';
import { MappingTool } from '@/components/Dashboard/MappingTool';
import { HoursCorrection } from '@/components/Dashboard/HoursCorrection';
import { DashboardView } from '@/components/Dashboard/DashboardView';
import { SyncStatus } from '@/components/Dashboard/SyncStatus';
import { WelcomeScreen } from '@/components/Dashboard/WelcomeScreen';
import { KPICardsSection, AnnualValueBreakdown } from '@/components/Dashboard/KPICardsSection';
import { ReportViewSection } from '@/components/Dashboard/ReportViewSection';
import { AnalysisViewSection } from '@/components/Dashboard/AnalysisViewSection';
import { BatchProgress } from '@/components/Dashboard/BatchProgress';
import { AdminViewToggle } from '@/components/Dashboard/AdminViewToggle';
import { OnboardingTour } from '@/components/Dashboard/OnboardingTour';
import { useOnboardingTour } from '@/hooks/useOnboardingTour';
import { Role, ViewMode, ProjectMapping, ProcessedCallRecord } from '@/types/dashboard';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { useProjects, useUpdateProject } from '@/hooks/useProjects';
import { MappingConfig, ProjectType } from '@/types/database';
import { useCallRecords, useAvailableWeeks } from '@/hooks/useCallRecords';
import { useAllCallRecordsForAnalysis } from '@/hooks/useAllCallRecordsForAnalysis';
import { useTotalRecordCount } from '@/hooks/useTotalRecordCount';
import { useKPIAggregates } from '@/hooks/useKPIAggregates';
import { useLoggedTime } from '@/hooks/useLoggedTime';
import { useReportMatrixData } from '@/hooks/useReportMatrixData';
import { useDateFilter, DateFilterType, DateRange } from '@/hooks/useDateFilter';
import { useAuth } from '@/hooks/useAuth';
import { useUserRole, useIsSuperAdmin } from '@/hooks/useUserRole';
import { useToast } from '@/hooks/use-toast';
import { useExcelExport } from '@/hooks/useExcelExport';
import { Navigate } from 'react-router-dom';
import { detectFrequencyFromConfig } from '@/lib/statsHelpers';
import { errorLogger } from '@/lib/errorLogger';

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

  // Onboarding tour (must be before any conditional returns)
  const isDbAdminForTour = userRole?.role === 'admin' || userRole?.role === 'superadmin';
  const tour = useOnboardingTour(!!isDbAdminForTour);

  // Resolve date filter for queries
  const dateFilter = useDateFilter({
    filterType: dateFilterType,
    weekYearValue: selectedWeek === 'all' ? 'all' : String(selectedWeek),
    dateRange,
  });

  // Determine effective role based on database role and viewAsClient toggle
  const isDbAdmin = userRole?.role === 'admin' || userRole?.role === 'superadmin';
  const effectiveRole: Role = viewAsClient ? 'client' : (isDbAdmin ? 'admin' : 'client');

  // Fetch projects from Supabase - admins get full access, customers get public view
  const { projects, isLoading: projectsLoading, error: projectsError } = useProjects(true, user?.id, isDbAdmin);
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
    dateFilter,
    page: dashboardPage,
    pageSize: dashboardPageSize
  });

  // Fetch total record count for pagination
  const { data: totalRecordCount = 0 } = useTotalRecordCount(currentProject?.id, dateFilter);

  // Get available weeks
  const { data: availableWeeks = [] } = useAvailableWeeks(currentProject?.id);

  // Project-data query keys that should be invalidated on project switch
  const PROJECT_DATA_KEYS = ['call_records', 'available_weeks', 'kpi_aggregates', 'logged_time', 'report_matrix_data', 'total_record_count', 'kpi_basic_aggregates', 'kpi_annual_value', 'all_call_records_analysis'];

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

    
  }, [selectedProjectKey, queryClient]);

  // Auto-select first project when projects are loaded and none selected
  useEffect(() => {
    if (projects.length > 0 && !selectedProjectKey) {
      setSelectedProjectKey(projects[0].project_key);
    }
  }, [projects, selectedProjectKey, setSelectedProjectKey]);

  // Auto-select most recent week when available weeks change
  useEffect(() => {
    if (availableWeeks.length > 0 && dateFilterType === 'week') {
      const isCurrentWeekValid = availableWeeks.some(w => w.value === selectedWeek);
      
      if (selectedWeek === 'all' || !isCurrentWeekValid) {
        setSelectedWeek(availableWeeks[0].value);
      }
    }
  }, [availableWeeks, dateFilterType]);

  // Fetch KPI aggregates (totals over ALL records, not paginated)
  const { data: kpiAggregates, isLoading: kpiLoading } = useKPIAggregates({
    projectId: currentProject?.id,
    dateFilter,
    mappingConfig: currentProject?.mapping_config
  });

  // Fetch logged time for accurate cost calculation
  const { data: loggedTime, isLoading: loggedTimeLoading } = useLoggedTime({
    projectId: currentProject?.id,
    dateFilter,
    hoursFactor: currentProject?.hours_factor ?? 1.0
  });

  // Fetch ALL records for selected period for ReportMatrix (no pagination)
  const { 
    data: reportMatrixData = [], 
    isLoading: reportMatrixLoading 
  } = useReportMatrixData(currentProject, dateFilter);

  // Fetch ALL records for analysis views
  const { 
    data: allRecordsForAnalysis = [], 
    isLoading: analysisLoading 
  } = useAllCallRecordsForAnalysis(currentProject, dateFilter);

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

  // Determine project type
  const projectType = (currentProject?.project_type || 'outbound') as ProjectType;
  const isInboundProject = projectType === 'inbound' || projectType === 'inbound_service';

  // Compute handled/not-handled counts for inbound_service
  const { totalHandled, totalNotHandled } = useMemo(() => {
    if (projectType !== 'inbound_service' || !currentProject?.mapping_config) {
      return { totalHandled: 0, totalNotHandled: 0 };
    }
    const mc = currentProject.mapping_config;
    const handledResults = mc.handled_results || [];
    const notHandledResults = mc.not_handled_results || [];
    
    // Count from reportMatrixProcessedData (all records for current filter)
    const source = reportMatrixProcessedData;
    const handled = source.filter(r => handledResults.includes(r.bc_result_naam)).length;
    const notHandled = source.filter(r => notHandledResults.includes(r.bc_result_naam)).length;
    
    return { totalHandled: handled, totalNotHandled: notHandled };
  }, [projectType, currentProject?.mapping_config, reportMatrixProcessedData]);

  // Compute annual value breakdown by frequency type
  const annualValueBreakdown = useMemo((): AnnualValueBreakdown | undefined => {
    if (!['outbound', 'inbound'].includes(projectType) || !currentProject?.mapping_config) return undefined;
    const freqMap = currentProject.mapping_config.freq_map || {};
    const freqCol = currentProject.mapping_config.freq_col;
    const amountCol = currentProject.mapping_config.amount_col;
    const breakdown: AnnualValueBreakdown = {
      monthly: { count: 0, value: 0, totalAmount: 0 },
      quarterly: { count: 0, value: 0, totalAmount: 0 },
      halfYearly: { count: 0, value: 0, totalAmount: 0 },
      yearly: { count: 0, value: 0, totalAmount: 0 },
      oneoff: { count: 0, value: 0, totalAmount: 0 },
    };

    reportMatrixProcessedData.forEach((record) => {
      if (!record.is_sale) return;
      const rawData = (record as any).raw_data as Record<string, unknown> | undefined;
      const freqRaw = rawData?.[freqCol];
      const result = detectFrequencyFromConfig(freqRaw, freqMap, record.bc_result_naam);
      const key = result.type as keyof AnnualValueBreakdown;
      breakdown[key].count++;
      breakdown[key].value += record.annual_value || 0;
      // Parse original term amount for breakdown display
      const amountRaw = rawData?.[amountCol];
      if (amountRaw) {
        breakdown[key].totalAmount += parseDutchFloat(amountRaw as string | number);
      }
    });

    return breakdown;
  }, [reportMatrixProcessedData, projectType, currentProject?.mapping_config]);

  // Get display label for current filter
  const filterLabel = useMemo(() => {
    if (dateFilterType === 'week') {
      return selectedWeek === 'all' ? 'Alle weken' : `Week ${selectedWeek}`;
    }
    if (dateRange.start && dateRange.end) {
      return `${dateRange.start.toLocaleDateString('nl-NL')} - ${dateRange.end.toLocaleDateString('nl-NL')}`;
    }
    return 'Selecteer periode';
  }, [dateFilterType, selectedWeek, dateRange]);

  // Excel export hook
  const { handleExportToExcel } = useExcelExport({
    data: reportMatrixProcessedData,
    hourlyRate,
    selectedWeek: filterLabel,
    projectName: currentProject?.name || selectedProjectKey,
    mappingConfig: currentProject?.mapping_config,
    vatRate: currentProject?.vat_rate || 21,
    loggedTimeHours: loggedTime?.hasData ? loggedTime.totalHours : undefined,
    dailyLoggedHours: loggedTime?.dailyHours,
    projectType,
  });

  const handleSaveMapping = async (projectId: string, hourlyRate: number, mappingConfig: MappingConfig, projectType: ProjectType, hoursFactor?: number) => {
    try {
      await updateProject.mutateAsync({
        projectId,
        hourlyRate,
        mappingConfig,
        projectType,
        hoursFactor,
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
      errorLogger.logApiError('logout', error);
    } finally {
      queryClient.clear();
      window.location.replace('/');
    }
  }, [signOut, queryClient]);

  // Project keys for sidebar (from database)
  const projectKeys = projects.map((p) => p.project_key);

  // Redirect to auth if not logged in
  if (!authLoading && !user) {
    return <Navigate to="/" replace />;
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
          onStartTour={tour.startTour}
        />
        
        {/* Admin toggle to view as client */}
        {isDbAdmin && (
          <AdminViewToggle 
            viewAsClient={viewAsClient} 
            onViewAsClientChange={setViewAsClient} 
          />
        )}

        <div className="p-3 sm:p-8 max-w-7xl mx-auto">
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
                  <div data-tour="mapping-tool">
                    <MappingTool
                      project={currentProject}
                      onSave={handleSaveMapping}
                      isSaving={updateProject.isPending}
                    />
                  </div>
                  
                  {/* Hours Correction - only show when date filter is active */}
                  {dateFilter.isFiltering && dateFilter.startDate && dateFilter.endDate && currentProject && (
                    <div className="mt-6" data-tour="hours-correction">
                      <HoursCorrection
                        projectId={currentProject.id}
                        startDate={dateFilter.startDate}
                        endDate={dateFilter.endDate}
                      />
                    </div>
                  )}
                </div>
              )}

              {/* Empty State */}
              {processedData.length === 0 && (
                <div className="text-center py-12 text-muted-foreground">
                  <p className="text-lg font-medium">Geen data beschikbaar</p>
                  <p className="text-sm mt-2">
                    {dateFilter.isFiltering 
                      ? 'Geen records gevonden voor de geselecteerde periode.'
                      : 'De data wordt automatisch gesynchroniseerd via de VPS sync engine.'}
                  </p>
                </div>
              )}

              {/* Top KPI Cards */}
              {processedData.length > 0 && (
                <>
                  <KPICardsSection
                    projectType={projectType}
                    totalSales={totalSales}
                    totalAnnualValue={totalAnnualValue}
                    totalRecords={kpiAggregates?.totalRecords ?? 0}
                    totalHours={totalHours}
                    costPerDonor={costPerDonor}
                    hourlyRate={hourlyRate}
                    selectedWeek={filterLabel}
                    isLoading={kpiLoading}
                    totalToCall={currentProject?.total_to_call}
                    totalHandled={totalHandled}
                    totalNotHandled={totalNotHandled}
                    annualValueBreakdown={annualValueBreakdown}
                  />

                  <BatchProgress projectId={currentProject.id} />

                  {/* MAIN VIEW SWITCHER */}
                  {viewMode === 'report' ? (
                    <ReportViewSection
                      projectType={projectType}
                      selectedWeek={filterLabel}
                      data={reportMatrixProcessedData}
                      hourlyRate={hourlyRate}
                      vatRate={currentProject?.vat_rate || 21}
                      mappingConfig={currentProject?.mapping_config}
                      loggedTimeHours={loggedTime?.hasData ? loggedTime.totalHours : undefined}
                      dailyLoggedHours={loggedTime?.dailyHours}
                      isLoading={reportMatrixLoading}
                      onExportToExcel={handleExportToExcel}
                      isAdmin={isDbAdmin}
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

      <OnboardingTour
        isActive={tour.isActive}
        currentStep={tour.currentStep}
        currentStepIndex={tour.currentStepIndex}
        totalSteps={tour.totalSteps}
        onNext={tour.nextStep}
        onPrev={tour.prevStep}
        onSkip={tour.skipTour}
      />
    </div>
  );
};

export default Index;
