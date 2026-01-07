import { LayoutDashboard, FileSpreadsheet, ChevronRight, BarChart3 } from 'lucide-react';
import { Role, ViewMode, Project } from '@/types/dashboard';
import { DateFilterSelector, DateFilterType, DateRange } from './DateFilterSelector';
import { HelpDialog } from './HelpDialog';
import { WeekYear } from '@/hooks/useCallRecords';

interface HeaderProps {
  project: Project;
  role: Role;
  selectedWeek: string | number;
  availableWeeks: WeekYear[];
  viewMode: ViewMode;
  onWeekChange: (week: string) => void;
  onViewModeChange: (mode: ViewMode) => void;
  // New date filter props
  dateFilterType: DateFilterType;
  onDateFilterTypeChange: (type: DateFilterType) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

export const Header = ({
  project,
  role,
  selectedWeek,
  availableWeeks,
  viewMode,
  onWeekChange,
  onViewModeChange,
  dateFilterType,
  onDateFilterTypeChange,
  dateRange,
  onDateRangeChange,
}: HeaderProps) => {
  return (
    <header className="bg-card shadow-sm border-b border-border px-8 py-5 flex flex-col gap-4 sticky top-0 z-20">
      <div className="flex items-center text-sm text-muted-foreground">
        <span className="hover:text-foreground cursor-pointer transition-colors">Dashboard</span>
        <ChevronRight size={14} className="mx-2" />
        <span className="text-foreground font-medium capitalize">{project}</span>
      </div>
      
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold text-card-foreground capitalize">{project}</h2>
          <p className="text-sm text-muted-foreground mt-1">
            {dateFilterType === 'week' 
              ? (selectedWeek === 'all' ? 'Totaaloverzicht van alle weken' : `Weekrapportage (Week ${selectedWeek})`)
              : (dateRange.start && dateRange.end 
                  ? `Periode: ${dateRange.start.toLocaleDateString('nl-NL')} - ${dateRange.end.toLocaleDateString('nl-NL')}`
                  : 'Selecteer een periode'
                )
            }
          </p>
        </div>

        <div className="flex items-center gap-4 flex-wrap">
          <HelpDialog />
          
          <DateFilterSelector
            filterType={dateFilterType}
            onFilterTypeChange={onDateFilterTypeChange}
            selectedWeek={selectedWeek}
            availableWeeks={availableWeeks}
            onWeekChange={onWeekChange}
            dateRange={dateRange}
            onDateRangeChange={onDateRangeChange}
          />

          {role === 'admin' ? (
            <span className="bg-warning/10 text-warning px-4 py-2 rounded-xl text-xs font-bold border border-warning/20">
              ADMIN MODE
            </span>
          ) : (
            <div className="flex bg-muted/50 p-1.5 rounded-xl border border-border">
              <button
                onClick={() => onViewModeChange('report')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === 'report'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <FileSpreadsheet size={16} /> Rapport
                </div>
              </button>
              <button
                onClick={() => onViewModeChange('dashboard')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === 'dashboard'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <LayoutDashboard size={16} /> Visueel
                </div>
              </button>
              <button
                onClick={() => onViewModeChange('analytics')}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-all ${
                  viewMode === 'analytics'
                    ? 'bg-primary text-primary-foreground shadow-sm'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                <div className="flex items-center gap-2">
                  <BarChart3 size={16} /> Analyse
                </div>
              </button>
            </div>
          )}
        </div>
      </div>
    </header>
  );
};
