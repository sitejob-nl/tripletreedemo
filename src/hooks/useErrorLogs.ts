import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface ErrorLog {
  id: string;
  error_type: string;
  error_message: string;
  stack_trace: string | null;
  component_name: string | null;
  url: string | null;
  user_id: string | null;
  user_agent: string | null;
  metadata: Record<string, unknown> | null;
  is_resolved: boolean;
  created_at: string;
}

export function useErrorLogs(limit: number = 100) {
  return useQuery({
    queryKey: ['error-logs', limit],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('error_logs')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(limit);

      if (error) throw error;
      return data as ErrorLog[];
    },
  });
}

export function useUnresolvedErrorCount() {
  return useQuery({
    queryKey: ['error-logs-count'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('error_logs')
        .select('*', { count: 'exact', head: true })
        .eq('is_resolved', false);

      if (error) throw error;
      return count || 0;
    },
    refetchInterval: 30000, // Refetch every 30 seconds
  });
}

export function useResolveError() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (errorId: string) => {
      const { error } = await supabase
        .from('error_logs')
        .update({ is_resolved: true })
        .eq('id', errorId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-logs'] });
      queryClient.invalidateQueries({ queryKey: ['error-logs-count'] });
    },
  });
}

export function useDeleteError() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (errorId: string) => {
      const { error } = await supabase
        .from('error_logs')
        .delete()
        .eq('id', errorId);

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['error-logs'] });
      queryClient.invalidateQueries({ queryKey: ['error-logs-count'] });
    },
  });
}
