import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { friendlyError } from '@/lib/friendlyError';
import { errorLogger } from '@/lib/errorLogger';
import { Loader2, CheckCircle } from 'lucide-react';
import { z } from 'zod';
import tripleTreeLogo from '@/assets/triple-tree-logo.png';

const passwordSchema = z.string().min(6, 'Wachtwoord moet minimaal 6 tekens zijn');

// A branded recovery link sent via Resend (admin "Opnieuw"/"Uitnodigen" for an
// account that already exists) lands here as ?token_hash=...&type=recovery. We
// verify the token ourselves so app.ttcallcenters.nl stays in the URL, just like
// the invite flow on /set-password. The legacy hash-based "wachtwoord vergeten"
// flow has no token_hash query param and keeps relying on the recovery session.
const hasRecoveryTokenInUrl = () => {
  const params = new URLSearchParams(window.location.search);
  return params.get('token_hash') !== null && params.get('type') === 'recovery';
};

export default function ResetPassword() {
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const [isVerifyingLink, setIsVerifyingLink] = useState(hasRecoveryTokenInUrl);
  const [errors, setErrors] = useState<{
    password?: string;
    confirmPassword?: string;
  }>({});

  const { updatePassword, session } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  // Verify a branded recovery token_hash from the query string (Resend link).
  useEffect(() => {
    if (!hasRecoveryTokenInUrl()) return;

    let isMounted = true;

    const verifyRecoveryLink = async () => {
      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get('token_hash') as string;

      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type: 'recovery',
      });

      if (!isMounted) return;

      if (error) {
        errorLogger.logApiError('verify_recovery_link', error);
        toast({
          title: 'Link verlopen',
          description: 'De inloglink is verlopen of ongeldig. Vraag een nieuwe aan bij Triple Tree.',
          variant: 'destructive',
        });
        navigate('/');
        return;
      }

      // Strip the spent token from the URL so a refresh doesn't re-verify it.
      navigate('/reset-password', { replace: true });
      setIsVerifyingLink(false);
    };

    verifyRecoveryLink();

    return () => {
      isMounted = false;
    };
  }, [navigate, toast]);

  // Check if user has a valid recovery session. Skip while a token_hash link is
  // still being verified — otherwise this bounces the user before the session
  // is established.
  useEffect(() => {
    if (isVerifyingLink) return;

    if (!session) {
      // No session means the reset link is invalid or expired
      const timer = setTimeout(() => {
        toast({
          title: 'Sessie verlopen',
          description: 'De reset link is verlopen of ongeldig. Vraag een nieuwe aan.',
          variant: 'destructive',
        });
        navigate('/');
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [session, isVerifyingLink, navigate, toast]);

  const validateForm = () => {
    const newErrors: { password?: string; confirmPassword?: string } = {};

    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }

    if (password !== confirmPassword) {
      newErrors.confirmPassword = 'Wachtwoorden komen niet overeen';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;

    setIsLoading(true);
    const { error } = await updatePassword(password);
    setIsLoading(false);

    if (error) {
      toast({
        title: 'Er ging iets mis',
        description: friendlyError(error, 'We konden het wachtwoord niet wijzigen. Probeer de link opnieuw te openen.'),
        variant: 'destructive',
      });
    } else {
      setIsSuccess(true);
      toast({
        title: 'Wachtwoord gewijzigd',
        description: 'Je wachtwoord is succesvol gewijzigd.',
      });
      setTimeout(() => {
        navigate('/dashboard');
      }, 2000);
    }
  };

  if (isVerifyingLink) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (isSuccess) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-4">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6 text-center">
            <CheckCircle className="h-16 w-16 text-primary mx-auto mb-4" />
            <h2 className="text-xl font-semibold mb-2">Wachtwoord gewijzigd!</h2>
            <p className="text-muted-foreground">
              Je wordt doorgestuurd naar het dashboard...
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center text-primary-foreground bg-popover-foreground">
          <img
            alt="Triple Tree Logo"
            className="h-16 mx-auto mb-4"
            src={tripleTreeLogo}
          />
          <CardDescription>Kies een nieuw wachtwoord</CardDescription>
        </CardHeader>
        <CardContent className="pt-[20px]">
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="new-password">Nieuw wachtwoord</Label>
              <Input
                id="new-password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
              {errors.password && (
                <p className="text-sm text-destructive">{errors.password}</p>
              )}
            </div>
            <div className="space-y-2">
              <Label htmlFor="confirm-password">Bevestig wachtwoord</Label>
              <Input
                id="confirm-password"
                type="password"
                placeholder="••••••••"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
              {errors.confirmPassword && (
                <p className="text-sm text-destructive">{errors.confirmPassword}</p>
              )}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Wachtwoord wijzigen
            </Button>
          </form>
        </CardContent>
      </Card>
    </div>
  );
}
