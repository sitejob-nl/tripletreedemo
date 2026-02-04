import { LayoutDashboard, FileSpreadsheet, BarChart3 } from 'lucide-react';
import { Role, ViewMode, Project } from '@/types/dashboard';
import { DateFilterSelector, DateFilterType, DateRange } from './DateFilterSelector';
import { HelpDialog } from './HelpDialog';
import { WeekYear } from '@/hooks/useCallRecords';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

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
    <header className="bg-card shadow-sm border-b border-border px-4 sm:px-8 py-4 sm:py-5 flex flex-col gap-3 sm:gap-4 sticky top-0 z-20">
      <div className="flex flex-col md:flex-row md:justify-between md:items-center gap-3 sm:gap-4">
        <div>
          <h2 className="text-xl sm:text-2xl font-bold text-card-foreground capitalize">{project}</h2>
          <p className="text-xs sm:text-sm text-muted-foreground mt-1">
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
            <span className="bg-warning/10 text-warning px-3 sm:px-4 py-1.5 sm:py-2 rounded-xl text-xs font-bold border border-warning/20">
              ADMIN
            </span>
          ) : (
            <TooltipProvider>
              <div className="flex bg-muted/50 p-1 sm:p-1.5 rounded-xl border border-border">
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onViewModeChange('report')}
                      className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition-all ${
                        viewMode === 'report'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <FileSpreadsheet size={16} />
                        <span className="hidden sm:inline">Rapport</span>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="sm:hidden">Rapport</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onViewModeChange('dashboard')}
                      className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition-all ${
                        viewMode === 'dashboard'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <LayoutDashboard size={16} />
                        <span className="hidden sm:inline">Visueel</span>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="sm:hidden">Visueel</TooltipContent>
                </Tooltip>
                <Tooltip>
                  <TooltipTrigger asChild>
                    <button
                      onClick={() => onViewModeChange('analytics')}
                      className={`px-2.5 sm:px-4 py-1.5 sm:py-2 rounded-lg text-sm font-medium transition-all ${
                        viewMode === 'analytics'
                          ? 'bg-primary text-primary-foreground shadow-sm'
                          : 'text-muted-foreground hover:text-foreground'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <BarChart3 size={16} />
                        <span className="hidden sm:inline">Analyse</span>
                      </div>
                    </button>
                  </TooltipTrigger>
                  <TooltipContent className="sm:hidden">Analyse</TooltipContent>
                </Tooltip>
              </div>
            </TooltipProvider>
          )}
        </div>
      </div>
    </header>
  );
};
