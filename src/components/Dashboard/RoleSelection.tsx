import { Database, LayoutDashboard, ChevronRight } from 'lucide-react';
import { Role } from '@/types/dashboard';
import logo from '@/assets/triple-tree-logo.png';

interface RoleSelectionProps {
  onSelectRole: (role: Role) => void;
}

export const RoleSelection = ({ onSelectRole }: RoleSelectionProps) => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-4xl w-full">
        <div className="text-center mb-12">
          <div className="flex items-center justify-center gap-3 mb-4">
            <img src={logo} alt="Triple Tree Logo" className="h-12 w-12" />
            <h1 className="text-4xl font-bold text-foreground">Triple Tree</h1>
          </div>
          <p className="text-muted-foreground text-lg">Selecteer uw rol om door te gaan</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div
          className="bg-card p-8 rounded-2xl shadow-lg border border-border hover:border-primary/50 transition-all cursor-pointer group"
          onClick={() => onSelectRole('admin')}
        >
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <Database className="text-primary" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-card-foreground mb-2">Triple Tree (Admin)</h2>
          <p className="text-muted-foreground mb-6">
            Configureer projecten, API mappings en uurtarieven.
          </p>
          <div className="flex items-center text-primary font-semibold">
            Ga naar Backend <ChevronRight size={20} />
          </div>
        </div>

        <div
          className="bg-card p-8 rounded-2xl shadow-lg border border-border hover:border-success/50 transition-all cursor-pointer group"
          onClick={() => onSelectRole('client')}
        >
          <div className="w-16 h-16 bg-success/10 rounded-full flex items-center justify-center mb-6 group-hover:scale-110 transition-transform">
            <LayoutDashboard className="text-success" size={32} />
          </div>
          <h2 className="text-2xl font-bold text-card-foreground mb-2">Klant Portaal</h2>
          <p className="text-muted-foreground mb-6">
            Bekijk de wekelijkse rapportages en ROI cijfers.
          </p>
          <div className="flex items-center text-success font-semibold">
            Bekijk Rapportages <ChevronRight size={20} />
          </div>
        </div>
      </div>
      </div>
    </div>
  );
};
