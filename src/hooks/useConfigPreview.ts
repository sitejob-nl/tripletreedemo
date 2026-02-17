import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MappingConfig } from '@/types/database';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { detectFrequencyFromConfig, FrequencyDetectionResult } from '@/lib/statsHelpers';

export interface ConfigPreviewRecord {
  recordId: number;
  resultaat: string;
  amountRaw: string | number | null;
  freqRaw: string | number | null;
  matchedKey: string | null;
  multiplier: number;
  frequencyType: string;
  annualValue: number;
  isSale: boolean;
  isRecurring: boolean;
}

interface UseConfigPreviewOptions {
  projectId: string;
  mappingConfig: MappingConfig;
  sampleSize?: number;
}

/**
 * Hook to preview how the current mapping config processes sample records
 * Shows the first N sales records with calculated values
 */
export const useConfigPreview = ({
  projectId,
  mappingConfig,
  sampleSize = 5,
}: UseConfigPreviewOptions) => {
  return useQuery({
    queryKey: ['config_preview', projectId, mappingConfig, sampleSize],
    queryFn: async (): Promise<ConfigPreviewRecord[]> => {
      if (!projectId) return [];

      // Fetch recent records that match sale_results
      const saleResults = mappingConfig.sale_results || [];
      
      let query = supabase
        .from('call_records')
        .select('basicall_record_id, resultaat, raw_data')
        .eq('project_id', projectId)
        .order('synced_at', { ascending: false })
        .limit(100); // Fetch more to find sales

      const { data, error } = await query;

      if (error) {
        throw new Error(`Fout bij ophalen preview records: ${error.message}`);
      }

      // Filter for sales and process
      const salesRecords = (data || [])
        .filter(record => saleResults.includes(record.resultaat || ''))
        .slice(0, sampleSize);

      return salesRecords.map((record): ConfigPreviewRecord => {
        const rawData = record.raw_data as Record<string, any> | null;
        const isSale = saleResults.includes(record.resultaat || '');

        // Get raw values - use normalized names first, then fallback
        const amountRaw = rawData?.['amount']
          || rawData?.[mappingConfig.amount_col] 
          || rawData?.['termijnbedrag'] 
          || rawData?.['Bedrag']
          || null;
        
        const freqRaw = rawData?.['frequency']
          || rawData?.[mappingConfig.freq_col]
          || rawData?.['frequentie']
          || rawData?.['Frequentie']
          || null;

        // Detect frequency using centralized function
        const freqResult: FrequencyDetectionResult = detectFrequencyFromConfig(
          freqRaw,
          mappingConfig.freq_map,
          record.resultaat
        );

        // Calculate annual value
        const amount = amountRaw ? parseDutchFloat(amountRaw) : 0;
        const annualValue = isSale ? amount * freqResult.multiplier : 0;

        return {
          recordId: record.basicall_record_id,
          resultaat: record.resultaat || '',
          amountRaw,
          freqRaw,
          matchedKey: freqResult.matchedKey,
          multiplier: freqResult.multiplier,
          frequencyType: freqResult.type,
          annualValue,
          isSale,
          isRecurring: !freqResult.isOneOff,
        };
      });
    },
    enabled: !!projectId && (mappingConfig.sale_results?.length || 0) > 0,
    staleTime: 30000, // Cache for 30 seconds
  });
};
