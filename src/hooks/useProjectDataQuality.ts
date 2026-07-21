import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type {
  DataQualityMessage,
  DataQualityStatus,
  ProjectDataQuality,
  QualityMetric,
} from '@/types/database';

const parseMessages = (value: unknown): DataQualityMessage[] => {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item) => {
    if (!item || typeof item !== 'object') return [];
    const row = item as Record<string, unknown>;
    if (typeof row.code !== 'string' || typeof row.text !== 'string') return [];
    const severity = row.severity === 'critical' || row.severity === 'warning' ? row.severity : 'info';
    return [{ code: row.code, text: row.text, severity }];
  });
};

export const useProjectDataQuality = (
  projectId?: string,
  startDate?: string | null,
  endDate?: string | null,
) => useQuery({
  queryKey: ['project-data-quality', projectId, startDate, endDate],
  queryFn: async (): Promise<ProjectDataQuality> => {
    if (!projectId) {
      return { status: 'attention', verified_through: null, blocked_metrics: [], messages: [] };
    }

    const { data, error } = await supabase.rpc('get_project_data_quality', {
      p_project_id: projectId,
      p_start_date: startDate ?? new Date().toISOString().slice(0, 10),
      p_end_date: endDate ?? new Date().toISOString().slice(0, 10),
    });
    if (error) throw new Error(`Kwaliteitsstatus kon niet worden geladen: ${error.message}`);

    const row = data?.[0];
    if (!row) {
      return { status: 'attention', verified_through: null, blocked_metrics: [], messages: [] };
    }

    return {
      status: row.status as DataQualityStatus,
      verified_through: row.verified_through,
      blocked_metrics: (row.blocked_metrics ?? []) as QualityMetric[],
      messages: parseMessages(row.messages),
    };
  },
  enabled: !!projectId && !!startDate && !!endDate,
  staleTime: 60_000,
  refetchInterval: 5 * 60_000,
});

// Bewust geen helper meer die een metric als "geblokkeerd" bestempelt: de kwaliteitsstatus
// mag nooit een cijfer uit het klantbeeld halen. blocked_metrics geeft nog wel aan welke
// cijfers een openstaand controlepunt raken, maar dat is uitsluitend beheerdersinformatie.
