import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBCallRecord, DBProject, MappingConfig, ProcessedDBCallRecord } from '@/types/database';
import { parseDutchFloat } from '@/lib/dataProcessing';

interface UseCallRecordsOptions {
  projectId?: string;
  weekNumber?: number | 'all';
  page?: number;
  pageSize?: number;
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

  // Try multiple field names for amount
  const amountRaw = rawData[mappingConfig.amount_col] 
    || rawData['termijnbedrag'] 
    || rawData['Bedrag'];

  // Try multiple field names for frequency
  const freqRaw = rawData[mappingConfig.freq_col] 
    || rawData['frequentie'] 
    || rawData['Frequentie'];

  if (!amountRaw) {
    return { annualValue: 0, isSale, isRecurring: false };
  }

  const amount = parseDutchFloat(amountRaw);

  // Determine multiplier from frequency or resultaat
  let multiplier = 1;
  let isOneOff = false;

  if (freqRaw) {
    const freqNum = parseInt(String(freqRaw), 10);
    if (!isNaN(freqNum) && freqNum > 0) {
      // Frequency is already a number (e.g., 12, 1, 4)
      multiplier = freqNum;
      isOneOff = freqNum === 1;
    } else {
      // Frequency is text (e.g., "maandelijks")
      const freqKey = String(freqRaw).toLowerCase().trim();
      multiplier = mappingConfig.freq_map[freqKey] || 1;
      isOneOff = freqKey.includes('eenmalig') || freqKey === '1';
    }
  } else if (resultaat) {
    // Fallback: derive frequency from resultaat name
    const resultLower = resultaat.toLowerCase();
    if (resultLower.includes('maand')) {
      multiplier = 12;
    } else if (resultLower.includes('kwartaal')) {
      multiplier = 4;
    } else if (resultLower.includes('jaar')) {
      multiplier = 1;
    }
    isOneOff = resultLower.includes('eenmalig');
  }

  return {
    annualValue: amount * multiplier,
    isSale,
    isRecurring: !isOneOff,
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
    queryFn: async (): Promise<ProcessedDBCallRecord[]> => {
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
          day_name: getDayName(record.beldatum_date, record.beldatum),
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
