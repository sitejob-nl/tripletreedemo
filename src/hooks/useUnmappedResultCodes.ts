import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBProject } from '@/types/database';
import { classifyResultCoverage } from '@/lib/statsHelpers';
import { friendlyError } from '@/lib/friendlyError';

export interface UnmappedCode {
  resultaat: string;
  cnt: number;
  lastDate: string | null; // beldatum_date van het recentste record met deze code
}

export interface ProjectUnmappedCodes {
  projectId: string;
  name: string;
  basicallProjectId: number;
  codes: UnmappedCode[];
}

/**
 * Niet-ingedeelde resultaatcodes per actief project — het admin-signaal dat nieuwe
 * BasiCall-codes zichtbaar maakt vóórdat iemand cijfers naast BasiCall hoeft te leggen.
 *
 * Data: RPC get_result_code_distribution (grouped, alle projecten in één call).
 * Classificatie: classifyResultCoverage — exact dezelfde engine-truth (UNION van
 * project-config + hardcoded defaults) als de rekenpaden en het dekking-paneel in
 * MappingTool. 'todo' betekent dus écht: deze code telt nergens in mee — bij outbound
 * mist hij als sale of vervuilt hij de netto-conversie-noemer (zie EO Muziekspel
 * "EO donateur eenmalig", juli 2026).
 */
export const useUnmappedResultCodes = (projects: DBProject[]) => {
  const query = useQuery({
    queryKey: ['result_code_distribution'],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_result_code_distribution');
      if (error) throw new Error(friendlyError(error, 'De onbekende resultaatcodes konden niet geladen worden. Herlaad de pagina en probeer het opnieuw.'));
      return data || [];
    },
    staleTime: 5 * 60_000,
  });

  const unmapped = useMemo<ProjectUnmappedCodes[]>(() => {
    if (!query.data || projects.length === 0) return [];

    const byProject = new Map(projects.filter((p) => p.is_active).map((p) => [p.id, p]));
    const acc = new Map<string, ProjectUnmappedCodes>();

    for (const row of query.data) {
      const project = byProject.get(row.project_id);
      if (!project) continue;
      if (classifyResultCoverage(row.resultaat, project.mapping_config, project.project_type) !== 'todo') continue;

      let entry = acc.get(project.id);
      if (!entry) {
        entry = {
          projectId: project.id,
          name: project.name,
          basicallProjectId: project.basicall_project_id,
          codes: [],
        };
        acc.set(project.id, entry);
      }
      entry.codes.push({ resultaat: row.resultaat, cnt: Number(row.cnt), lastDate: row.last_date ?? null });
    }

    // Recentste codes eerst — een nieuwe BasiCall-code komt zo bovenaan te staan.
    const list = Array.from(acc.values());
    for (const e of list) e.codes.sort((a, b) => (b.lastDate ?? '').localeCompare(a.lastDate ?? ''));
    list.sort((a, b) => (b.codes[0]?.lastDate ?? '').localeCompare(a.codes[0]?.lastDate ?? ''));
    return list;
  }, [query.data, projects]);

  return { unmapped, isLoading: query.isLoading };
};
