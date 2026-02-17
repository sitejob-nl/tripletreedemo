import { FileSpreadsheet, Loader2 } from 'lucide-react';
import { ReportMatrix } from './ReportMatrix';
import { InboundReportMatrix } from './InboundReportMatrix';
import { ServiceReportMatrix } from './ServiceReportMatrix';
import { ProcessedCallRecord } from '@/types/dashboard';
import { MappingConfig, ProjectType } from '@/types/database';
import { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';

interface ReportViewSectionProps {
  projectType: ProjectType;
  selectedWeek: string | number;
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate: number;
  mappingConfig?: MappingConfig;
  loggedTimeHours?: number;
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
  isLoading: boolean;
  onExportToExcel: () => void;
}

export function ReportViewSection({
  projectType,
  selectedWeek,
  data,
  hourlyRate,
  vatRate,
  mappingConfig,
  loggedTimeHours,
  dailyLoggedHours,
  isLoading,
  onExportToExcel,
}: ReportViewSectionProps) {
  const isInboundProject = projectType === 'inbound';
  const isServiceProject = projectType === 'inbound_service';
  
  const getTitle = () => {
    if (isServiceProject) return selectedWeek === 'all' ? 'Klantenservice Overzicht' : `Klantenservice Week ${selectedWeek}`;
    if (isInboundProject) return selectedWeek === 'all' ? 'Retentie Overzicht' : `Retentie Week ${selectedWeek}`;
    return selectedWeek === 'all' ? 'Totaaloverzicht' : `Weekoverzicht - Week ${selectedWeek}`;
  };

  return (
    <div>
      <div className="flex justify-between items-end mb-4">
        <h3 className="font-bold text-foreground text-lg">
          {getTitle()}
        </h3>
        <button 
          onClick={onExportToExcel}
          className="text-primary text-sm font-medium hover:underline flex items-center gap-1"
        >
          <FileSpreadsheet size={16} /> Exporteer naar Excel
        </button>
      </div>
      
      {isServiceProject && mappingConfig ? (
        <ServiceReportMatrix
          data={data}
          hourlyRate={hourlyRate}
          vatRate={vatRate}
          selectedWeek={selectedWeek}
          mappingConfig={mappingConfig}
          loggedTimeHours={loggedTimeHours}
          dailyLoggedHours={dailyLoggedHours}
        />
      ) : isInboundProject && mappingConfig ? (
        <InboundReportMatrix
          data={data}
          hourlyRate={hourlyRate}
          vatRate={vatRate}
          selectedWeek={selectedWeek}
          mappingConfig={mappingConfig}
          amountCol={mappingConfig.amount_col}
        />
      ) : selectedWeek === 'all' ? (
        <div className="bg-muted/50 border border-border rounded-lg p-6 text-center">
          <p className="text-muted-foreground">
            Selecteer een specifieke week om het gedetailleerde weekoverzicht te zien.
          </p>
        </div>
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
        />
      )}
    </div>
  );
}
