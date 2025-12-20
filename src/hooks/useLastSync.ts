import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { DBSyncLog } from '@/types/database';

export const useLastSync = (projectId?: string) => {
  return useQuery({
    queryKey: ['last_sync', projectId],
    queryFn: async (): Promise<DBSyncLog | null> => {
      if (!projectId) return null;

      const { data, error } = await supabase
        .from('sync_logs')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'success')
        .order('completed_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (error) {
        throw new Error(`Fout bij ophalen sync status: ${error.message}`);
      }

      return data as DBSyncLog | null;
    },
    enabled: !!projectId,
    refetchInterval: 60000, // Refresh every minute
  });
};

export const getSyncStatusColor = (lastSync: DBSyncLog | null): 'green' | 'orange' | 'red' => {
  if (!lastSync || !lastSync.completed_at) return 'red';

  const completedAt = new Date(lastSync.completed_at);
  const now = new Date();
  const hoursSinceSync = (now.getTime() - completedAt.getTime()) / (1000 * 60 * 60);

  if (hoursSinceSync < 1) return 'green';
  if (hoursSinceSync < 24) return 'orange';
  return 'red';
};

export const formatSyncTime = (lastSync: DBSyncLog | null): string => {
  if (!lastSync || !lastSync.completed_at) return 'Nog niet gesynchroniseerd';

  const completedAt = new Date(lastSync.completed_at);
  const now = new Date();
  const minutesAgo = Math.floor((now.getTime() - completedAt.getTime()) / (1000 * 60));

  if (minutesAgo < 1) return 'Zojuist';
  if (minutesAgo < 60) return `${minutesAgo} minuten geleden`;
  
  const hoursAgo = Math.floor(minutesAgo / 60);
  if (hoursAgo < 24) return `${hoursAgo} uur geleden`;
  
  const daysAgo = Math.floor(hoursAgo / 24);
  return `${daysAgo} dagen geleden`;
};
