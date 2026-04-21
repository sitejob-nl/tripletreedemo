import { ReportMatrix } from '../ReportMatrix';
import { StockHeader } from './StockHeader';
import { ProcessedCallRecord } from '@/types/dashboard';
import { MappingConfig } from '@/types/database';
import { DailyLoggedTimeBreakdown } from '@/hooks/useLoggedTime';

interface OutboundStandardMatrixProps {
  projectId: string;
  data: ProcessedCallRecord[];
  hourlyRate: number;
  vatRate?: number;
  selectedWeek: string | number;
  mappingConfig?: MappingConfig;
  loggedTimeHours?: number;
  dailyLoggedHours?: DailyLoggedTimeBreakdown;
}

// Variant 1 of the historical rapportages (17/24 legacy files: STC, Proefdiervrij,
// Hersenstichting storno, Trombose, Cliniclowns, etc.). Wraps the existing
// ReportMatrix with a voorraad-header — most metrics from the legacy Excel
// already exist in ReportMatrix (Score per uur, Terugverdientijd, frequency
// breakdown, etc.); the missing piece in the UI is the voorraad-summary.
// The Excel-export for this template (Totaal + 52 weektabs) lives in its own
// builder and is invoked through useExcelExport when report_template is set.
export function OutboundStandardMatrix({
  projectId,
  data,
  hourlyRate,
  vatRate,
  selectedWeek,
  mappingConfig,
  loggedTimeHours,
  dailyLoggedHours,
}: OutboundStandardMatrixProps) {
  return (
    <>
      <StockHeader projectId={projectId} />
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
    </>
  );
}
