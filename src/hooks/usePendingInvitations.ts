import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { getSupabaseFunctionErrorMessage } from '@/lib/functionErrors';

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
      const { data, error } = await supabase
        .from('pending_invitations')
        .select('*')
        .order('created_at', { ascending: false });
      
      if (error) {
        console.error('Error fetching pending invitations:', error);
        throw error;
      }
      
      return (data || []).map((invitation) => ({
        ...invitation,
        project_ids: invitation.project_ids || [],
      }));
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
      
      if (error) throw new Error(await getSupabaseFunctionErrorMessage(error));
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
      const { error } = await supabase
        .from('pending_invitations')
        .delete()
        .eq('id', invitationId);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['pending-invitations'] });
    },
  });
}
