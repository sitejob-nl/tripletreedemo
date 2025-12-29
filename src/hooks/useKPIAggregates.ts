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
  weekNumber?: number | 'all';
  mappingConfig?: MappingConfig;
}

// Default sale results if not configured
const DEFAULT_SALE_RESULTS = ['Sale', 'Donateur', 'Toezegging', 'Afspraak', 'Positief', 'Verkoop', 'Ja', 'Akkoord'];

export const useKPIAggregates = ({ projectId, weekNumber, mappingConfig }: UseKPIAggregatesOptions) => {
  // Get sale results from mapping config or use defaults
  const saleResults = mappingConfig?.sale_results?.length 
    ? mappingConfig.sale_results 
    : DEFAULT_SALE_RESULTS;

  // Query 1: Get basic aggregates from database function
  const basicAggregatesQuery = useQuery({
    queryKey: ['kpi_basic_aggregates', projectId, weekNumber, saleResults],
    queryFn: async () => {
      if (!projectId) return null;
      
      const weekParam = weekNumber === 'all' ? null : weekNumber;
      
      const { data, error } = await supabase
        .rpc('get_project_kpi_totals', {
          p_project_id: projectId,
          p_week_number: weekParam,
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
    queryKey: ['kpi_annual_value', projectId, weekNumber, mappingConfig?.amount_col, mappingConfig?.freq_col, saleResults],
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
      
      if (weekNumber !== 'all') {
        query = query.eq('week_number', weekNumber);
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
