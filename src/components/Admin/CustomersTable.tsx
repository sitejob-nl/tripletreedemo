import { useState, useMemo } from "react";
import { useProjects } from "@/hooks/useProjects";
import { useAuth } from "@/hooks/useAuth";
import { 
  useCustomersWithProjects, 
  useCreateCustomer, 
  useLinkProjectToCustomer, 
  useUnlinkProjectFromCustomer 
} from "@/hooks/useCustomerProjects";
import { usePendingInvitations, useDeletePendingInvitation } from "@/hooks/usePendingInvitations";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Link as LinkIcon, Unlink, UserPlus, Loader2, Mail, Clock, RefreshCw, Trash2 } from "lucide-react";

interface CustomersTableProps {
  isAddDialogOpen: boolean;
  setIsAddDialogOpen: (open: boolean) => void;
}

export function CustomersTable({ isAddDialogOpen, setIsAddDialogOpen }: CustomersTableProps) {
  const { user } = useAuth();
  const { projects } = useProjects(false, user?.id);
  const { data: customers, isLoading } = useCustomersWithProjects();
  const { data: pendingInvitations, isLoading: isPendingLoading } = usePendingInvitations();
  const createCustomer = useCreateCustomer();
  const linkProject = useLinkProjectToCustomer();
  const unlinkProject = useUnlinkProjectFromCustomer();
  const deletePendingInvitation = useDeletePendingInvitation();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [isLinkDialogOpen, setIsLinkDialogOpen] = useState(false);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(null);
  
  const [newEmail, setNewEmail] = useState("");
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);

  const filteredCustomers = useMemo(() => {
    const q = search.toLowerCase();
    return customers?.filter(customer =>
      customer.email.toLowerCase().includes(q) ||
      customer.user_id.toLowerCase().includes(q)
    ) || [];
  }, [customers, search]);

  const filteredPending = useMemo(() => {
    return pendingInvitations?.filter(invitation =>
      invitation.email.toLowerCase().includes(search.toLowerCase())
    ) || [];
  }, [pendingInvitations, search]);

  const handleInviteCustomer = async () => {
    if (!newEmail) {
      toast({
        title: "Validatie fout",
        description: "Vul een e-mailadres in.",
        variant: "destructive"
      });
      return;
    }

    try {
      await createCustomer.mutateAsync({
        email: newEmail,
        password: '', // Not used anymore
        projectIds: selectedProjectIds
      });

      toast({
        title: "Uitnodiging verstuurd",
        description: `Een activatielink is verstuurd naar ${newEmail}.`
      });

      setIsAddDialogOpen(false);
      setNewEmail("");
      setSelectedProjectIds([]);
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon uitnodiging niet versturen.",
        variant: "destructive"
      });
    }
  };

  const handleResendInvitation = async (email: string, projectIds: string[]) => {
    try {
      await createCustomer.mutateAsync({
        email,
        password: '',
        projectIds
      });

      toast({
        title: "Uitnodiging opnieuw verstuurd",
        description: `Een nieuwe activatielink is verstuurd naar ${email}.`
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon uitnodiging niet opnieuw versturen.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteInvitation = async (invitationId: string) => {
    try {
      await deletePendingInvitation.mutateAsync(invitationId);
      toast({
        title: "Uitnodiging verwijderd",
        description: "De openstaande uitnodiging is verwijderd."
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon uitnodiging niet verwijderen.",
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
      setIsLinkDialogOpen(false);
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
        description: error.message,
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

  const getProjectNames = (projectIds: string[]) => {
    return projectIds
      .map(id => projects.find(p => p.id === id)?.name || 'Onbekend')
      .join(', ');
  };

  return (
    <>
      <Card data-tour="admin-customers-table">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Klanten</CardTitle>
              <CardDescription>Beheer klantaccounts en projectkoppelingen</CardDescription>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
              <Mail className="h-4 w-4" />
              Uitnodigen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Search */}
          <div className="relative mb-6">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
            <Input
              placeholder="Zoek op e-mail..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-10"
            />
          </div>

          {/* Tabs for Active and Pending */}
          <Tabs defaultValue="active" className="w-full">
            <TabsList className="mb-4">
              <TabsTrigger value="active">
                Actief ({filteredCustomers.length})
              </TabsTrigger>
              <TabsTrigger value="pending">
                <Clock className="h-4 w-4 mr-1" />
                Uitnodigingen ({filteredPending.length})
              </TabsTrigger>
            </TabsList>

            <TabsContent value="active">
              {isLoading ? (
                <div className="text-center py-8 text-muted-foreground">Laden...</div>
              ) : filteredCustomers.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {search ? "Geen klanten gevonden." : "Nog geen actieve klanten."}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>E-mail</TableHead>
                        <TableHead>Projecten</TableHead>
                        <TableHead className="hidden md:table-cell">Aangemaakt</TableHead>
                        <TableHead className="text-right">Acties</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredCustomers.map((customer) => {
                        // email is either the real address (from edge fn) or falls back to user_id.
                        // We treat a UUID-shaped value as "no email resolved" to keep the UX honest.
                        const isUuid = customer.email === customer.user_id;
                        return (
                        <TableRow key={customer.user_id}>
                          <TableCell className={`text-sm max-w-[260px] truncate ${isUuid ? 'font-mono text-muted-foreground' : 'font-medium'}`} title={customer.user_id}>
                            {isUuid ? <em>(geen e-mail gevonden)</em> : customer.email}
                          </TableCell>
                          <TableCell>
                            <div className="flex flex-wrap gap-1">
                              {customer.projects.length === 0 ? (
                                <span className="text-sm text-muted-foreground italic">Geen</span>
                              ) : (
                                customer.projects.map((proj) => (
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
                                ))
                              )}
                            </div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {new Date(customer.created_at).toLocaleDateString('nl-NL')}
                          </TableCell>
                          <TableCell className="text-right">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openLinkDialog(customer.user_id)}
                              className="gap-1"
                            >
                              <LinkIcon className="h-4 w-4" />
                              <span className="hidden sm:inline">Koppelen</span>
                            </Button>
                          </TableCell>
                        </TableRow>
                      );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </TabsContent>

            <TabsContent value="pending">
              {isPendingLoading ? (
                <div className="text-center py-8 text-muted-foreground">Laden...</div>
              ) : filteredPending.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  {search ? "Geen uitnodigingen gevonden." : "Geen openstaande uitnodigingen."}
                </div>
              ) : (
                <div className="rounded-md border">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>E-mail</TableHead>
                        <TableHead>Projecten</TableHead>
                        <TableHead className="hidden md:table-cell">Verstuurd</TableHead>
                        <TableHead className="text-right">Acties</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {filteredPending.map((invitation) => (
                        <TableRow key={invitation.id}>
                          <TableCell className="font-medium">
                            {invitation.email}
                          </TableCell>
                          <TableCell>
                            {invitation.project_ids.length === 0 ? (
                              <span className="text-sm text-muted-foreground italic">Geen</span>
                            ) : (
                              <span className="text-sm">
                                {getProjectNames(invitation.project_ids)}
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="hidden md:table-cell">
                            {new Date(invitation.created_at).toLocaleDateString('nl-NL')}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1">
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleResendInvitation(invitation.email, invitation.project_ids)}
                                disabled={createCustomer.isPending}
                                className="gap-1"
                              >
                                <RefreshCw className="h-4 w-4" />
                                <span className="hidden sm:inline">Opnieuw</span>
                              </Button>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => handleDeleteInvitation(invitation.id)}
                                disabled={deletePendingInvitation.isPending}
                                className="text-destructive hover:text-destructive"
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
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>

      {/* Invite Customer Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Klant uitnodigen</DialogTitle>
            <DialogDescription>
              Stuur een uitnodiging per e-mail. De klant ontvangt een link om zelf een wachtwoord te kiezen.
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
              <Button variant="outline" onClick={() => setIsAddDialogOpen(false)}>
                Annuleren
              </Button>
              <Button 
                onClick={handleInviteCustomer}
                disabled={createCustomer.isPending}
                className="gap-2"
              >
                {createCustomer.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
                <Mail className="h-4 w-4" />
                Uitnodigen
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
                  onClick={() => handleLinkProject(project.id)}
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
    </>
  );
}
