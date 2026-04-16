import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Check, X, ListChecks } from "lucide-react";
import { useOnboardingStatus, type OnboardingStatus } from "@/hooks/useOnboardingStatus";

interface OnboardingChecklistProps {
  onNavigate: (tab: string) => void;
}

type Checkpoint = {
  key: keyof Pick<OnboardingStatus, "has_token" | "has_mapping" | "has_records" | "has_batch" | "has_customer">;
  label: string;
  critical: boolean;
};

const CHECKPOINTS: Checkpoint[] = [
  { key: "has_token", label: "Token", critical: true },
  { key: "has_mapping", label: "Mapping", critical: true },
  { key: "has_records", label: "Records", critical: true },
  { key: "has_batch", label: "Batch", critical: false },
  { key: "has_customer", label: "Klant", critical: false },
];

export function OnboardingChecklist({ onNavigate }: OnboardingChecklistProps) {
  const { data, isLoading } = useOnboardingStatus();
  if (isLoading || !data) return null;

  const incomplete = data.filter((p) => p.is_incomplete);
  if (incomplete.length === 0) return null;

  return (
    <Card className="border-blue-500/30 bg-blue-500/5">
      <CardContent className="pt-6">
        <div className="flex items-center gap-2 mb-3">
          <ListChecks className="h-5 w-5 text-blue-500" />
          <h3 className="font-semibold">Projecten met open onboarding-stappen ({incomplete.length})</h3>
        </div>
        <p className="text-xs text-muted-foreground mb-3">
          Kritieke checkpoints: token, mapping, eerste records. Optioneel: batch-koppeling (voor voorraad-KPI)
          en klant-koppeling (voor dashboard-toegang).
        </p>
        <div className="space-y-2">
          {incomplete.map((p) => (
            <div
              key={p.project_id}
              className="flex flex-wrap items-center justify-between gap-2 p-3 rounded-lg bg-background text-sm"
            >
              <div className="flex items-center gap-2 min-w-0">
                <span className="font-medium truncate">{p.name}</span>
                <span className="text-xs text-muted-foreground flex-shrink-0">#{p.basicall_project_id}</span>
              </div>
              <div className="flex items-center gap-2 flex-wrap">
                {CHECKPOINTS.map((cp) => {
                  const ok = p[cp.key];
                  return (
                    <span
                      key={cp.key}
                      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-xs ${
                        ok
                          ? "bg-green-500/10 text-green-700 dark:text-green-400"
                          : cp.critical
                          ? "bg-destructive/10 text-destructive"
                          : "bg-muted text-muted-foreground"
                      }`}
                      title={`${cp.label}${cp.critical ? " (kritiek)" : " (optioneel)"}`}
                    >
                      {ok ? <Check className="h-3 w-3" /> : <X className="h-3 w-3" />}
                      {cp.label}
                    </span>
                  );
                })}
                <Button size="sm" variant="outline" onClick={() => onNavigate("projecten")}>
                  Open
                </Button>
              </div>
            </div>
          ))}
        </div>
      </CardContent>
    </Card>
  );
}
