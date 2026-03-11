import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";

export interface Batch {
  id: string;
  project_id: string;
  basicall_batch_id: number;
  name: string;
  status: number | null;
  total: number | null;
  handled: number | null;
  remaining: number | null;
  created_at: string | null;
  last_synced_at: string | null;
}

export function useBatches(projectId?: string) {
  return useQuery({
    queryKey: ["batches", projectId],
    queryFn: async () => {
      let query = supabase
        .from("batches")
        .select("*")
        .order("remaining", { ascending: false, nullsFirst: false });

      if (projectId) {
        query = query.eq("project_id", projectId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as Batch[];
    },
    enabled: !!projectId,
  });
}

export function useCreateBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (batch: { name: string; basicall_batch_id: number; project_id: string }) => {
      const { data, error } = await supabase
        .from("batches")
        .insert({
          name: batch.name,
          basicall_batch_id: batch.basicall_batch_id,
          project_id: batch.project_id,
        })
        .select()
        .single();
      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });
}

export function useDeleteBatch() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("batches").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["batches"] });
    },
  });
}
