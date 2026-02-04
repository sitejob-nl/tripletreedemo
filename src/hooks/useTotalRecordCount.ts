import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { ResolvedDateFilter } from './useDateFilter';

export const useTotalRecordCount = (projectId?: string, dateFilter?: ResolvedDateFilter) => {
  return useQuery({
    queryKey: ['total_record_count', projectId, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.weekNumber],
    queryFn: async (): Promise<number> => {
      if (!projectId) return 0;

      let query = supabase
        .from('call_records')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);

      // Apply date filter
      if (dateFilter?.isFiltering && dateFilter.startDate && dateFilter.endDate) {
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
      }

      const { count, error } = await query;

      if (error) {
        throw new Error(`Fout bij ophalen record count: ${error.message}`);
      }

      return count || 0;
    },
    enabled: !!projectId,
  });
};
