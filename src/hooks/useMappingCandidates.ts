import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { MappingCandidates } from '@/lib/mappingTrust';
import { friendlyError } from '@/lib/friendlyError';

const EMPTY_CANDIDATES: MappingCandidates = { fields: [], results: [], frequency_values: [] };

export const useMappingCandidates = (projectId?: string) => useQuery({
  queryKey: ['project-mapping-candidates', projectId],
  queryFn: async (): Promise<MappingCandidates> => {
    if (!projectId) return EMPTY_CANDIDATES;
    const { data, error } = await supabase.rpc('get_project_mapping_candidates', {
      p_project_id: projectId,
    });
    if (error) throw new Error(friendlyError(error, 'De mappingvoorstellen konden niet geladen worden. Herlaad de pagina en probeer het opnieuw.'));
    const value = data as unknown;
    if (!value || typeof value !== 'object' || Array.isArray(value)) return EMPTY_CANDIDATES;
    const row = value as Partial<MappingCandidates>;
    return {
      fields: Array.isArray(row.fields) ? row.fields : [],
      results: Array.isArray(row.results) ? row.results : [],
      frequency_values: Array.isArray(row.frequency_values) ? row.frequency_values : [],
    };
  },
  enabled: !!projectId,
  staleTime: 60_000,
});

