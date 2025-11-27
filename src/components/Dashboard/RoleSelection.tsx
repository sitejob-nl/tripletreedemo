import { Database, LayoutDashboard, ChevronRight } from 'lucide-react';
import { Role } from '@/types/dashboard';

interface RoleSelectionProps {
  onSelectRole: (role: Role) => void;
}

export const RoleSelection = ({ onSelectRole }: RoleSelectionProps) => {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-4xl w-full grid grid-cols-1 md:grid-cols-2 gap-8">
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
  );
};
