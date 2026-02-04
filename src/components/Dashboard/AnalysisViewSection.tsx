import { Loader2, GitCompare, MapPin, Phone, PieChart } from 'lucide-react';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { WeekComparison } from './WeekComparison';
import { GeographicAnalysis } from './GeographicAnalysis';
import { CallAttemptsAnalysis } from './CallAttemptsAnalysis';
import { ResultsBreakdown } from './ResultsBreakdown';
import { ProcessedCallRecord } from '@/types/dashboard';
import { MappingConfig } from '@/types/database';
import { WeekYear } from '@/hooks/useCallRecords';

interface AnalysisViewSectionProps {
  data: ProcessedCallRecord[];
  isLoading: boolean;
  hourlyRate: number;
  availableWeeks: WeekYear[];
  mappingConfig?: MappingConfig;
}

export function AnalysisViewSection({
  data,
  isLoading,
  hourlyRate,
  availableWeeks,
  mappingConfig,
}: AnalysisViewSectionProps) {
  return (
    <div className="space-y-4 sm:space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <h3 className="font-bold text-foreground text-base sm:text-lg">Geavanceerde Analyse</h3>
        {isLoading && (
          <span className="text-xs sm:text-sm text-muted-foreground flex items-center gap-2">
            <Loader2 className="h-4 w-4 animate-spin" />
            Volledige dataset laden...
          </span>
        )}
        {!isLoading && data.length > 0 && (
          <span className="text-xs sm:text-sm text-muted-foreground">
            {data.length.toLocaleString()} records
          </span>
        )}
      </div>
      
      <Tabs defaultValue="comparison" className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4 mb-4 sm:mb-6 h-auto gap-1">
          <TabsTrigger value="comparison" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm py-2 px-2 sm:px-3">
            <GitCompare className="w-4 h-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Weekvergelijking</span>
            <span className="xs:hidden">Weken</span>
          </TabsTrigger>
          <TabsTrigger value="geographic" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm py-2 px-2 sm:px-3">
            <MapPin className="w-4 h-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Geografisch</span>
            <span className="xs:hidden">Geo</span>
          </TabsTrigger>
          <TabsTrigger value="attempts" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm py-2 px-2 sm:px-3">
            <Phone className="w-4 h-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Belpogingen</span>
            <span className="xs:hidden">Calls</span>
          </TabsTrigger>
          <TabsTrigger value="results" className="flex items-center justify-center gap-1.5 text-xs sm:text-sm py-2 px-2 sm:px-3">
            <PieChart className="w-4 h-4 shrink-0" />
            <span className="hidden xs:inline sm:inline">Resultaten</span>
            <span className="xs:hidden">Stats</span>
          </TabsTrigger>
        </TabsList>
        
        <TabsContent value="comparison" className="mt-0">
          <WeekComparison 
            data={data} 
            hourlyRate={hourlyRate} 
            availableWeeks={availableWeeks} 
            amountCol={mappingConfig?.amount_col}
          />
        </TabsContent>
        
        <TabsContent value="geographic" className="mt-0">
          <GeographicAnalysis data={data} locationCol={mappingConfig?.location_col} />
        </TabsContent>
        
        <TabsContent value="attempts" className="mt-0">
          <CallAttemptsAnalysis data={data} />
        </TabsContent>
        
        <TabsContent value="results" className="mt-0">
          <ResultsBreakdown data={data} />
        </TabsContent>
      </Tabs>
    </div>
  );
}
