import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowLeft, Users, Shield, UserCog, Trash2, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useToast } from "@/hooks/use-toast";
import { useUsers, useUpdateUserRole, useDeleteUserRole, useAddUserRole } from "@/hooks/useUsers";
import { useAuth } from "@/hooks/useAuth";

type AppRole = 'admin' | 'user' | 'superadmin';

const roleLabels: Record<AppRole, string> = {
  user: 'Gebruiker',
  admin: 'Admin',
  superadmin: 'Superadmin'
};

const roleBadgeStyles: Record<AppRole, string> = {
  user: 'bg-secondary text-secondary-foreground',
  admin: 'bg-primary/20 text-primary',
  superadmin: 'bg-kpi-purple text-kpi-purple-text'
};

export default function AdminUsers() {
  const { data: users, isLoading } = useUsers();
  const updateRole = useUpdateUserRole();
  const deleteRole = useDeleteUserRole();
  const addRole = useAddUserRole();
  const { user: currentUser } = useAuth();
  const { toast } = useToast();
  
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [newUserId, setNewUserId] = useState('');
  const [newUserRole, setNewUserRole] = useState<AppRole>('user');

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
    <div className="min-h-screen bg-background p-6">
      <div className="max-w-4xl mx-auto">
        {/* Header */}
        <div className="flex items-center justify-between mb-8">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" size="icon">
                <ArrowLeft className="h-5 w-5" />
              </Button>
            </Link>
            <div>
              <h1 className="text-3xl font-bold text-foreground">Gebruikersbeheer</h1>
              <p className="text-muted-foreground">Beheer gebruikersrollen en toegangsrechten</p>
            </div>
          </div>
          <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
            <DialogTrigger asChild>
              <Button className="gap-2">
                <Plus className="h-4 w-4" />
                Rol toekennen
              </Button>
            </DialogTrigger>
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
        </div>

        {/* Role Overview Cards */}
        <div className="grid gap-4 md:grid-cols-3 mb-8">
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-secondary">
                  <Users className="h-5 w-5 text-secondary-foreground" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {users?.filter(u => u.role === 'user').length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Gebruikers</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-primary/20">
                  <Shield className="h-5 w-5 text-primary" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {users?.filter(u => u.role === 'admin').length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Admins</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <div className="p-2 rounded-lg bg-kpi-purple">
                  <UserCog className="h-5 w-5 text-kpi-purple-text" />
                </div>
                <div>
                  <p className="text-2xl font-bold">
                    {users?.filter(u => u.role === 'superadmin').length || 0}
                  </p>
                  <p className="text-sm text-muted-foreground">Superadmins</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users List */}
        <Card>
          <CardHeader>
            <CardTitle>Gebruikers met rollen</CardTitle>
            <CardDescription>
              Overzicht van alle gebruikers met een toegewezen rol
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-muted-foreground">Laden...</div>
            ) : !users || users.length === 0 ? (
              <div className="text-center py-8 text-muted-foreground">
                Nog geen gebruikers met rollen.
              </div>
            ) : (
              <div className="space-y-3">
                {users.map((user) => (
                  <div 
                    key={user.role_id} 
                    className="flex items-center justify-between p-4 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-3">
                      <div className="h-10 w-10 rounded-full bg-muted flex items-center justify-center">
                        <Users className="h-5 w-5 text-muted-foreground" />
                      </div>
                      <div>
                        <p className="font-mono text-sm truncate max-w-[200px] md:max-w-[300px]">
                          {user.user_id}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Aangemaakt: {new Date(user.created_at).toLocaleDateString('nl-NL')}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-3">
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
                      <Button
                        variant="ghost"
                        size="icon"
                        className="text-destructive hover:text-destructive"
                        onClick={() => user.role_id && handleDeleteRole(user.role_id, user.user_id)}
                        disabled={user.user_id === currentUser?.id}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
