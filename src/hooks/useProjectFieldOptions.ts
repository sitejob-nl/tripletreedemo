import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export const useProjectFieldOptions = (projectId: string | undefined, freqCol?: string) => {
  const fieldsQuery = useQuery({
    queryKey: ['project-fields', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const { data } = await supabase
        .from('call_records')
        .select('raw_data')
        .eq('project_id', projectId)
        .limit(100);
      
      const allKeys = new Set<string>();
      data?.forEach(record => {
        if (record.raw_data && typeof record.raw_data === 'object') {
          Object.keys(record.raw_data as Record<string, unknown>).forEach(key => allKeys.add(key));
        }
      });
      return Array.from(allKeys).sort();
    },
    enabled: !!projectId,
  });

  const resultsQuery = useQuery({
    queryKey: ['project-results', projectId],
    queryFn: async () => {
      if (!projectId) return [];
      
      const { data } = await supabase
        .from('call_records')
        .select('resultaat')
        .eq('project_id', projectId)
        .not('resultaat', 'is', null);
      
      const uniqueResults = [...new Set(data?.map(r => r.resultaat).filter(Boolean))];
      return uniqueResults.sort() as string[];
    },
    enabled: !!projectId,
  });

  const frequencyValuesQuery = useQuery({
    queryKey: ['project-frequency-values', projectId, freqCol],
    queryFn: async () => {
      if (!projectId || !freqCol) return [];
      
      const { data } = await supabase
        .from('call_records')
        .select('raw_data')
        .eq('project_id', projectId)
        .not('raw_data', 'is', null)
        .limit(1000);
      
      const uniqueFreqs = new Set<string>();
      data?.forEach(record => {
        const rawData = record.raw_data as Record<string, unknown>;
        const freqValue = rawData?.[freqCol];
        if (freqValue && String(freqValue).trim()) {
          uniqueFreqs.add(String(freqValue).trim().toLowerCase());
        }
      });
      
      return Array.from(uniqueFreqs).sort();
    },
    enabled: !!projectId && !!freqCol,
  });

  return {
    availableFields: fieldsQuery.data || [],
    availableResults: resultsQuery.data || [],
    availableFrequencyValues: frequencyValuesQuery.data || [],
    isLoading: fieldsQuery.isLoading || resultsQuery.isLoading || frequencyValuesQuery.isLoading,
  };
};
