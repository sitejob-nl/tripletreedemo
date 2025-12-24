import { useState } from "react";
import { format, subMonths, startOfYear, endOfYear, startOfQuarter, endOfQuarter, subQuarters } from "date-fns";
import { nl } from "date-fns/locale";
import { useSyncJobs, useCreateSyncJob } from "@/hooks/useSyncJobs";
import { useProjects } from "@/hooks/useProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useToast } from "@/hooks/use-toast";
import { RefreshCw, Clock, CheckCircle, XCircle, Loader2, Play } from "lucide-react";

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

const StatusIcon = ({ status }: { status: string }) => {
  switch (status) {
    case "pending":
      return <Clock className="h-4 w-4 text-muted-foreground" />;
    case "processing":
      return <Loader2 className="h-4 w-4 text-primary animate-spin" />;
    case "completed":
      return <CheckCircle className="h-4 w-4 text-green-500" />;
    case "failed":
      return <XCircle className="h-4 w-4 text-destructive" />;
    default:
      return null;
  }
};

const statusLabels: Record<string, string> = {
  pending: "Wachtend",
  processing: "Bezig...",
  completed: "Voltooid",
  failed: "Mislukt"
};

export function SyncJobManager() {
  const { projects, isLoading: projectsLoading } = useProjects(false);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [preset, setPreset] = useState<PresetPeriod>("2024");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const { toast } = useToast();

  const { data: syncJobs, isLoading: jobsLoading } = useSyncJobs(undefined, 10);
  const createJob = useCreateSyncJob();

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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <RefreshCw className="h-5 w-5" />
          Data Synchronisatie
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

        {/* Recent Jobs */}
        <div className="space-y-3 pt-4 border-t">
          <h4 className="font-medium text-sm">Recente Jobs</h4>
          {jobsLoading ? (
            <p className="text-sm text-muted-foreground">Laden...</p>
          ) : !syncJobs?.length ? (
            <p className="text-sm text-muted-foreground">Nog geen sync jobs.</p>
          ) : (
            <div className="space-y-2">
              {syncJobs.map((job) => (
                <div 
                  key={job.id} 
                  className="flex items-center justify-between p-3 rounded-lg bg-muted/50 text-sm"
                >
                  <div className="flex items-center gap-3">
                    <StatusIcon status={job.status} />
                    <div>
                      <p className="font-medium">{job.project_name}</p>
                      <p className="text-xs text-muted-foreground">
                        {format(new Date(job.start_date), "dd-MM-yyyy")} → {format(new Date(job.end_date), "dd-MM-yyyy")}
                      </p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className={`text-xs font-medium ${
                      job.status === "completed" ? "text-green-600" :
                      job.status === "failed" ? "text-destructive" :
                      job.status === "processing" ? "text-primary" :
                      "text-muted-foreground"
                    }`}>
                      {statusLabels[job.status]}
                    </p>
                    {job.status === "completed" && job.records_synced > 0 && (
                      <p className="text-xs text-muted-foreground">{job.records_synced.toLocaleString()} records</p>
                    )}
                    {job.status === "failed" && job.log_message && (
                      <p className="text-xs text-destructive truncate max-w-[150px]" title={job.log_message}>
                        {job.log_message}
                      </p>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
