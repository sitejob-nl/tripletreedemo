import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { startOfISOWeek, endOfISOWeek, setISOWeek, setYear, format, getDay } from 'date-fns';

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
  /** Hours per day of week (only populated when a specific week is selected) */
  dailyHours?: DailyLoggedTimeBreakdown;
}

interface UseLoggedTimeOptions {
  projectId?: string;
  weekYearValue?: string | 'all'; // e.g., "2026-01" or "all"
}

// Parse weekYearValue (e.g., "2026-01") into start and end dates of that ISO week
const getWeekDateRange = (weekYearValue: string): { startDate: string; endDate: string } | null => {
  const match = weekYearValue.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  
  const year = parseInt(match[1]);
  const week = parseInt(match[2]);
  
  // Create a date in the target year and set the ISO week
  let date = new Date(year, 0, 4); // Jan 4th is always in week 1 of ISO year
  date = setYear(date, year);
  date = setISOWeek(date, week);
  
  const weekStart = startOfISOWeek(date);
  const weekEnd = endOfISOWeek(date);
  
  return {
    startDate: format(weekStart, 'yyyy-MM-dd'),
    endDate: format(weekEnd, 'yyyy-MM-dd')
  };
};

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

export const useLoggedTime = ({ projectId, weekYearValue }: UseLoggedTimeOptions) => {
  return useQuery({
    queryKey: ['logged_time', projectId, weekYearValue],
    queryFn: async (): Promise<LoggedTimeData> => {
      if (!projectId) {
        return { totalSeconds: 0, totalHours: 0, hasData: false };
      }
      
      // Build query
      let query = supabase
        .from('daily_logged_time')
        .select('total_seconds, date')
        .eq('project_id', projectId);
      
      // Filter on date range if specific week selected
      const isSpecificWeek = weekYearValue && weekYearValue !== 'all';
      if (isSpecificWeek) {
        const range = getWeekDateRange(weekYearValue);
        if (range) {
          query = query
            .gte('date', range.startDate)
            .lte('date', range.endDate);
        }
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      const totalSeconds = data?.reduce((sum, r) => sum + (r.total_seconds || 0), 0) || 0;
      const totalHours = totalSeconds / 3600;
      
      // Build daily breakdown for specific week selection
      let dailyHours: DailyLoggedTimeBreakdown | undefined;
      if (isSpecificWeek && data && data.length > 0) {
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
