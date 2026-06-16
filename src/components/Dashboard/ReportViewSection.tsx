import { FileSpreadsheet, Loader2, PhoneOutgoing, PhoneIncoming, Headphones } from 'lucide-react';
import { ReportMatrix } from './ReportMatrix';
import { InboundReportMatrix } from './InboundReportMatrix';
import { ServiceReportMatrix } from './ServiceReportMatrix';
import { OutboundStandardMatrix } from './templates/OutboundStandardMatrix';
import { InboundServiceMatrix } from './templates/InboundServiceMatrix';
import { InboundRetentionMatrix } from './templates/InboundRetentionMatrix';
import { FlatReportMatrix } from './templates/FlatReportMatrix';
import { ProcessedCallRecord } from '@/types/dashboard';
import { MappingConfig, ProjectType, ReportTemplate, ReportageWeeklyOverride } from '@/types/database';
import { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';
import { overrideHasExcelData } from '@/lib/reportageOverrideUtils';

interface ReportViewSectionProps {
  projectId?: string;
  projectType: ProjectType;
  reportTemplate?: ReportTemplate | null;
  selectedWeek: string | number;
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate: number;
  mappingConfig?: MappingConfig;
  loggedTimeHours?: number;
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
  reportageOverrides?: ReportageWeeklyOverride[];
  isLoading: boolean;
  onExportToExcel: () => void;
  isAdmin?: boolean;
}

export function ReportViewSection({
  projectId,
  projectType,
  reportTemplate,
  selectedWeek,
  data,
  hourlyRate,
  vatRate,
  mappingConfig,
  loggedTimeHours,
  dailyLoggedHours,
  reportageOverrides = [],
  isLoading,
  onExportToExcel,
  isAdmin = false,
}: ReportViewSectionProps) {
  const isInboundProject = projectType === 'inbound';
  const isServiceProject = projectType === 'inbound_service';

  // Template routing: when a report_template is set, route to template-specific matrix.
  // Templates are built incrementally (see plan); remaining values fall back to legacy
  // project_type-based rendering below until their matrix is built.
  const templateComponent = (() => {
    if (!reportTemplate) return null;
    switch (reportTemplate) {
      case 'outbound_standard':
        if (!projectId) return null;
        return (
          <OutboundStandardMatrix
            projectId={projectId}
            data={data}
            hourlyRate={hourlyRate}
            vatRate={vatRate}
            selectedWeek={selectedWeek}
            mappingConfig={mappingConfig}
            loggedTimeHours={loggedTimeHours}
            dailyLoggedHours={dailyLoggedHours}
            reportageOverrides={reportageOverrides}
          />
        );
      case 'flat':
        return (
          <FlatReportMatrix
            data={data}
            mappingConfig={mappingConfig}
            selectedWeek={selectedWeek}
            loggedTimeHours={loggedTimeHours}
            reportageOverrides={reportageOverrides}
          />
        );
      case 'inbound_service':
        return (
          <InboundServiceMatrix
            data={data}
            hourlyRate={hourlyRate}
            vatRate={vatRate}
            selectedWeek={selectedWeek}
            mappingConfig={mappingConfig}
            loggedTimeHours={loggedTimeHours}
            dailyLoggedHours={dailyLoggedHours}
            reportageOverrides={reportageOverrides}
            showInvestment={isAdmin}
          />
        );
      case 'inbound_retention':
        return (
          <InboundRetentionMatrix
            data={data}
            hourlyRate={hourlyRate}
            vatRate={vatRate}
            selectedWeek={selectedWeek}
            mappingConfig={mappingConfig}
            loggedTimeHours={loggedTimeHours}
            dailyLoggedHours={dailyLoggedHours}
            reportageOverrides={reportageOverrides}
          />
        );
      default: {
        const _exhaustive: never = reportTemplate;
        return _exhaustive;
      }
    }
  })();

  const getTitle = () => {
    if (isServiceProject) return selectedWeek === 'all' ? 'Klantenservice Overzicht' : `Klantenservice Week ${selectedWeek}`;
    if (isInboundProject) return selectedWeek === 'all' ? 'Retentie Overzicht' : `Retentie Week ${selectedWeek}`;
    return selectedWeek === 'all' ? 'Totaaloverzicht' : `Weekoverzicht - Week ${selectedWeek}`;
  };

  const typeBadge = () => {
    if (isServiceProject) return (
      <span className="inline-flex items-center gap-1 rounded-full bg-kpi-cyan px-2 py-0.5 text-[10px] font-semibold text-kpi-cyan-text">
        <Headphones size={10} /> Service
      </span>
    );
    if (isInboundProject) return (
      <span className="inline-flex items-center gap-1 rounded-full bg-kpi-blue px-2 py-0.5 text-[10px] font-semibold text-kpi-blue-text">
        <PhoneIncoming size={10} /> Retentie
      </span>
    );
    return (
      <span className="inline-flex items-center gap-1 rounded-full bg-kpi-green px-2 py-0.5 text-[10px] font-semibold text-kpi-green-text">
        <PhoneOutgoing size={10} /> Outbound
      </span>
    );
  };

  return (
    <div data-tour="report-section">
      <div className="flex justify-between items-end mb-3 sm:mb-4 gap-2">
        <h3 className="font-bold text-foreground text-sm sm:text-lg truncate flex items-center gap-2">
          <span className="truncate">{getTitle()}</span>
          {typeBadge()}
          {overrideHasExcelData(reportageOverrides) && (
            <span className="hidden sm:inline-flex rounded-full border border-primary/30 bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
              Excel-correctie actief t/m week 15
            </span>
          )}
        </h3>
        <button
          onClick={onExportToExcel}
          aria-label="Exporteer rapport naar Excel"
          className="text-primary text-xs sm:text-sm font-medium hover:underline focus-visible:underline focus-visible:outline-none flex items-center gap-1 shrink-0"
        >
          <FileSpreadsheet size={14} className="sm:w-4 sm:h-4" aria-hidden="true" /> <span className="hidden sm:inline">Exporteer naar</span> Excel
        </button>
      </div>
      
      {templateComponent ? (
        templateComponent
      ) : isServiceProject && mappingConfig ? (
        <ServiceReportMatrix
          data={data}
          hourlyRate={hourlyRate}
          vatRate={vatRate}
          selectedWeek={selectedWeek}
          mappingConfig={mappingConfig}
          loggedTimeHours={loggedTimeHours}
          dailyLoggedHours={dailyLoggedHours}
          reportageOverrides={reportageOverrides}
          showInvestment={isAdmin}
        />
      ) : isInboundProject && mappingConfig ? (
        <InboundReportMatrix
          data={data}
          hourlyRate={hourlyRate}
          vatRate={vatRate}
          selectedWeek={selectedWeek}
          mappingConfig={mappingConfig}
          amountCol={mappingConfig.amount_col}
          loggedTimeHours={loggedTimeHours}
          dailyLoggedHours={dailyLoggedHours}
          reportageOverrides={reportageOverrides}
          showInvestment={isAdmin}
        />
      ) : isLoading ? (
        <div className="flex items-center justify-center py-12">
          <Loader2 className="h-8 w-8 animate-spin text-primary" />
          <span className="ml-3 text-muted-foreground">Week data laden...</span>
        </div>
      ) : (
        <ReportMatrix
          data={data}
          hourlyRate={hourlyRate}
          vatRate={vatRate}
          selectedWeek={selectedWeek}
          amountCol={mappingConfig?.amount_col}
          freqCol={mappingConfig?.freq_col}
          mappingConfig={mappingConfig}
          loggedTimeHours={loggedTimeHours}
          dailyLoggedHours={dailyLoggedHours}
          reportageOverrides={reportageOverrides}
          showInvestment={isAdmin}
        />
      )}
    </div>
  );
}
