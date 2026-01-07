import { Link } from 'react-router-dom';
import { BarChart3, Users, Shield, TrendingUp, ArrowRight, Phone } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { useAuth } from '@/hooks/useAuth';
import tripleTreeLogo from '@/assets/triple-tree-logo.png';

const features = [
  {
    icon: BarChart3,
    title: 'Real-time Analytics',
    description: 'Bekijk direct inzichten in belresultaten, conversies en ROI per project.',
  },
  {
    icon: Phone,
    title: 'Bel Tracking',
    description: 'Volg alle belactiviteiten met gedetailleerde statistieken per uur en dag.',
  },
  {
    icon: TrendingUp,
    title: 'Financiële Rapportage',
    description: 'Jaarwaarde berekeningen, kostenanalyse en investeringsoverzichten.',
  },
  {
    icon: Users,
    title: 'Multi-Project Support',
    description: 'Beheer meerdere klantprojecten vanuit één centraal dashboard.',
  },
];

const Welcome = () => {
  const { user } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      {/* Header */}
      <header className="border-b bg-card/50 backdrop-blur-sm sticky top-0 z-50">
        <div className="container mx-auto px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <img src={tripleTreeLogo} alt="Triple Tree" className="h-10 w-auto" />
            <span className="text-xl font-semibold text-foreground">Triple Tree</span>
          </div>
          <div className="flex items-center gap-4">
            {user ? (
              <Button asChild>
                <Link to="/dashboard">
                  Naar Dashboard
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            ) : (
              <Button asChild>
                <Link to="/auth">
                  Inloggen
                  <ArrowRight className="ml-2 h-4 w-4" />
                </Link>
              </Button>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="py-20 md:py-32">
        <div className="container mx-auto px-6 text-center">
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-primary/10 text-primary text-sm font-medium mb-6">
            <Shield className="h-4 w-4" />
            Bel Analytics Platform
          </div>
          <h1 className="text-4xl md:text-6xl font-bold text-foreground mb-6 leading-tight">
            Inzicht in uw{' '}
            <span className="text-primary">belcampagnes</span>
          </h1>
          <p className="text-lg md:text-xl text-muted-foreground max-w-2xl mx-auto mb-10">
            Volg prestaties, analyseer conversies en optimaliseer uw telefonische 
            fondsenwerving met real-time data en overzichtelijke rapportages.
          </p>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            {user ? (
              <Button size="lg" asChild className="text-lg px-8">
                <Link to="/dashboard">
                  Open Dashboard
                  <ArrowRight className="ml-2 h-5 w-5" />
                </Link>
              </Button>
            ) : (
              <>
                <Button size="lg" asChild className="text-lg px-8">
                  <Link to="/auth">
                    Aan de slag
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
                <Button size="lg" variant="outline" asChild className="text-lg px-8">
                  <Link to="/auth">
                    Inloggen
                  </Link>
                </Button>
              </>
            )}
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section className="py-20 bg-muted/30">
        <div className="container mx-auto px-6">
          <div className="text-center mb-12">
            <h2 className="text-3xl md:text-4xl font-bold text-foreground mb-4">
              Alles wat u nodig heeft
            </h2>
            <p className="text-muted-foreground text-lg max-w-xl mx-auto">
              Een compleet platform voor het monitoren en optimaliseren van uw belcampagnes.
            </p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {features.map((feature) => (
              <Card key={feature.title} className="border-0 shadow-md hover:shadow-lg transition-shadow">
                <CardContent className="p-6">
                  <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center mb-4">
                    <feature.icon className="h-6 w-6 text-primary" />
                  </div>
                  <h3 className="text-lg font-semibold text-foreground mb-2">
                    {feature.title}
                  </h3>
                  <p className="text-muted-foreground text-sm">
                    {feature.description}
                  </p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-20">
        <div className="container mx-auto px-6">
          <Card className="bg-gradient-to-br from-primary to-primary/80 border-0 overflow-hidden">
            <CardContent className="p-10 md:p-16 text-center">
              <h2 className="text-3xl md:text-4xl font-bold text-primary-foreground mb-4">
                Klaar om te beginnen?
              </h2>
              <p className="text-primary-foreground/80 text-lg mb-8 max-w-xl mx-auto">
                Log in om toegang te krijgen tot uw projectdashboard en real-time inzichten.
              </p>
              {user ? (
                <Button size="lg" variant="secondary" asChild className="text-lg px-8">
                  <Link to="/dashboard">
                    Naar Dashboard
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              ) : (
                <Button size="lg" variant="secondary" asChild className="text-lg px-8">
                  <Link to="/auth">
                    Inloggen
                    <ArrowRight className="ml-2 h-5 w-5" />
                  </Link>
                </Button>
              )}
            </CardContent>
          </Card>
        </div>
      </section>

      {/* Footer */}
      <footer className="border-t py-8">
        <div className="container mx-auto px-6 text-center text-muted-foreground text-sm">
          <p>© {new Date().getFullYear()} Triple Tree. Alle rechten voorbehouden.</p>
        </div>
      </footer>
    </div>
  );
};

export default Welcome;
