import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

export interface MappingIssue {
  project_id: string;
  name: string;
  basicall_project_id: number;
  project_type: string;
  issue_type:
    | 'amount_col_missing'
    | 'freq_col_missing'
    | 'no_sale_hits'
    | 'inbound_service_no_handled'
    | 'inbound_no_results';
  issue_message: string;
}

export const useMappingIssues = () =>
  useQuery({
    queryKey: ['mapping_issues'],
    queryFn: async (): Promise<MappingIssue[]> => {
      const { data, error } = await supabase
        .from('mapping_issues')
        .select('*')
        .order('basicall_project_id', { ascending: true });
      if (error) throw new Error(error.message);
      return (data || []) as MappingIssue[];
    },
    staleTime: 60_000,
  });
