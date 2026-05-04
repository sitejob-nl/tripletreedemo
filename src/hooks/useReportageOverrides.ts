import { useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DateFilterType } from './useDateFilter';
import { ReportageWeeklyOverride } from '@/types/database';

const OVERRIDE_YEAR = 2026;
const OVERRIDE_THROUGH_WEEK = 15;

function parseWeekValue(value: string | number): { year: number; week: number } | null {
  if (typeof value === 'number') {
    return { year: OVERRIDE_YEAR, week: value };
  }
  const match = String(value).match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  return { year: Number(match[1]), week: Number(match[2]) };
}

interface UseReportageOverridesArgs {
  projectId?: string;
  selectedWeek: string | number;
  dateFilterType: DateFilterType;
}

export function useReportageOverrides({
  projectId,
  selectedWeek,
  dateFilterType,
}: UseReportageOverridesArgs) {
  const request = useMemo(() => {
    if (!projectId || dateFilterType !== 'week') return null;
    if (selectedWeek === 'all') {
      return { mode: 'all' as const, year: OVERRIDE_YEAR, week: null };
    }
    const parsed = parseWeekValue(selectedWeek);
    if (!parsed || parsed.year !== OVERRIDE_YEAR || parsed.week > OVERRIDE_THROUGH_WEEK) {
      return null;
    }
    return { mode: 'week' as const, year: parsed.year, week: parsed.week };
  }, [projectId, selectedWeek, dateFilterType]);

  return useQuery({
    queryKey: ['reportage_weekly_overrides', projectId, request?.mode, request?.year, request?.week],
    queryFn: async (): Promise<ReportageWeeklyOverride[]> => {
      if (!projectId || !request) return [];
      let query = supabase
        .from('reportage_weekly_overrides')
        .select('*')
        .eq('project_id', projectId)
        .eq('year', request.year)
        .order('week_number', { ascending: true });

      if (request.mode === 'week' && request.week !== null) {
        query = query.eq('week_number', request.week);
      } else {
        query = query.lte('week_number', OVERRIDE_THROUGH_WEEK);
      }

      const { data, error } = await query;
      if (error) throw error;
      return (data ?? []) as unknown as ReportageWeeklyOverride[];
    },
    enabled: !!projectId && !!request,
    staleTime: 1000 * 60 * 5,
  });
}
