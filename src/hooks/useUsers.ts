import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'user' | 'superadmin';

interface UserWithRole {
  user_id: string;
  email: string;
  role: AppRole | null;
  role_id: string | null;
  created_at: string;
}

export function useUsers() {
  return useQuery({
    queryKey: ['users-with-roles'],
    queryFn: async (): Promise<UserWithRole[]> => {
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*');

      if (rolesError) {
        console.error('Error fetching user roles:', rolesError);
        throw rolesError;
      }

      // Resolve UUID → email via admin-gated edge function; auth.users is
      // service-role-only. Falls back to UUID display on failure.
      const userIds = (userRoles || []).map(r => r.user_id);
      let emailsMap: Record<string, string | null> = {};
      if (userIds.length > 0) {
        const { data: emailsData, error: emailsError } = await supabase.functions.invoke(
          'get-customer-emails',
          { body: { userIds } }
        );
        if (emailsError) {
          console.warn('Kon gebruiker-emails niet ophalen:', emailsError.message);
        } else if (emailsData?.emails) {
          emailsMap = emailsData.emails;
        }
      }

      return (userRoles || []).map(role => ({
        user_id: role.user_id,
        email: emailsMap[role.user_id] || role.user_id,
        role: role.role as AppRole,
        role_id: role.id,
        created_at: role.created_at || new Date().toISOString()
      }));
    },
  });
}

export function useUpdateUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role, existingRoleId }: { userId: string; role: AppRole; existingRoleId: string | null }) => {
      if (existingRoleId) {
        // Update existing role
        const { error } = await supabase
          .from('user_roles')
          .update({ role })
          .eq('id', existingRoleId);
        
        if (error) throw error;
      } else {
        // Insert new role
        const { error } = await supabase
          .from('user_roles')
          .insert({ user_id: userId, role });
        
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['userRole'] });
    },
  });
}

export function useDeleteUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (roleId: string) => {
      const { error } = await supabase
        .from('user_roles')
        .delete()
        .eq('id', roleId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['userRole'] });
    },
  });
}

export function useAddUserRole() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, role }: { userId: string; role: AppRole }) => {
      const { error } = await supabase
        .from('user_roles')
        .insert({ user_id: userId, role });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
    },
  });
}
