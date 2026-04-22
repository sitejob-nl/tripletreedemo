import { useMemo } from "react";
import { useBatches, type Batch } from "@/hooks/useBatches";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { Package } from "lucide-react";
import { format } from "date-fns";
import { nl } from "date-fns/locale";

const STATUS_META: Record<
  number,
  { label: string; variant: "default" | "secondary" | "outline" }
> = {
  1: { label: "Actief", variant: "default" },
  2: { label: "Inactief", variant: "secondary" },
  3: { label: "Alleen pers. TBA", variant: "outline" },
};

function statusKey(status: number | null): 1 | 2 | 3 {
  if (status === 1 || status === 2 || status === 3) return status;
  return 1;
}

function sumTotals(batches: Batch[]) {
  return batches.reduce(
    (acc, b) => {
      const total = b.total ?? 0;
      const handled = b.handled ?? 0;
      return {
        total: acc.total + total,
        handled: acc.handled + handled,
        remaining: acc.remaining + (b.remaining ?? Math.max(0, total - handled)),
      };
    },
    { total: 0, handled: 0, remaining: 0 }
  );
}

interface BatchProgressProps {
  projectId: string;
}

export function BatchProgress({ projectId }: BatchProgressProps) {
  const { data: batches } = useBatches(projectId);

  const groups = useMemo(() => {
    const buckets: Record<1 | 2 | 3, Batch[]> = { 1: [], 2: [], 3: [] };
    (batches ?? []).forEach((b) => {
      buckets[statusKey(b.status)].push(b);
    });
    return buckets;
  }, [batches]);

  const latestSync = useMemo(
    () =>
      (batches ?? [])
        .map((b) => b.last_synced_at)
        .filter(Boolean)
        .sort()
        .pop(),
    [batches]
  );

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

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="text-lg flex items-center gap-2">
          <Package className="h-5 w-5 text-muted-foreground" aria-hidden="true" />
          Batch Voortgang
        </CardTitle>
      </CardHeader>
      <CardContent>
        <Tabs defaultValue="summary" className="space-y-4">
          <TabsList>
            <TabsTrigger value="summary">Totaal</TabsTrigger>
            <TabsTrigger value="all">Alle batches</TabsTrigger>
          </TabsList>

          <TabsContent value="summary" className="space-y-4">
            {([1, 2, 3] as const).map((s) => {
              const list = groups[s];
              if (list.length === 0) return null;
              const totals = sumTotals(list);
              const pct =
                totals.total > 0 ? Math.round((totals.handled / totals.total) * 100) : 0;
              const meta = STATUS_META[s];
              return (
                <div key={s} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <Badge variant={meta.variant} className="text-xs">
                        {meta.label}
                      </Badge>
                      <span className="text-muted-foreground">
                        {list.length} {list.length === 1 ? "batch" : "batches"}
                      </span>
                    </div>
                    <span className="text-muted-foreground">
                      {totals.handled.toLocaleString("nl-NL")}/{totals.total.toLocaleString("nl-NL")} ({pct}%) ·{" "}
                      {totals.remaining.toLocaleString("nl-NL")} resterend
                    </span>
                  </div>
                  <Progress value={pct} className="h-2" />
                </div>
              );
            })}

            <TotalRow batches={batches} />

            {latestSync && (
              <p className="text-xs text-muted-foreground pt-1">
                Laatst bijgewerkt: {format(new Date(latestSync), "d MMM yyyy HH:mm", { locale: nl })}
              </p>
            )}
          </TabsContent>

          <TabsContent value="all" className="space-y-4">
            {batches.map((b) => {
              const total = b.total ?? 0;
              const handled = b.handled ?? 0;
              const pct = total > 0 ? Math.round((handled / total) * 100) : 0;
              const meta = STATUS_META[b.status ?? 1] ?? {
                label: `Status ${b.status}`,
                variant: "outline" as const,
              };
              return (
                <div key={b.id} className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <div className="flex items-center gap-2">
                      <span className="font-medium">{b.name}</span>
                      <Badge variant={meta.variant} className="text-xs">
                        {meta.label}
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
          </TabsContent>
        </Tabs>
      </CardContent>
    </Card>
  );
}

function TotalRow({ batches }: { batches: Batch[] }) {
  const totals = sumTotals(batches);
  const pct = totals.total > 0 ? Math.round((totals.handled / totals.total) * 100) : 0;
  return (
    <div className="space-y-1.5 pt-2 border-t">
      <div className="flex items-center justify-between text-sm">
        <div className="flex items-center gap-2">
          <span className="font-semibold">Totaal</span>
          <span className="text-muted-foreground">
            {batches.length} {batches.length === 1 ? "batch" : "batches"}
          </span>
        </div>
        <span className="text-muted-foreground">
          {totals.handled.toLocaleString("nl-NL")}/{totals.total.toLocaleString("nl-NL")} ({pct}%) ·{" "}
          {totals.remaining.toLocaleString("nl-NL")} resterend
        </span>
      </div>
      <Progress value={pct} className="h-2" />
    </div>
  );
}
