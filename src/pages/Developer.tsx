import { Link } from "react-router-dom";
import { ArrowLeft, Database, Activity, RefreshCw, AlertCircle, CheckCircle, Clock, FileText, Code } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useSyncLogs, useDbStats } from "@/hooks/useSyncLogs";
import { useProjects } from "@/hooks/useProjects";

const statusStyles: Record<string, { icon: React.ReactNode; color: string }> = {
  completed: { icon: <CheckCircle className="h-4 w-4" />, color: 'text-primary bg-primary/10' },
  running: { icon: <RefreshCw className="h-4 w-4 animate-spin" />, color: 'text-kpi-blue-text bg-kpi-blue' },
  failed: { icon: <AlertCircle className="h-4 w-4" />, color: 'text-destructive bg-destructive/10' },
  pending: { icon: <Clock className="h-4 w-4" />, color: 'text-warning bg-warning/10' },
};

export default function Developer() {
  const { data: syncLogs, isLoading: logsLoading } = useSyncLogs();
  const { data: stats, isLoading: statsLoading } = useDbStats();
  const { projects } = useProjects(false);

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Developer Console</h1>
              <p className="text-muted-foreground">System logs, statistieken en debug tools</p>
            </div>
          </div>
          <div className="flex gap-2">
            <Link to="/developer/api-docs">
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                API Docs
              </Button>
            </Link>
          </div>
        </div>

        <Tabs defaultValue="logs" className="space-y-6">
          <TabsList>
            <TabsTrigger value="logs" className="gap-2">
              <Activity className="h-4 w-4" />
              Sync Logs
            </TabsTrigger>
            <TabsTrigger value="stats" className="gap-2">
              <Database className="h-4 w-4" />
              Database Stats
            </TabsTrigger>
            <TabsTrigger value="config" className="gap-2">
              <Code className="h-4 w-4" />
              Configuratie
            </TabsTrigger>
          </TabsList>

          {/* Sync Logs Tab */}
          <TabsContent value="logs" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Synchronisatie Logs</CardTitle>
                <CardDescription>
                  Overzicht van alle sync operaties per project
                </CardDescription>
              </CardHeader>
              <CardContent>
                {logsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Laden...</div>
                ) : !syncLogs || syncLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    Nog geen sync logs beschikbaar.
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {syncLogs.map((log) => {
                        const status = log.status || 'pending';
                        const style = statusStyles[status] || statusStyles.pending;
                        
                        return (
                          <div 
                            key={log.id} 
                            className="p-4 rounded-lg border bg-card"
                          >
                            <div className="flex items-start justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <Badge variant="outline" className={style.color}>
                                  {style.icon}
                                  <span className="ml-1 capitalize">{status}</span>
                                </Badge>
                                <span className="font-medium">{log.project_name || 'Onbekend project'}</span>
                              </div>
                              <span className="text-sm text-muted-foreground">
                                {log.started_at ? new Date(log.started_at).toLocaleString('nl-NL') : '-'}
                              </span>
                            </div>
                            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                              <div>
                                <span className="text-muted-foreground">Records:</span>
                                <p className="font-medium">{log.records_synced || 0}</p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Periode:</span>
                                <p className="font-medium text-xs">
                                  {log.sync_from ? new Date(log.sync_from).toLocaleDateString('nl-NL') : '-'} → {' '}
                                  {log.sync_to ? new Date(log.sync_to).toLocaleDateString('nl-NL') : '-'}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">Duur:</span>
                                <p className="font-medium">
                                  {log.started_at && log.completed_at 
                                    ? `${Math.round((new Date(log.completed_at).getTime() - new Date(log.started_at).getTime()) / 1000)}s`
                                    : '-'}
                                </p>
                              </div>
                              <div>
                                <span className="text-muted-foreground">ID:</span>
                                <p className="font-mono text-xs truncate">{log.id.slice(0, 8)}...</p>
                              </div>
                            </div>
                            {log.error_message && (
                              <div className="mt-3 p-2 rounded bg-destructive/10 text-destructive text-sm">
                                <strong>Error:</strong> {log.error_message}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Database Stats Tab */}
          <TabsContent value="stats" className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-primary/20">
                      <Database className="h-5 w-5 text-primary" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {statsLoading ? '...' : stats?.callRecords.toLocaleString()}
                      </p>
                      <p className="text-sm text-muted-foreground">Call Records</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-kpi-blue">
                      <Activity className="h-5 w-5 text-kpi-blue-text" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {statsLoading ? '...' : stats?.projects}
                      </p>
                      <p className="text-sm text-muted-foreground">Projecten</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-kpi-orange">
                      <RefreshCw className="h-5 w-5 text-kpi-orange-text" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {statsLoading ? '...' : stats?.syncLogs}
                      </p>
                      <p className="text-sm text-muted-foreground">Sync Logs</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
              <Card>
                <CardContent className="pt-6">
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded-lg bg-kpi-purple">
                      <Database className="h-5 w-5 text-kpi-purple-text" />
                    </div>
                    <div>
                      <p className="text-2xl font-bold">
                        {statsLoading ? '...' : stats?.users}
                      </p>
                      <p className="text-sm text-muted-foreground">Gebruikers</p>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* Projects Overview */}
            <Card>
              <CardHeader>
                <CardTitle>Projecten Overzicht</CardTitle>
                <CardDescription>Alle geconfigureerde projecten met hun instellingen</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-3">
                  {projects.map((project) => (
                    <div key={project.id} className="p-4 rounded-lg border bg-card">
                      <div className="flex items-center justify-between">
                        <div>
                          <p className="font-medium">{project.name}</p>
                          <p className="text-sm text-muted-foreground">Key: {project.project_key}</p>
                        </div>
                        <div className="text-right text-sm">
                          <p>BasiCall ID: <span className="font-mono">{project.basicall_project_id}</span></p>
                          <p className="text-muted-foreground">
                            €{project.hourly_rate}/uur • {project.vat_rate}% BTW
                          </p>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Configuration Tab */}
          <TabsContent value="config" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle>Omgevingsconfiguratie</CardTitle>
                <CardDescription>Overzicht van de systeemconfiguratie</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="p-4 rounded-lg border bg-card">
                    <h4 className="font-medium mb-2">Supabase</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Project ID:</span>
                        <span className="font-mono">tvsdbztjqksxybxjwtrf</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Status:</span>
                        <Badge variant="outline" className="text-primary bg-primary/10">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Verbonden
                        </Badge>
                      </div>
                    </div>
                  </div>
                  <div className="p-4 rounded-lg border bg-card">
                    <h4 className="font-medium mb-2">Authenticatie</h4>
                    <div className="space-y-2 text-sm">
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Methode:</span>
                        <span>Email/Password</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-muted-foreground">Rollen:</span>
                        <span>user, admin, superadmin</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div className="p-4 rounded-lg border bg-card">
                  <h4 className="font-medium mb-2">BasiCall API Tokens</h4>
                  <div className="space-y-2">
                    {projects.map((project) => (
                      <div key={project.id} className="flex justify-between text-sm">
                        <span className="text-muted-foreground">{project.name}:</span>
                        <span className="font-mono">
                          {project.basicall_token.substring(0, 8)}...{project.basicall_token.slice(-4)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
