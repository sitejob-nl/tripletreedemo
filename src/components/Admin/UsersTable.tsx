import { useState, useMemo } from "react";
import { useUsers, useUpdateUserRole, useDeleteUserRole, useAddUserRole } from "@/hooks/useUsers";
import { useAuth } from "@/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { Plus, Search, Trash2, Users, Shield, UserCog } from "lucide-react";

type AppRole = 'admin' | 'user' | 'superadmin';

const roleLabels: Record<AppRole, string> = {
  user: 'Gebruiker',
  admin: 'Admin',
  superadmin: 'Superadmin'
};

const roleBadgeStyles: Record<AppRole, string> = {
  user: 'bg-secondary text-secondary-foreground',
  admin: 'bg-primary/20 text-primary',
  superadmin: 'bg-purple-500/20 text-purple-600'
};

export function UsersTable() {
  const { data: users, isLoading } = useUsers();
  const updateRole = useUpdateUserRole();
  const deleteRole = useDeleteUserRole();
  const addRole = useAddUserRole();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();

  const [search, setSearch] = useState("");
  const [filterRole, setFilterRole] = useState<string>("all");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('user');

  const filteredUsers = useMemo(() => {
    return users?.filter(user => {
      const matchesSearch = user.user_id.toLowerCase().includes(search.toLowerCase());
      const matchesRole = filterRole === "all" || user.role === filterRole;
      return matchesSearch && matchesRole;
    }) || [];
  }, [users, search, filterRole]);

  const roleCounts = useMemo(() => {
    return {
      user: users?.filter(u => u.role === 'user').length || 0,
      admin: users?.filter(u => u.role === 'admin').length || 0,
      superadmin: users?.filter(u => u.role === 'superadmin').length || 0
    };
  }, [users]);

  const handleRoleChange = async (userId: string, newRole: AppRole, existingRoleId: string | null) => {
    try {
      await updateRole.mutateAsync({ userId, role: newRole, existingRoleId });
      toast({
        title: "Rol bijgewerkt",
        description: `Gebruikersrol is gewijzigd naar ${roleLabels[newRole]}.`
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon rol niet bijwerken.",
        variant: "destructive"
      });
    }
  };

  const handleDeleteRole = async (roleId: string, userId: string) => {
    if (userId === currentUser?.id) {
      toast({
        title: "Niet toegestaan",
        description: "Je kunt je eigen rol niet verwijderen.",
        variant: "destructive"
      });
      return;
    }

    if (!confirm("Weet je zeker dat je deze gebruikersrol wilt verwijderen?")) return;

    try {
      await deleteRole.mutateAsync(roleId);
      toast({
        title: "Rol verwijderd",
        description: "De gebruikersrol is verwijderd."
      });
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon rol niet verwijderen.",
        variant: "destructive"
      });
    }
  };

  const handleAddRole = async () => {
    if (!newUserId.trim()) {
      toast({
        title: "Validatie fout",
        description: "Vul een user ID in.",
        variant: "destructive"
      });
      return;
    }

    try {
      await addRole.mutateAsync({ userId: newUserId, role: newUserRole });
      toast({
        title: "Rol toegevoegd",
        description: `Nieuwe ${roleLabels[newUserRole]} rol is toegevoegd.`
      });
      setIsAddDialogOpen(false);
      setNewUserId('');
      setNewUserRole('user');
    } catch (error: any) {
      toast({
        title: "Fout",
        description: error.message || "Kon rol niet toevoegen.",
        variant: "destructive"
      });
    }
  };

  return (
    <>
      <Card data-tour="admin-users-table">
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>Gebruikers</CardTitle>
              <CardDescription>Beheer gebruikersrollen en toegangsrechten</CardDescription>
            </div>
            <Button onClick={() => setIsAddDialogOpen(true)} className="gap-2">
              <Plus className="h-4 w-4" />
              Rol toekennen
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {/* Role Stats */}
          <div className="grid grid-cols-3 gap-4 mb-6">
            <div className="flex items-center gap-2 p-3 rounded-lg bg-muted/50">
              <Users className="h-4 w-4 text-muted-foreground" />
              <div>
                <p className="text-xl font-bold">{roleCounts.user}</p>
                <p className="text-xs text-muted-foreground">Gebruikers</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-primary/10">
              <Shield className="h-4 w-4 text-primary" />
              <div>
                <p className="text-xl font-bold">{roleCounts.admin}</p>
                <p className="text-xs text-muted-foreground">Admins</p>
              </div>
            </div>
            <div className="flex items-center gap-2 p-3 rounded-lg bg-purple-500/10">
              <UserCog className="h-4 w-4 text-purple-600" />
              <div>
                <p className="text-xl font-bold">{roleCounts.superadmin}</p>
                <p className="text-xs text-muted-foreground">Superadmins</p>
              </div>
            </div>
          </div>

          {/* Filters */}
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Zoek op user ID..."
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={filterRole} onValueChange={setFilterRole}>
              <SelectTrigger className="w-[180px]">
                <SelectValue placeholder="Filter op rol" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Alle rollen</SelectItem>
                <SelectItem value="user">Gebruikers</SelectItem>
                <SelectItem value="admin">Admins</SelectItem>
                <SelectItem value="superadmin">Superadmins</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Table */}
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">Laden...</div>
          ) : filteredUsers.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              {search || filterRole !== "all" ? "Geen gebruikers gevonden." : "Nog geen gebruikers met rollen."}
            </div>
          ) : (
            <div className="rounded-md border">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>User ID</TableHead>
                    <TableHead>Rol</TableHead>
                    <TableHead className="hidden md:table-cell">Aangemaakt</TableHead>
                    <TableHead className="text-right">Acties</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredUsers.map((user) => (
                    <TableRow key={user.role_id}>
                      <TableCell className="font-mono text-sm max-w-[200px] truncate">
                        {user.user_id}
                        {user.user_id === currentUser?.id && (
                          <Badge variant="outline" className="ml-2">Jij</Badge>
                        )}
                      </TableCell>
                      <TableCell>
                        <Select 
                          value={user.role || 'user'} 
                          onValueChange={(v) => handleRoleChange(user.user_id, v as AppRole, user.role_id)}
                          disabled={user.user_id === currentUser?.id}
                        >
                          <SelectTrigger className="w-[140px]">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="user">Gebruiker</SelectItem>
                            <SelectItem value="admin">Admin</SelectItem>
                            <SelectItem value="superadmin">Superadmin</SelectItem>
                          </SelectContent>
                        </Select>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {new Date(user.created_at).toLocaleDateString('nl-NL')}
                      </TableCell>
                      <TableCell className="text-right">
                        <Button
                          variant="ghost"
                          size="icon"
                          className="text-destructive hover:text-destructive"
                          onClick={() => user.role_id && handleDeleteRole(user.role_id, user.user_id)}
                          disabled={user.user_id === currentUser?.id}
                        >
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Add Role Dialog */}
      <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Nieuwe rol toekennen</DialogTitle>
            <DialogDescription>
              Voer de user ID in en selecteer een rol.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="userId">User ID (UUID)</Label>
              <Input
                id="userId"
                value={newUserId}
                onChange={(e) => setNewUserId(e.target.value)}
                placeholder="xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx"
              />
              <p className="text-xs text-muted-foreground">
                Je vindt de user ID in het Supabase dashboard onder Authentication → Users
              </p>
            </div>
            <div className="space-y-2">
              <Label htmlFor="role">Rol</Label>
              <Select value={newUserRole} onValueChange={(v) => setNewUserRole(v as AppRole)}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">Gebruiker</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="superadmin">Superadmin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddRole} className="w-full" disabled={addRole.isPending}>
              {addRole.isPending ? "Toevoegen..." : "Rol toekennen"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
