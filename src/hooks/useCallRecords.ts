import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProjectBase, ProcessedDBCallRecord } from '@/types/database';
import { FrequencyType } from '@/lib/statsHelpers';
import { calculateValuesFromRaw, getDayName } from '@/lib/recordValue';
import { ResolvedDateFilter, applyMaxDate } from './useDateFilter';

interface UseCallRecordsOptions {
  projectId?: string;
  dateFilter?: ResolvedDateFilter;
  page?: number;
  pageSize?: number;
}

// Extended type with frequency_type for Fase 2
export interface ProcessedDBCallRecordWithFreq extends ProcessedDBCallRecord {
  frequency_type: FrequencyType;
  frequency_multiplier: number;
  frequency_matched_key: string | null;
}

export const useCallRecords = (
  project: DBProjectBase | undefined,
  options: UseCallRecordsOptions = {}
) => {
  const { dateFilter, page = 1, pageSize = 100 } = options;

  return useQuery({
    queryKey: ['call_records', project?.id, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.weekNumber, dateFilter?.maxDate, page, pageSize],
    queryFn: async (): Promise<ProcessedDBCallRecordWithFreq[]> => {
      if (!project) return [];

      const from = (page - 1) * pageSize;
      const to = from + pageSize - 1;

      let query = supabase
        .from('call_records')
        .select('*')
        .eq('project_id', project.id)
        .order('beldatum_date', { ascending: false, nullsFirst: false })
        .range(from, to);

      // Apply date filter
      if (dateFilter?.isFiltering && dateFilter.startDate && dateFilter.endDate) {
        if (dateFilter.filterType === 'week' && dateFilter.weekNumber !== null) {
          query = query
            .eq('week_number', dateFilter.weekNumber)
            .gte('beldatum_date', dateFilter.startDate)
            .lte('beldatum_date', dateFilter.endDate);
        } else {
          // Date range: direct date comparison
          query = query
            .gte('beldatum_date', dateFilter.startDate)
            .lte('beldatum_date', dateFilter.endDate);
        }
      }

      // Embargo upper bound (admin view-as-client preview only; no-op otherwise).
      query = applyMaxDate(query, dateFilter?.maxDate);

      const { data, error } = await query;

      if (error) {
        throw new Error(`Fout bij ophalen call records: ${error.message}`);
      }

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
        .rpc('get_available_weeks', { p_project_id: projectId });

      if (error) {
        console.error('[useAvailableWeeks] RPC error:', error.message);
        throw new Error(`Fout bij ophalen weeks: ${error.message}`);
      }

      const result: WeekYear[] = (data || []).map((row: { week_number: number; iso_year: number; value: string }) => ({
        week: row.week_number,
        year: row.iso_year,
        label: `Week ${row.week_number} (${row.iso_year})`,
        value: row.value,
      }));

      return result;
    },
    enabled: !!projectId,
  });
};
