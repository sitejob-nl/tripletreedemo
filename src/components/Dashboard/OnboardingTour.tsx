import { useEffect, useState, useCallback, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, SkipForward } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { cn } from '@/lib/utils';
import { TourStep } from '@/hooks/useOnboardingTour';

interface OnboardingTourProps {
  isActive: boolean;
  currentStep: TourStep | null;
  currentStepIndex: number;
  totalSteps: number;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}

interface SpotlightRect {
  top: number;
  left: number;
  width: number;
  height: number;
}

export function OnboardingTour({
  isActive,
  currentStep,
  currentStepIndex,
  totalSteps,
  onNext,
  onPrev,
  onSkip,
}: OnboardingTourProps) {
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const [tooltipStyle, setTooltipStyle] = useState<React.CSSProperties>({});
  const [isVisible, setIsVisible] = useState(false);
  const pendingSettleRef = useRef<{ io: IntersectionObserver; fallback: number } | null>(null);

  const updatePosition = useCallback(() => {
    // Cancel any in-flight settle before starting a new one.
    if (pendingSettleRef.current) {
      pendingSettleRef.current.io.disconnect();
      clearTimeout(pendingSettleRef.current.fallback);
      pendingSettleRef.current = null;
    }

    if (!currentStep?.target) {
      setSpotlightRect(null);
      setTooltipStyle({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    const el = document.querySelector(`[data-tour="${currentStep.target}"]`);
    if (!el) {
      setSpotlightRect(null);
      setTooltipStyle({
        position: 'fixed',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
      });
      return;
    }

    // Scroll element into view
    el.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'nearest' });

    const computePositions = () => {
      const rect = el.getBoundingClientRect();
      const padding = 8;
      const spotlight = {
        top: rect.top - padding,
        left: rect.left - padding,
        width: rect.width + padding * 2,
        height: rect.height + padding * 2,
      };
      setSpotlightRect(spotlight);

      // Calculate tooltip position
      const tooltipWidth = Math.min(360, window.innerWidth - 32);
      const tooltipHeight = 200; // approximate
      const gap = 16;
      let style: React.CSSProperties = { position: 'fixed', width: tooltipWidth };

      const pos = currentStep.position;
      const isMobile = window.innerWidth < 768;

      if (pos === 'center' || isMobile) {
        // On mobile, always position below or above
        const spaceBelow = window.innerHeight - (spotlight.top + spotlight.height);
        if (spaceBelow > tooltipHeight + gap) {
          style.top = spotlight.top + spotlight.height + gap;
          style.left = Math.max(16, Math.min(spotlight.left + spotlight.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16));
        } else {
          style.top = Math.max(16, spotlight.top - tooltipHeight - gap);
          style.left = Math.max(16, Math.min(spotlight.left + spotlight.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16));
        }
      } else if (pos === 'bottom') {
        style.top = spotlight.top + spotlight.height + gap;
        style.left = Math.max(16, Math.min(spotlight.left + spotlight.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16));
      } else if (pos === 'top') {
        style.top = Math.max(16, spotlight.top - tooltipHeight - gap);
        style.left = Math.max(16, Math.min(spotlight.left + spotlight.width / 2 - tooltipWidth / 2, window.innerWidth - tooltipWidth - 16));
      } else if (pos === 'right') {
        style.top = Math.max(16, spotlight.top + spotlight.height / 2 - tooltipHeight / 2);
        style.left = Math.min(spotlight.left + spotlight.width + gap, window.innerWidth - tooltipWidth - 16);
      } else if (pos === 'left') {
        style.top = Math.max(16, spotlight.top + spotlight.height / 2 - tooltipHeight / 2);
        style.left = Math.max(16, spotlight.left - tooltipWidth - gap);
      }

      setTooltipStyle(style);
    };

    // Wait for scroll to settle using IntersectionObserver,
    // with a safety-net timeout in case IO never fires.
    let settled = false;
    const fallback = window.setTimeout(() => {
      if (!settled) {
        settled = true;
        computePositions();
        pendingSettleRef.current = null;
      }
    }, 500);

    const io = new IntersectionObserver((entries) => {
      if (settled) return;
      const entry = entries[0];
      if (entry?.isIntersecting) {
        settled = true;
        clearTimeout(fallback);
        io.disconnect();
        pendingSettleRef.current = null;
        // Double RAF so the rect read happens post-layout, after smooth-scroll
        // has finished compositing the final frame.
        requestAnimationFrame(() => {
          requestAnimationFrame(() => computePositions());
        });
      }
    }, { threshold: [0, 0.5] });
    io.observe(el);
    pendingSettleRef.current = { io, fallback };
  }, [currentStep]);

  // Cleanup pending IO/timeout on unmount
  useEffect(() => {
    return () => {
      if (pendingSettleRef.current) {
        pendingSettleRef.current.io.disconnect();
        clearTimeout(pendingSettleRef.current.fallback);
        pendingSettleRef.current = null;
      }
    };
  }, []);

  // Update position when step changes
  useEffect(() => {
    if (!isActive || !currentStep) return;
    updatePosition();
  }, [isActive, currentStep, updatePosition]);

  // Fade in
  useEffect(() => {
    if (isActive) {
      const timer = setTimeout(() => setIsVisible(true), 50);
      return () => clearTimeout(timer);
    } else {
      setIsVisible(false);
    }
  }, [isActive]);

  // Keyboard support
  useEffect(() => {
    if (!isActive) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onSkip();
      if (e.key === 'ArrowRight' || e.key === 'Enter') onNext();
      if (e.key === 'ArrowLeft') onPrev();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isActive, onNext, onPrev, onSkip]);

  // Reposition on resize/scroll
  useEffect(() => {
    if (!isActive) return;
    const handler = () => {
      // Don't thrash during a pending settle — the in-flight observer will handle the new position.
      if (pendingSettleRef.current) return;
      updatePosition();
    };
    window.addEventListener('resize', handler);
    window.addEventListener('scroll', handler, true);
    return () => {
      window.removeEventListener('resize', handler);
      window.removeEventListener('scroll', handler, true);
      if (pendingSettleRef.current) {
        pendingSettleRef.current.io.disconnect();
        clearTimeout(pendingSettleRef.current.fallback);
        pendingSettleRef.current = null;
      }
    };
  }, [isActive, updatePosition]);

  if (!isActive || !currentStep) return null;

  const isOverlayStep = !currentStep.target;
  const progress = ((currentStepIndex + 1) / totalSteps) * 100;
  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === totalSteps - 1;

  return (
    <div
      className={cn(
        'fixed inset-0 z-[9999] transition-opacity duration-300',
        isVisible ? 'opacity-100' : 'opacity-0'
      )}
    >
      {/* Overlay */}
      {isOverlayStep ? (
        <div className="absolute inset-0 bg-black/70" onClick={onSkip} />
      ) : (
        <>
          {/* SVG overlay with cutout for spotlight */}
          <svg className="absolute inset-0 w-full h-full" style={{ pointerEvents: 'none' }}>
            <defs>
              <mask id="tour-spotlight-mask">
                <rect x="0" y="0" width="100%" height="100%" fill="white" />
                {spotlightRect && (
                  <rect
                    x={spotlightRect.left}
                    y={spotlightRect.top}
                    width={spotlightRect.width}
                    height={spotlightRect.height}
                    rx="8"
                    fill="black"
                  />
                )}
              </mask>
            </defs>
            <rect
              x="0"
              y="0"
              width="100%"
              height="100%"
              fill="rgba(0,0,0,0.7)"
              mask="url(#tour-spotlight-mask)"
              style={{ pointerEvents: 'auto' }}
              onClick={onSkip}
            />
          </svg>
          {/* Spotlight border ring */}
          {spotlightRect && (
            <div
              className="absolute rounded-lg ring-2 ring-primary ring-offset-2 ring-offset-transparent pointer-events-none"
              style={{
                top: spotlightRect.top,
                left: spotlightRect.left,
                width: spotlightRect.width,
                height: spotlightRect.height,
              }}
            />
          )}
        </>
      )}

      {/* Tooltip Card */}
      <div
        className="bg-card border border-border rounded-xl shadow-2xl p-5 z-[10000] animate-in fade-in slide-in-from-bottom-2 duration-300"
        style={tooltipStyle}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          onClick={onSkip}
          className="absolute top-3 right-3 text-muted-foreground hover:text-foreground transition-colors"
          aria-label="Sluiten"
        >
          <X size={16} />
        </button>

        {/* Step indicator */}
        <div className="text-xs text-muted-foreground mb-2 font-medium">
          Stap {currentStepIndex + 1} van {totalSteps}
        </div>

        {/* Title */}
        <h3 className="text-base font-bold text-foreground mb-2">{currentStep.title}</h3>

        {/* Description */}
        <p className="text-sm text-muted-foreground leading-relaxed mb-4">
          {currentStep.description}
        </p>

        {/* Progress bar */}
        <Progress value={progress} className="h-1.5 mb-4" />

        {/* Navigation buttons */}
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="ghost"
            size="sm"
            onClick={onSkip}
            className="text-muted-foreground text-xs"
          >
            <SkipForward size={14} className="mr-1" />
            Overslaan
          </Button>

          <div className="flex gap-2">
            {!isFirstStep && (
              <Button variant="outline" size="sm" onClick={onPrev}>
                <ChevronLeft size={14} className="mr-1" />
                Vorige
              </Button>
            )}
            <Button size="sm" onClick={onNext}>
              {isLastStep ? 'Afronden' : 'Volgende'}
              {!isLastStep && <ChevronRight size={14} className="ml-1" />}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
