import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader } from '@/components/ui/card';
import { useToast } from '@/hooks/use-toast';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';
import tripleTreeLogo from '@/assets/triple-tree-logo.png';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

const emailSchema = z.string().email('Ongeldig email adres');
const passwordSchema = z.string().min(6, 'Wachtwoord moet minimaal 6 tekens zijn');

export default function Auth() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [errors, setErrors] = useState<{
    email?: string;
    password?: string;
  }>({});

  // Forgot password state
  const [showForgotDialog, setShowForgotDialog] = useState(false);
  const [resetEmail, setResetEmail] = useState('');
  const [resetEmailError, setResetEmailError] = useState('');
  const [isResetting, setIsResetting] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const { user, signIn, resetPassword } = useAuth();
  const navigate = useNavigate();
  const { toast } = useToast();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const validateForm = () => {
    const newErrors: {
      email?: string;
      password?: string;
    } = {};
    const emailResult = emailSchema.safeParse(email);
    if (!emailResult.success) {
      newErrors.email = emailResult.error.errors[0].message;
    }
    const passwordResult = passwordSchema.safeParse(password);
    if (!passwordResult.success) {
      newErrors.password = passwordResult.error.errors[0].message;
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSignIn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    const { error } = await signIn(email, password);
    setIsLoading(false);
    if (error) {
      toast({
        title: 'Inloggen mislukt',
        description: error.message === 'Invalid login credentials' ? 'Onjuist email of wachtwoord' : error.message,
        variant: 'destructive',
      });
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setResetEmailError('');

    const emailResult = emailSchema.safeParse(resetEmail);
    if (!emailResult.success) {
      setResetEmailError(emailResult.error.errors[0].message);
      return;
    }

    setIsResetting(true);
    const { error } = await resetPassword(resetEmail);
    setIsResetting(false);

    if (error) {
      toast({
        title: 'Fout bij verzenden',
        description: error.message,
        variant: 'destructive',
      });
    } else {
      setResetSent(true);
    }
  };

  const closeForgotDialog = () => {
    setShowForgotDialog(false);
    setResetEmail('');
    setResetEmailError('');
    setResetSent(false);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center text-primary-foreground bg-popover-foreground">
          <img alt="Triple Tree Logo" className="h-16 mx-auto mb-4" src={tripleTreeLogo} />
          <CardDescription>Log in om verder te gaan</CardDescription>
        </CardHeader>
        <CardContent className="pt-[20px]">
          <form onSubmit={handleSignIn} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="login-email">Email</Label>
              <Input 
                id="login-email" 
                type="email" 
                placeholder="naam@voorbeeld.nl" 
                value={email} 
                onChange={e => setEmail(e.target.value)} 
              />
              {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
            </div>
            <div className="space-y-2">
              <Label htmlFor="login-password">Wachtwoord</Label>
              <Input 
                id="login-password" 
                type="password" 
                placeholder="••••••••" 
                value={password} 
                onChange={e => setPassword(e.target.value)} 
              />
              {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
            </div>
            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
              Inloggen
            </Button>
          </form>
          <div className="mt-4 text-center">
            <button
              type="button"
              onClick={() => setShowForgotDialog(true)}
              className="text-sm text-muted-foreground hover:text-primary underline-offset-4 hover:underline"
            >
              Wachtwoord vergeten?
            </button>
          </div>
        </CardContent>
      </Card>

      <Dialog open={showForgotDialog} onOpenChange={closeForgotDialog}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Wachtwoord vergeten</DialogTitle>
            <DialogDescription>
              Vul je email adres in om een reset link te ontvangen.
            </DialogDescription>
          </DialogHeader>
          {resetSent ? (
            <div className="py-4 text-center">
              <p className="text-sm text-muted-foreground">
                Als dit email adres bij ons bekend is, ontvang je binnen enkele minuten een email met instructies om je wachtwoord te resetten.
              </p>
              <Button onClick={closeForgotDialog} className="mt-4">
                Sluiten
              </Button>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="naam@voorbeeld.nl"
                  value={resetEmail}
                  onChange={(e) => setResetEmail(e.target.value)}
                />
                {resetEmailError && (
                  <p className="text-sm text-destructive">{resetEmailError}</p>
                )}
              </div>
              <div className="flex gap-2 justify-end">
                <Button type="button" variant="outline" onClick={closeForgotDialog}>
                  Annuleren
                </Button>
                <Button type="submit" disabled={isResetting}>
                  {isResetting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Verstuur reset link
                </Button>
              </div>
            </form>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}