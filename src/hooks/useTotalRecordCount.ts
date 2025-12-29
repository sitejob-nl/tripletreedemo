import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useTotalRecordCount = (projectId?: string, weekNumber?: number | 'all') => {
  return useQuery({
    queryKey: ['call_records_count', projectId, weekNumber],
    queryFn: async (): Promise<number> => {
      if (!projectId) return 0;

      let query = supabase
        .from('call_records')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);

      if (weekNumber !== 'all' && weekNumber !== undefined) {
        query = query.eq('week_number', weekNumber);
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
