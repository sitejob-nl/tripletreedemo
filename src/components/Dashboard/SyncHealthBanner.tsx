import { AlertCircle } from 'lucide-react';
import { useLastSync, useLastSyncAttempt } from '@/hooks/useLastSync';

interface SyncHealthBannerProps {
  projectId?: string;
}

// Toont een rode banner voor de klant als:
// - de allerlaatste sync-poging gefaald is, EN
// - er sindsdien geen succes is geweest, OF de laatste success > 48u geleden is.
// Doel: klant ziet niet stil een lege KPI bij nachtsync-failure.
export const SyncHealthBanner = ({ projectId }: SyncHealthBannerProps) => {
  const { data: lastAttempt } = useLastSyncAttempt(projectId);
  const { data: lastSuccess } = useLastSync(projectId);

  if (!projectId || !lastAttempt) return null;
  if (lastAttempt.status !== 'failed') return null;

  const lastSuccessTime = lastSuccess?.completed_at ? new Date(lastSuccess.completed_at) : null;
  const attemptTime = lastAttempt.started_at ? new Date(lastAttempt.started_at) : null;

  // Als de succes JONGER is dan de failed attempt → niks aan de hand, gewoon een oude failure
  if (lastSuccessTime && attemptTime && lastSuccessTime > attemptTime) return null;

  const hoursSinceLastSuccess = lastSuccessTime
    ? (Date.now() - lastSuccessTime.getTime()) / 3_600_000
    : Infinity;

  const formatAgo = (d: Date) => {
    const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
    if (mins < 60) return `${mins} min geleden`;
    const hrs = Math.floor(mins / 60);
    if (hrs < 24) return `${hrs} uur geleden`;
    return `${Math.floor(hrs / 24)} dagen geleden`;
  };

  return (
    <div className="bg-destructive/10 border border-destructive/30 rounded-lg p-4 mb-4 flex items-start gap-3">
      <AlertCircle className="text-destructive flex-shrink-0 mt-0.5" size={20} />
      <div className="flex-1 text-sm">
        <div className="font-medium text-destructive mb-1">Laatste synchronisatie is niet geslaagd</div>
        <div className="text-muted-foreground">
          De meest recente poging {attemptTime ? `(${formatAgo(attemptTime)})` : ''} is mislukt.{' '}
          {lastSuccessTime
            ? `De weergegeven data is van ${formatAgo(lastSuccessTime)}.`
            : 'Er is nog geen succesvolle synchronisatie beschikbaar.'}
          {hoursSinceLastSuccess > 48 &&
            ' Neem contact op met Triple Tree als dit blijft aanhouden.'}
        </div>
      </div>
    </div>
  );
};
