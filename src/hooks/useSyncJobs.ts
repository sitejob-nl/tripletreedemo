import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useEffect } from "react";
import type { DBSyncJob } from "@/types/database";

export interface SyncJobWithProject extends DBSyncJob {
  project_name: string;
}

// Fetch sync jobs, optionally filtered by project
export function useSyncJobs(projectId?: string, limit: number = 20) {
  const queryClient = useQueryClient();

  const query = useQuery({
    queryKey: ["sync-jobs", projectId, limit],
    queryFn: async () => {
      let q = supabase
        .from("sync_jobs")
        .select(`
          *,
          projects:project_id (name)
        `)
        .order("created_at", { ascending: false })
        .limit(limit);

      if (projectId) {
        q = q.eq("project_id", projectId);
      }

      const { data, error } = await q;

      if (error) throw error;

      return (data || []).map((job: any) => ({
        ...job,
        project_name: job.projects?.name || "Onbekend project"
      })) as SyncJobWithProject[];
    }
  });

  // Subscribe to realtime updates
  useEffect(() => {
    const channel = supabase
      .channel("sync-jobs-realtime")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "sync_jobs"
        },
        () => {
          // Invalidate query to refetch on any change
          queryClient.invalidateQueries({ queryKey: ["sync-jobs"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [queryClient]);

  return query;
}

// Create a new sync job
export function useCreateSyncJob() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({
      projectId,
      startDate,
      endDate
    }: {
      projectId: string;
      startDate: string;
      endDate: string;
    }) => {
      // Get current user
      const { data: { user } } = await supabase.auth.getUser();

      const { data, error } = await supabase
        .from("sync_jobs")
        .insert({
          project_id: projectId,
          start_date: startDate,
          end_date: endDate,
          status: "pending",
          created_by: user?.id || null
        })
        .select()
        .single();

      if (error) throw error;
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["sync-jobs"] });
    }
  });
}
