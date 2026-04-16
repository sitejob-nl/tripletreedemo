import { BarChart3, Phone, TrendingUp, Users } from 'lucide-react';
import { Card } from '@/components/ui/card';
import tripleTreeLogo from '@/assets/triple-tree-logo.png';

export const WelcomeScreen = () => {
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-[80vh]">
      <div className="max-w-2xl w-full text-center space-y-8">
        {/* Logo */}
        <div className="flex justify-center mb-4">
          <img 
            src={tripleTreeLogo} 
            alt="Triple Tree Logo" 
            className="h-20 w-auto opacity-90"
          />
        </div>
        
        {/* Welcome Text */}
        <div className="space-y-3">
          <h1 className="text-3xl font-bold text-foreground">
            Welkom bij het Dashboard
          </h1>
          <p className="text-lg text-muted-foreground">
            Selecteer een campagne in de sidebar om te beginnen met het analyseren van je beldata.
          </p>
        </div>
        
        {/* Feature Cards */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mt-12">
          <Card className="p-4 flex flex-col items-center gap-3 bg-card/50 border-border/50 hover:bg-card transition-colors">
            <div className="p-3 rounded-full bg-primary/10">
              <Phone className="h-6 w-6 text-primary" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Beldata</span>
          </Card>
          
          <Card className="p-4 flex flex-col items-center gap-3 bg-card/50 border-border/50 hover:bg-card transition-colors">
            <div className="p-3 rounded-full bg-emerald-500/10">
              <TrendingUp className="h-6 w-6 text-emerald-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Conversies</span>
          </Card>
          
          <Card className="p-4 flex flex-col items-center gap-3 bg-card/50 border-border/50 hover:bg-card transition-colors">
            <div className="p-3 rounded-full bg-blue-500/10">
              <BarChart3 className="h-6 w-6 text-blue-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Rapporten</span>
          </Card>
          
          <Card className="p-4 flex flex-col items-center gap-3 bg-card/50 border-border/50 hover:bg-card transition-colors">
            <div className="p-3 rounded-full bg-purple-500/10">
              <Users className="h-6 w-6 text-purple-500" />
            </div>
            <span className="text-sm font-medium text-muted-foreground">Resultaten</span>
          </Card>
        </div>
        
        {/* Subtle hint */}
        <p className="text-sm text-muted-foreground/60 mt-8">
          Kies een project uit het menu aan de linkerkant →
        </p>
      </div>
    </div>
  );
};
