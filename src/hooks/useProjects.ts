import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject, DBProjectPublic, MappingConfig, ProjectType } from '@/types/database';

/**
 * Hook voor het ophalen van projecten.
 * 
 * @param onlyActive - Filter op actieve projecten (default: true)
 * @param userId - User ID voor RLS filtering
 * @param isAdmin - Als true, haalt volledige project data op (incl. token), anders publieke view
 * 
 * NOTE: Wanneer isAdmin=true, cast het resultaat naar DBProject[].
 *       Wanneer isAdmin=false, is het een DBProjectPublic[] (geen token).
 *       De component moet zelf zorgen voor juiste type-afhandeling.
 */
export function useProjects(onlyActive = true, userId?: string, isAdmin = false) {
  const query = useQuery({
    queryKey: ['projects', onlyActive, userId, isAdmin],
    queryFn: async (): Promise<DBProject[] | DBProjectPublic[]> => {
      // Admins krijgen volledige data met tokens, reguliere users de publieke view zonder tokens
      const tableName = isAdmin ? 'projects' : 'projects_public';
      
      // Type-safe query met 'as any' omdat projects_public nog niet in types.ts staat
      let queryBuilder = supabase
        .from(tableName as any)
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
      return (data || []).map((project: any) => ({
        ...project,
        project_type: (project.project_type || 'outbound') as ProjectType,
        mapping_config: project.mapping_config as unknown as MappingConfig,
      }));
    },
    enabled: userId !== undefined,
  });

  return {
    projects: query.data || [],
    isLoading: query.isLoading,
    error: query.error,
    refetch: query.refetch,
  };
}

/**
 * Typed version for admin usage - returns DBProject[] with token
 */
export function useAdminProjects(onlyActive = true, userId?: string) {
  const result = useProjects(onlyActive, userId, true);
  return {
    ...result,
    projects: result.projects as DBProject[],
  };
}

interface UpdateProjectParams {
  projectId: string;
  hourlyRate?: number;
  vatRate?: number;
  mappingConfig?: MappingConfig;
  projectType?: ProjectType;
}

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, hourlyRate, vatRate, mappingConfig, projectType }: UpdateProjectParams) => {
      const updates: Record<string, any> = {
        updated_at: new Date().toISOString(),
      };

      if (hourlyRate !== undefined) updates.hourly_rate = hourlyRate;
      if (vatRate !== undefined) updates.vat_rate = vatRate;
      if (mappingConfig !== undefined) updates.mapping_config = mappingConfig;
      if (projectType !== undefined) updates.project_type = projectType;

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
