import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProjectBase } from '@/types/database';
import { ProcessedDBCallRecordWithFreq } from './useCallRecords';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { detectFrequencyFromConfig, FrequencyType } from '@/lib/statsHelpers';
import { ResolvedDateFilter } from './useDateFilter';

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

/**
 * Hook to fetch ALL call records for a specific date range (without pagination)
 * This is specifically for the ReportMatrix component that needs complete data for aggregation.
 */
export const useReportMatrixData = (
  project: DBProjectBase | undefined,
  dateFilter?: ResolvedDateFilter
) => {
  return useQuery({
    queryKey: ['report_matrix_data', project?.id, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.weekNumber],
    queryFn: async (): Promise<ProcessedDBCallRecordWithFreq[]> => {
      if (!project) return [];

      // PostgREST caps unpaginated SELECTs at 1000 rows. A single week can exceed
      // that (STC giftgevers week 17: 1714 records), so we page through in chunks.
      const allRecords: any[] = [];
      const batchSize = 1000;
      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        let query = supabase
          .from('call_records')
          .select('*')
          .eq('project_id', project.id)
          .order('beldatum_date', { ascending: false, nullsFirst: false })
          .range(offset, offset + batchSize - 1);

        if (dateFilter?.isFiltering && dateFilter.startDate && dateFilter.endDate) {
          if (dateFilter.filterType === 'week' && dateFilter.weekNumber !== null) {
            query = query
              .eq('week_number', dateFilter.weekNumber)
              .gte('beldatum_date', dateFilter.startDate)
              .lte('beldatum_date', dateFilter.endDate);
          } else {
            query = query
              .gte('beldatum_date', dateFilter.startDate)
              .lte('beldatum_date', dateFilter.endDate);
          }
        }

        const { data, error } = await query;

        if (error) {
          throw new Error(`Fout bij ophalen report matrix data: ${error.message}`);
        }

        if (data && data.length > 0) {
          allRecords.push(...data);
          offset += batchSize;
          hasMore = data.length === batchSize;
        } else {
          hasMore = false;
        }
      }

      return allRecords.map((record): ProcessedDBCallRecordWithFreq => {
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
    staleTime: 1000 * 60 * 5,
  });
};
