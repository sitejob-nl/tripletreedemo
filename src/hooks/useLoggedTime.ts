import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { summarizeLoggedTime, type DailyLoggedTimeBreakdown } from '@/lib/loggedTime';
import { ResolvedDateFilter, applyMaxDate } from './useDateFilter';

export type { DailyLoggedTimeBreakdown } from '@/lib/loggedTime';

interface LoggedTimeData {
  totalSeconds: number;
  totalHours: number;
  hasData: boolean;
  dailyHours?: DailyLoggedTimeBreakdown;
}

interface UseLoggedTimeOptions {
  projectId?: string;
  dateFilter?: ResolvedDateFilter;
  hoursFactor?: number;
}

export const useLoggedTime = ({ projectId, dateFilter, hoursFactor = 1.0 }: UseLoggedTimeOptions) => {
  return useQuery({
    queryKey: ['logged_time', projectId, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.maxDate, hoursFactor],
    queryFn: async (): Promise<LoggedTimeData> => {
      if (!projectId) {
        return { totalSeconds: 0, totalHours: 0, hasData: false };
      }
      
      let query = supabase
        .from('daily_logged_time')
        .select('total_seconds, corrected_seconds, date')
        .eq('project_id', projectId);
      
      // Filter on date range if filtering is active
      if (dateFilter?.isFiltering && dateFilter.startDate && dateFilter.endDate) {
        query = query
          .gte('date', dateFilter.startDate)
          .lte('date', dateFilter.endDate);
      }

      // Embargo upper bound on the `date` column (admin preview only; no-op otherwise).
      query = applyMaxDate(query, dateFilter?.maxDate, 'date');

      const { data, error } = await query;
      
      if (error) throw error;
      
      const summary = summarizeLoggedTime(data ?? [], hoursFactor ?? 1);
      return {
        totalSeconds: summary.totalSeconds,
        totalHours: summary.totalHours,
        hasData: summary.hasData,
        dailyHours: dateFilter?.isFiltering ? summary.dailyHours : undefined,
      };
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    enabled: !!projectId
  });
};

// Gelogde uren per week, key "YYYY-WW" (voor de Weekvergelijking in de Analyse-view).
// Weektotaal = som van per-dag-afgeronde uren (dezelfde factuurregel als matrix/export).
// Zonder deze bron viel de Weekvergelijking terug op gesprekstijd, die voor outbound
// vrijwel altijd 0 is -> "Aantal beluren 0.00" (QA 23-07-2026, punt A4).
// Klanten krijgen via RLS automatisch alleen vrijgegeven dagen; de client-side
// admin-preview-cap (maxDate) wordt hier bewust niet toegepast.
export const useLoggedTimeWeekly = (projectId: string | undefined, hoursFactor = 1.0) => {
  return useQuery({
    queryKey: ['logged_time_weekly', projectId, hoursFactor],
    queryFn: async (): Promise<Record<string, number>> => {
      if (!projectId) return {};
      const { data, error } = await supabase
        .from('daily_logged_time')
        .select('total_seconds, corrected_seconds, date')
        .eq('project_id', projectId);
      if (error) throw error;
      return summarizeLoggedTime(data ?? [], hoursFactor ?? 1).weeklyHours;
    },
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
    enabled: !!projectId,
  });
};
