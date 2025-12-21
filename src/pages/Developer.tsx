import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Database, Activity, RefreshCw, AlertCircle, CheckCircle, Clock, FileText, Code, ChevronDown, Copy, AlertTriangle, Bug, Trash2, CheckCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { useSyncLogs, useDbStats } from "@/hooks/useSyncLogs";
import { useProjects } from "@/hooks/useProjects";
import { useErrorLogs, useUnresolvedErrorCount, useResolveError, useDeleteError } from "@/hooks/useErrorLogs";
import { toast } from "sonner";

const statusStyles: Record<string, { icon: React.ReactNode; color: string }> = {
  completed: { icon: <CheckCircle className="h-4 w-4" />, color: 'text-primary bg-primary/10' },
  success: { icon: <CheckCircle className="h-4 w-4" />, color: 'text-primary bg-primary/10' },
  running: { icon: <RefreshCw className="h-4 w-4 animate-spin" />, color: 'text-kpi-blue-text bg-kpi-blue' },
  failed: { icon: <AlertCircle className="h-4 w-4" />, color: 'text-destructive bg-destructive/10' },
  pending: { icon: <Clock className="h-4 w-4" />, color: 'text-warning bg-warning/10' },
};

const errorTypeStyles: Record<string, { icon: React.ReactNode; color: string; label: string }> = {
  javascript_error: { icon: <Bug className="h-4 w-4" />, color: 'text-destructive bg-destructive/10', label: 'JavaScript' },
  react_error: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-kpi-orange-text bg-kpi-orange', label: 'React' },
  api_error: { icon: <AlertCircle className="h-4 w-4" />, color: 'text-kpi-purple-text bg-kpi-purple', label: 'API' },
  network_error: { icon: <RefreshCw className="h-4 w-4" />, color: 'text-kpi-blue-text bg-kpi-blue', label: 'Network' },
  unhandled_rejection: { icon: <AlertTriangle className="h-4 w-4" />, color: 'text-warning bg-warning/10', label: 'Promise' },
};

const copyToClipboard = (text: string, label: string) => {
  navigator.clipboard.writeText(text);
  toast.success(`${label} gekopieerd`);
};

export default function Developer() {
  const { data: syncLogs, isLoading: logsLoading } = useSyncLogs();
  const { data: stats, isLoading: statsLoading } = useDbStats();
  const { projects } = useProjects(false);
  const { data: errorLogs, isLoading: errorLogsLoading } = useErrorLogs();
  const { data: unresolvedCount } = useUnresolvedErrorCount();
  const resolveError = useResolveError();
  const deleteError = useDeleteError();
  
  const [openLogs, setOpenLogs] = useState<Set<string>>(new Set());
  const [openErrors, setOpenErrors] = useState<Set<string>>(new Set());

  const toggleLog = (logId: string) => {
    setOpenLogs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(logId)) {
        newSet.delete(logId);
      } else {
        newSet.add(logId);
      }
      return newSet;
    });
  };

  const toggleError = (errorId: string) => {
    setOpenErrors(prev => {
      const newSet = new Set(prev);
      if (newSet.has(errorId)) {
        newSet.delete(errorId);
      } else {
        newSet.add(errorId);
      }
      return newSet;
    });
  };

  const handleResolveError = (errorId: string) => {
    resolveError.mutate(errorId, {
      onSuccess: () => toast.success('Error gemarkeerd als opgelost'),
      onError: () => toast.error('Kon error niet bijwerken'),
    });
  };

  const handleDeleteError = (errorId: string) => {
    deleteError.mutate(errorId, {
      onSuccess: () => toast.success('Error verwijderd'),
      onError: () => toast.error('Kon error niet verwijderen'),
    });
  };

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
            <TabsTrigger value="errors" className="gap-2 relative">
              <Bug className="h-4 w-4" />
              Error Logs
              {unresolvedCount && unresolvedCount > 0 && (
                <span className="ml-1 px-1.5 py-0.5 text-xs font-medium rounded-full bg-destructive text-destructive-foreground">
                  {unresolvedCount}
                </span>
              )}
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
                        const isOpen = openLogs.has(log.id);
                        
                        return (
                          <Collapsible
                            key={log.id}
                            open={isOpen}
                            onOpenChange={() => toggleLog(log.id)}
                          >
                            <div className="rounded-lg border bg-card overflow-hidden">
                              <CollapsibleTrigger className="w-full p-4 text-left hover:bg-muted/50 transition-colors">
                                <div className="flex items-start justify-between mb-3">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={style.color}>
                                      {style.icon}
                                      <span className="ml-1 capitalize">{status}</span>
                                    </Badge>
                                    <span className="font-medium">{log.project_name || 'Onbekend project'}</span>
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">
                                      {log.started_at ? new Date(log.started_at).toLocaleString('nl-NL') : '-'}
                                    </span>
                                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                  </div>
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
                                  <div className="mt-3 p-2 rounded bg-destructive/10 text-destructive text-sm text-left">
                                    <strong>Error:</strong> {log.error_message.length > 100 ? log.error_message.slice(0, 100) + '...' : log.error_message}
                                  </div>
                                )}
                              </CollapsibleTrigger>
                              
                              <CollapsibleContent>
                                <div className="px-4 pb-4 pt-2 border-t bg-muted/30 space-y-4">
                                  {/* Full Log ID */}
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="text-sm text-muted-foreground">Log ID:</span>
                                      <p className="font-mono text-sm">{log.id}</p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(log.id, 'Log ID');
                                      }}
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </div>

                                  {/* Project ID */}
                                  {log.project_id && (
                                    <div className="flex items-center justify-between">
                                      <div>
                                        <span className="text-sm text-muted-foreground">Project ID:</span>
                                        <p className="font-mono text-sm">{log.project_id}</p>
                                      </div>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(log.project_id!, 'Project ID');
                                        }}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </div>
                                  )}

                                  {/* Timestamps */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <span className="text-sm text-muted-foreground">Gestart op:</span>
                                      <p className="text-sm font-medium">
                                        {log.started_at ? new Date(log.started_at).toLocaleString('nl-NL', { 
                                          dateStyle: 'full', 
                                          timeStyle: 'medium' 
                                        }) : '-'}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-sm text-muted-foreground">Voltooid op:</span>
                                      <p className="text-sm font-medium">
                                        {log.completed_at ? new Date(log.completed_at).toLocaleString('nl-NL', { 
                                          dateStyle: 'full', 
                                          timeStyle: 'medium' 
                                        }) : '-'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Sync Period Details */}
                                  <div className="grid grid-cols-2 gap-4">
                                    <div>
                                      <span className="text-sm text-muted-foreground">Sync periode van:</span>
                                      <p className="text-sm font-medium">
                                        {log.sync_from ? new Date(log.sync_from).toLocaleString('nl-NL', { 
                                          dateStyle: 'full', 
                                          timeStyle: 'medium' 
                                        }) : '-'}
                                      </p>
                                    </div>
                                    <div>
                                      <span className="text-sm text-muted-foreground">Sync periode tot:</span>
                                      <p className="text-sm font-medium">
                                        {log.sync_to ? new Date(log.sync_to).toLocaleString('nl-NL', { 
                                          dateStyle: 'full', 
                                          timeStyle: 'medium' 
                                        }) : '-'}
                                      </p>
                                    </div>
                                  </div>

                                  {/* Full Error Message */}
                                  {log.error_message && (
                                    <div>
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-muted-foreground">Volledige foutmelding:</span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(log.error_message!, 'Foutmelding');
                                          }}
                                        >
                                          <Copy className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      <div className="p-3 rounded bg-destructive/10 text-destructive text-sm font-mono whitespace-pre-wrap break-all">
                                        {log.error_message}
                                      </div>
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
                        );
                      })}
                    </div>
                  </ScrollArea>
                )}
              </CardContent>
            </Card>
          </TabsContent>

          {/* Error Logs Tab */}
          <TabsContent value="errors" className="space-y-4">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Bug className="h-5 w-5" />
                  Error Logs
                  {unresolvedCount && unresolvedCount > 0 && (
                    <Badge variant="destructive">{unresolvedCount} open</Badge>
                  )}
                </CardTitle>
                <CardDescription>
                  Alle systeem errors worden hier automatisch gelogd
                </CardDescription>
              </CardHeader>
              <CardContent>
                {errorLogsLoading ? (
                  <div className="text-center py-8 text-muted-foreground">Laden...</div>
                ) : !errorLogs || errorLogs.length === 0 ? (
                  <div className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-12 w-12 mx-auto mb-3 text-primary" />
                    <p className="font-medium">Geen errors!</p>
                    <p className="text-sm">Het systeem draait zonder problemen.</p>
                  </div>
                ) : (
                  <ScrollArea className="h-[500px]">
                    <div className="space-y-3">
                      {errorLogs.map((error) => {
                        const style = errorTypeStyles[error.error_type] || errorTypeStyles.javascript_error;
                        const isOpen = openErrors.has(error.id);
                        
                        return (
                          <Collapsible
                            key={error.id}
                            open={isOpen}
                            onOpenChange={() => toggleError(error.id)}
                          >
                            <div className={`rounded-lg border overflow-hidden ${error.is_resolved ? 'opacity-60' : ''}`}>
                              <CollapsibleTrigger className="w-full p-4 text-left hover:bg-muted/50 transition-colors">
                                <div className="flex items-start justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <Badge variant="outline" className={style.color}>
                                      {style.icon}
                                      <span className="ml-1">{style.label}</span>
                                    </Badge>
                                    {error.is_resolved && (
                                      <Badge variant="outline" className="text-primary bg-primary/10">
                                        <CheckCheck className="h-3 w-3 mr-1" />
                                        Opgelost
                                      </Badge>
                                    )}
                                    {error.component_name && (
                                      <span className="text-sm text-muted-foreground font-mono">
                                        {error.component_name}
                                      </span>
                                    )}
                                  </div>
                                  <div className="flex items-center gap-2">
                                    <span className="text-sm text-muted-foreground">
                                      {new Date(error.created_at).toLocaleString('nl-NL')}
                                    </span>
                                    <ChevronDown className={`h-4 w-4 text-muted-foreground transition-transform ${isOpen ? 'rotate-180' : ''}`} />
                                  </div>
                                </div>
                                <p className="text-sm font-medium line-clamp-2">
                                  {error.error_message}
                                </p>
                                {error.url && (
                                  <p className="text-xs text-muted-foreground mt-1 truncate">
                                    {error.url}
                                  </p>
                                )}
                              </CollapsibleTrigger>
                              
                              <CollapsibleContent>
                                <div className="px-4 pb-4 pt-2 border-t bg-muted/30 space-y-4">
                                  {/* Actions */}
                                  <div className="flex gap-2">
                                    {!error.is_resolved && (
                                      <Button
                                        variant="outline"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          handleResolveError(error.id);
                                        }}
                                        className="gap-2"
                                      >
                                        <CheckCheck className="h-4 w-4" />
                                        Markeer als opgelost
                                      </Button>
                                    )}
                                    <Button
                                      variant="outline"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        handleDeleteError(error.id);
                                      }}
                                      className="gap-2 text-destructive hover:text-destructive"
                                    >
                                      <Trash2 className="h-4 w-4" />
                                      Verwijderen
                                    </Button>
                                  </div>

                                  {/* Error ID */}
                                  <div className="flex items-center justify-between">
                                    <div>
                                      <span className="text-sm text-muted-foreground">Error ID:</span>
                                      <p className="font-mono text-sm">{error.id}</p>
                                    </div>
                                    <Button
                                      variant="ghost"
                                      size="sm"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        copyToClipboard(error.id, 'Error ID');
                                      }}
                                    >
                                      <Copy className="h-4 w-4" />
                                    </Button>
                                  </div>

                                  {/* Full Error Message */}
                                  <div>
                                    <div className="flex items-center justify-between mb-2">
                                      <span className="text-sm text-muted-foreground">Error message:</span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        onClick={(e) => {
                                          e.stopPropagation();
                                          copyToClipboard(error.error_message, 'Error message');
                                        }}
                                      >
                                        <Copy className="h-4 w-4" />
                                      </Button>
                                    </div>
                                    <div className="p-3 rounded bg-destructive/10 text-destructive text-sm font-mono whitespace-pre-wrap break-all">
                                      {error.error_message}
                                    </div>
                                  </div>

                                  {/* Stack Trace */}
                                  {error.stack_trace && (
                                    <div>
                                      <div className="flex items-center justify-between mb-2">
                                        <span className="text-sm text-muted-foreground">Stack trace:</span>
                                        <Button
                                          variant="ghost"
                                          size="sm"
                                          onClick={(e) => {
                                            e.stopPropagation();
                                            copyToClipboard(error.stack_trace!, 'Stack trace');
                                          }}
                                        >
                                          <Copy className="h-4 w-4" />
                                        </Button>
                                      </div>
                                      <div className="p-3 rounded bg-muted text-sm font-mono whitespace-pre-wrap break-all max-h-48 overflow-auto">
                                        {error.stack_trace}
                                      </div>
                                    </div>
                                  )}

                                  {/* Metadata */}
                                  <div className="grid grid-cols-2 gap-4">
                                    {error.url && (
                                      <div>
                                        <span className="text-sm text-muted-foreground">URL:</span>
                                        <p className="text-sm font-medium break-all">{error.url}</p>
                                      </div>
                                    )}
                                    {error.user_id && (
                                      <div>
                                        <span className="text-sm text-muted-foreground">User ID:</span>
                                        <p className="text-sm font-mono">{error.user_id}</p>
                                      </div>
                                    )}
                                  </div>

                                  {error.user_agent && (
                                    <div>
                                      <span className="text-sm text-muted-foreground">User Agent:</span>
                                      <p className="text-xs font-mono text-muted-foreground break-all">{error.user_agent}</p>
                                    </div>
                                  )}

                                  {error.metadata && Object.keys(error.metadata).length > 0 && (
                                    <div>
                                      <span className="text-sm text-muted-foreground">Extra metadata:</span>
                                      <pre className="mt-1 p-3 rounded bg-muted text-xs font-mono overflow-auto">
                                        {JSON.stringify(error.metadata, null, 2)}
                                      </pre>
                                    </div>
                                  )}
                                </div>
                              </CollapsibleContent>
                            </div>
                          </Collapsible>
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
