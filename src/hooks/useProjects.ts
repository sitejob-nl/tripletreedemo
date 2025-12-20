import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject, MappingConfig } from '@/types/database';

export const useProjects = () => {
  return useQuery({
    queryKey: ['projects'],
    queryFn: async (): Promise<DBProject[]> => {
      const { data, error } = await supabase
        .from('projects')
        .select('*')
        .eq('is_active', true)
        .order('name');

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
};
