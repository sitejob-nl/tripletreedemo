import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getDay, getISOWeek, getISOWeekYear } from 'date-fns';
import { ceilHours } from '@/lib/hours';
import { ResolvedDateFilter, applyMaxDate } from './useDateFilter';

// Daily breakdown of logged time per weekday
export interface DailyLoggedTimeBreakdown {
  maandag: number;
  dinsdag: number;
  woensdag: number;
  donderdag: number;
  vrijdag: number;
  zaterdag: number;
  zondag: number;
}

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

// Map JS getDay() (0=Sunday) to Dutch day names
const dayIndexToDutch: Record<number, keyof DailyLoggedTimeBreakdown> = {
  0: 'zondag',
  1: 'maandag',
  2: 'dinsdag',
  3: 'woensdag',
  4: 'donderdag',
  5: 'vrijdag',
  6: 'zaterdag',
};

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
      
      // Use corrected_seconds if available, otherwise total_seconds, then apply global factor
      const factor = hoursFactor ?? 1.0;
      const totalSeconds = (data?.reduce((sum, r) => sum + (r.corrected_seconds ?? r.total_seconds ?? 0), 0) || 0) * factor;
      const totalHours = totalSeconds / 3600;
      
      // Build daily breakdown when filtering is active
      let dailyHours: DailyLoggedTimeBreakdown | undefined;
      if (dateFilter?.isFiltering && data && data.length > 0) {
        dailyHours = {
          maandag: 0,
          dinsdag: 0,
          woensdag: 0,
          donderdag: 0,
          vrijdag: 0,
          zaterdag: 0,
          zondag: 0,
        };
        
        data.forEach((record) => {
          if (record.date) {
            const date = new Date(record.date);
            const dayIndex = getDay(date);
            const dayName = dayIndexToDutch[dayIndex];
            if (dayName) {
              dailyHours![dayName] += (record.corrected_seconds ?? record.total_seconds ?? 0) * factor / 3600;
            }
          }
        });
      }
      
      return { 
        totalSeconds, 
        totalHours,
        hasData: (data?.length || 0) > 0,
        dailyHours,
      };
    },
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
      const factor = hoursFactor ?? 1.0;
      const weekly: Record<string, number> = {};
      (data ?? []).forEach((r) => {
        if (!r.date) return;
        const d = new Date(r.date);
        const key = `${getISOWeekYear(d)}-${String(getISOWeek(d)).padStart(2, '0')}`;
        const hours = ((r.corrected_seconds ?? r.total_seconds ?? 0) * factor) / 3600;
        weekly[key] = (weekly[key] ?? 0) + ceilHours(hours);
      });
      return weekly;
    },
    enabled: !!projectId,
  });
};
