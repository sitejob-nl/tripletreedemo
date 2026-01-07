import { useState, useMemo } from "react";
import { format, subMonths, startOfYear, startOfQuarter, endOfQuarter, subQuarters } from "date-fns";
import { nl } from "date-fns/locale";
import { useSyncJobs, useCreateSyncJob } from "@/hooks/useSyncJobs";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Clock, CheckCircle, XCircle, Loader2, Play, Search } from "lucide-react";

type PresetPeriod = "2024" | "2025" | "this-quarter" | "last-quarter" | "last-month" | "custom";

const getPresetDates = (preset: PresetPeriod): { start: Date; end: Date } => {
  const now = new Date();
  
  switch (preset) {
    case "2024":
      return { start: new Date(2024, 0, 1), end: new Date(2024, 11, 31) };
    case "2025":
      return { start: new Date(2025, 0, 1), end: now };
    case "this-quarter":
      return { start: startOfQuarter(now), end: endOfQuarter(now) };
    case "last-quarter":
      const lastQ = subQuarters(now, 1);
      return { start: startOfQuarter(lastQ), end: endOfQuarter(lastQ) };
    case "last-month":
      const lastMonth = subMonths(now, 1);
      return { start: new Date(lastMonth.getFullYear(), lastMonth.getMonth(), 1), end: new Date(lastMonth.getFullYear(), lastMonth.getMonth() + 1, 0) };
    default:
      return { start: startOfYear(now), end: now };
  }
};

const StatusBadge = ({ status }: { status: string }) => {
  const config = {
    pending: { icon: Clock, label: "Wachtend", className: "bg-muted text-muted-foreground" },
    processing: { icon: Loader2, label: "Bezig", className: "bg-primary/20 text-primary" },
    completed: { icon: CheckCircle, label: "Voltooid", className: "bg-green-500/20 text-green-600" },
    failed: { icon: XCircle, label: "Mislukt", className: "bg-destructive/20 text-destructive" }
  }[status] || { icon: Clock, label: status, className: "bg-muted" };

  const Icon = config.icon;

  return (
    <Badge variant="outline" className={`gap-1 ${config.className}`}>
      <Icon className={`h-3 w-3 ${status === 'processing' ? 'animate-spin' : ''}`} />
      {config.label}
    </Badge>
  );
};

export function SyncManager() {
  const { projects, isLoading: projectsLoading } = useProjects(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [preset, setPreset] = useState<PresetPeriod>("2024");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [filterProject, setFilterProject] = useState<string>("all");
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const { toast } = useToast();

  const { data: syncJobs, isLoading: jobsLoading } = useSyncJobs(undefined, 50);
  const createJob = useCreateSyncJob();

  const filteredJobs = useMemo(() => {
    return syncJobs?.filter(job => {
      const matchesProject = filterProject === "all" || job.project_id === filterProject;
      const matchesStatus = filterStatus === "all" || job.status === filterStatus;
      return matchesProject && matchesStatus;
    }) || [];
  }, [syncJobs, filterProject, filterStatus]);

  const handleStartSync = async () => {
    if (!selectedProjectId) {
      toast({
        title: "Selecteer een project",
        description: "Kies eerst een project om te synchroniseren.",
        variant: "destructive"
      });
      return;
    }

    let startDate: string;
    let endDate: string;

    if (preset === "custom") {
      if (!customStart || !customEnd) {
        toast({
          title: "Vul datums in",
          description: "Kies een begin- en einddatum voor de synchronisatie.",
          variant: "destructive"
        });
        return;
      }
      startDate = customStart;
      endDate = customEnd;
    } else {
      const dates = getPresetDates(preset);
      startDate = format(dates.start, "yyyy-MM-dd");
      endDate = format(dates.end, "yyyy-MM-dd");
    }

    try {
      await createJob.mutateAsync({
        projectId: selectedProjectId,
        startDate,
        endDate
      });

      toast({
        title: "Sync job aangemaakt",
        description: "De VPS pakt deze opdracht binnenkort op."
      });
    } catch (error: any) {
      toast({
        title: "Fout bij aanmaken job",
        description: error.message || "Er is iets misgegaan.",
        variant: "destructive"
      });
    }
  };

  const presetDates = preset !== "custom" ? getPresetDates(preset) : null;

  return (
    <div className="space-y-6">
      {/* Create Sync Job */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <RefreshCw className="h-5 w-5" />
            Nieuwe Synchronisatie
          </CardTitle>
          <CardDescription>
            Start een sync job om data op te halen van BasiCall. De VPS controleert elke minuut op nieuwe opdrachten.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Project Selection */}
          <div className="space-y-2">
            <Label>Project</Label>
            <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
              <SelectTrigger>
                <SelectValue placeholder="Selecteer een project..." />
              </SelectTrigger>
              <SelectContent>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Period Selection */}
          <div className="space-y-3">
            <Label>Periode</Label>
            <RadioGroup value={preset} onValueChange={(v) => setPreset(v as PresetPeriod)} className="grid grid-cols-3 gap-2">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="2024" id="2024" />
                <Label htmlFor="2024" className="font-normal cursor-pointer">Heel 2024</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="2025" id="2025" />
                <Label htmlFor="2025" className="font-normal cursor-pointer">2025 t/m nu</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="this-quarter" id="this-quarter" />
                <Label htmlFor="this-quarter" className="font-normal cursor-pointer">Dit kwartaal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="last-quarter" id="last-quarter" />
                <Label htmlFor="last-quarter" className="font-normal cursor-pointer">Vorig kwartaal</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="last-month" id="last-month" />
                <Label htmlFor="last-month" className="font-normal cursor-pointer">Vorige maand</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="custom" id="custom" />
                <Label htmlFor="custom" className="font-normal cursor-pointer">Anders</Label>
              </div>
            </RadioGroup>

            {preset === "custom" ? (
              <div className="grid grid-cols-2 gap-4 pt-2">
                <div className="space-y-2">
                  <Label htmlFor="start-date">Van</Label>
                  <Input
                    id="start-date"
                    type="date"
                    value={customStart}
                    onChange={(e) => setCustomStart(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="end-date">Tot</Label>
                  <Input
                    id="end-date"
                    type="date"
                    value={customEnd}
                    onChange={(e) => setCustomEnd(e.target.value)}
                  />
                </div>
              </div>
            ) : presetDates && (
              <p className="text-sm text-muted-foreground">
                {format(presetDates.start, "d MMMM yyyy", { locale: nl })} t/m {format(presetDates.end, "d MMMM yyyy", { locale: nl })}
              </p>
            )}
          </div>

          {/* Start Button */}
          <Button 
            onClick={handleStartSync} 
            disabled={createJob.isPending || !selectedProjectId}
            className="w-full gap-2"
          >
            {createJob.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Play className="h-4 w-4" />
            )}
            Start Synchronisatie
          </Button>
        </CardContent>
      </Card>

      {/* Job History */}
      <Card>
        <CardHeader>
          <CardTitle>Sync Historie</CardTitle>
          <CardDescription>Overzicht van alle synchronisatie opdrachten</CardDescription>
        </CardHeader>
        <CardContent>
          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <Select value={filterProject} onValueChange={setFilterProject}>
              <SelectTrigger className="w-full sm:w-[200px]">
                <SelectValue placeholder="Filter op project" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle projecten</SelectItem>
                {projects.map((project) => (
                  <SelectItem key={project.id} value={project.id}>
                    {project.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterStatus} onValueChange={setFilterStatus}>
              <SelectTrigger className="w-full sm:w-[180px]">
                <SelectValue placeholder="Filter op status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle statussen</SelectItem>
                <SelectItem value="pending">Wachtend</SelectItem>
                <SelectItem value="processing">Bezig</SelectItem>
                <SelectItem value="completed">Voltooid</SelectItem>
                <SelectItem value="failed">Mislukt</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {jobsLoading ? (
            <div className="text-center py-8 text-muted-foreground">Laden...</div>
          ) : filteredJobs.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              Geen sync jobs gevonden.
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Project</TableHead>
                    <TableHead>Periode</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="hidden md:table-cell">Records</TableHead>
                    <TableHead className="hidden lg:table-cell">Aangemaakt</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredJobs.map((job) => (
                    <TableRow key={job.id}>
                      <TableCell className="font-medium">{job.project_name}</TableCell>
                      <TableCell className="text-sm">
                        {format(new Date(job.start_date), "dd-MM-yyyy")} → {format(new Date(job.end_date), "dd-MM-yyyy")}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={job.status} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {job.status === "completed" ? job.records_synced.toLocaleString() : "-"}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {format(new Date(job.created_at), "dd-MM-yyyy HH:mm")}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
