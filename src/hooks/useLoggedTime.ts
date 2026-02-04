import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getDay } from 'date-fns';
import { ResolvedDateFilter } from './useDateFilter';

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

export const useLoggedTime = ({ projectId, dateFilter }: UseLoggedTimeOptions) => {
  return useQuery({
    queryKey: ['logged_time', projectId, dateFilter?.startDate, dateFilter?.endDate],
    queryFn: async (): Promise<LoggedTimeData> => {
      if (!projectId) {
        return { totalSeconds: 0, totalHours: 0, hasData: false };
      }
      
      let query = supabase
        .from('daily_logged_time')
        .select('total_seconds, date')
        .eq('project_id', projectId);
      
      // Filter on date range if filtering is active
      if (dateFilter?.isFiltering && dateFilter.startDate && dateFilter.endDate) {
        query = query
          .gte('date', dateFilter.startDate)
          .lte('date', dateFilter.endDate);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const totalSeconds = data?.reduce((sum, r) => sum + (r.total_seconds || 0), 0) || 0;
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
              dailyHours![dayName] += (record.total_seconds || 0) / 3600;
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
