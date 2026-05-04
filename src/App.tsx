import { useEffect } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, useLocation, useNavigate } from "react-router-dom";
import { ProtectedRoute } from "@/components/ProtectedRoute";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { errorLogger } from "@/lib/errorLogger";
import { supabase } from "@/integrations/supabase/client";
import Dashboard from "./pages/Dashboard";
import Admin from "./pages/Admin";
import AdminUsers from "./pages/AdminUsers";
import AdminCustomers from "./pages/AdminCustomers";
import Developer from "./pages/Developer";
import ApiDocs from "./pages/ApiDocs";
import Auth from "./pages/Auth";
import ResetPassword from "./pages/ResetPassword";
import SetPassword from "./pages/SetPassword";
import Welcome from "./pages/Welcome";
import NotFound from "./pages/NotFound";

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,
      gcTime: 10 * 60 * 1000,
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

/**
 * Force navigation to /reset-password or /set-password whenever Supabase hands us a
 * recovery- or invite-token. Without this, an already-authenticated user clicking
 * such a link would hit `/` (or a protected route), get treated as "signed in", and
 * be redirected straight to /dashboard — burning the token without ever seeing the
 * password form. Belt-and-suspenders next to the Supabase Redirect URL allowlist.
 */
const AuthLinkRedirect = () => {
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    const hash = window.location.hash;
    const target = hash.includes("type=recovery")
      ? "/reset-password"
      : hash.includes("type=invite") || hash.includes("type=signup")
        ? "/set-password"
        : null;
    if (target && location.pathname !== target) {
      navigate(`${target}${hash}`, { replace: true });
    }

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY") {
        navigate("/reset-password", { replace: true });
      }
    });
    return () => subscription.unsubscribe();
  }, [navigate, location.pathname]);

  return null;
};

const App = () => {
  useEffect(() => {
    // Initialize global error handlers
    errorLogger.initGlobalHandlers();
  }, []);

  return (
    <ErrorBoundary>
      <QueryClientProvider client={queryClient}>
        <TooltipProvider>
          <Toaster />
          <Sonner />
          <BrowserRouter>
            <AuthLinkRedirect />
            <Routes>
              <Route path="/" element={<Auth />} />
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route path="/set-password" element={<SetPassword />} />
              <Route path="/welcome" element={<ProtectedRoute><Welcome /></ProtectedRoute>} />
              <Route path="/dashboard" element={<ProtectedRoute><Dashboard /></ProtectedRoute>} />
              <Route path="/admin" element={<ProtectedRoute requireAdmin><Admin /></ProtectedRoute>} />
              <Route path="/admin/users" element={<ProtectedRoute requireAdmin><AdminUsers /></ProtectedRoute>} />
              <Route path="/admin/customers" element={<ProtectedRoute requireAdmin><AdminCustomers /></ProtectedRoute>} />
              <Route path="/developer" element={<ProtectedRoute requireSuperAdmin><Developer /></ProtectedRoute>} />
              <Route path="/developer/api-docs" element={<ProtectedRoute requireSuperAdmin><ApiDocs /></ProtectedRoute>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </BrowserRouter>
        </TooltipProvider>
      </QueryClientProvider>
    </ErrorBoundary>
  );
};

export default App;
