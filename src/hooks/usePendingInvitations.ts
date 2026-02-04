import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

interface PendingInvitation {
  id: string;
  email: string;
  project_ids: string[];
  invited_by: string | null;
  created_at: string;
}

export function usePendingInvitations() {
  return useQuery({
    queryKey: ['pending-invitations'],
    queryFn: async (): Promise<PendingInvitation[]> => {
      // Cast to any since pending_invitations isn't in generated types yet
      const { data, error } = await (supabase
        .from('pending_invitations' as any)
        .select('*')
        .order('created_at', { ascending: false })) as { data: PendingInvitation[] | null; error: any };
      
      if (error) {
        console.error('Error fetching pending invitations:', error);
        throw error;
      }
      
      return data || [];
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async ({ email, projectIds }: { email: string; projectIds?: string[] }) => {
      const { data, error } = await supabase.functions.invoke('create-customer', {
        body: { email, projectIds }
      });
      
      if (error) throw error;
      if (data.error) throw new Error(data.error);
      
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
    },
  });
}

export function useDeletePendingInvitation() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { error } = await (supabase
        .from('pending_invitations' as any)
        .delete()
        .eq('id', invitationId)) as { error: any };
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
    },
  });
}
