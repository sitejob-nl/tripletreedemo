import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface CustomerProject {
  id: string;
  user_id: string;
  project_id: string;
  created_at: string;
  created_by: string | null;
}

interface CustomerWithProjects {
  user_id: string;
  email: string;
  role: 'user' | 'admin' | 'superadmin';
  role_id: string;
  created_at: string;
  projects: {
    id: string;
    project_id: string;
    project_name: string;
    project_key: string;
  }[];
}

export function useCustomerProjects() {
  return useQuery({
    queryKey: ['customer-projects'],
    queryFn: async (): Promise<CustomerProject[]> => {
      const { data, error } = await supabase
        .from('customer_projects')
        .select('*');
      
      if (error) {
        console.error('Error fetching customer projects:', error);
        throw error;
      }
      
      return data || [];
    },
  });
}

export function useCustomersWithProjects() {
  return useQuery({
    queryKey: ['customers-with-projects'],
    queryFn: async (): Promise<CustomerWithProjects[]> => {
      // Get all users with role 'user'
      const { data: userRoles, error: rolesError } = await supabase
        .from('user_roles')
        .select('*')
        .eq('role', 'user');
      
      if (rolesError) {
        console.error('Error fetching user roles:', rolesError);
        throw rolesError;
      }

      // Get all customer_projects
      const { data: customerProjects, error: cpError } = await supabase
        .from('customer_projects')
        .select('*');
      
      if (cpError) {
        console.error('Error fetching customer projects:', cpError);
        throw cpError;
      }

      // Get all projects for names - use public view (no token needed)
      // Cast response to expected type since view isn't in generated types yet
      const { data: projects, error: projError } = await supabase
        .from('projects_public' as any)
        .select('id, name, project_key') as { data: Array<{ id: string; name: string; project_key: string }> | null; error: any };
      
      if (projError) {
        console.error('Error fetching projects:', projError);
        throw projError;
      }

      const projectsMap = new Map(projects?.map(p => [p.id, p]) || []);

      // Build customer data with their projects
      const customers: CustomerWithProjects[] = (userRoles || []).map(role => {
        const userProjects = (customerProjects || [])
          .filter(cp => cp.user_id === role.user_id)
          .map(cp => {
            const project = projectsMap.get(cp.project_id);
            return {
              id: cp.id,
              project_id: cp.project_id,
              project_name: project?.name || 'Onbekend',
              project_key: project?.project_key || ''
            };
          });

        return {
          user_id: role.user_id,
          email: role.user_id, // Will be shown as user_id since we can't access auth.users
          role: role.role as 'user',
          role_id: role.id,
          created_at: role.created_at || new Date().toISOString(),
          projects: userProjects
        };
      });

      return customers;
    },
  });
}

export function useLinkProjectToCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ userId, projectId }: { userId: string; projectId: string }) => {
      const { data: { user } } = await supabase.auth.getUser();
      
      const { error } = await supabase
        .from('customer_projects')
        .insert({
          user_id: userId,
          project_id: projectId,
          created_by: user?.id
        });
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-projects'] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-projects'] });
    },
  });
}

export function useUnlinkProjectFromCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (linkId: string) => {
      const { error } = await supabase
        .from('customer_projects')
        .delete()
        .eq('id', linkId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customer-projects'] });
      queryClient.invalidateQueries({ queryKey: ['customers-with-projects'] });
    },
  });
}

export function useCreateCustomer() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, projectIds }: { email: string; password?: string; projectIds?: string[] }) => {
      const { data, error } = await supabase.functions.invoke('create-customer', {
        body: { email, projectIds }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['customers-with-projects'] });
      queryClient.invalidateQueries({ queryKey: ['users-with-roles'] });
      queryClient.invalidateQueries({ queryKey: ['customer-projects'] });
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
    },
  });
}
