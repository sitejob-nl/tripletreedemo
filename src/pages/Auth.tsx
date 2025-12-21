import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/hooks/useAuth';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { Loader2, Mail, Lock } from 'lucide-react';
import { z } from 'zod';
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
  const {
    user,
    signIn,
    signUp
  } = useAuth();
  const navigate = useNavigate();
  const {
    toast
  } = useToast();
  useEffect(() => {
    if (user) {
      navigate('/');
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
    const {
      error
    } = await signIn(email, password);
    setIsLoading(false);
    if (error) {
      toast({
        title: 'Inloggen mislukt',
        description: error.message === 'Invalid login credentials' ? 'Onjuist email of wachtwoord' : error.message,
        variant: 'destructive'
      });
    }
  };
  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validateForm()) return;
    setIsLoading(true);
    const {
      error
    } = await signUp(email, password);
    setIsLoading(false);
    if (error) {
      if (error.message.includes('already registered')) {
        toast({
          title: 'Account bestaat al',
          description: 'Dit email adres is al geregistreerd. Probeer in te loggen.',
          variant: 'destructive'
        });
      } else {
        toast({
          title: 'Registratie mislukt',
          description: error.message,
          variant: 'destructive'
        });
      }
    } else {
      toast({
        title: 'Account aangemaakt',
        description: 'Controleer je email om je account te bevestigen.'
      });
    }
  };
  return <div className="min-h-screen flex items-center justify-center bg-background p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <img alt="Triple Tree Logo" className="h-16 mx-auto mb-4" src="/lovable-uploads/88aa155b-88a2-45d0-a554-eaafefd22704.png" />
          <CardTitle className="text-2xl">Triple Tree Dashboard</CardTitle>
          <CardDescription>Log in of maak een account aan</CardDescription>
        </CardHeader>
        <CardContent>
          <Tabs defaultValue="login">
            <TabsList className="grid w-full grid-cols-2">
              <TabsTrigger value="login">Inloggen</TabsTrigger>
              <TabsTrigger value="register">Registreren</TabsTrigger>
            </TabsList>
            
            <TabsContent value="login">
              <form onSubmit={handleSignIn} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="login-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="login-email" type="email" placeholder="naam@voorbeeld.nl" value={email} onChange={e => setEmail(e.target.value)} className="pl-10" />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="login-password">Wachtwoord</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="login-password" type="password" placeholder="••••••••" value={password} onChange={e => setPassword(e.target.value)} className="pl-10" />
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Inloggen
                </Button>
              </form>
            </TabsContent>
            
            <TabsContent value="register">
              <form onSubmit={handleSignUp} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="register-email">Email</Label>
                  <div className="relative">
                    <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="register-email" type="email" placeholder="naam@voorbeeld.nl" value={email} onChange={e => setEmail(e.target.value)} className="pl-10" />
                  </div>
                  {errors.email && <p className="text-sm text-destructive">{errors.email}</p>}
                </div>
                <div className="space-y-2">
                  <Label htmlFor="register-password">Wachtwoord</Label>
                  <div className="relative">
                    <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                    <Input id="register-password" type="password" placeholder="Minimaal 6 tekens" value={password} onChange={e => setPassword(e.target.value)} className="pl-10" />
                  </div>
                  {errors.password && <p className="text-sm text-destructive">{errors.password}</p>}
                </div>
                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                  Account aanmaken
                </Button>
              </form>
            </TabsContent>
          </Tabs>
        </CardContent>
      </Card>
    </div>;
}