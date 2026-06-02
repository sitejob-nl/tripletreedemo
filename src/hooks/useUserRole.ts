import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';

type AppRole = 'admin' | 'user' | 'superadmin';

interface UserRole {
  id: string;
  user_id: string;
  role: AppRole;
  created_at: string;
}

// user_roles has UNIQUE(user_id, role), so an account may legitimately hold more
// than one role row. Resolving with .maybeSingle() would throw ("multiple rows
// returned") for such an account and silently drop the user to no-role — which,
// for an admin, means losing access to the admin UI. So we fetch ALL roles and
// keep the highest-privilege one.
const ROLE_PRIORITY: Record<AppRole, number> = { superadmin: 3, admin: 2, user: 1 };

export function useUserRole(userId: string | undefined) {
  return useQuery({
    queryKey: ['userRole', userId],
    queryFn: async (): Promise<UserRole | null> => {
      if (!userId) return null;

      const { data, error } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', userId);

      if (error) {
        console.error('Error fetching user role:', error);
        return null;
      }

      const rows = (data as UserRole[] | null) || [];
      if (rows.length === 0) return null;

      return rows.reduce((highest, current) =>
        ROLE_PRIORITY[current.role] > ROLE_PRIORITY[highest.role] ? current : highest
      );
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
