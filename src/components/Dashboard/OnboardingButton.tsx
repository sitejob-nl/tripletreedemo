import { BookOpen } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';

interface OnboardingButtonProps {
  onClick: () => void;
}

export function OnboardingButton({ onClick }: OnboardingButtonProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          onClick={onClick}
          className="p-1.5 sm:p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-muted/50 transition-colors"
          aria-label="Start rondleiding"
        >
          <BookOpen size={16} className="sm:w-5 sm:h-5" />
        </button>
      </TooltipTrigger>
      <TooltipContent>Start rondleiding</TooltipContent>
    </Tooltip>
  );
}
