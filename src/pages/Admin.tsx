import { useState, useCallback } from "react";
import { Link } from "react-router-dom";
import { useProjects } from "@/hooks/useProjects";
import { supabase } from "@/integrations/supabase/client";
import { useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft } from "lucide-react";
import { OnboardingButton } from "@/components/Dashboard/OnboardingButton";
import { OnboardingTour } from "@/components/Dashboard/OnboardingTour";
import { useAdminOnboardingTour } from "@/hooks/useAdminOnboardingTour";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import type { DBProject, MappingConfig } from "@/types/database";

import { AdminDashboard } from "@/components/Admin/AdminDashboard";
import { ProjectsTable } from "@/components/Admin/ProjectsTable";
import { CustomersTable } from "@/components/Admin/CustomersTable";
import { UsersTable } from "@/components/Admin/UsersTable";
import { SyncManager } from "@/components/Admin/SyncManager";
import { ProjectDialog, ProjectFormData } from "@/components/Admin/ProjectDialog";

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

const emptyFormData: ProjectFormData = {
  name: "",
  project_key: "",
  basicall_project_id: "",
  basicall_token: "",
  hourly_rate: "35.00",
  vat_rate: "21",
  is_active: true,
  mapping_config: defaultMappingConfig,
  total_to_call: "",
  hours_factor: "1.0"
};

export default function Admin() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isProjectDialogOpen, setIsProjectDialogOpen] = useState(false);
  const [isCustomerDialogOpen, setIsCustomerDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<DBProject | null>(null);
  const [formData, setFormData] = useState<ProjectFormData>(emptyFormData);
  const [isSaving, setIsSaving] = useState(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const handleSwitchTab = useCallback((tab: string) => {
    setActiveTab(tab);
  }, []);

  const tour = useAdminOnboardingTour(handleSwitchTab);

  const handleOpenAddProject = () => {
    setFormData(emptyFormData);
    setEditingProject(null);
    setIsProjectDialogOpen(true);
  };

  const handleOpenEditProject = (project: DBProject) => {
    setFormData({
      name: project.name,
      project_key: project.project_key,
      basicall_project_id: String(project.basicall_project_id),
      basicall_token: project.basicall_token,
      hourly_rate: String(project.hourly_rate),
      vat_rate: String(project.vat_rate),
      is_active: project.is_active,
      mapping_config: project.mapping_config,
      total_to_call: project.total_to_call ? String(project.total_to_call) : "",
      hours_factor: String(project.hours_factor ?? 1.0)
    });
    setEditingProject(project);
    setIsProjectDialogOpen(true);
  };

  const handleSaveProject = async () => {
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
      mapping_config: formData.mapping_config,
      total_to_call: formData.total_to_call ? parseInt(formData.total_to_call) : null,
      hours_factor: parseFloat(formData.hours_factor) || 1.0
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
            mapping_config: JSON.parse(JSON.stringify(projectData.mapping_config)),
            total_to_call: projectData.total_to_call,
            hours_factor: projectData.hours_factor
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
            mapping_config: JSON.parse(JSON.stringify(projectData.mapping_config)),
            total_to_call: projectData.total_to_call,
            hours_factor: projectData.hours_factor
          });

        if (error) throw error;

        toast({
          title: "Project toegevoegd",
          description: `${formData.name} is succesvol toegevoegd.`
        });
      }

      queryClient.invalidateQueries({ queryKey: ["projects"] });
      setIsProjectDialogOpen(false);
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

  return (
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          <Link to="/" data-tour="admin-back-button">
            <Button variant="ghost" size="icon">
              <ArrowLeft className="h-5 w-5" />
            </Button>
          </Link>
          <div className="flex-1">
            <h1 className="text-3xl font-bold text-foreground">Beheer</h1>
            <p className="text-muted-foreground">Projecten, klanten, gebruikers en synchronisatie</p>
          </div>
          <OnboardingButton onClick={tour.startTour} />
        </div>

        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
          <TabsList className="grid w-full grid-cols-5" data-tour="admin-tabs">
            <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
            <TabsTrigger value="projecten" data-tour="admin-projects-tab">Projecten</TabsTrigger>
            <TabsTrigger value="klanten" data-tour="admin-customers-tab">Klanten</TabsTrigger>
            <TabsTrigger value="gebruikers" data-tour="admin-users-tab">Gebruikers</TabsTrigger>
            <TabsTrigger value="sync" data-tour="admin-sync-tab">Synchronisatie</TabsTrigger>
          </TabsList>

          <TabsContent value="dashboard">
            <AdminDashboard 
              onNavigate={setActiveTab}
              onOpenAddProject={handleOpenAddProject}
              onOpenAddCustomer={() => setIsCustomerDialogOpen(true)}
            />
          </TabsContent>

          <TabsContent value="projecten">
            <ProjectsTable 
              onOpenAdd={handleOpenAddProject}
              onOpenEdit={handleOpenEditProject}
            />
          </TabsContent>

          <TabsContent value="klanten">
            <CustomersTable 
              isAddDialogOpen={isCustomerDialogOpen}
              setIsAddDialogOpen={setIsCustomerDialogOpen}
            />
          </TabsContent>

          <TabsContent value="gebruikers">
            <UsersTable />
          </TabsContent>

          <TabsContent value="sync">
            <SyncManager />
          </TabsContent>
        </Tabs>

        {/* Project Dialog */}
        <ProjectDialog
          isOpen={isProjectDialogOpen}
          onOpenChange={setIsProjectDialogOpen}
          formData={formData}
          setFormData={setFormData}
          onSave={handleSaveProject}
          isSaving={isSaving}
          isEditing={!!editingProject}
        />
      </div>

      <OnboardingTour
        isActive={tour.isActive}
        currentStep={tour.currentStep}
        currentStepIndex={tour.currentStepIndex}
        totalSteps={tour.totalSteps}
        onNext={tour.nextStep}
        onPrev={tour.prevStep}
        onSkip={tour.skipTour}
      />
    </div>
  );
}
