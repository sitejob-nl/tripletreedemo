import { useState } from "react";
import { useProjects } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { useToast } from "@/hooks/use-toast";
import { Plus, Settings, ArrowLeft, Trash2 } from "lucide-react";
import { Link } from "react-router-dom";
import type { DBProject, MappingConfig } from "@/types/database";
import { SyncJobManager } from "@/components/Dashboard/SyncJobManager";
const defaultMappingConfig: MappingConfig = {
  amount_col: "termijnbedrag",
  freq_col: "frequentie",
  reason_col: "opzegreden",
  freq_map: {
    maand: 12,
    maandelijks: 12,
    kwartaal: 4,
    jaar: 1,
    jaarlijks: 1,
    eenmalig: 1,
    mnd: 12
  },
  sale_results: ["Sale", "Donateur", "Toezegging"]
};

interface ProjectFormData {
  name: string;
  project_key: string;
  basicall_project_id: string;
  basicall_token: string;
  hourly_rate: string;
  vat_rate: string;
  is_active: boolean;
  mapping_config: MappingConfig;
}

const emptyFormData: ProjectFormData = {
  name: "",
  project_key: "",
  basicall_project_id: "",
  basicall_token: "",
  hourly_rate: "35.00",
  vat_rate: "21",
  is_active: true,
  mapping_config: defaultMappingConfig
};

export default function Admin() {
  const { projects, isLoading } = useProjects(false); // Get all projects, not just active
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<DBProject | null>(null);
  const [formData, setFormData] = useState<ProjectFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleOpenAdd = () => {
    setFormData(emptyFormData);
    setEditingProject(null);
    setIsAddDialogOpen(true);
  };

  const handleOpenEdit = (project: DBProject) => {
    setFormData({
      name: project.name,
      project_key: project.project_key,
      basicall_project_id: String(project.basicall_project_id),
      basicall_token: project.basicall_token,
      hourly_rate: String(project.hourly_rate),
      vat_rate: String(project.vat_rate),
      is_active: project.is_active,
      mapping_config: project.mapping_config
    });
    setEditingProject(project);
    setIsAddDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.name || !formData.project_key || !formData.basicall_project_id || !formData.basicall_token) {
      toast({
        title: "Validatie fout",
        description: "Vul alle verplichte velden in.",
        variant: "destructive"
      });
      return;
    }

    setIsSaving(true);

    const projectData = {
      name: formData.name,
      project_key: formData.project_key.toLowerCase().replace(/\s+/g, "-"),
      basicall_project_id: parseInt(formData.basicall_project_id),
      basicall_token: formData.basicall_token,
      hourly_rate: parseFloat(formData.hourly_rate),
      vat_rate: parseInt(formData.vat_rate),
      is_active: formData.is_active,
      mapping_config: formData.mapping_config
    };

    try {
      if (editingProject) {
        const { error } = await supabase
          .from("projects")
          .update({
            name: projectData.name,
            project_key: projectData.project_key,
            basicall_project_id: projectData.basicall_project_id,
            basicall_token: projectData.basicall_token,
            hourly_rate: projectData.hourly_rate,
            vat_rate: projectData.vat_rate,
            is_active: projectData.is_active,
            mapping_config: JSON.parse(JSON.stringify(projectData.mapping_config))
          })
          .eq("id", editingProject.id);

        if (error) throw error;

        toast({
          title: "Project bijgewerkt",
          description: `${formData.name} is succesvol bijgewerkt.`
        });
      } else {
        const { error } = await supabase
          .from("projects")
          .insert({
            name: projectData.name,
            project_key: projectData.project_key,
            basicall_project_id: projectData.basicall_project_id,
            basicall_token: projectData.basicall_token,
            hourly_rate: projectData.hourly_rate,
            vat_rate: projectData.vat_rate,
            is_active: projectData.is_active,
            mapping_config: JSON.parse(JSON.stringify(projectData.mapping_config))
          });

        if (error) throw error;

        toast({
          title: "Project toegevoegd",
          description: `${formData.name} is succesvol toegevoegd.`
        });
      }

      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setIsAddDialogOpen(false);
      setEditingProject(null);
      setFormData(emptyFormData);
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Er is iets misgegaan.",
        variant: "destructive"
      });
    } finally {
      setIsSaving(false);
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
        description: error.message || "Er is iets misgegaan.",
        variant: "destructive"
      });
    }
  };

  const updateMappingConfig = (key: keyof MappingConfig, value: any) => {
    setFormData(prev => ({
      ...prev,
      mapping_config: {
        ...prev.mapping_config,
        [key]: value
      }
    }));
  };

  const updateFreqMap = (key: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setFormData(prev => ({
      ...prev,
      mapping_config: {
        ...prev.mapping_config,
        freq_map: {
          ...prev.mapping_config.freq_map,
          [key]: numValue
        }
      }
    }));
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
              <h1 className="text-3xl font-bold text-foreground">Projectbeheer</h1>
              <p className="text-muted-foreground">Beheer projecten, tokens en mapping configuratie</p>
            </div>
          </div>
          <Button onClick={handleOpenAdd} className="gap-2">
            <Plus className="h-4 w-4" />
            Nieuw project
          </Button>
        </div>

        {/* Projects Grid */}
        {isLoading ? (
          <div className="text-center py-12 text-muted-foreground">Laden...</div>
        ) : projects.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent>
              <p className="text-muted-foreground mb-4">Nog geen projecten toegevoegd.</p>
              <Button onClick={handleOpenAdd}>Eerste project toevoegen</Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
            {projects.map((project) => (
              <Card key={project.id} className={!project.is_active ? "opacity-60" : ""}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg">{project.name}</CardTitle>
                      <CardDescription>{project.project_key}</CardDescription>
                    </div>
                    <div className={`px-2 py-1 rounded-full text-xs font-medium ${
                      project.is_active 
                        ? "bg-primary/10 text-primary" 
                        : "bg-muted text-muted-foreground"
                    }`}>
                      {project.is_active ? "Actief" : "Inactief"}
                    </div>
                  </div>
                </CardHeader>
                <CardContent className="space-y-3">
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div>
                      <span className="text-muted-foreground">BasiCall ID:</span>
                      <p className="font-medium">{project.basicall_project_id}</p>
                    </div>
                    <div>
                      <span className="text-muted-foreground">Uurtarief:</span>
                      <p className="font-medium">€{project.hourly_rate}</p>
                    </div>
                  </div>
                  <div className="text-sm">
                    <span className="text-muted-foreground">Token:</span>
                    <p className="font-mono text-xs truncate">{project.basicall_token.substring(0, 20)}...</p>
                  </div>
                  <div className="flex gap-2 pt-2">
                    <Button 
                      variant="outline" 
                      size="sm" 
                      className="flex-1 gap-1"
                      onClick={() => handleOpenEdit(project)}
                    >
                      <Settings className="h-3 w-3" />
                      Bewerken
                    </Button>
                    <Button 
                      variant="outline" 
                      size="sm"
                      className="text-destructive hover:text-destructive"
                      onClick={() => handleDelete(project)}
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Sync Job Manager */}
        <div className="mt-8">
          <SyncJobManager />
        </div>

        {/* Add/Edit Dialog */}
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>
                {editingProject ? "Project bewerken" : "Nieuw project toevoegen"}
              </DialogTitle>
              <DialogDescription>
                Vul de projectgegevens en BasiCall configuratie in.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-6 py-4">
              {/* Basic Info */}
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Basis informatie</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="name">Projectnaam *</Label>
                    <Input
                      id="name"
                      value={formData.name}
                      onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                      placeholder="Hersenstichting"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="project_key">Project key *</Label>
                    <Input
                      id="project_key"
                      value={formData.project_key}
                      onChange={(e) => setFormData(prev => ({ ...prev, project_key: e.target.value }))}
                      placeholder="hersenstichting"
                    />
                  </div>
                </div>
                <div className="flex items-center gap-3">
                  <Switch
                    checked={formData.is_active}
                    onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
                  />
                  <Label>Project actief</Label>
                </div>
              </div>

              {/* BasiCall Config */}
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">BasiCall configuratie</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="basicall_project_id">BasiCall Project ID *</Label>
                    <Input
                      id="basicall_project_id"
                      type="number"
                      value={formData.basicall_project_id}
                      onChange={(e) => setFormData(prev => ({ ...prev, basicall_project_id: e.target.value }))}
                      placeholder="1001"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="basicall_token">API Token *</Label>
                    <Input
                      id="basicall_token"
                      type="password"
                      value={formData.basicall_token}
                      onChange={(e) => setFormData(prev => ({ ...prev, basicall_token: e.target.value }))}
                      placeholder="••••••••••••••••"
                    />
                  </div>
                </div>
              </div>

              {/* Financial Settings */}
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Financiële instellingen</h3>
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="hourly_rate">Uurtarief (€)</Label>
                    <Input
                      id="hourly_rate"
                      type="number"
                      step="0.01"
                      value={formData.hourly_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, hourly_rate: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="vat_rate">BTW percentage (%)</Label>
                    <Input
                      id="vat_rate"
                      type="number"
                      value={formData.vat_rate}
                      onChange={(e) => setFormData(prev => ({ ...prev, vat_rate: e.target.value }))}
                    />
                  </div>
                </div>
              </div>

              {/* Mapping Config */}
              <div className="space-y-4">
                <h3 className="font-semibold text-foreground">Mapping configuratie</h3>
                <p className="text-sm text-muted-foreground">
                  Configureer welke kolommen uit BasiCall data gebruikt worden.
                </p>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="amount_col">Bedrag kolom</Label>
                    <Input
                      id="amount_col"
                      value={formData.mapping_config.amount_col}
                      onChange={(e) => updateMappingConfig("amount_col", e.target.value)}
                      placeholder="termijnbedrag"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="freq_col">Frequentie kolom</Label>
                    <Input
                      id="freq_col"
                      value={formData.mapping_config.freq_col}
                      onChange={(e) => updateMappingConfig("freq_col", e.target.value)}
                      placeholder="frequentie"
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reason_col">Opzegreden kolom</Label>
                    <Input
                      id="reason_col"
                      value={formData.mapping_config.reason_col || ""}
                      onChange={(e) => updateMappingConfig("reason_col", e.target.value)}
                      placeholder="opzegreden"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label>Frequentie mapping (term → vermenigvuldiger)</Label>
                  <div className="grid grid-cols-4 gap-2">
                    {Object.entries(formData.mapping_config.freq_map).map(([key, value]) => (
                      <div key={key} className="flex items-center gap-1">
                        <span className="text-sm text-muted-foreground w-20 truncate">{key}:</span>
                        <Input
                          type="number"
                          value={value}
                          onChange={(e) => updateFreqMap(key, e.target.value)}
                          className="h-8"
                        />
                      </div>
                    ))}
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="sale_results">Sale resultaten (komma-gescheiden)</Label>
                  <Input
                    id="sale_results"
                    value={formData.mapping_config.sale_results.join(", ")}
                    onChange={(e) => updateMappingConfig(
                      "sale_results", 
                      e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                    )}
                    placeholder="Sale, Donateur, Toezegging"
                  />
                </div>
              </div>
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Annuleren
              </Button>
              <Button onClick={handleSave} disabled={isSaving}>
                {isSaving ? "Opslaan..." : editingProject ? "Bijwerken" : "Toevoegen"}
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
