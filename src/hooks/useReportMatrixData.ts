import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject, MappingConfig, ProcessedDBCallRecord } from '@/types/database';
import { parseDutchFloat } from '@/lib/dataProcessing';

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
      multiplier = freqNum;
      isOneOff = freqNum === 1;
    } else {
      const freqKey = String(freqRaw).toLowerCase().trim();
      
      // Substring matching voor freq_map keys
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

/**
 * Hook to fetch ALL call records for a specific week (without pagination)
 * This is specifically for the ReportMatrix component that needs complete data for aggregation.
 * 
 * For "all" weeks, this returns an empty array as fetching 60k+ records would be too slow.
 * Users should select a specific week for the detailed report view.
 */
export const useReportMatrixData = (
  project: DBProject | undefined,
  weekNumber: number | 'all'
) => {
  return useQuery({
    queryKey: ['report_matrix_data', project?.id, weekNumber],
    queryFn: async (): Promise<ProcessedDBCallRecord[]> => {
      if (!project) return [];
      
      // Don't fetch all records when 'all' is selected - too many records
      if (weekNumber === 'all') {
        return [];
      }

      // Fetch ALL records for the specific week (no pagination)
      const { data, error } = await supabase
        .from('call_records')
        .select('*')
        .eq('project_id', project.id)
        .eq('week_number', weekNumber)
        .order('beldatum_date', { ascending: false, nullsFirst: false });

      if (error) {
        throw new Error(`Fout bij ophalen report matrix data: ${error.message}`);
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
    enabled: !!project?.id && weekNumber !== 'all',
    staleTime: 1000 * 60 * 5, // Cache for 5 minutes
  });
};
