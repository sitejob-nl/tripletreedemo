import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

// Parse weekYearValue (e.g., "2026-01") into week and year
const parseWeekYearValue = (value: string): { week: number; year: number } | null => {
  const match = value.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    return { year: parseInt(match[1]), week: parseInt(match[2]) };
  }
  return null;
};

export const useTotalRecordCount = (projectId?: string, weekYearValue?: string | 'all') => {
  return useQuery({
    queryKey: ['call_records_count', projectId, weekYearValue],
    queryFn: async (): Promise<number> => {
      if (!projectId) return 0;

      let query = supabase
        .from('call_records')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId);

      if (weekYearValue !== 'all' && weekYearValue !== undefined) {
        const parsed = parseWeekYearValue(weekYearValue);
        if (parsed) {
          query = query
            .eq('week_number', parsed.week)
            .gte('beldatum_date', `${parsed.year}-01-01`)
            .lte('beldatum_date', `${parsed.year}-12-31`);
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
