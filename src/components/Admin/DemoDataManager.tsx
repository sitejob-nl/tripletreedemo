import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { format } from "date-fns";
import { nl } from "date-fns/locale";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { useToast } from "@/hooks/use-toast";
import { friendlyError } from "@/lib/friendlyError";
import { Loader2, Sparkles, PlayCircle } from "lucide-react";

const DEMO_EMAIL = "demo@tripletree.nl";

interface SeedResponse {
  recordsCreated: number;
  daysCreated: number;
  periodStart: string | null;
  periodEnd: string | null;
  demoUserLinked: boolean;
  weeks: number;
}

interface DemoStatus {
  exists: boolean;
  isActive: boolean;
  records: number;
  from: string | null;
  to: string | null;
}

/**
 * Beheer van de demo-omgeving: één project met uitsluitend verzonnen data dat met
 * potentiele klanten gedeeld kan worden (login demo@tripletree.nl).
 *
 * De knop roept de edge function `seed-demo-data` aan. Die wist de oude demodata en
 * genereert een nieuwe set over de laatste N weken t/m gisteren — inclusief uren en
 * voorraad, zodat álle KPI's gevuld zijn. Er wordt nooit data van een echt project
 * gekopieerd; de function is hard gescoped op project_key = 'demo'.
 */
export function DemoDataManager() {
  const [weeks, setWeeks] = useState("10");
  const [isSeeding, setIsSeeding] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: status, isLoading, refetch } = useQuery<DemoStatus>({
    queryKey: ["demo-project-status"],
    queryFn: async () => {
      const { data: project, error } = await supabase
        .from("projects")
        .select("id, is_active")
        .eq("project_key", "demo")
        .maybeSingle();

      if (error) throw error;
      if (!project) return { exists: false, isActive: false, records: 0, from: null, to: null };

      const [{ count }, { data: oldest }, { data: newest }] = await Promise.all([
        supabase.from("call_records").select("id", { count: "exact", head: true }).eq("project_id", project.id),
        supabase.from("call_records").select("beldatum_date").eq("project_id", project.id)
          .order("beldatum_date", { ascending: true }).limit(1).maybeSingle(),
        supabase.from("call_records").select("beldatum_date").eq("project_id", project.id)
          .order("beldatum_date", { ascending: false }).limit(1).maybeSingle(),
      ]);

      return {
        exists: true,
        isActive: project.is_active,
        records: count ?? 0,
        from: oldest?.beldatum_date ?? null,
        to: newest?.beldatum_date ?? null,
      };
    },
  });

  const handleSeed = async () => {
    setIsSeeding(true);
    try {
      const { data, error } = await supabase.functions.invoke<SeedResponse>("seed-demo-data", {
        body: { weeks: Number(weeks) },
      });

      if (error) throw error;

      toast({
        title: "Demo-data ververst",
        description: `${data?.recordsCreated.toLocaleString("nl-NL")} verzonnen records over ${data?.daysCreated} beldagen. Inloggen kan met ${DEMO_EMAIL}.`,
      });

      if (data && !data.demoUserLinked) {
        toast({
          title: "Let op: demo-account niet gevonden",
          description: `Er bestaat geen gebruiker ${DEMO_EMAIL}. Maak die aan bij Klanten en koppel hem aan Demo Campagne.`,
          variant: "destructive",
        });
      }

      await refetch();
      queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (error) {
      toast({
        title: "Verversen mislukt",
        description: friendlyError(error, "De demo-data kon niet ververst worden. Probeer het opnieuw."),
        variant: "destructive",
      });
    } finally {
      setIsSeeding(false);
    }
  };

  const formatDate = (value: string | null) =>
    value ? format(new Date(value), "d MMM yyyy", { locale: nl }) : "—";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Sparkles className="h-5 w-5" />
          Demo-omgeving
        </CardTitle>
        <CardDescription>
          Eén losstaand project met uitsluitend verzonnen data, bedoeld om te delen met
          potentiele klanten. Log in als <span className="font-medium">{DEMO_EMAIL}</span>.
          Verversen wist de oude demo-data en genereert een nieuwe set t/m gisteren —
          echte projecten worden nooit geraakt.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Status */}
        <div className="rounded-md border p-4">
          {isLoading ? (
            <p className="text-sm text-muted-foreground">Status laden...</p>
          ) : !status?.exists ? (
            <p className="text-sm text-muted-foreground">
              Demoproject bestaat nog niet. Klik op verversen om het aan te maken.
            </p>
          ) : (
            <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
              <div>
                <span className="text-muted-foreground">Records: </span>
                <span className="font-medium">{status.records.toLocaleString("nl-NL")}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Periode: </span>
                <span className="font-medium">{formatDate(status.from)} t/m {formatDate(status.to)}</span>
              </div>
              <Badge variant="outline" className={status.isActive && status.records > 0
                ? "bg-green-500/20 text-green-600"
                : "bg-destructive/20 text-destructive"}>
                {status.records === 0 ? "Leeg" : status.isActive ? "Klaar om te delen" : "Project inactief"}
              </Badge>
            </div>
          )}
        </div>

        {/* Periode */}
        <div className="space-y-2 max-w-xs">
          <Label htmlFor="demo-weeks">Aantal weken data</Label>
          <Select value={weeks} onValueChange={setWeeks}>
            <SelectTrigger id="demo-weeks">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="4">4 weken</SelectItem>
              <SelectItem value="8">8 weken</SelectItem>
              <SelectItem value="10">10 weken</SelectItem>
              <SelectItem value="16">16 weken</SelectItem>
              <SelectItem value="26">26 weken (half jaar)</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-xs text-muted-foreground">
            Records, ureninzet en voorraad worden opnieuw opgebouwd t/m gisteren.
          </p>
        </div>

        {/* Actie */}
        <AlertDialog>
          <AlertDialogTrigger asChild>
            <Button disabled={isSeeding} className="gap-2">
              {isSeeding ? <Loader2 className="h-4 w-4 animate-spin" /> : <PlayCircle className="h-4 w-4" />}
              Demo-data verversen
            </Button>
          </AlertDialogTrigger>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>Demo-data verversen?</AlertDialogTitle>
              <AlertDialogDescription>
                De huidige demo-records, uren en batch worden verwijderd en vervangen door een
                nieuwe set verzonnen data over de laatste {weeks} weken. Dit raakt alleen het
                demoproject — data van echte klanten blijft ongemoeid.
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter>
              <AlertDialogCancel>Annuleren</AlertDialogCancel>
              <AlertDialogAction onClick={handleSeed}>Verversen</AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </CardContent>
    </Card>
  );
}
