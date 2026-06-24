import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface ResultCount {
  resultaat: string;
  cnt: number;
}

/**
 * Aantal records per resultaat-code voor een project (GROUP BY in de DB).
 * Voedt de live "categorie-dekking" in de mapping-configurator zodat de admin
 * ziet welk volume in elke categorie valt en welke codes nog niet zijn ingedeeld.
 */
export const useResultDistribution = (projectId?: string) =>
  useQuery({
    queryKey: ['result_distribution', projectId],
    queryFn: async (): Promise<ResultCount[]> => {
      if (!projectId) return [];
      const { data, error } = await supabase.rpc('get_project_result_distribution', {
        p_project_id: projectId,
      });
      if (error) throw new Error(error.message);
      return (data || []).map((r: { resultaat: string; cnt: number }) => ({
        resultaat: r.resultaat,
        cnt: Number(r.cnt),
      }));
    },
    enabled: !!projectId,
    staleTime: 60_000,
  });
