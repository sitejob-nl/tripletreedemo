import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject, MappingConfig, ProjectType } from '@/types/database';

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

      // Parse mapping_config from JSONB and cast project_type
      return (data || []).map((project) => ({
        ...project,
        project_type: (project.project_type || 'outbound') as ProjectType,
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

interface UpdateProjectParams {
  projectId: string;
  hourlyRate?: number;
  vatRate?: number;
  mappingConfig?: MappingConfig;
}

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, hourlyRate, vatRate, mappingConfig }: UpdateProjectParams) => {
      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (hourlyRate !== undefined) updates.hourly_rate = hourlyRate;
      if (vatRate !== undefined) updates.vat_rate = vatRate;
      if (mappingConfig !== undefined) updates.mapping_config = mappingConfig;

      const { data, error } = await supabase
        .from('projects')
        .update(updates)
        .eq('id', projectId)
        .select()
        .single();

      if (error) {
        throw new Error(`Fout bij updaten project: ${error.message}`);
      }

      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['projects'] });
      queryClient.invalidateQueries({ queryKey: ['call_records'] });
    },
  });
};
