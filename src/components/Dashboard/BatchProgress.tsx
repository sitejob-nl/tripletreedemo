import { useBatches } from "@/hooks/useBatches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Package } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

const statusLabels: Record<number, string> = {
  1: "Actief",
  2: "Inactief",
  3: "Alleen pers. TBA",
};

const statusVariants: Record<number, "default" | "secondary" | "outline"> = {
  1: "default",
  2: "secondary",
  3: "outline",
};

interface BatchProgressProps {
  projectId: string;
}

export function BatchProgress({ projectId }: BatchProgressProps) {
  const { data: batches } = useBatches(projectId);

  if (!batches?.length) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
            Batch Voortgang
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-muted-foreground">
            Nog geen batches gekoppeld aan deze campagne.
          </p>
        </CardContent>
      </Card>
    );
  }

  const latestSync = batches
    .map((b) => b.last_synced_at)
    .filter(Boolean)
    .sort()
    .pop();

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          Batch Voortgang
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {batches.map((b) => {
          const total = b.total ?? 0;
          const handled = b.handled ?? 0;
          const pct = total > 0 ? Math.round((handled / total) * 100) : 0;

          return (
            <div key={b.id} className="space-y-1.5">
              <div className="flex items-center justify-between text-sm">
                <div className="flex items-center gap-2">
                  <span className="font-medium">{b.name}</span>
                  <Badge variant={statusVariants[b.status ?? 1]} className="text-xs">
                    {statusLabels[b.status ?? 1]}
                  </Badge>
                </div>
                <span className="text-muted-foreground">
                  {handled}/{total} ({pct}%) · {b.remaining ?? 0} resterend
                </span>
              </div>
              <Progress value={pct} className="h-2" />
            </div>
          );
        })}

        {latestSync && (
          <p className="text-xs text-muted-foreground pt-1">
            Laatst bijgewerkt: {format(new Date(latestSync), "d MMM yyyy HH:mm", { locale: nl })}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
