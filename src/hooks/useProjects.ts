import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject, MappingConfig } from '@/types/database';

export const useProjects = (onlyActive = true) => {
  const query = useQuery({
    queryKey: ['projects', onlyActive],
    queryFn: async (): Promise<DBProject[]> => {
      let queryBuilder = supabase
        .from('projects')
        .select('*')
        .order('name');

      if (onlyActive) {
        queryBuilder = queryBuilder.eq('is_active', true);
      }

      const { data, error } = await queryBuilder;

      if (error) {
        throw new Error(`Fout bij ophalen projecten: ${error.message}`);
      }

      // Parse mapping_config from JSONB
      return (data || []).map((project) => ({
        ...project,
        mapping_config: project.mapping_config as unknown as MappingConfig,
      }));
    },
  });

  return {
    projects: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
};
