import { ReactNode } from 'react';
import { Navigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { useIsAdmin, useIsSuperAdmin } from '@/hooks/useUserRole';
import { Loader2 } from 'lucide-react';

interface ProtectedRouteProps {
  children: ReactNode;
  requireAdmin?: boolean;
  requireSuperAdmin?: boolean;
}

export function ProtectedRoute({ children, requireAdmin = false, requireSuperAdmin = false }: ProtectedRouteProps) {
  const { user, loading: authLoading } = useAuth();
  const { isAdmin, isLoading: adminLoading } = useIsAdmin(user?.id);
  const { isSuperAdmin, isLoading: superAdminLoading } = useIsSuperAdmin(user?.id);

  // CRITICAL: Wait until ALL required state is fully loaded before rendering
  // This prevents flickering when role checks haven't completed yet
  const isFullyLoaded = !authLoading && 
    (!requireAdmin || !adminLoading) && 
    (!requireSuperAdmin || !superAdminLoading);

  if (!isFullyLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/" replace />;
  }

  if (requireSuperAdmin && !isSuperAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Geen toegang</h1>
          <p className="text-muted-foreground mb-4">
            Je hebt geen superadmin rechten om deze pagina te bekijken.
          </p>
          <a href="/dashboard" className="text-primary hover:underline">
            Terug naar dashboard
          </a>
        </div>
      </div>
    );
  }

  if (requireAdmin && !isAdmin) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <div className="text-center">
          <h1 className="text-2xl font-bold text-foreground mb-2">Geen toegang</h1>
          <p className="text-muted-foreground mb-4">
            Je hebt geen admin rechten om deze pagina te bekijken.
          </p>
          <a href="/dashboard" className="text-primary hover:underline">
            Terug naar dashboard
          </a>
        </div>
      </div>
    );
  }

  return <>{children}</>;
}
