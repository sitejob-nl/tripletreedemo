import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject } from '@/types/database';
import { ProcessedDBCallRecordWithFreq } from './useCallRecords';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { detectFrequencyFromConfig, FrequencyType } from '@/lib/statsHelpers';

/**
 * Hook that fetches ALL call records for a project (no pagination limit)
 * Used specifically for analysis views that need complete dataset statistics
 * 
 * Uses batch pagination internally to bypass Supabase's 1000 row limit
 */
export const useAllCallRecordsForAnalysis = (
  project: DBProject | undefined,
  weekYearValue: string | 'all'
) => {
  return useQuery({
    queryKey: ['all_call_records_analysis', project?.id, weekYearValue],
    queryFn: async (): Promise<ProcessedDBCallRecordWithFreq[]> => {
      if (!project) return [];

      const allRecords: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      // Parse week filter once
      let weekFilter: { week: number; year: number } | null = null;
      if (weekYearValue !== 'all') {
        const match = weekYearValue.match(/^(\d{4})-(\d{1,2})$/);
        if (match) {
          weekFilter = {
            year: parseInt(match[1]),
            week: parseInt(match[2]),
          };
        }
      }

      // Fetch all records in batches
      while (hasMore) {
        let query = supabase
          .from('call_records')
          .select('*')
          .eq('project_id', project.id)
          .order('beldatum_date', { ascending: false, nullsFirst: false })
          .range(offset, offset + batchSize - 1);

        // Apply week filter if specified
        if (weekFilter) {
          query = query
            .eq('week_number', weekFilter.week)
            .gte('beldatum_date', `${weekFilter.year}-01-01`)
            .lte('beldatum_date', `${weekFilter.year}-12-31`);
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Fout bij ophalen analyse records: ${error.message}`);
        }

        if (data && data.length > 0) {
          allRecords.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      console.log(`[useAllCallRecordsForAnalysis] Fetched ${allRecords.length} records for project ${project.name}, week=${weekYearValue}`);

      // Process all records with mapping config
      return allRecords.map((record) => {
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
    staleTime: 5 * 60 * 1000, // 5 min cache - analysis data doesn't change often
    gcTime: 10 * 60 * 1000, // Keep in cache for 10 min
  });
};

// Helper functions (duplicated from useCallRecords to keep this module self-contained)
const calculateValuesFromRaw = (
  rawData: Record<string, any> | null,
  resultaat: string | null,
  mappingConfig: any
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

  const isSale = mappingConfig.sale_results?.includes(resultaat || '') || false;

  const freqRaw = rawData['frequency'] 
    || rawData[mappingConfig.freq_col] 
    || rawData['frequentie'] 
    || rawData['Frequentie'];

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
  if (beldatumDate) {
    const date = new Date(beldatumDate);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('nl-NL', { weekday: 'long' });
    }
  }
  
  if (beldatum) {
    const match = beldatum.match(/^(\d{1,2})-(\d{1,2})-(\d{4})/);
    if (match) {
      const [, day, month, year] = match;
      const date = new Date(parseInt(year), parseInt(month) - 1, parseInt(day));
      if (!isNaN(date.getTime())) {
        return date.toLocaleDateString('nl-NL', { weekday: 'long' });
      }
    }
    const date = new Date(beldatum);
    if (!isNaN(date.getTime())) {
      return date.toLocaleDateString('nl-NL', { weekday: 'long' });
    }
  }
  
  return '';
};

