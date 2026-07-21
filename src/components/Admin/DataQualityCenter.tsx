import { AlertTriangle, CheckCircle2, ShieldAlert, Wrench } from 'lucide-react';
import { Link } from 'react-router-dom';
import { useDataQualityIssues } from '@/hooks/useDataQualityIssues';
import { useOnboardingStatus } from '@/hooks/useOnboardingStatus';
import { useRecentSyncFailures } from '@/hooks/useSyncLogs';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';

interface DataQualityCenterProps {
  onNavigate: (tab: string) => void;
}

export function DataQualityCenter({ onNavigate }: DataQualityCenterProps) {
  const { data: issues = [], isLoading } = useDataQualityIssues();
  const { data: syncFailures = [] } = useRecentSyncFailures(24);
  const { data: onboarding = [] } = useOnboardingStatus();
  const onboardingIssues = onboarding.filter((project) => project.is_incomplete);
  const syncIssueProjects = new Set(
    issues.filter((issue) => issue.source === 'sync').map((issue) => issue.project_id),
  );
  const legacySyncFailures = syncFailures.filter(
    (failure) => !failure.project_id || !syncIssueProjects.has(failure.project_id),
  );
  const critical = issues.filter((issue) => issue.severity === 'critical').length;
  const openCount = issues.length + legacySyncFailures.length + onboardingIssues.length;

  return (
    <Card className={critical || legacySyncFailures.length
      ? 'border-destructive/35 bg-destructive/5'
      : openCount > 0
        ? 'border-amber-500/35 bg-amber-500/5'
        : 'border-emerald-500/30 bg-emerald-500/5'}>
      <CardContent className="pt-6">
        <div className="flex flex-wrap items-center justify-between gap-3 mb-3">
          <div className="flex items-center gap-2">
            {critical || legacySyncFailures.length
              ? <ShieldAlert className="h-5 w-5 text-destructive" />
              : openCount > 0
                ? <AlertTriangle className="h-5 w-5 text-amber-500" />
                : <CheckCircle2 className="h-5 w-5 text-emerald-600" />}
            <h3 className="font-semibold">Betrouwbaarheidscentrum</h3>
            {!isLoading && <Badge variant={critical ? 'destructive' : 'secondary'}>{openCount} open</Badge>}
          </div>
          <Button size="sm" variant="outline" onClick={() => onNavigate('projecten')}>
            Projectstatus beheren
          </Button>
        </div>

        <p className="text-xs text-muted-foreground mb-4">
          Centrale controle op mapping, nieuwe BasiCall-codes, datavolledigheid en herstelpogingen.
        </p>

        {isLoading ? (
          <p className="text-sm text-muted-foreground">Controles laden…</p>
        ) : openCount === 0 ? (
          <p className="text-sm text-emerald-700 dark:text-emerald-300">Alle bewaakte projecten zijn groen.</p>
        ) : (
          <div className="space-y-2">
            {issues.map((issue) => (
              <div key={issue.id} className="rounded-lg border bg-background p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    {issue.severity === 'critical'
                      ? <ShieldAlert className="h-4 w-4 text-destructive" />
                      : <AlertTriangle className="h-4 w-4 text-amber-500" />}
                    <span className="font-medium text-sm">{issue.project_name}</span>
                    <span className="text-xs text-muted-foreground">#{issue.basicall_project_id}</span>
                    <Badge variant="outline">{issue.source}</Badge>
                    {!issue.enforcement_enabled && <Badge variant="secondary">observe-only</Badge>}
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{issue.admin_detail}</p>
                  <p className="text-[10px] text-muted-foreground mt-1">
                    Laatst gezien {new Date(issue.last_seen_at).toLocaleString('nl-NL')}
                  </p>
                </div>
                {issue.source === 'sync' ? (
                  <Button size="sm" variant="outline" onClick={() => onNavigate('sync')} className="shrink-0 gap-1">
                    <Wrench className="h-3 w-3" /> Herstellen
                  </Button>
                ) : (
                  <Button size="sm" variant="outline" asChild className="shrink-0 gap-1">
                    <Link to={`/dashboard?project=${encodeURIComponent(issue.project_key)}`}>
                      <Wrench className="h-3 w-3" /> Mapping
                    </Link>
                  </Button>
                )}
              </div>
            ))}

            {onboardingIssues.map((project) => {
              const missing = [
                !project.has_token && 'token',
                !project.has_mapping && 'mapping',
                !project.has_records && 'eerste records',
              ].filter(Boolean).join(', ');
              return (
                <div key={`onboarding-${project.project_id}`} className="rounded-lg border bg-background p-3 flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <AlertTriangle className="h-4 w-4 text-amber-500" />
                      <span className="font-medium text-sm">{project.name}</span>
                      <span className="text-xs text-muted-foreground">#{project.basicall_project_id}</span>
                      <Badge variant="outline">onboarding</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">Ontbreekt: {missing || 'kritieke projectconfiguratie'}.</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => onNavigate('projecten')}>Open</Button>
                </div>
              );
            })}

            {legacySyncFailures.slice(0, 10).map((failure) => (
              <div key={`legacy-${failure.id}`} className="rounded-lg border bg-background p-3 flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <ShieldAlert className="h-4 w-4 text-destructive" />
                    <span className="font-medium text-sm">{failure.project_name ?? 'Onbekend project'}</span>
                    <Badge variant="outline">sync</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1 truncate" title={failure.error_message ?? undefined}>
                    {failure.error_message ?? 'Synchronisatie mislukt.'}
                  </p>
                </div>
                <Button size="sm" variant="outline" onClick={() => onNavigate('sync')}>Open</Button>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
