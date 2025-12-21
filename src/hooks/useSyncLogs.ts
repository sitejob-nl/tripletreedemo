import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface SyncLog {
  id: string;
  project_id: string | null;
  started_at: string | null;
  completed_at: string | null;
  status: string | null;
  records_synced: number | null;
  error_message: string | null;
  sync_from: string | null;
  sync_to: string | null;
}

interface SyncLogWithProject extends SyncLog {
  project_name: string | null;
}

export function useSyncLogs(projectId?: string, limit = 50) {
  return useQuery({
    queryKey: ['sync-logs', projectId, limit],
    queryFn: async (): Promise<SyncLogWithProject[]> => {
      let query = supabase
        .from('sync_logs')
        .select(`
          *,
          projects!inner(name)
        `)
        .order('started_at', { ascending: false })
        .limit(limit);

      if (projectId) {
        query = query.eq('project_id', projectId);
      }

      const { data, error } = await query;

      if (error) {
        console.error('Error fetching sync logs:', error);
        throw error;
      }

      return (data || []).map(log => ({
        ...log,
        project_name: (log.projects as any)?.name || null
      }));
    },
  });
}

export function useDbStats() {
  return useQuery({
    queryKey: ['db-stats'],
    queryFn: async () => {
      // Get call records count
      const { count: callRecordsCount, error: callError } = await supabase
        .from('call_records')
        .select('*', { count: 'exact', head: true });

      if (callError) {
        console.error('Error fetching call records count:', callError);
      }

      // Get projects count
      const { count: projectsCount, error: projectsError } = await supabase
        .from('projects')
        .select('*', { count: 'exact', head: true });

      if (projectsError) {
        console.error('Error fetching projects count:', projectsError);
      }

      // Get sync logs count
      const { count: syncLogsCount, error: syncError } = await supabase
        .from('sync_logs')
        .select('*', { count: 'exact', head: true });

      if (syncError) {
        console.error('Error fetching sync logs count:', syncError);
      }

      // Get users count
      const { count: usersCount, error: usersError } = await supabase
        .from('user_roles')
        .select('*', { count: 'exact', head: true });

      if (usersError) {
        console.error('Error fetching users count:', usersError);
      }

      return {
        callRecords: callRecordsCount || 0,
        projects: projectsCount || 0,
        syncLogs: syncLogsCount || 0,
        users: usersCount || 0,
      };
    },
  });
}
