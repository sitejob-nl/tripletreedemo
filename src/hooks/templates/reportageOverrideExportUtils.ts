import { supabase } from '@/integrations/supabase/client';
import { ReportTemplate, ReportageWeeklyOverride } from '@/types/database';
import { REPORTAGE_OVERRIDE_THROUGH_WEEK } from '@/lib/reportageOverrideUtils';

export async function fetchYearReportageOverrides(
  projectId: string,
  year: number,
  template: ReportTemplate,
  prefetched: ReportageWeeklyOverride[] = [],
): Promise<ReportageWeeklyOverride[]> {
  const hasFullPrefetch =
    prefetched.filter((override) => override.year === year && override.template === template).length >= REPORTAGE_OVERRIDE_THROUGH_WEEK;
  if (hasFullPrefetch) return prefetched;

  const { data, error } = await supabase
    .from('reportage_weekly_overrides')
    .select('*')
    .eq('project_id', projectId)
    .eq('year', year)
    .eq('template', template)
    .lte('week_number', REPORTAGE_OVERRIDE_THROUGH_WEEK)
    .order('week_number', { ascending: true });

  if (error) throw error;
  return (data ?? []) as unknown as ReportageWeeklyOverride[];
}
