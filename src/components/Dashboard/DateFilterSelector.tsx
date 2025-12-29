import { useState } from 'react';
import { Calendar, ChevronDown, Filter } from 'lucide-react';
import { format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear, endOfYear, subMonths, subQuarters, subYears } from 'date-fns';
import { nl } from 'date-fns/locale';
import { Button } from '@/components/ui/button';
import { Calendar as CalendarComponent } from '@/components/ui/calendar';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { cn } from '@/lib/utils';

export type DateFilterType = 'week' | 'range' | 'month' | 'quarter' | 'year';

export interface DateRange {
  start: Date | null;
  end: Date | null;
}

interface DateFilterSelectorProps {
  filterType: DateFilterType;
  onFilterTypeChange: (type: DateFilterType) => void;
  selectedWeek: string | number;
  availableWeeks: number[];
  onWeekChange: (week: string) => void;
  dateRange: DateRange;
  onDateRangeChange: (range: DateRange) => void;
}

const quickSelectOptions = [
  { label: 'Deze maand', getValue: () => ({ start: startOfMonth(new Date()), end: endOfMonth(new Date()) }) },
  { label: 'Vorige maand', getValue: () => ({ start: startOfMonth(subMonths(new Date(), 1)), end: endOfMonth(subMonths(new Date(), 1)) }) },
  { label: 'Dit kwartaal', getValue: () => ({ start: startOfQuarter(new Date()), end: endOfQuarter(new Date()) }) },
  { label: 'Vorig kwartaal', getValue: () => ({ start: startOfQuarter(subQuarters(new Date(), 1)), end: endOfQuarter(subQuarters(new Date(), 1)) }) },
  { label: 'Dit jaar', getValue: () => ({ start: startOfYear(new Date()), end: endOfYear(new Date()) }) },
  { label: 'Vorig jaar', getValue: () => ({ start: startOfYear(subYears(new Date(), 1)), end: endOfYear(subYears(new Date(), 1)) }) },
];

export const DateFilterSelector = ({
  filterType,
  onFilterTypeChange,
  selectedWeek,
  availableWeeks,
  onWeekChange,
  dateRange,
  onDateRangeChange,
}: DateFilterSelectorProps) => {
  const [isCalendarOpen, setIsCalendarOpen] = useState(false);
  const [selectingStart, setSelectingStart] = useState(true);

  const handleQuickSelect = (option: typeof quickSelectOptions[0]) => {
    const range = option.getValue();
    onDateRangeChange(range);
    onFilterTypeChange('range');
  };

  const handleCalendarSelect = (date: Date | undefined) => {
    if (!date) return;
    
    if (selectingStart) {
      onDateRangeChange({ start: date, end: null });
      setSelectingStart(false);
    } else {
      // Ensure start is before end
      if (dateRange.start && date < dateRange.start) {
        onDateRangeChange({ start: date, end: dateRange.start });
      } else {
        onDateRangeChange({ ...dateRange, end: date });
      }
      setSelectingStart(true);
      setIsCalendarOpen(false);
    }
  };

  const formatDateRange = () => {
    if (!dateRange.start) return 'Selecteer periode...';
    if (!dateRange.end) return `Vanaf ${format(dateRange.start, 'd MMM yyyy', { locale: nl })}...`;
    return `${format(dateRange.start, 'd MMM', { locale: nl })} - ${format(dateRange.end, 'd MMM yyyy', { locale: nl })}`;
  };

  return (
    <div className="flex items-center gap-2 flex-wrap">
      {/* Filter Type Selector */}
      <div className="flex items-center bg-muted/50 rounded-xl px-3 py-1.5 border border-border">
        <Filter size={14} className="text-muted-foreground mr-2" />
        <Select
          value={filterType}
          onValueChange={(value) => onFilterTypeChange(value as DateFilterType)}
        >
          <SelectTrigger className="border-0 bg-transparent h-8 w-28 p-0 focus:ring-0">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="week">Per Week</SelectItem>
            <SelectItem value="range">Datum Range</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Week Selector (when filterType is 'week') */}
      {filterType === 'week' && (
        <div className="flex items-center bg-muted/50 rounded-xl px-4 py-2 border border-border">
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
      )}

      {/* Date Range Picker (when filterType is 'range') */}
      {filterType === 'range' && (
        <div className="flex items-center gap-2">
          {/* Quick Select Dropdown */}
          <Select onValueChange={(value) => {
            const option = quickSelectOptions.find(o => o.label === value);
            if (option) handleQuickSelect(option);
          }}>
            <SelectTrigger className="bg-muted/50 rounded-xl px-4 py-2 border border-border h-auto w-auto">
              <div className="flex items-center gap-2 text-sm font-medium">
                <ChevronDown size={14} className="text-muted-foreground" />
                Snel
              </div>
            </SelectTrigger>
            <SelectContent>
              {quickSelectOptions.map((option) => (
                <SelectItem key={option.label} value={option.label}>
                  {option.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          {/* Custom Date Range Picker */}
          <Popover open={isCalendarOpen} onOpenChange={setIsCalendarOpen}>
            <PopoverTrigger asChild>
              <Button
                variant="outline"
                className={cn(
                  "justify-start text-left font-normal bg-muted/50 border-border rounded-xl px-4 py-2 h-auto",
                  !dateRange.start && "text-muted-foreground"
                )}
              >
                <Calendar className="mr-2 h-4 w-4" />
                {formatDateRange()}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <div className="p-3 border-b border-border">
                <p className="text-sm text-muted-foreground">
                  {selectingStart ? 'Selecteer startdatum' : 'Selecteer einddatum'}
                </p>
              </div>
              <CalendarComponent
                mode="single"
                selected={selectingStart ? dateRange.start || undefined : dateRange.end || undefined}
                onSelect={handleCalendarSelect}
                initialFocus
                className={cn("p-3 pointer-events-auto")}
                locale={nl}
              />
              {dateRange.start && (
                <div className="p-3 border-t border-border flex justify-between items-center">
                  <span className="text-xs text-muted-foreground">
                    {dateRange.start && format(dateRange.start, 'd MMM yyyy', { locale: nl })}
                    {dateRange.end && ` - ${format(dateRange.end, 'd MMM yyyy', { locale: nl })}`}
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      onDateRangeChange({ start: null, end: null });
                      setSelectingStart(true);
                    }}
                  >
                    Reset
                  </Button>
                </div>
              )}
            </PopoverContent>
          </Popover>
        </div>
      )}
    </div>
  );
};
