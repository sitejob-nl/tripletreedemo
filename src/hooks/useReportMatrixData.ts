import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject, MappingConfig, ProcessedDBCallRecord } from '@/types/database';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { ResolvedDateFilter } from './useDateFilter';

const calculateValuesFromRaw = (
  rawData: Record<string, any> | null,
  resultaat: string | null,
  mappingConfig: MappingConfig
): { annualValue: number; isSale: boolean; isRecurring: boolean } => {
  if (!rawData || !mappingConfig) {
    return { annualValue: 0, isSale: false, isRecurring: false };
  }

  const isSale = mappingConfig.sale_results?.includes(resultaat || '') || false;

  if (!isSale) {
    return { annualValue: 0, isSale: false, isRecurring: false };
  }

  const amountRaw = rawData[mappingConfig.amount_col] 
    || rawData['termijnbedrag'] 
    || rawData['Bedrag'];

  const freqRaw = rawData[mappingConfig.freq_col] 
    || rawData['frequentie'] 
    || rawData['Frequentie'];

  if (!amountRaw) {
    return { annualValue: 0, isSale, isRecurring: false };
  }

  const amount = parseDutchFloat(amountRaw);

  let multiplier = 1;
  let isOneOff = false;

  if (freqRaw) {
    const freqNum = parseInt(String(freqRaw), 10);
    if (!isNaN(freqNum) && freqNum > 0) {
      multiplier = freqNum;
      isOneOff = freqNum === 1;
    } else {
      const freqKey = String(freqRaw).toLowerCase().trim();
      
      let foundMultiplier = 1;
      for (const [mapKey, mapValue] of Object.entries(mappingConfig.freq_map)) {
        if (freqKey.includes(mapKey.toLowerCase())) {
          foundMultiplier = mapValue;
          break;
        }
      }
      multiplier = foundMultiplier;
      isOneOff = freqKey.includes('eenmalig') || freqKey === '1';
    }
  } else if (resultaat) {
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
  project: DBProject | undefined,
  dateFilter?: ResolvedDateFilter
) => {
  return useQuery({
    queryKey: ['report_matrix_data', project?.id, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.weekNumber],
    queryFn: async (): Promise<ProcessedDBCallRecord[]> => {
      if (!project) return [];
      
      // Don't fetch when no filter is active
      if (!dateFilter?.isFiltering || !dateFilter.startDate || !dateFilter.endDate) {
        return [];
      }

      let query = supabase
        .from('call_records')
        .select('*')
        .eq('project_id', project.id)
        .order('beldatum_date', { ascending: false, nullsFirst: false });

      // Apply date filter
      if (dateFilter.filterType === 'week' && dateFilter.weekNumber !== null && dateFilter.year !== null) {
        query = query
          .eq('week_number', dateFilter.weekNumber)
          .gte('beldatum_date', `${dateFilter.year}-01-01`)
          .lte('beldatum_date', `${dateFilter.year}-12-31`);
      } else {
        query = query
          .gte('beldatum_date', dateFilter.startDate)
          .lte('beldatum_date', dateFilter.endDate);
      }

      const { data, error } = await query;

      if (error) {
        throw new Error(`Fout bij ophalen report matrix data: ${error.message}`);
      }

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
    enabled: !!project?.id && !!dateFilter?.isFiltering,
    staleTime: 1000 * 60 * 5,
  });
};
