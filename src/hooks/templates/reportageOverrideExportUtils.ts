import { supabase } from '@/integrations/supabase/client';
import { ReportTemplate, ReportageWeeklyOverride } from '@/types/database';

export async function fetchYearReportageOverrides(
  projectId: string,
  year: number,
  template: ReportTemplate,
  prefetched: ReportageWeeklyOverride[] = [],
): Promise<ReportageWeeklyOverride[]> {
  const { data, error } = await supabase
    .from('reportage_weekly_overrides')
    .select('*')
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('template', template)
    .order('week_number', { ascending: true });

  if (error) {
    const matchingPrefetch = prefetched.filter(
      (override) => override.year === year && override.template === template,
    );
    if (matchingPrefetch.length > 0) return matchingPrefetch;
    throw error;
  }
  return (data ?? []) as unknown as ReportageWeeklyOverride[];
}
