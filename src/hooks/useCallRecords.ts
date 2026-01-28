import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject, MappingConfig, ProcessedDBCallRecord } from '@/types/database';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { detectFrequencyFromConfig, FrequencyType } from '@/lib/statsHelpers';

interface UseCallRecordsOptions {
  projectId?: string;
  weekYearValue?: string | 'all'; // e.g., "2026-01" or "all"
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
  const { weekYearValue = 'all', page = 1, pageSize = 100 } = options;

  return useQuery({
    queryKey: ['call_records', project?.id, weekYearValue, page, pageSize],
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

      // Parse weekYearValue (e.g., "2026-01") to filter by week and year
      if (weekYearValue !== 'all') {
        const match = weekYearValue.match(/^(\d{4})-(\d{1,2})$/);
        if (match) {
          const year = parseInt(match[1]);
          const week = parseInt(match[2]);
          
          // Filter by week_number and year (using beldatum_date)
          // We need to filter where the year of beldatum_date matches
          query = query
            .eq('week_number', week)
            .gte('beldatum_date', `${year}-01-01`)
            .lte('beldatum_date', `${year}-12-31`);
        }
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

// Week with year context
export interface WeekYear {
  week: number;
  year: number;
  label: string; // "Week 1 (2026)"
  value: string; // "2026-01" for unique identification
}

// Hook to get available weeks for a project (with year context)
export const useAvailableWeeks = (projectId?: string) => {
  return useQuery({
    queryKey: ['available_weeks', projectId],
    queryFn: async (): Promise<WeekYear[]> => {
      if (!projectId) return [];

      const { data, error } = await supabase
        .from('call_records')
        .select('week_number, beldatum_date')
        .eq('project_id', projectId)
        .not('week_number', 'is', null)
        .not('beldatum_date', 'is', null)
        // CRITICAL: Supabase/PostgREST has a default 1000 row limit.
        // If a project has >1000 records, we must order by most recent and
        // explicitly request a larger range so the latest weeks are included.
        .order('beldatum_date', { ascending: false, nullsFirst: false })
        .range(0, 4999);

      if (error) {
        throw new Error(`Fout bij ophalen weeks: ${error.message}`);
      }

      // Extract unique week-year combinations
      const weekYearMap = new Map<string, WeekYear>();
      
      (data || []).forEach((d) => {
        if (!d.beldatum_date || d.week_number === null) return;
        
        const date = new Date(d.beldatum_date);
        const year = date.getFullYear();
        const week = d.week_number as number;
        const key = `${year}-${String(week).padStart(2, '0')}`;
        
        if (!weekYearMap.has(key)) {
          weekYearMap.set(key, {
            week,
            year,
            label: `Week ${week} (${year})`,
            value: key,
          });
        }
      });

      // Sort by year desc, then week desc (most recent first)
      return Array.from(weekYearMap.values()).sort((a, b) => {
        if (a.year !== b.year) return b.year - a.year;
        return b.week - a.week;
      });
    },
    enabled: !!projectId,
  });
};
