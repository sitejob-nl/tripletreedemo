import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { MappingConfig, ProjectType } from '@/types/database';
import { ResolvedDateFilter } from './useDateFilter';
import { isSale, SALE_RESULTS } from '@/lib/statsHelpers';

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
  projectType?: ProjectType;
}

// Default sale results if not configured
const DEFAULT_SALE_RESULTS = ['Sale', 'Donateur', 'Toezegging', 'Afspraak', 'Positief', 'Verkoop', 'Ja', 'Akkoord'];

export const useKPIAggregates = ({ projectId, dateFilter, mappingConfig, projectType }: UseKPIAggregatesOptions) => {
  // For inbound retention projects the top KPI counts "behouden" records
  // (retention_results ∪ partial_success_results), not sales. Without this the
  // top card showed 0 while the detail matrix categorized the same record as
  // retained — divergence reported for Hersenstichting inbound week 20.
  const positiveResults = (() => {
    if (projectType === 'inbound') {
      const retention = mappingConfig?.retention_results ?? [];
      const partial = mappingConfig?.partial_success_results ?? [];
      const combined = [...retention, ...partial];
      if (combined.length) return combined;
    }
    return mappingConfig?.sale_results?.length
      ? mappingConfig.sale_results
      : DEFAULT_SALE_RESULTS;
  })();
  // Substring-matching for inbound retention mirrors categorizeInboundResult.
  // Outbound keeps exact equality so 'Sale' doesn't accidentally match 'Sale niet doorgezet'.
  const useSubstring = projectType === 'inbound';
  const positiveResultsLower = useSubstring ? positiveResults.map(r => r.toLowerCase()) : positiveResults;

  // Query 1: Get basic aggregates
  const basicAggregatesQuery = useQuery({
    queryKey: ['kpi_basic_aggregates', projectId, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.weekNumber, projectType, positiveResults],
    queryFn: async () => {
      if (!projectId) return null;
      
      // If we have date filtering, use direct query
      if (dateFilter?.isFiltering && dateFilter.startDate && dateFilter.endDate) {
        // PostgREST caps unpaginated SELECTs at 1000 rows; a single week can exceed
        // that, so we page through and aggregate across batches.
        const allRecords: Array<{ gesprekstijd_sec: number | null; resultaat: string | null }> = [];
        const batchSize = 1000;
        let offset = 0;
        let hasMore = true;

        while (hasMore) {
          let query = supabase
            .from('call_records')
            .select('gesprekstijd_sec, resultaat')
            .eq('project_id', projectId)
            .range(offset, offset + batchSize - 1);

          if (dateFilter.filterType === 'week' && dateFilter.weekNumber !== null) {
            query = query
              .eq('week_number', dateFilter.weekNumber)
              .gte('beldatum_date', dateFilter.startDate)
              .lte('beldatum_date', dateFilter.endDate);
          } else {
            query = query
              .gte('beldatum_date', dateFilter.startDate)
              .lte('beldatum_date', dateFilter.endDate);
          }

          const { data, error } = await query;
          if (error) throw error;

          if (data && data.length > 0) {
            allRecords.push(...data);
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }

        const matchesPositive = (resultaat: string | null) => {
          const raw = (resultaat || '').toLowerCase();
          if (!raw) return false;
          if (useSubstring) {
            return (positiveResultsLower as string[]).some(p => raw.includes(p));
          }
          // Outbound: gedeelde isSale (UNION config + SALE_RESULTS, case-insensitive).
          return isSale(resultaat, mappingConfig);
        };

        return {
          totalRecords: allRecords.length,
          totalSales: allRecords.filter(r => matchesPositive(r.resultaat)).length,
          totalGesprekstijdSec: allRecords.reduce((sum, r) => sum + (r.gesprekstijd_sec || 0), 0)
        };
      }

      // For 'all' (no filtering), use the RPC. The RPC matches exactly, so for
      // inbound substring-matching we fall back to a paginated client-side count.
      if (useSubstring) {
        const allRecords: Array<{ gesprekstijd_sec: number | null; resultaat: string | null }> = [];
        const batchSize = 1000;
        let offset = 0;
        let hasMore = true;
        while (hasMore) {
          const { data, error } = await supabase
            .from('call_records')
            .select('gesprekstijd_sec, resultaat')
            .eq('project_id', projectId)
            .range(offset, offset + batchSize - 1);
          if (error) throw error;
          if (data && data.length > 0) {
            allRecords.push(...data);
            offset += batchSize;
            hasMore = data.length === batchSize;
          } else {
            hasMore = false;
          }
        }
        return {
          totalRecords: allRecords.length,
          totalSales: allRecords.filter(r => {
            const raw = (r.resultaat || '').toLowerCase();
            return raw && (positiveResultsLower as string[]).some(p => raw.includes(p));
          }).length,
          totalGesprekstijdSec: allRecords.reduce((sum, r) => sum + (r.gesprekstijd_sec || 0), 0)
        };
      }

      // Outbound 'all' view: pass the UNION (config ∪ SALE_RESULTS) so the RPC's
      // case-insensitive predicate matches isSale() exactly (KPI-kaart == matrix).
      const { data, error } = await supabase
        .rpc('get_project_kpi_totals', {
          p_project_id: projectId,
          p_week_number: null,
          p_sale_results: [...(mappingConfig?.sale_results ?? []), ...SALE_RESULTS]
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

  // Query 2: Get annual value via server-side RPC
  const annualValueQuery = useQuery({
    queryKey: ['kpi_annual_value', projectId, dateFilter?.startDate, dateFilter?.endDate, dateFilter?.weekNumber, dateFilter?.year],
    queryFn: async () => {
      if (!projectId || !mappingConfig?.amount_col || !mappingConfig?.freq_col) {
        return 0;
      }
      const { data, error } = await supabase.rpc('get_project_annual_value', {
        p_project_id: projectId,
        p_start_date: dateFilter?.isFiltering ? dateFilter.startDate : null,
        p_end_date: dateFilter?.isFiltering ? dateFilter.endDate : null,
        p_week_number: (dateFilter?.isFiltering && dateFilter.filterType === 'week') ? dateFilter.weekNumber : null,
        p_year: (dateFilter?.isFiltering && dateFilter.filterType === 'week') ? dateFilter.year : null,
      });
      if (error) throw error;
      return Number(data || 0);
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
