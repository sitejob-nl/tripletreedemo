import { useState, useMemo } from "react";
import { useAdminProjects } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Settings, Trash2 } from "lucide-react";
import type { DBProject } from "@/types/database";

interface ProjectsTableProps {
  onOpenAdd: () => void;
  onOpenEdit: (project: DBProject) => void;
}

export function ProjectsTable({ onOpenAdd, onOpenEdit }: ProjectsTableProps) {
  const { user } = useAuth();
  // Admin-only component - always use full projects table with token access
  const { projects, isLoading } = useAdminProjects(false, user?.id);
  const [search, setSearch] = useState("");
  const [showOnlyActive, setShowOnlyActive] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const filteredProjects = useMemo(() => {
    return projects.filter(project => {
      const matchesSearch = 
        project.name.toLowerCase().includes(search.toLowerCase()) ||
        project.project_key.toLowerCase().includes(search.toLowerCase()) ||
        String(project.basicall_project_id).includes(search);
      
      const matchesActive = !showOnlyActive || project.is_active;
      
      return matchesSearch && matchesActive;
    });
  }, [projects, search, showOnlyActive]);

  const handleToggleActive = async (project: DBProject) => {
    try {
      const { error } = await supabase
        .from("projects")
        .update({ is_active: !project.is_active })
        .eq("id", project.id);

      if (error) throw error;

      queryClient.invalidateQueries({ queryKey: ["projects"] });
      toast({
        title: project.is_active ? "Project gedeactiveerd" : "Project geactiveerd",
        description: `${project.name} is nu ${project.is_active ? "inactief" : "actief"}.`
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  const handleDelete = async (project: DBProject) => {
    if (!confirm(`Weet je zeker dat je "${project.name}" wilt verwijderen?`)) return;

    try {
      const { error } = await supabase
        .from("projects")
        .delete()
        .eq("id", project.id);

      if (error) throw error;

      toast({
        title: "Project verwijderd",
        description: `${project.name} is succesvol verwijderd.`
      });

      queryClient.invalidateQueries({ queryKey: ["projects"] });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message,
        variant: "destructive"
      });
    }
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle>Projecten</CardTitle>
            <CardDescription>Beheer alle projecten en BasiCall configuratie</CardDescription>
          </div>
          <Button onClick={onOpenAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            Nieuw project
          </Button>
        </div>
      </CardHeader>
      <CardContent>
        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-6">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek op naam, key of BasiCall ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>
          <div className="flex items-center gap-2">
            <Switch
              id="active-only"
              checked={showOnlyActive}
              onCheckedChange={setShowOnlyActive}
            />
            <label htmlFor="active-only" className="text-sm">Alleen actief</label>
          </div>
        </div>

        {/* Table */}
        {isLoading ? (
          <div className="text-center py-8 text-muted-foreground">Laden...</div>
        ) : filteredProjects.length === 0 ? (
          <div className="text-center py-8 text-muted-foreground">
            {search ? "Geen projecten gevonden." : "Nog geen projecten."}
          </div>
        ) : (
          <div className="rounded-md border">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Naam</TableHead>
                  <TableHead>Key</TableHead>
                  <TableHead className="hidden md:table-cell">BasiCall ID</TableHead>
                  <TableHead className="hidden lg:table-cell">Uurtarief</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Acties</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredProjects.map((project) => (
                  <TableRow key={project.id} className={!project.is_active ? "opacity-60" : ""}>
                    <TableCell className="font-medium">{project.name}</TableCell>
                    <TableCell className="font-mono text-sm">{project.project_key}</TableCell>
                    <TableCell className="hidden md:table-cell">{project.basicall_project_id}</TableCell>
                    <TableCell className="hidden lg:table-cell">€{project.hourly_rate}</TableCell>
                    <TableCell>
                      <Badge 
                        variant={project.is_active ? "default" : "secondary"}
                        className="cursor-pointer"
                        onClick={() => handleToggleActive(project)}
                      >
                        {project.is_active ? "Actief" : "Inactief"}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button
                          variant="ghost"
                          size="icon"
                          onClick={() => onOpenEdit(project)}
                        >
                          <Settings className="h-4 w-4" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => handleDelete(project)}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
