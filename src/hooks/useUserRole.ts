import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'user' | 'superadmin';

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

export function useUserRole(userId: string | undefined) {
  return useQuery({
    queryKey: ['userRole', userId],
    queryFn: async (): Promise<UserRole | null> => {
      if (!userId) return null;
      
      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId)
        .maybeSingle();
      
      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }
      
      return data as UserRole | null;
    },
    enabled: !!userId,
  });
}

export function useIsAdmin(userId: string | undefined) {
  const { data: userRole, isLoading } = useUserRole(userId);
  
  return {
    isAdmin: userRole?.role === 'admin' || userRole?.role === 'superadmin',
    isLoading,
  };
}

export function useIsSuperAdmin(userId: string | undefined) {
  const { data: userRole, isLoading } = useUserRole(userId);
  
  return {
    isSuperAdmin: userRole?.role === 'superadmin',
    isLoading,
  };
}
