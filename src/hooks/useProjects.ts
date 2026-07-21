import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { Database, Json } from '@/integrations/supabase/types';
import { DBProject, DBProjectPublic, MappingConfig, ProjectType, ReportingState } from '@/types/database';

type ProjectRow = Database['public']['Tables']['projects']['Row']
  | Database['public']['Views']['projects_public']['Row'];

const normalizeProject = (project: ProjectRow): DBProject | DBProjectPublic => ({
  ...project,
  project_type: (project.project_type || 'outbound') as ProjectType,
  reporting_state: (project.reporting_state || 'live') as ReportingState,
  quality_enforcement_enabled: project.quality_enforcement_enabled ?? false,
  quality_tracking_started_at: project.quality_tracking_started_at ?? null,
  mapping_config: project.mapping_config as unknown as MappingConfig,
}) as DBProject | DBProjectPublic;

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
      const result = isAdmin
        ? await (onlyActive
          ? supabase.from('projects').select('*').eq('is_active', true).order('name')
          : supabase.from('projects').select('*').order('name'))
        : await (onlyActive
          ? supabase.from('projects_public').select('*').eq('is_active', true).order('name')
          : supabase.from('projects_public').select('*').order('name'));
      const { data, error } = result;

      if (error) {
        throw new Error(`Fout bij ophalen projecten: ${error.message}`);
      }

      return ((data || []) as ProjectRow[]).map(normalizeProject);
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
  hoursFactor?: number;
}

export const useUpdateProject = () => {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ projectId, hourlyRate, vatRate, mappingConfig, projectType, hoursFactor }: UpdateProjectParams) => {
      const updates: Database['public']['Tables']['projects']['Update'] = {
        updated_at: new Date().toISOString(),
      };

      if (hourlyRate !== undefined) updates.hourly_rate = hourlyRate;
      if (vatRate !== undefined) updates.vat_rate = vatRate;
      if (mappingConfig !== undefined) {
        const { data, error } = await supabase.rpc('approve_project_mapping', {
          p_project_id: projectId,
          p_config: mappingConfig as unknown as Json,
          p_project_type: projectType,
          p_hourly_rate: hourlyRate,
          p_hours_factor: hoursFactor,
        });
        if (error) throw new Error(`Mapping kon niet worden goedgekeurd: ${error.message}`);
        return data;
      }
      if (projectType !== undefined) updates.project_type = projectType;
      if (hoursFactor !== undefined) updates.hours_factor = hoursFactor;

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
