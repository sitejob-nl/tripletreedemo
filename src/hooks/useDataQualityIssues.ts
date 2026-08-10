import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import type { QualityMetric, ReportingState } from '@/types/database';
import { friendlyError } from '@/lib/friendlyError';

export interface DataQualityIssue {
  id: string;
  project_id: string;
  issue_key: string;
  source: 'sync' | 'mapping' | 'drift' | 'hours';
  severity: 'info' | 'warning' | 'critical';
  affected_metrics: QualityMetric[];
  public_message: string;
  admin_detail: string;
  period_start: string | null;
  period_end: string | null;
  first_seen_at: string;
  last_seen_at: string;
  last_notified_at: string | null;
  project_name: string;
  project_key: string;
  basicall_project_id: number;
  reporting_state: ReportingState;
  enforcement_enabled: boolean;
}

export const useDataQualityIssues = () => useQuery({
  queryKey: ['data-quality-issues'],
  queryFn: async (): Promise<DataQualityIssue[]> => {
    const { data, error } = await supabase
      .from('data_quality_issues')
      .select('*, projects!inner(name,project_key,basicall_project_id,reporting_state,quality_enforcement_enabled)')
      .is('resolved_at', null)
      .order('severity')
      .order('last_seen_at', { ascending: false });
    if (error) throw new Error(friendlyError(error, 'De kwaliteitscontroles konden niet geladen worden. Herlaad de pagina en probeer het opnieuw.'));

    return (data ?? []).map((row) => ({
      ...row,
      source: row.source as DataQualityIssue['source'],
      severity: row.severity as DataQualityIssue['severity'],
      affected_metrics: (row.affected_metrics ?? []) as QualityMetric[],
      project_name: row.projects?.name ?? 'Onbekend project',
      project_key: row.projects?.project_key ?? '',
      basicall_project_id: row.projects?.basicall_project_id ?? 0,
      reporting_state: (row.projects?.reporting_state ?? 'live') as ReportingState,
      enforcement_enabled: row.projects?.quality_enforcement_enabled ?? false,
    }));
  },
  refetchInterval: 60_000,
});
