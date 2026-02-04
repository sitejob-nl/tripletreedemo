import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { parseDutchFloat } from '@/lib/dataProcessing';
import { MappingConfig } from '@/types/database';
import { ResolvedDateFilter } from './useDateFilter';

interface KPIAggregates {
  totalRecords: number;
  totalSales: number;
  totalGesprekstijdSec: number;
  totalAnnualValue: number;
}

interface UseKPIAggregatesOptions {
  projectId?: string;
  dateFilter?: ResolvedDateFilter;
  mappingConfig?: MappingConfig;
}

// Default sale results if not configured
const DEFAULT_SALE_RESULTS = ['Sale', 'Donateur', 'Toezegging', 'Afspraak', 'Positief', 'Verkoop', 'Ja', 'Akkoord'];

export const useKPIAggregates = ({ projectId, dateFilter, mappingConfig }: UseKPIAggregatesOptions) => {
  const saleResults = mappingConfig?.sale_results?.length 
    ? mappingConfig.sale_results 
    : DEFAULT_SALE_RESULTS;

  // Query 1: Get basic aggregates
  const basicAggregatesQuery = useQuery({
    queryKey: ['kpi_basic_aggregates', projectId, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.weekNumber, saleResults],
    queryFn: async () => {
      if (!projectId) return null;
      
      // If we have date filtering, use direct query
      if (dateFilter?.isFiltering && dateFilter.startDate && dateFilter.endDate) {
        let query = supabase
          .from('call_records')
          .select('gesprekstijd_sec, resultaat')
          .eq('project_id', projectId);

        // Apply date filter
        if (dateFilter.filterType === 'week' && dateFilter.weekNumber !== null && dateFilter.year !== null) {
          query = query
            .eq('week_number', dateFilter.weekNumber)
            .gte('beldatum_date', `${dateFilter.year}-01-01`)
            .lte('beldatum_date', `${dateFilter.year}-12-31`);
        } else {
          query = query
            .gte('beldatum_date', dateFilter.startDate)
            .lte('beldatum_date', dateFilter.endDate);
        }
        
        const { data, error } = await query;
        if (error) throw error;
        
        const records = data || [];
        return {
          totalRecords: records.length,
          totalSales: records.filter(r => saleResults.includes(r.resultaat || '')).length,
          totalGesprekstijdSec: records.reduce((sum, r) => sum + (r.gesprekstijd_sec || 0), 0)
        };
      }
      
      // For 'all' (no filtering), use the RPC
      const { data, error } = await supabase
        .rpc('get_project_kpi_totals', {
          p_project_id: projectId,
          p_week_number: null,
          p_sale_results: saleResults
        });
      
      if (error) throw error;
      
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
    queryKey: ['kpi_annual_value', projectId, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.weekNumber, mappingConfig?.amount_col, mappingConfig?.freq_col, saleResults],
    queryFn: async () => {
      if (!projectId || !mappingConfig?.amount_col || !mappingConfig?.freq_col) {
        return 0;
      }
      
      let query = supabase
        .from('call_records')
        .select('raw_data')
        .eq('project_id', projectId)
        .in('resultaat', saleResults);
      
      // Apply date filter
      if (dateFilter?.isFiltering && dateFilter.startDate && dateFilter.endDate) {
        if (dateFilter.filterType === 'week' && dateFilter.weekNumber !== null && dateFilter.year !== null) {
          query = query
            .eq('week_number', dateFilter.weekNumber)
            .gte('beldatum_date', `${dateFilter.year}-01-01`)
            .lte('beldatum_date', `${dateFilter.year}-12-31`);
        } else {
          query = query
            .gte('beldatum_date', dateFilter.startDate)
            .lte('beldatum_date', dateFilter.endDate);
        }
      }
      
      const { data, error } = await query;
      
      if (error) throw error;
      
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
