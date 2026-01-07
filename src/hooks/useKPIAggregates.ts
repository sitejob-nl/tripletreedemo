import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { MappingConfig } from '@/types/database';

interface KPIAggregates {
  totalRecords: number;
  totalSales: number;
  totalGesprekstijdSec: number;
  totalAnnualValue: number;
}

interface UseKPIAggregatesOptions {
  projectId?: string;
  weekYearValue?: string | 'all'; // e.g., "2026-01" or "all"
  mappingConfig?: MappingConfig;
}

// Parse weekYearValue (e.g., "2026-01") into week and year
const parseWeekYearValue = (value: string): { week: number; year: number } | null => {
  const match = value.match(/^(\d{4})-(\d{1,2})$/);
  if (match) {
    return { year: parseInt(match[1]), week: parseInt(match[2]) };
  }
  return null;
};

// Default sale results if not configured
const DEFAULT_SALE_RESULTS = ['Sale', 'Donateur', 'Toezegging', 'Afspraak', 'Positief', 'Verkoop', 'Ja', 'Akkoord'];

export const useKPIAggregates = ({ projectId, weekYearValue, mappingConfig }: UseKPIAggregatesOptions) => {
  // Get sale results from mapping config or use defaults
  const saleResults = mappingConfig?.sale_results?.length 
    ? mappingConfig.sale_results 
    : DEFAULT_SALE_RESULTS;

  // Parse weekYearValue for filtering
  const parsed = weekYearValue && weekYearValue !== 'all' ? parseWeekYearValue(weekYearValue) : null;

  // Query 1: Get basic aggregates from database function
  // Note: The RPC doesn't support year filtering, so for year-specific queries we need to use the second approach
  const basicAggregatesQuery = useQuery({
    queryKey: ['kpi_basic_aggregates', projectId, weekYearValue, saleResults],
    queryFn: async () => {
      if (!projectId) return null;
      
      // If we have a specific week+year, we need to query differently
      if (parsed) {
        // Use direct query with year filter instead of RPC
        let query = supabase
          .from('call_records')
          .select('gesprekstijd_sec, resultaat')
          .eq('project_id', projectId)
          .eq('week_number', parsed.week)
          .gte('beldatum_date', `${parsed.year}-01-01`)
          .lte('beldatum_date', `${parsed.year}-12-31`);
        
        const { data, error } = await query;
        if (error) throw error;
        
        const records = data || [];
        return {
          totalRecords: records.length,
          totalSales: records.filter(r => saleResults.includes(r.resultaat || '')).length,
          totalGesprekstijdSec: records.reduce((sum, r) => sum + (r.gesprekstijd_sec || 0), 0)
        };
      }
      
      // For 'all', use the RPC
      const { data, error } = await supabase
        .rpc('get_project_kpi_totals', {
          p_project_id: projectId,
          p_week_number: null,
          p_sale_results: saleResults
        });
      
      if (error) throw error;
      
      // RPC returns an array, get first row
      const result = Array.isArray(data) ? data[0] : data;
      
      return {
        totalRecords: Number(result?.total_records || 0),
        totalSales: Number(result?.total_sales || 0),
        totalGesprekstijdSec: Number(result?.total_gesprekstijd_sec || 0)
      };
    },
    enabled: !!projectId
  });

  // Query 2: Get annual value by fetching only sales records
  const annualValueQuery = useQuery({
    queryKey: ['kpi_annual_value', projectId, weekYearValue, mappingConfig?.amount_col, mappingConfig?.freq_col, saleResults],
    queryFn: async () => {
      if (!projectId || !mappingConfig?.amount_col || !mappingConfig?.freq_col) {
        return 0;
      }
      
      // Fetch only sales records (much smaller dataset)
      let query = supabase
        .from('call_records')
        .select('raw_data')
        .eq('project_id', projectId)
        .in('resultaat', saleResults);
      
      if (parsed) {
        query = query
          .eq('week_number', parsed.week)
          .gte('beldatum_date', `${parsed.year}-01-01`)
          .lte('beldatum_date', `${parsed.year}-12-31`);
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
      // Calculate total annual value from sales records
      let totalAnnualValue = 0;
      const freqMap = mappingConfig.freq_map || {};
      
      (data || []).forEach((record) => {
        const rawData = record.raw_data as Record<string, unknown> | null;
        if (!rawData) return;
        
        const amountRaw = rawData[mappingConfig.amount_col];
        const freqRaw = rawData[mappingConfig.freq_col];
        
        if (!amountRaw || !freqRaw) return;
        
        const amount = parseDutchFloat(String(amountRaw));
        const freqKey = String(freqRaw).toLowerCase().trim();
        const multiplier = freqMap[freqKey] || 1;
        
        totalAnnualValue += amount * multiplier;
      });
      
      return totalAnnualValue;
    },
    enabled: !!projectId && !!mappingConfig?.amount_col && !!mappingConfig?.freq_col
  });

  // Combine results
  const isLoading = basicAggregatesQuery.isLoading || annualValueQuery.isLoading;
  const error = basicAggregatesQuery.error || annualValueQuery.error;
  
  const data: KPIAggregates | null = basicAggregatesQuery.data ? {
    ...basicAggregatesQuery.data,
    totalAnnualValue: annualValueQuery.data || 0
  } : null;

  return {
    data,
    isLoading,
    error
  };
};
