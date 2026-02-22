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
    <header className="bg-card shadow-sm border-b border-border px-3 sm:px-8 py-3 sm:py-5 flex flex-col gap-2 sm:gap-4 sticky top-0 z-20">
      <div className="flex items-center justify-between gap-2">
        <div className="min-w-0 flex-1">
          <h2 className="text-lg sm:text-2xl font-bold text-card-foreground capitalize truncate">{project}</h2>
          <p className="text-[11px] sm:text-sm text-muted-foreground mt-0.5 truncate">
            {dateFilterType === 'week' 
              ? (selectedWeek === 'all' ? 'Alle weken' : `Week ${selectedWeek}`)
              : (dateRange.start && dateRange.end 
                  ? `${dateRange.start.toLocaleDateString('nl-NL')} - ${dateRange.end.toLocaleDateString('nl-NL')}`
                  : 'Selecteer periode'
                )
            }
          </p>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
          <HelpDialog />
          
          {role === 'admin' && (
            <span className="bg-warning/10 text-warning px-2 sm:px-4 py-1 sm:py-2 rounded-lg sm:rounded-xl text-[10px] sm:text-xs font-bold border border-warning/20">
              ADMIN
            </span>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 sm:gap-4 flex-wrap">
        <DateFilterSelector
          filterType={dateFilterType}
          onFilterTypeChange={onDateFilterTypeChange}
          selectedWeek={selectedWeek}
          availableWeeks={availableWeeks}
          onWeekChange={onWeekChange}
          dateRange={dateRange}
          onDateRangeChange={onDateRangeChange}
        />

        {role !== 'admin' && (
          <TooltipProvider>
            <div className="flex bg-muted/50 p-0.5 sm:p-1.5 rounded-lg sm:rounded-xl border border-border ml-auto">
              <Tooltip>
                <TooltipTrigger asChild>
                  <button
                    onClick={() => onViewModeChange('report')}
                    className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      viewMode === 'report'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <FileSpreadsheet size={14} className="sm:w-4 sm:h-4" />
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
                    className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      viewMode === 'dashboard'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <LayoutDashboard size={14} className="sm:w-4 sm:h-4" />
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
                    className={`px-2 sm:px-4 py-1.5 sm:py-2 rounded-md sm:rounded-lg text-xs sm:text-sm font-medium transition-all ${
                      viewMode === 'analytics'
                        ? 'bg-primary text-primary-foreground shadow-sm'
                        : 'text-muted-foreground hover:text-foreground'
                    }`}
                  >
                    <div className="flex items-center gap-1.5">
                      <BarChart3 size={14} className="sm:w-4 sm:h-4" />
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
    </header>
  );
};
