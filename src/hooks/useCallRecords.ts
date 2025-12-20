import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBCallRecord, DBProject, MappingConfig, ProcessedDBCallRecord } from '@/types/database';
import { parseDutchFloat } from '@/lib/dataProcessing';

interface UseCallRecordsOptions {
  projectId?: string;
  weekNumber?: number | 'all';
}

const calculateValuesFromRaw = (
  rawData: Record<string, any> | null,
  resultaat: string | null,
  mappingConfig: MappingConfig
): { annualValue: number; isSale: boolean; isRecurring: boolean } => {
  if (!rawData || !mappingConfig) {
    return { annualValue: 0, isSale: false, isRecurring: false };
  }

  // Check if it's a sale
  const isSale = mappingConfig.sale_results?.includes(resultaat || '') || false;

  if (!isSale) {
    return { annualValue: 0, isSale: false, isRecurring: false };
  }

  // Get amount and frequency from raw_data using mapping
  const amountRaw = rawData[mappingConfig.amount_col];
  const freqRaw = rawData[mappingConfig.freq_col];

  if (!amountRaw || !freqRaw) {
    return { annualValue: 0, isSale, isRecurring: false };
  }

  const amount = parseDutchFloat(amountRaw);
  const freqKey = String(freqRaw).toLowerCase().trim();
  const multiplier = mappingConfig.freq_map[freqKey] || 1;

  const isOneOff = freqKey.includes('eenmalig') || freqKey === '1';

  return {
    annualValue: amount * multiplier,
    isSale,
    isRecurring: !isOneOff,
  };
};

const getDayName = (dateStr: string | null): string => {
  if (!dateStr) return '';
  const date = new Date(dateStr);
  return date.toLocaleDateString('nl-NL', { weekday: 'long' });
};

export const useCallRecords = (
  project: DBProject | undefined,
  options: UseCallRecordsOptions = {}
) => {
  const { weekNumber = 'all' } = options;

  return useQuery({
    queryKey: ['call_records', project?.id, weekNumber],
    queryFn: async (): Promise<ProcessedDBCallRecord[]> => {
      if (!project) return [];

      let query = supabase
        .from('call_records')
        .select('*')
        .eq('project_id', project.id)
        .order('beldatum', { ascending: false });

      if (weekNumber !== 'all') {
        query = query.eq('week_number', weekNumber);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Fout bij ophalen call records: ${error.message}`);
      }

      // Process each record with mapping config
      return (data || []).map((record): ProcessedDBCallRecord => {
        const { annualValue, isSale, isRecurring } = calculateValuesFromRaw(
          record.raw_data as Record<string, any> | null,
          record.resultaat,
          project.mapping_config
        );

        return {
          ...record,
          raw_data: record.raw_data as Record<string, any> | null,
          annual_value: annualValue,
          is_sale: isSale,
          is_recurring: isRecurring,
          day_name: getDayName(record.beldatum),
        };
      });
    },
    enabled: !!project?.id,
  });
};

// Hook to get available weeks for a project
export const useAvailableWeeks = (projectId?: string) => {
  return useQuery({
    queryKey: ['available_weeks', projectId],
    queryFn: async (): Promise<number[]> => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from('call_records')
        .select('week_number')
        .eq('project_id', projectId)
        .not('week_number', 'is', null);

      if (error) {
        throw new Error(`Fout bij ophalen weeks: ${error.message}`);
      }

      const weeks = new Set(data?.map((d) => d.week_number as number) || []);
      return Array.from(weeks).sort((a, b) => a - b);
    },
    enabled: !!projectId,
  });
};
