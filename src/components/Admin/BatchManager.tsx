import { useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useBatches, useCreateBatch, useDeleteBatch } from "@/hooks/useBatches";
import { useAuth } from "@/hooks/useAuth";
import { useToast } from "@/hooks/use-toast";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from "@/components/ui/alert-dialog";
import { Plus, Trash2, Package } from "lucide-react";
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

export function BatchManager() {
  const { user } = useAuth();
  const { projects } = useProjects(false, user?.id, true);
  const [selectedProjectId, setSelectedProjectId] = useState<string>("");
  const [batchName, setBatchName] = useState("");
  const [batchId, setBatchId] = useState("");
  const { toast } = useToast();

  const { data: batches, isLoading } = useBatches(selectedProjectId || undefined);
  const createBatch = useCreateBatch();
  const deleteBatch = useDeleteBatch();

  const handleAdd = async () => {
    if (!batchName || !batchId || !selectedProjectId) {
      toast({ title: "Vul alle velden in", variant: "destructive" });
      return;
    }
    try {
      await createBatch.mutateAsync({
        name: batchName,
        basicall_batch_id: parseInt(batchId),
        project_id: selectedProjectId,
      });
      toast({ title: "Batch toegevoegd" });
      setBatchName("");
      setBatchId("");
    } catch (e: any) {
      toast({ title: "Fout", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await deleteBatch.mutateAsync(id);
      toast({ title: "Batch verwijderd" });
    } catch (e: any) {
      toast({ title: "Fout", description: e.message, variant: "destructive" });
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Package className="h-5 w-5" />
          Batch Beheer
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Project selector */}
        <div className="space-y-2">
          <Label>Project</Label>
          <Select value={selectedProjectId} onValueChange={setSelectedProjectId}>
            <SelectTrigger>
              <SelectValue placeholder="Selecteer een project" />
            </SelectTrigger>
            <SelectContent>
              {projects?.map((p) => (
                <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {selectedProjectId && (
          <>
            {/* Add form */}
            <div className="flex items-end gap-3">
              <div className="flex-1 space-y-1">
                <Label>Batch naam</Label>
                <Input value={batchName} onChange={(e) => setBatchName(e.target.value)} placeholder="Naam" />
              </div>
              <div className="w-40 space-y-1">
                <Label>BasiCall Batch ID</Label>
                <Input type="number" value={batchId} onChange={(e) => setBatchId(e.target.value)} placeholder="ID" />
              </div>
              <Button onClick={handleAdd} disabled={createBatch.isPending}>
                <Plus className="h-4 w-4 mr-1" /> Toevoegen
              </Button>
            </div>

            {/* Table */}
            {isLoading ? (
              <p className="text-muted-foreground text-sm">Laden...</p>
            ) : batches?.length ? (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Naam</TableHead>
                    <TableHead>Batch ID</TableHead>
                    <TableHead className="text-right">Totaal</TableHead>
                    <TableHead className="text-right">Afgehandeld</TableHead>
                    <TableHead className="text-right">Resterend</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Laatst gesynct</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {batches.map((b) => (
                    <TableRow key={b.id}>
                      <TableCell className="font-medium">{b.name}</TableCell>
                      <TableCell>{b.basicall_batch_id}</TableCell>
                      <TableCell className="text-right">{b.total ?? 0}</TableCell>
                      <TableCell className="text-right">{b.handled ?? 0}</TableCell>
                      <TableCell className="text-right">{b.remaining ?? 0}</TableCell>
                      <TableCell>
                        <Badge variant={statusVariants[b.status ?? 1]}>
                          {statusLabels[b.status ?? 1] ?? `Status ${b.status}`}
                        </Badge>
                      </TableCell>
                      <TableCell className="text-muted-foreground text-sm">
                        {b.last_synced_at
                          ? format(new Date(b.last_synced_at), "d MMM HH:mm", { locale: nl })
                          : "—"}
                      </TableCell>
                      <TableCell>
                        <AlertDialog>
                          <AlertDialogTrigger asChild>
                            <Button variant="ghost" size="icon">
                              <Trash2 className="h-4 w-4 text-destructive" />
                            </Button>
                          </AlertDialogTrigger>
                          <AlertDialogContent>
                            <AlertDialogHeader>
                              <AlertDialogTitle>Batch verwijderen?</AlertDialogTitle>
                              <AlertDialogDescription>
                                Weet je zeker dat je "{b.name}" wilt verwijderen?
                              </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                              <AlertDialogCancel>Annuleren</AlertDialogCancel>
                              <AlertDialogAction onClick={() => handleDelete(b.id)}>
                                Verwijderen
                              </AlertDialogAction>
                            </AlertDialogFooter>
                          </AlertDialogContent>
                        </AlertDialog>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            ) : (
              <p className="text-muted-foreground text-sm">Geen batches voor dit project.</p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
