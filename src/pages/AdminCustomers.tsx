import { useState } from "react";
import { Link } from "react-router-dom";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { useCustomersWithProjects, useCreateCustomer, useLinkProjectToCustomer, useUnlinkProjectFromCustomer } from "@/hooks/useCustomerProjects";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useToast } from "@/hooks/use-toast";
import { ArrowLeft, Plus, UserPlus, Link as LinkIcon, Unlink, Loader2, Users } from "lucide-react";
import { Badge } from "@/components/ui/badge";

export default function AdminCustomers() {
  const { user } = useAuth();
  const { projects } = useProjects(false, user?.id);
  const { data: customers, isLoading: customersLoading } = useCustomersWithProjects();
  const createCustomer = useCreateCustomer();
  const linkProject = useLinkProjectToCustomer();
  const unlinkProject = useUnlinkProjectFromCustomer();
  const { toast } = useToast();

  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false);
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  
  const [newEmail, setNewEmail] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const handleCreateCustomer = async () => {
    if (!newEmail || !newPassword) {
      toast({
        title: "Validatie fout",
        description: "Vul email en wachtwoord in.",
        variant: "destructive"
      });
      return;
    }

    try {
      await createCustomer.mutateAsync({
        email: newEmail,
        password: newPassword,
        projectIds: selectedProjectIds
      });

      toast({
        title: "Klant aangemaakt",
        description: `Account voor ${newEmail} is succesvol aangemaakt.`
      });

      setIsCreateDialogOpen(false);
      setNewEmail("");
      setNewPassword("");
      setSelectedProjectIds([]);
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon klant niet aanmaken.",
        variant: "destructive"
      });
    }
  };

  const handleLinkProject = async (projectId: string) => {
    if (!selectedCustomerId) return;

    try {
      await linkProject.mutateAsync({
        userId: selectedCustomerId,
        projectId
      });

      toast({
        title: "Project gekoppeld",
        description: "Project is succesvol aan de klant gekoppeld."
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon project niet koppelen.",
        variant: "destructive"
      });
    }
  };

  const handleUnlinkProject = async (linkId: string) => {
    try {
      await unlinkProject.mutateAsync(linkId);

      toast({
        title: "Project ontkoppeld",
        description: "Project is succesvol ontkoppeld."
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon project niet ontkoppelen.",
        variant: "destructive"
      });
    }
  };

  const openLinkDialog = (customerId: string) => {
    setSelectedCustomerId(customerId);
    setIsLinkDialogOpen(true);
  };

  const selectedCustomer = customers?.find(c => c.user_id === selectedCustomerId);
  const linkedProjectIds = selectedCustomer?.projects.map(p => p.project_id) || [];
  const availableProjects = projects.filter(p => !linkedProjectIds.includes(p.id));

  const toggleProjectSelection = (projectId: string) => {
    setSelectedProjectIds(prev =>
      prev.includes(projectId)
        ? prev.filter(id => id !== projectId)
        : [...prev, projectId]
    );
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
              <h1 className="text-3xl font-bold text-foreground">Klantenbeheer</h1>
              <p className="text-muted-foreground">Beheer klantaccounts en projectkoppelingen</p>
            </div>
          </div>
          <Button onClick={() => setIsCreateDialogOpen(true)} className="gap-2">
            <UserPlus className="h-4 w-4" />
            Nieuwe klant
          </Button>
        </div>

        {/* Customers List */}
        {customersLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !customers || customers.length === 0 ? (
          <Card className="text-center py-12">
            <CardContent className="flex flex-col items-center gap-4">
              <Users className="h-12 w-12 text-muted-foreground" />
              <p className="text-muted-foreground">Nog geen klanten aangemaakt.</p>
              <Button onClick={() => setIsCreateDialogOpen(true)}>
                Eerste klant toevoegen
              </Button>
            </CardContent>
          </Card>
        ) : (
          <div className="grid gap-4 md:grid-cols-2">
            {customers.map((customer) => (
              <Card key={customer.user_id}>
                <CardHeader className="pb-3">
                  <div className="flex items-start justify-between">
                    <div>
                      <CardTitle className="text-lg font-mono text-sm">
                        {customer.email.length > 30 
                          ? `${customer.email.substring(0, 30)}...` 
                          : customer.email}
                      </CardTitle>
                      <CardDescription>
                        Aangemaakt: {new Date(customer.created_at).toLocaleDateString('nl-NL')}
                      </CardDescription>
                    </div>
                    <Badge variant="secondary">Klant</Badge>
                  </div>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <p className="text-sm font-medium text-muted-foreground mb-2">
                      Gekoppelde projecten ({customer.projects.length})
                    </p>
                    {customer.projects.length === 0 ? (
                      <p className="text-sm text-muted-foreground italic">
                        Geen projecten gekoppeld
                      </p>
                    ) : (
                      <div className="flex flex-wrap gap-2">
                        {customer.projects.map((proj) => (
                          <Badge 
                            key={proj.id} 
                            variant="outline" 
                            className="flex items-center gap-1"
                          >
                            {proj.project_name}
                            <button
                              onClick={() => handleUnlinkProject(proj.id)}
                              className="ml-1 hover:text-destructive"
                              title="Ontkoppelen"
                            >
                              <Unlink className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                  <Button 
                    variant="outline" 
                    size="sm" 
                    className="gap-2"
                    onClick={() => openLinkDialog(customer.user_id)}
                  >
                    <LinkIcon className="h-4 w-4" />
                    Project koppelen
                  </Button>
                </CardContent>
              </Card>
            ))}
          </div>
        )}

        {/* Create Customer Dialog */}
        <Dialog open={isCreateDialogOpen} onOpenChange={setIsCreateDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Nieuwe klant aanmaken</DialogTitle>
              <DialogDescription>
                Maak een klantaccount aan. De klant kan inloggen en alleen gekoppelde projecten zien.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="email">E-mailadres *</Label>
                <Input
                  id="email"
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="klant@voorbeeld.nl"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password">Wachtwoord *</Label>
                <Input
                  id="password"
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder="••••••••"
                />
              </div>

              <div className="space-y-2">
                <Label>Projecten koppelen (optioneel)</Label>
                <div className="border rounded-lg p-3 max-h-48 overflow-y-auto space-y-2">
                  {projects.length === 0 ? (
                    <p className="text-sm text-muted-foreground">Geen projecten beschikbaar</p>
                  ) : (
                    projects.map((project) => (
                      <div key={project.id} className="flex items-center gap-2">
                        <Checkbox
                          id={`project-${project.id}`}
                          checked={selectedProjectIds.includes(project.id)}
                          onCheckedChange={() => toggleProjectSelection(project.id)}
                        />
                        <label
                          htmlFor={`project-${project.id}`}
                          className="text-sm cursor-pointer"
                        >
                          {project.name}
                        </label>
                      </div>
                    ))
                  )}
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setIsCreateDialogOpen(false)}>
                  Annuleren
                </Button>
                <Button 
                  onClick={handleCreateCustomer}
                  disabled={createCustomer.isPending}
                >
                  {createCustomer.isPending && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  Aanmaken
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>

        {/* Link Project Dialog */}
        <Dialog open={isLinkDialogOpen} onOpenChange={setIsLinkDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogHeader>
              <DialogTitle>Project koppelen</DialogTitle>
              <DialogDescription>
                Selecteer een project om aan deze klant te koppelen.
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-2 py-4">
              {availableProjects.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-4">
                  Alle projecten zijn al gekoppeld aan deze klant.
                </p>
              ) : (
                availableProjects.map((project) => (
                  <Button
                    key={project.id}
                    variant="outline"
                    className="w-full justify-start"
                    onClick={() => {
                      handleLinkProject(project.id);
                      setIsLinkDialogOpen(false);
                    }}
                    disabled={linkProject.isPending}
                  >
                    <Plus className="h-4 w-4 mr-2" />
                    {project.name}
                  </Button>
                ))
              )}
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </div>
  );
}
