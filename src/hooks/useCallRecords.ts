import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject, MappingConfig, ProcessedDBCallRecord } from '@/types/database';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { detectFrequencyFromConfig, FrequencyType } from '@/lib/statsHelpers';

interface UseCallRecordsOptions {
  projectId?: string;
  weekNumber?: number | 'all';
  page?: number;
  pageSize?: number;
}

// Extended type with frequency_type for Fase 2
export interface ProcessedDBCallRecordWithFreq extends ProcessedDBCallRecord {
  frequency_type: FrequencyType;
  frequency_multiplier: number;
  frequency_matched_key: string | null;
}

const calculateValuesFromRaw = (
  rawData: Record<string, any> | null,
  resultaat: string | null,
  mappingConfig: MappingConfig
): { 
  annualValue: number; 
  isSale: boolean; 
  isRecurring: boolean; 
  frequencyType: FrequencyType;
  frequencyMultiplier: number;
  frequencyMatchedKey: string | null;
} => {
  const defaultResult = { 
    annualValue: 0, 
    isSale: false, 
    isRecurring: false,
    frequencyType: 'oneoff' as FrequencyType,
    frequencyMultiplier: 1,
    frequencyMatchedKey: null as string | null,
  };

  if (!rawData || !mappingConfig) {
    return defaultResult;
  }

  // Check if it's a sale
  const isSale = mappingConfig.sale_results?.includes(resultaat || '') || false;

  // Use normalized field names first, then fallback to config col, then legacy names
  // After sync normalization, 'frequency' and 'amount' should be standard
  const freqRaw = rawData['frequency'] 
    || rawData[mappingConfig.freq_col] 
    || rawData['frequentie'] 
    || rawData['Frequentie'];

  // Use centralized frequency detection
  const freqResult = detectFrequencyFromConfig(freqRaw, mappingConfig.freq_map);

  if (!isSale) {
    return {
      ...defaultResult,
      isSale: false,
      frequencyType: freqResult.type,
      frequencyMultiplier: freqResult.multiplier,
      frequencyMatchedKey: freqResult.matchedKey,
    };
  }

  // Use normalized field names first, then fallback to config col, then legacy names
  const amountRaw = rawData['amount'] 
    || rawData[mappingConfig.amount_col] 
    || rawData['termijnbedrag'] 
    || rawData['Bedrag'];

  if (!amountRaw) {
    return {
      annualValue: 0, 
      isSale, 
      isRecurring: !freqResult.isOneOff,
      frequencyType: freqResult.type,
      frequencyMultiplier: freqResult.multiplier,
      frequencyMatchedKey: freqResult.matchedKey,
    };
  }

  const amount = parseDutchFloat(amountRaw);

  return {
    annualValue: amount * freqResult.multiplier,
    isSale,
    isRecurring: !freqResult.isOneOff,
    frequencyType: freqResult.type,
    frequencyMultiplier: freqResult.multiplier,
    frequencyMatchedKey: freqResult.matchedKey,
  };
};

const getDayName = (beldatumDate: string | null, beldatum: string | null): string => {
  // Prioritize beldatum_date (ISO format YYYY-MM-DD) 
  if (beldatumDate) {
    const date = new Date(beldatumDate);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('nl-NL', { weekday: 'long' });
    }
  }
  
  // Fallback: parse beldatum (DD-MM-YYYY format) manually
  if (beldatum) {
    const match = beldatum.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('nl-NL', { weekday: 'long' });
      }
    }
    // Last resort: try direct parsing (for ISO format in beldatum)
    const date = new Date(beldatum);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('nl-NL', { weekday: 'long' });
    }
  }
  
  return '';
};

export const useCallRecords = (
  project: DBProject | undefined,
  options: UseCallRecordsOptions = {}
) => {
  const { weekNumber = 'all', page = 1, pageSize = 100 } = options;

  return useQuery({
    queryKey: ['call_records', project?.id, weekNumber, page, pageSize],
    queryFn: async (): Promise<ProcessedDBCallRecordWithFreq[]> => {
      if (!project) return [];

      // Calculate range for server-side pagination
      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('call_records')
        .select('*')
        .eq('project_id', project.id)
        .order('beldatum_date', { ascending: false, nullsFirst: false })
        .range(from, to);

      if (weekNumber !== 'all') {
        query = query.eq('week_number', weekNumber);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Fout bij ophalen call records: ${error.message}`);
      }

      // Process each record with mapping config
      return (data || []).map((record): ProcessedDBCallRecordWithFreq => {
        const calculated = calculateValuesFromRaw(
          record.raw_data as Record<string, any> | null,
          record.resultaat,
          project.mapping_config
        );

        return {
          ...record,
          raw_data: record.raw_data as Record<string, any> | null,
          annual_value: calculated.annualValue,
          is_sale: calculated.isSale,
          is_recurring: calculated.isRecurring,
          day_name: getDayName(record.beldatum_date, record.beldatum),
          frequency_type: calculated.frequencyType,
          frequency_multiplier: calculated.frequencyMultiplier,
          frequency_matched_key: calculated.frequencyMatchedKey,
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
      return Array.from(weeks).sort((a, b) => b - a); // Sort descending (most recent week first)
    },
    enabled: !!projectId,
  });
};
