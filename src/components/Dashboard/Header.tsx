import { Filter, LayoutDashboard, FileSpreadsheet } from 'lucide-react';
import { Role, ViewMode, Project } from '@/types/dashboard';

interface HeaderProps {
  project: Project;
  role: Role;
  selectedWeek: string | number;
  availableWeeks: number[];
  viewMode: ViewMode;
  onWeekChange: (week: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
}

export const Header = ({
  project,
  role,
  selectedWeek,
  availableWeeks,
  viewMode,
  onWeekChange,
  onViewModeChange,
}: HeaderProps) => {
  return (
    <header className="bg-card shadow-sm border-b border-border px-8 py-5 flex flex-col md:flex-row md:justify-between md:items-center gap-4 sticky top-0 z-20">
      <div>
        <h2 className="text-2xl font-bold text-card-foreground capitalize">{project}</h2>
        <p className="text-sm text-muted-foreground">
          {selectedWeek === 'all' ? 'Totaaloverzicht' : `Weekrapportage (Week ${selectedWeek})`}
        </p>
      </div>

      <div className="flex items-center gap-4 flex-wrap">
        <div className="flex items-center bg-secondary rounded-lg px-3 py-1 border border-border">
          <Filter size={16} className="text-muted-foreground mr-2" />
          <select
            className="bg-transparent text-sm font-medium text-foreground outline-none cursor-pointer"
            value={selectedWeek}
            onChange={(e) => onWeekChange(e.target.value)}
          >
            <option value="all">Alle Weken</option>
            {availableWeeks.map((w) => (
              <option key={w} value={w}>
                Week {w}
              </option>
            ))}
          </select>
        </div>

        {role === 'admin' ? (
          <span className="bg-warning/10 text-warning px-3 py-1 rounded-full text-xs font-bold border border-warning/20">
            ADMIN MODE
          </span>
        ) : (
          <div className="flex bg-secondary p-1 rounded-lg border border-border">
            <button
              onClick={() => onViewModeChange('report')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === 'report'
                  ? 'bg-card shadow text-card-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <FileSpreadsheet size={16} /> Rapportage
              </div>
            </button>
            <button
              onClick={() => onViewModeChange('dashboard')}
              className={`px-4 py-1.5 rounded-md text-sm font-medium transition-all ${
                viewMode === 'dashboard'
                  ? 'bg-card shadow text-card-foreground'
                  : 'text-muted-foreground hover:text-foreground'
              }`}
            >
              <div className="flex items-center gap-2">
                <LayoutDashboard size={16} /> Visueel
              </div>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};
