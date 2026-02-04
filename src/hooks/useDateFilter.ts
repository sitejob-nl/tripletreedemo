import { useMemo } from 'react';
import { format, startOfISOWeek, endOfISOWeek, setISOWeek, setYear } from 'date-fns';

export type DateFilterType = 'week' | 'range';

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

export interface DateFilterOptions {
  filterType: DateFilterType;
  weekYearValue: string | 'all'; // e.g., "2026-01" or "all"
  dateRange: DateRange;
}

export interface ResolvedDateFilter {
  /** Whether date filtering is active */
  isFiltering: boolean;
  /** ISO date string for start (YYYY-MM-DD) */
  startDate: string | null;
  /** ISO date string for end (YYYY-MM-DD) */
  endDate: string | null;
  /** Week number if week-based filter */
  weekNumber: number | null;
  /** Year if week-based filter */
  year: number | null;
  /** The filter type being used */
  filterType: DateFilterType;
}

/**
 * Parse weekYearValue (e.g., "2026-01") into start and end dates of that ISO week
 */
const getWeekDateRange = (weekYearValue: string): { startDate: string; endDate: string; week: number; year: number } | null => {
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
    endDate: format(weekEnd, 'yyyy-MM-dd'),
    week,
    year,
  };
};

/**
 * Hook to resolve date filter options into a consistent format for database queries
 */
export function useDateFilter(options: DateFilterOptions): ResolvedDateFilter {
  return useMemo(() => {
    const { filterType, weekYearValue, dateRange } = options;

    // Week-based filtering
    if (filterType === 'week') {
      if (weekYearValue === 'all') {
        return {
          isFiltering: false,
          startDate: null,
          endDate: null,
          weekNumber: null,
          year: null,
          filterType: 'week',
        };
      }

      const weekRange = getWeekDateRange(weekYearValue);
      if (!weekRange) {
        return {
          isFiltering: false,
          startDate: null,
          endDate: null,
          weekNumber: null,
          year: null,
          filterType: 'week',
        };
      }

      return {
        isFiltering: true,
        startDate: weekRange.startDate,
        endDate: weekRange.endDate,
        weekNumber: weekRange.week,
        year: weekRange.year,
        filterType: 'week',
      };
    }

    // Date range filtering
    if (filterType === 'range') {
      if (!dateRange.start || !dateRange.end) {
        return {
          isFiltering: false,
          startDate: null,
          endDate: null,
          weekNumber: null,
          year: null,
          filterType: 'range',
        };
      }

      return {
        isFiltering: true,
        startDate: format(dateRange.start, 'yyyy-MM-dd'),
        endDate: format(dateRange.end, 'yyyy-MM-dd'),
        weekNumber: null,
        year: null,
        filterType: 'range',
      };
    }

    // Fallback
    return {
      isFiltering: false,
      startDate: null,
      endDate: null,
      weekNumber: null,
      year: null,
      filterType: 'week',
    };
  }, [options.filterType, options.weekYearValue, options.dateRange.start, options.dateRange.end]);
}

/**
 * Apply date filter to a Supabase query builder
 * This is a helper for use in query functions
 */
export function applyDateFilter<T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T; eq: (col: string, val: number) => T }>(
  query: T,
  filter: ResolvedDateFilter,
  dateColumn: string = 'beldatum_date'
): T {
  if (!filter.isFiltering || !filter.startDate || !filter.endDate) {
    return query;
  }

  // For week-based filtering, also filter by week_number for efficiency
  if (filter.filterType === 'week' && filter.weekNumber !== null && filter.year !== null) {
    return query
      .eq('week_number', filter.weekNumber)
      .gte(dateColumn, `${filter.year}-01-01`)
      .lte(dateColumn, `${filter.year}-12-31`);
  }

  // For date range filtering, use direct date comparison
  return query
    .gte(dateColumn, filter.startDate)
    .lte(dateColumn, filter.endDate);
}
