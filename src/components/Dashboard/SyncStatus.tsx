import { RefreshCw } from 'lucide-react';
import { useLastSync, getSyncStatusColor, formatSyncTime } from '@/hooks/useLastSync';
import { cn } from '@/lib/utils';

interface SyncStatusProps {
  projectId?: string;
}

export const SyncStatus = ({ projectId }: SyncStatusProps) => {
  const { data: lastSync, isLoading } = useLastSync(projectId);

  if (isLoading) {
    return (
      <div className="flex items-center gap-2 text-muted-foreground text-sm">
        <RefreshCw className="h-4 w-4 animate-spin" />
        <span>Laden...</span>
      </div>
    );
  }

  const statusColor = getSyncStatusColor(lastSync);
  const syncTime = formatSyncTime(lastSync);

  const colorClasses = {
    green: 'bg-green-500',
    orange: 'bg-orange-500',
    red: 'bg-red-500',
  };

  return (
    <div className="flex items-center gap-2 text-sm" data-tour="sync-status">
      <div className={cn('h-2 w-2 rounded-full', colorClasses[statusColor])} />
      <span className="text-muted-foreground">
        Sync: {syncTime}
        {lastSync?.records_synced !== undefined && lastSync.records_synced > 0 && (
          <span className="ml-1 text-xs">
            ({lastSync.records_synced} records)
          </span>
        )}
      </span>
    </div>
  );
};
