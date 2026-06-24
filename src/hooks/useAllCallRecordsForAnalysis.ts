import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProjectBase } from '@/types/database';
import { ProcessedDBCallRecordWithFreq } from './useCallRecords';
import { calculateValuesFromRaw, getDayName } from '@/lib/recordValue';
import { ResolvedDateFilter } from './useDateFilter';

/**
 * Hook that fetches ALL call records for a project (no pagination limit)
 * Used specifically for analysis views that need complete dataset statistics
 */
export const useAllCallRecordsForAnalysis = (
  project: DBProjectBase | undefined,
  dateFilter?: ResolvedDateFilter
) => {
  return useQuery({
    queryKey: ['all_call_records_analysis', project?.id, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.weekNumber],
    queryFn: async (): Promise<ProcessedDBCallRecordWithFreq[]> => {
      if (!project) return [];

      const allRecords: any[] = [];
      let offset = 0;
      const batchSize = 1000;
      let hasMore = true;

      // Fetch all records in batches
      while (hasMore) {
        let query = supabase
          .from('call_records')
          .select('*')
          .eq('project_id', project.id)
          .order('beldatum_date', { ascending: false, nullsFirst: false })
          .range(offset, offset + batchSize - 1);

        // Apply date filter
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
    staleTime: 5 * 60 * 1000,
    gcTime: 10 * 60 * 1000,
  });
};
