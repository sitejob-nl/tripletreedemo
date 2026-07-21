import { useEffect, useMemo, useState } from 'react';
import {
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleHelp,
  CloudDownload,
  EyeOff,
  ListChecks,
  Settings2,
  ShieldCheck,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ProjectDataQuality } from '@/types/database';
import { cn } from '@/lib/utils';

interface DataTrustOnboardingProps {
  projectName: string;
  isAdmin: boolean;
  quality?: ProjectDataQuality;
  qualityVisible: boolean;
  onOpenMapping?: () => void;
}

const ONBOARDING_VERSION = 'v1';

const formatDate = (value: string | null | undefined) => {
  if (!value) return 'nog niet vastgesteld';
  return new Intl.DateTimeFormat('nl-NL', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(`${value}T12:00:00`));
};

export function DataTrustOnboarding({
  projectName,
  isAdmin,
  quality,
  qualityVisible,
  onOpenMapping,
}: DataTrustOnboardingProps) {
  const storageKey = `data-trust-onboarding:${ONBOARDING_VERSION}:${isAdmin ? 'admin' : 'client'}`;
  const [step, setStep] = useState(0);
  const [isOpen, setIsOpen] = useState(() => {
    try {
      return window.localStorage.getItem(storageKey) !== 'completed';
    } catch {
      return true;
    }
  });

  useEffect(() => {
    try {
      setIsOpen(window.localStorage.getItem(storageKey) !== 'completed');
    } catch {
      setIsOpen(true);
    }
    setStep(0);
  }, [storageKey]);

  const steps = useMemo(() => [
    {
      icon: CloudDownload,
      eyebrow: 'Stap 1 · Aanvoer',
      title: 'BasiCall levert de brondata aan',
      description: 'Velden kunnen per campagne anders heten of in een andere structuur binnenkomen. Het dashboard leest die gegevens automatisch in; niemand hoeft hiervoor code te schrijven.',
      visual: (
        <div className="flex flex-wrap items-center justify-center gap-2" aria-label="Gegevensstroom">
          <Badge variant="secondary">BasiCall</Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Badge variant="secondary">Bronvelden</Badge>
          <ArrowRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
          <Badge className="bg-primary text-primary-foreground">Dashboard</Badge>
        </div>
      ),
    },
    {
      icon: ListChecks,
      eyebrow: 'Stap 2 · Volledigheid',
      title: 'Iedere dag wordt op volledigheid gecontroleerd',
      description: 'Voor alle dagen tot en met gisteren vergelijken we hoeveel records BasiCall meldt met hoeveel records werkelijk zijn opgehaald. Een succesvolle dag met nul records is gewoon compleet.',
      visual: (
        <div className="w-full max-w-xs space-y-2 rounded-xl border bg-background/80 p-3">
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Verwacht</span>
            <strong>126 records</strong>
          </div>
          <div className="flex items-center justify-between text-xs">
            <span className="text-muted-foreground">Ontvangen</span>
            <strong className="flex items-center gap-1 text-emerald-700 dark:text-emerald-300">
              <Check className="h-3.5 w-3.5" /> 126 records
            </strong>
          </div>
          <Progress value={100} className="h-1.5" aria-label="Voorbeeld van een complete synchronisatie" />
        </div>
      ),
    },
    {
      icon: Settings2,
      eyebrow: 'Stap 3 · Betekenis',
      title: isAdmin ? 'Jullie controleren en keuren de mapping goed' : 'Een beheerder keurt de mapping goed',
      description: isAdmin
        ? 'Het dashboard stelt velden, resultaatcodes en frequenties voor. Controleer deze inhoudelijk, vul ontbrekende waarden aan en zet bewust neutrale codes bij “Overig”. Pas na jullie goedkeuring wordt de mapping actief.'
        : 'Het dashboard maakt voorstellen, maar activeert die nooit zelfstandig. De verantwoordelijke beheerder controleert de velden, resultaatcodes en frequenties en vult ze waar nodig aan.',
      visual: (
        <div className="grid w-full max-w-sm grid-cols-3 gap-2 text-center text-[11px] sm:text-xs">
          {[
            ['1', 'Voorstel'],
            ['2', 'Controleren'],
            ['3', 'Goedkeuren'],
          ].map(([number, label], index) => (
            <div key={label} className="rounded-lg border bg-background/80 p-2.5">
              <span className={cn(
                'mx-auto mb-1.5 grid h-6 w-6 place-items-center rounded-full font-bold',
                index === 2 ? 'bg-emerald-500/15 text-emerald-700 dark:text-emerald-300' : 'bg-primary/10 text-primary',
              )}>
                {number}
              </span>
              <span className="font-medium">{label}</span>
            </div>
          ))}
        </div>
      ),
    },
    {
      icon: ShieldCheck,
      eyebrow: 'Stap 4 · Bescherming',
      title: 'Je ziet direct waarop je kunt vertrouwen',
      description: 'Groen betekent gecontroleerd. Oranje vraagt aandacht, maar laat betrouwbare historische gegevens staan. Rood verbergt alleen geraakte cijfers met een “—” en schakelt de Excel-export tijdelijk uit.',
      visual: (
        <div className="w-full max-w-sm space-y-2">
          <div className="grid grid-cols-3 gap-2 text-[11px] sm:text-xs">
            <div className="rounded-lg border border-emerald-500/30 bg-emerald-500/10 p-2 text-center font-medium text-emerald-800 dark:text-emerald-200">Groen<br />gecontroleerd</div>
            <div className="rounded-lg border border-amber-500/30 bg-amber-500/10 p-2 text-center font-medium text-amber-900 dark:text-amber-100">Oranje<br />aandacht</div>
            <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-2 text-center font-medium text-destructive">Rood<br />tijdelijk beschermd</div>
          </div>
          {qualityVisible && quality && (
            <div className="flex items-center justify-between gap-3 rounded-lg border bg-background/80 px-3 py-2 text-xs">
              <span className="text-muted-foreground">Status van {projectName}</span>
              <strong>t/m {formatDate(quality.verified_through)}</strong>
            </div>
          )}
        </div>
      ),
    },
  ], [isAdmin, projectName, quality, qualityVisible]);

  const activeStep = steps[step];
  const ActiveIcon = activeStep.icon;

  const finish = () => {
    try {
      window.localStorage.setItem(storageKey, 'completed');
    } catch {
      // De uitleg blijft bruikbaar wanneer browseropslag is uitgeschakeld.
    }
    setIsOpen(false);
  };

  const openMapping = () => {
    setIsOpen(false);
    onOpenMapping?.();
  };

  if (!isOpen) {
    return (
      <button
        type="button"
        onClick={() => {
          setStep(0);
          setIsOpen(true);
        }}
        className="mb-5 flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-primary/20 bg-primary/5 px-4 py-3 text-left transition-colors hover:bg-primary/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="flex min-w-0 items-center gap-3">
          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-primary/10 text-primary">
            <CircleHelp className="h-4 w-4" aria-hidden="true" />
          </span>
          <span className="min-w-0">
            <span className="block text-sm font-semibold">Hoe weet ik dat deze cijfers kloppen?</span>
            <span className="block truncate text-xs text-muted-foreground">Bekijk de uitleg over sync, mapping en controles.</span>
          </span>
        </span>
        <ChevronDown className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
      </button>
    );
  }

  return (
    <Card className="mb-6 overflow-hidden border-primary/25 bg-gradient-to-br from-card via-card to-primary/5 shadow-sm">
      <CardContent className="p-0">
        <div className="flex items-start justify-between gap-4 border-b px-4 py-4 sm:px-6">
          <div className="flex min-w-0 items-start gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-primary text-primary-foreground shadow-sm">
              <ShieldCheck className="h-5 w-5" aria-hidden="true" />
            </span>
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <h2 className="text-sm font-bold sm:text-base">Zo blijft het dashboard betrouwbaar</h2>
                <Badge variant="secondary" className="text-[10px]">Interactieve uitleg</Badge>
              </div>
              <p className="mt-1 text-xs text-muted-foreground">In vier korte stappen uitgelegd voor {projectName}.</p>
            </div>
          </div>
          <Button type="button" variant="ghost" size="sm" onClick={() => setIsOpen(false)} className="shrink-0">
            Sluiten
          </Button>
        </div>

        <div className="px-4 pt-4 sm:px-6">
          <div className="mb-2 flex items-center justify-between text-[11px] font-medium text-muted-foreground">
            <span>Stap {step + 1} van {steps.length}</span>
            <span>{Math.round(((step + 1) / steps.length) * 100)}%</span>
          </div>
          <Progress value={((step + 1) / steps.length) * 100} className="h-1.5" aria-label={`Stap ${step + 1} van ${steps.length}`} />
          <div className="mt-3 flex gap-1.5" aria-label="Uitlegstappen">
            {steps.map((item, index) => (
              <button
                key={item.title}
                type="button"
                onClick={() => setStep(index)}
                aria-label={`Ga naar stap ${index + 1}: ${item.title}`}
                aria-current={index === step ? 'step' : undefined}
                className={cn(
                  'h-2 flex-1 rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                  index === step ? 'bg-primary' : index < step ? 'bg-primary/40' : 'bg-muted',
                )}
              />
            ))}
          </div>
        </div>

        <div className="grid gap-5 px-4 py-6 sm:px-6 md:grid-cols-[minmax(0,0.8fr)_minmax(0,1.2fr)] md:items-center" aria-live="polite">
          <div className="flex min-h-44 items-center justify-center rounded-2xl border border-primary/15 bg-primary/5 p-5">
            <div className="flex w-full flex-col items-center gap-4">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-background text-primary shadow-sm ring-1 ring-border">
                <ActiveIcon className="h-6 w-6" aria-hidden="true" />
              </span>
              {activeStep.visual}
            </div>
          </div>

          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-primary">{activeStep.eyebrow}</p>
            <h3 className="mt-2 text-xl font-bold leading-tight text-foreground">{activeStep.title}</h3>
            <p className="mt-3 max-w-2xl text-sm leading-6 text-muted-foreground">{activeStep.description}</p>
            {step === 2 && isAdmin && onOpenMapping && (
              <Button type="button" variant="outline" size="sm" onClick={openMapping} className="mt-4 gap-2">
                <Settings2 className="h-4 w-4" /> Naar de Mapping Tool
              </Button>
            )}
            {step === 3 && !qualityVisible && (
              <p className="mt-4 flex items-center gap-2 rounded-lg border border-blue-500/20 bg-blue-500/5 px-3 py-2 text-xs text-muted-foreground">
                <EyeOff className="h-4 w-4 shrink-0 text-blue-600" />
                De klantstatus wordt zichtbaar nadat de nulmeting voor dit project is goedgekeurd.
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-col-reverse gap-3 border-t bg-muted/20 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <Button
            type="button"
            variant="ghost"
            onClick={() => setStep((current) => Math.max(0, current - 1))}
            disabled={step === 0}
            className="min-h-11 gap-2 sm:min-h-9"
          >
            <ArrowLeft className="h-4 w-4" /> Vorige
          </Button>
          {step < steps.length - 1 ? (
            <Button
              type="button"
              onClick={() => setStep((current) => Math.min(steps.length - 1, current + 1))}
              className="min-h-11 gap-2 sm:min-h-9"
            >
              Volgende <ArrowRight className="h-4 w-4" />
            </Button>
          ) : (
            <Button type="button" onClick={finish} className="min-h-11 gap-2 bg-emerald-600 text-white hover:bg-emerald-700 sm:min-h-9">
              <CheckCircle2 className="h-4 w-4" /> Ik begrijp het
            </Button>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
