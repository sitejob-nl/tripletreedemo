import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { useCustomersWithProjects } from "@/hooks/useCustomerProjects";
import { useUsers } from "@/hooks/useUsers";
import { useSyncJobs } from "@/hooks/useSyncJobs";
import { useRecentSyncFailures } from "@/hooks/useSyncLogs";
import { useMappingIssues } from "@/hooks/useMappingIssues";
import { OnboardingChecklist } from "@/components/Admin/OnboardingChecklist";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  FolderKanban,
  Users,
  UserCheck,
  RefreshCw,
  Plus,
  UserPlus,
  CheckCircle,
  XCircle,
  Clock,
  Loader2,
  AlertTriangle
} from "lucide-react";

interface AdminDashboardProps {
  onNavigate: (tab: string) => void;
  onOpenAddProject: () => void;
  onOpenAddCustomer: () => void;
}

const statusIcons: Record<string, React.ReactNode> = {
  pending: <Clock className="h-3 w-3 text-muted-foreground" />,
  processing: <Loader2 className="h-3 w-3 text-primary animate-spin" />,
  completed: <CheckCircle className="h-3 w-3 text-green-500" />,
  failed: <XCircle className="h-3 w-3 text-destructive" />
};

export function AdminDashboard({ onNavigate, onOpenAddProject, onOpenAddCustomer }: AdminDashboardProps) {
  const { user } = useAuth();
  const { projects, isLoading: projectsLoading } = useProjects(false, user?.id);
  const { data: customers, isLoading: customersLoading } = useCustomersWithProjects();
  const { data: users, isLoading: usersLoading } = useUsers();
  const { data: syncJobs, isLoading: jobsLoading } = useSyncJobs(undefined, 5);
  const { data: syncFailures } = useRecentSyncFailures(24);
  const { data: mappingIssues, isLoading: issuesLoading } = useMappingIssues();

  const activeProjects = projects.filter(p => p.is_active).length;
  const recentJobs = syncJobs?.slice(0, 5) || [];

  return (
    <div className="space-y-6">
      {/* Stats Overview */}
      <div className="grid gap-4 md:grid-cols-4" data-tour="admin-stats">
        <Card 
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => onNavigate("projecten")}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{projectsLoading ? "..." : projects.length}</p>
                <p className="text-sm text-muted-foreground">Projecten</p>
                <p className="text-xs text-muted-foreground mt-1">{activeProjects} actief</p>
              </div>
              <div className="p-3 rounded-full bg-primary/10">
                <FolderKanban className="h-6 w-6 text-primary" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => onNavigate("klanten")}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{customersLoading ? "..." : customers?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Klanten</p>
              </div>
              <div className="p-3 rounded-full bg-green-500/10">
                <UserCheck className="h-6 w-6 text-green-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => onNavigate("gebruikers")}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{usersLoading ? "..." : users?.length || 0}</p>
                <p className="text-sm text-muted-foreground">Gebruikers</p>
              </div>
              <div className="p-3 rounded-full bg-blue-500/10">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
            </div>
          </CardContent>
        </Card>

        <Card 
          className="cursor-pointer hover:border-primary/50 transition-colors"
          onClick={() => onNavigate("sync")}
        >
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-3xl font-bold">{jobsLoading ? "..." : syncJobs?.filter(j => j.status === "completed").length || 0}</p>
                <p className="text-sm text-muted-foreground">Sync Jobs (voltooid)</p>
              </div>
              <div className="p-3 rounded-full bg-orange-500/10">
                <RefreshCw className="h-6 w-6 text-orange-500" />
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Quick Actions */}
      <div className="flex flex-wrap gap-3" data-tour="admin-quick-actions">
        <Button onClick={onOpenAddProject} className="gap-2">
          <Plus className="h-4 w-4" />
          Nieuw project
        </Button>
        <Button onClick={onOpenAddCustomer} variant="outline" className="gap-2">
          <UserPlus className="h-4 w-4" />
          Nieuwe klant
        </Button>
        <Button onClick={() => onNavigate("sync")} variant="outline" className="gap-2">
          <RefreshCw className="h-4 w-4" />
          Sync starten
        </Button>
      </div>

      {/* Onboarding-checklist — projecten met open kritieke stappen (token/mapping/records) */}
      <OnboardingChecklist onNavigate={onNavigate} />

      {/* Sync-failures laatste 24u — rood omdat nachtsync-falen = geen verse data voor klant */}
      {syncFailures && syncFailures.length > 0 && (
        <Card className="border-destructive/40 bg-destructive/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <XCircle className="h-5 w-5 text-destructive" />
              <h3 className="font-semibold">Sync-failures laatste 24u ({syncFailures.length})</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Deze syncs zijn gefaald — klanten zien mogelijk geen verse data. Controleer token, BasiCall-API of log.
            </p>
            <div className="space-y-2">
              {syncFailures.slice(0, 10).map((f) => (
                <div
                  key={f.id}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg bg-background text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {f.project_name ?? "Onbekend project"}
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5 truncate" title={f.error_message ?? undefined}>
                      {f.error_message ?? "Geen error-message"}
                    </div>
                    {f.started_at && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        {new Date(f.started_at).toLocaleString("nl-NL", {
                          day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit"
                        })}
                      </div>
                    )}
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNavigate("sync")}
                    className="flex-shrink-0"
                  >
                    Sync-tab
                  </Button>
                </div>
              ))}
              {syncFailures.length > 10 && (
                <p className="text-xs text-muted-foreground pt-1">
                  + {syncFailures.length - 10} eerdere failures — zie sync-tab voor volledig overzicht.
                </p>
              )}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Mapping-config issues — waarschuwt admin over projecten die silent €0 of foute metrics tonen */}
      {!issuesLoading && mappingIssues && mappingIssues.length > 0 && (
        <Card className="border-amber-500/30 bg-amber-500/5">
          <CardContent className="pt-6">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-5 w-5 text-amber-500" />
              <h3 className="font-semibold">Mapping-config issues ({mappingIssues.length})</h3>
            </div>
            <p className="text-xs text-muted-foreground mb-3">
              Deze projecten hebben een configuratie die geen of foutieve KPI&apos;s oplevert. Open de betreffende project-configuratie om dit te corrigeren.
            </p>
            <div className="space-y-2">
              {mappingIssues.map((iss) => (
                <div
                  key={`${iss.project_id}-${iss.issue_type}`}
                  className="flex items-start justify-between gap-3 p-3 rounded-lg bg-background text-sm"
                >
                  <div className="flex-1 min-w-0">
                    <div className="font-medium truncate">
                      {iss.name} <span className="text-xs text-muted-foreground">#{iss.basicall_project_id}</span>
                    </div>
                    <div className="text-xs text-muted-foreground mt-0.5">{iss.issue_message}</div>
                  </div>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => onNavigate("projecten")}
                    className="flex-shrink-0"
                  >
                    Configureer
                  </Button>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recent Sync Jobs */}
      <Card data-tour="admin-recent-jobs">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold">Recente Sync Jobs</h3>
            <Button variant="ghost" size="sm" onClick={() => onNavigate("sync")}>
              Alles bekijken
            </Button>
          </div>
          {jobsLoading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : recentJobs.length === 0 ? (
            <p className="text-sm text-muted-foreground">Geen recente sync jobs.</p>
          ) : (
            <div className="space-y-2">
              {recentJobs.map((job) => (
                <div 
                  key={job.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm"
                >
                  <div className="flex items-center gap-2">
                    {statusIcons[job.status]}
                    <span className="font-medium">{job.project_name}</span>
                  </div>
                  <span className={`text-xs ${
                    job.status === "completed" ? "text-green-600" :
                    job.status === "failed" ? "text-destructive" :
                    "text-muted-foreground"
                  }`}>
                    {job.status === "completed" ? `${job.records_synced} records` : job.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
