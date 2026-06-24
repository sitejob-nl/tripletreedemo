import { useState, useEffect, useMemo, useCallback } from 'react';
import { Settings, CheckCircle, Plus, X, Loader2, PhoneIncoming, PhoneOutgoing, Headphones, Eye, RefreshCw, AlertTriangle, ShieldOff, MessageSquareOff, PhoneOff, Ban, RotateCcw } from 'lucide-react';
import { DBProjectBase, MappingConfig, ProjectType } from '@/types/database';
import { UNREACHABLE_RESULTS, NEGATIVE_ARGUMENTATED, NEGATIVE_NOT_ARGUMENTATED, getFrequencyLabel, FrequencyType, isSale, isUnreachable, categorizeNegativeResult, categorizeInboundResult } from '@/lib/statsHelpers';
import { useResultDistribution } from '@/hooks/useResultDistribution';
import { useToast } from '@/hooks/use-toast';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useProjectFieldOptions } from '@/hooks/useProjectFieldOptions';
import { useConfigPreview } from '@/hooks/useConfigPreview';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface MappingToolProps {
  project: DBProjectBase;
  onSave: (projectId: string, hourlyRate: number, mappingConfig: MappingConfig, projectType: ProjectType, hoursFactor: number) => Promise<void>;
  isSaving?: boolean;
}

const EMPTY_VALUE = "__none__";
const AUTO_VALUE = "__auto__";

// Stabiele serialisatie (object-keys gesorteerd) voor wijzig-detectie, zodat
// her-ordening van object-keys geen valse "niet-opgeslagen" status geeft.
const stableStringify = (v: unknown): string => {
  if (Array.isArray(v)) return `[${v.map(stableStringify).join(',')}]`;
  if (v && typeof v === 'object') {
    return `{${Object.keys(v as Record<string, unknown>)
      .sort()
      .map((k) => `${JSON.stringify(k)}:${stableStringify((v as Record<string, unknown>)[k])}`)
      .join(',')}}`;
  }
  return JSON.stringify(v ?? null);
};

// Kleuren per dekkings-categorie (Tailwind bar-classes). 'todo' = nog niet ingedeeld.
const COVERAGE_COLORS: Record<string, string> = {
  positief: 'bg-emerald-500',
  behouden: 'bg-emerald-500',
  afgehandeld: 'bg-emerald-500',
  partial: 'bg-teal-500',
  onbereikbaar: 'bg-slate-400',
  neg_arg: 'bg-amber-500',
  neg_notarg: 'bg-orange-500',
  verloren: 'bg-rose-500',
  niet_afgehandeld: 'bg-rose-500',
  todo: 'bg-fuchsia-500',
};

export const MappingTool = ({ project, onSave, isSaving = false }: MappingToolProps) => {
  const { toast } = useToast();
  const [projectType, setProjectType] = useState<ProjectType>(project.project_type || 'outbound');
  const [hourlyRate, setHourlyRate] = useState(project.hourly_rate);
  const [amountCol, setAmountCol] = useState(project.mapping_config.amount_col);
  const [freqCol, setFreqCol] = useState(project.mapping_config.freq_col);
  const [reasonCol, setReasonCol] = useState(project.mapping_config.reason_col || EMPTY_VALUE);
  const [locationCol, setLocationCol] = useState(project.mapping_config.location_col || AUTO_VALUE);
  const [saleResults, setSaleResults] = useState<string[]>(project.mapping_config.sale_results || []);
  const [freqMap, setFreqMap] = useState<Record<string, number>>(project.mapping_config.freq_map || {});
  const [newFreqKey, setNewFreqKey] = useState('');
  const [newFreqValue, setNewFreqValue] = useState('');
  
  // Inbound-specific state
  const [retentionResults, setRetentionResults] = useState<string[]>(project.mapping_config.retention_results || []);
  const [lostResults, setLostResults] = useState<string[]>(project.mapping_config.lost_results || []);
  const [partialSuccessResults, setPartialSuccessResults] = useState<string[]>(project.mapping_config.partial_success_results || []);
  
  // Inbound service state
  const [handledResults, setHandledResults] = useState<string[]>(project.mapping_config.handled_results || []);
  const [notHandledResults, setNotHandledResults] = useState<string[]>(project.mapping_config.not_handled_results || []);

  // Flat-template (ANBO/TTG) state
  const [flatVoicemailResults, setFlatVoicemailResults] = useState<string[]>(project.mapping_config.flat_voicemail_results || []);
  const [flatNawtResults, setFlatNawtResults] = useState<string[]>(project.mapping_config.flat_nawt_results || []);

  // Inbound-service-template targets state
  const [serviceTargetBereikbaarheid, setServiceTargetBereikbaarheid] = useState<number>(
    project.mapping_config.service_targets?.bereikbaarheid ?? 0.95
  );
  const [serviceTargetServiceLevel, setServiceTargetServiceLevel] = useState<number>(
    project.mapping_config.service_targets?.service_level ?? 0.70
  );
  const [serviceTargetSeconds, setServiceTargetSeconds] = useState<number>(
    project.mapping_config.service_targets?.service_level_sec ?? 30
  );

  // Inbound-retention-template reason categories state
  const DEFAULT_REASON_CATEGORIES: Record<string, string[]> = {
    'Overleden': [],
    'Hoge leeftijd': [],
    'Financiele redenen': [],
    'Nieuwe machtiging / wijziging': [],
    'Klacht / niet tevreden': [],
    'Heeft al machtiging': [],
    'Eenmalig': [],
    'Storno': [],
    'Overig / onbekend': [],
    'Coronavirus': [],
    'Actualiteit': [],
  };
  const [reasonCategories, setReasonCategories] = useState<Record<string, string[]>>(
    project.mapping_config.reason_categories
      ? { ...DEFAULT_REASON_CATEGORIES, ...project.mapping_config.reason_categories }
      : DEFAULT_REASON_CATEGORIES
  );

  // Negative categorization state (outbound). Default empty: auto-suggest
  // below picks project-specific matches once availableResults loads. The
  // hardcoded constants stay as runtime fallback in isUnreachable() /
  // categorizeNegativeResult() for projects without explicit config.
  const [unreachableResults, setUnreachableResults] = useState<string[]>(project.mapping_config.unreachable_results ?? []);
  const [negativeArgumentated, setNegativeArgumentated] = useState<string[]>(project.mapping_config.negative_argumentated ?? []);
  const [negativeNotArgumentated, setNegativeNotArgumentated] = useState<string[]>(project.mapping_config.negative_not_argumentated ?? []);

  // Per-result exclusions from ratio denominators
  const [excludeFromNet, setExcludeFromNet] = useState<string[]>(project.mapping_config.exclude_from_net || []);
  const [excludeFromRetention, setExcludeFromRetention] = useState<string[]>(project.mapping_config.exclude_from_retention || []);
  
  // Weekday rates state
  const [weekdayRates, setWeekdayRates] = useState<Record<string, number | undefined>>(
    project.mapping_config.weekday_rates || {}
  );
  
  // Hours factor state
  const [hoursFactor, setHoursFactor] = useState<number>(project.hours_factor ?? 1.0);

  // Baseline snapshot for unsaved-changes detection (captured once per project load).
  const [baselineKey, setBaselineKey] = useState<string | null>(null);

  const { availableFields, availableResults, availableFrequencyValues, isLoading } = useProjectFieldOptions(project.id, freqCol);

  // Projects that never saved unreachable/negative configs use the runtime
  // fallback in isUnreachable() / categorizeNegativeResult(). For the admin UI
  // we surface project-specific suggestions: substring-match the generic
  // patterns against the actual resultaat values for this project. Only fires
  // when the field is undefined (never saved) — saved [] stays empty.
  const unreachableNeverSaved = project.mapping_config.unreachable_results === undefined;
  const negArgNeverSaved = project.mapping_config.negative_argumentated === undefined;
  const negNotArgNeverSaved = project.mapping_config.negative_not_argumentated === undefined;

  useEffect(() => {
    if (availableResults.length === 0) return;

    const suggest = (patterns: string[]): string[] =>
      availableResults.filter((r) =>
        patterns.some((p) => r.toLowerCase().includes(p.toLowerCase())),
      );

    if (unreachableNeverSaved && unreachableResults.length === 0) {
      const s = suggest(UNREACHABLE_RESULTS);
      if (s.length) setUnreachableResults(s);
    }
    if (negArgNeverSaved && negativeArgumentated.length === 0) {
      const s = suggest(NEGATIVE_ARGUMENTATED);
      if (s.length) setNegativeArgumentated(s);
    }
    if (negNotArgNeverSaved && negativeNotArgumentated.length === 0) {
      const s = suggest(NEGATIVE_NOT_ARGUMENTATED);
      if (s.length) setNegativeNotArgumentated(s);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- intentionally only re-runs when availableResults changes for this project
  }, [availableResults, project.id]);

  // Field-existence checks: does the chosen column actually occur in raw_data of this project?
  // Only meaningful once availableFields has loaded (non-empty); during load we suppress.
  const hasData = availableFields.length > 0;
  const amountColMissing = hasData && !!amountCol && !availableFields.includes(amountCol);
  const freqColMissing = hasData && !!freqCol && !availableFields.includes(freqCol);
  const freqMapMissingCount = availableFrequencyValues.filter(
    (v) => !Object.keys(freqMap).some((k) => v.includes(k.toLowerCase()) || k.toLowerCase().includes(v))
  ).length;

  // Build clean weekday_rates (filter out undefined)
  const cleanWeekdayRates = () => {
    const clean: Record<string, number> = {};
    Object.entries(weekdayRates).forEach(([k, v]) => {
      if (v !== undefined && v > 0) clean[k] = v;
    });
    return Object.keys(clean).length > 0 ? clean : undefined;
  };

  // Build current mapping config for preview
  const currentMappingConfig: MappingConfig = {
    amount_col: amountCol,
    freq_col: freqCol,
    reason_col: reasonCol === EMPTY_VALUE ? '' : reasonCol,
    location_col: locationCol === AUTO_VALUE ? '' : locationCol,
    freq_map: freqMap,
    sale_results: saleResults,
    retention_results: retentionResults,
    lost_results: lostResults,
    partial_success_results: partialSuccessResults,
    unreachable_results: unreachableResults,
    negative_argumentated: negativeArgumentated,
    negative_not_argumentated: negativeNotArgumentated,
    exclude_from_net: excludeFromNet,
    exclude_from_retention: excludeFromRetention,
    weekday_rates: cleanWeekdayRates(),
    handled_results: handledResults,
    not_handled_results: notHandledResults,
    flat_voicemail_results: flatVoicemailResults,
    flat_nawt_results: flatNawtResults,
    service_targets: {
      bereikbaarheid: serviceTargetBereikbaarheid,
      service_level: serviceTargetServiceLevel,
      service_level_sec: serviceTargetSeconds,
    },
    reason_categories: reasonCategories,
  };

  const { data: previewRecords, isLoading: previewLoading, refetch: refetchPreview } = useConfigPreview({
    projectId: project.id,
    mappingConfig: currentMappingConfig,
    sampleSize: 5,
  });

  const loadFromProject = useCallback(() => {
    setProjectType(project.project_type || 'outbound');
    setHourlyRate(project.hourly_rate);
    setAmountCol(project.mapping_config.amount_col);
    setFreqCol(project.mapping_config.freq_col);
    setReasonCol(project.mapping_config.reason_col || EMPTY_VALUE);
    setLocationCol(project.mapping_config.location_col || AUTO_VALUE);
    setSaleResults(project.mapping_config.sale_results || []);
    setFreqMap(project.mapping_config.freq_map || {});
    setRetentionResults(project.mapping_config.retention_results || []);
    setLostResults(project.mapping_config.lost_results || []);
    setPartialSuccessResults(project.mapping_config.partial_success_results || []);
    setHandledResults(project.mapping_config.handled_results || []);
    setNotHandledResults(project.mapping_config.not_handled_results || []);
    setFlatVoicemailResults(project.mapping_config.flat_voicemail_results || []);
    setFlatNawtResults(project.mapping_config.flat_nawt_results || []);
    setServiceTargetBereikbaarheid(project.mapping_config.service_targets?.bereikbaarheid ?? 0.95);
    setServiceTargetServiceLevel(project.mapping_config.service_targets?.service_level ?? 0.70);
    setServiceTargetSeconds(project.mapping_config.service_targets?.service_level_sec ?? 30);
    setReasonCategories(
      project.mapping_config.reason_categories
        ? { ...DEFAULT_REASON_CATEGORIES, ...project.mapping_config.reason_categories }
        : DEFAULT_REASON_CATEGORIES
    );
    setUnreachableResults(project.mapping_config.unreachable_results ?? []);
    setNegativeArgumentated(project.mapping_config.negative_argumentated ?? []);
    setNegativeNotArgumentated(project.mapping_config.negative_not_argumentated ?? []);
    setExcludeFromNet(project.mapping_config.exclude_from_net || []);
    setExcludeFromRetention(project.mapping_config.exclude_from_retention || []);
    setWeekdayRates(project.mapping_config.weekday_rates || {});
    setHoursFactor(project.hours_factor ?? 1.0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [project.id]);

  useEffect(() => {
    loadFromProject();
    setBaselineKey(null); // recapture clean baseline for the new project
  }, [project.id, loadFromProject]);

  const handleSave = async () => {
    const mappingConfig: MappingConfig = {
      amount_col: amountCol,
      freq_col: freqCol,
      reason_col: reasonCol === EMPTY_VALUE ? '' : reasonCol,
      location_col: locationCol === AUTO_VALUE ? '' : locationCol,
      freq_map: freqMap,
      sale_results: saleResults,
      retention_results: retentionResults,
      lost_results: lostResults,
      partial_success_results: partialSuccessResults,
      unreachable_results: unreachableResults,
      negative_argumentated: negativeArgumentated,
      negative_not_argumentated: negativeNotArgumentated,
      exclude_from_net: excludeFromNet,
      exclude_from_retention: excludeFromRetention,
      weekday_rates: cleanWeekdayRates(),
      handled_results: handledResults,
      not_handled_results: notHandledResults,
      flat_voicemail_results: flatVoicemailResults,
      flat_nawt_results: flatNawtResults,
      service_targets: {
        bereikbaarheid: serviceTargetBereikbaarheid,
        service_level: serviceTargetServiceLevel,
        service_level_sec: serviceTargetSeconds,
      },
      reason_categories: reasonCategories,
    };
    await onSave(project.id, hourlyRate, mappingConfig, projectType, hoursFactor);
  };

  const addFreqMapping = () => {
    if (newFreqKey.trim() && newFreqValue) {
      const multiplier = parseInt(newFreqValue, 10);
      if (!isNaN(multiplier) && multiplier > 0) {
        setFreqMap({ ...freqMap, [newFreqKey.toLowerCase().trim()]: multiplier });
        setNewFreqKey('');
        setNewFreqValue('');
      }
    }
  };

  const removeFreqMapping = (key: string) => {
    const updated = { ...freqMap };
    delete updated[key];
    setFreqMap(updated);
  };

  // Categorieën die elkaar uitsluiten (outcome-categorisatie): als een code
  // in een van deze lijsten staat, verdwijnt-ie uit de shared "Resultaat
  // toevoegen"-dropdown. Reason-categorieën zijn hier NIET bij: die leven op
  // een andere dimensie (waarom een donateur verloren is, niet of het positief/
  // negatief telt). Dezelfde code kan dus tegelijk in lost_results én in
  // reason_categories.Overleden voorkomen.
  const allSelected = [...saleResults, ...retentionResults, ...lostResults, ...partialSuccessResults, ...handledResults, ...notHandledResults, ...flatVoicemailResults, ...flatNawtResults];
  const availableResultsFiltered = availableResults.filter((r) => !allSelected.includes(r));
  // Dropdown-filter specifiek voor reason-categorieën: elke code mag in
  // precies één reason-categorie zitten, maar onafhankelijk van de outcome-
  // lijsten hierboven.
  const allReasonResults = Object.values(reasonCategories).flat();
  const availableForReason = availableResults.filter((r) => !allReasonResults.includes(r));

  // Look up which named category a result-code already lives in (case-insensitive)
  const findExistingCategory = (candidate: string): string | null => {
    const lc = candidate.toLowerCase();
    const check = (name: string, list: string[]) =>
      list.some((r) => r.toLowerCase() === lc) ? name : null;
    return (
      check('Positieve Resultaten', saleResults) ||
      check('Niet Bereikbaar', unreachableResults) ||
      check('Negatief Beargumenteerd', negativeArgumentated) ||
      check('Negatief Niet Beargumenteerd', negativeNotArgumentated) ||
      check('Behouden', retentionResults) ||
      check('Verloren', lostResults) ||
      check('Gedeeltelijk Succes', partialSuccessResults) ||
      check('Afgehandeld', handledResults) ||
      check('Niet Afgehandeld', notHandledResults) ||
      check('Max voicemail', flatVoicemailResults) ||
      check('NAWT fout', flatNawtResults)
      // reason_categories bewust niet meegenomen: reden is een orthogonale
      // dimensie (waarom verloren, niet of verloren).
    );
  };

  // Shared handler for manual text-input Enter: trims, deduplicates case-insensitively against all categories,
  // toasts when duplicate, otherwise appends to the given setter.
  const addManualResult = (
    raw: string,
    current: string[],
    setter: (next: string[]) => void,
    categoryLabel: string,
    clearInput: () => void,
  ) => {
    const trimmed = raw.trim();
    if (!trimmed) return;
    const existing = findExistingCategory(trimmed);
    if (existing) {
      toast({
        title: 'Resultaat bestaat al',
        description: existing === categoryLabel
          ? `"${trimmed}" staat al in deze categorie.`
          : `"${trimmed}" staat al in categorie "${existing}". Verplaats het eerst.`,
        variant: 'destructive',
      });
      return;
    }
    setter([...current, trimmed]);
    clearInput();
  };

  interface ExcludeConfig {
    excluded: string[];
    toggle: (r: string) => void;
    label: string; // tooltip text
  }

  const renderResultBadges = (
    results: string[],
    onRemove: (r: string) => void,
    excludeConfig?: ExcludeConfig,
  ) => (
    <div className="flex flex-wrap gap-2">
      {results.map((result) => {
        const isExcluded = excludeConfig?.excluded.some((r) => r.toLowerCase() === result.toLowerCase()) ?? false;
        return (
          <Badge
            key={result}
            variant="secondary"
            className={`flex items-center gap-1 px-3 py-1 ${isExcluded ? 'line-through decoration-destructive decoration-2 border border-destructive/60' : ''}`}
          >
            {excludeConfig && (
              <button
                type="button"
                onClick={() => excludeConfig.toggle(result)}
                title={isExcluded ? `Telt NIET mee in ${excludeConfig.label}. Klik om weer mee te tellen.` : `Uitsluiten van ${excludeConfig.label}`}
                className={`mr-1 transition-colors ${isExcluded ? 'text-destructive' : 'text-muted-foreground hover:text-destructive'}`}
              >
                <Ban size={12} />
              </button>
            )}
            {result}
            <button onClick={() => onRemove(result)} className="ml-1 hover:text-destructive transition-colors">
              <X size={14} />
            </button>
          </Badge>
        );
      })}
    </div>
  );

  const toggleExcludeFromNet = (r: string) => {
    const lc = r.toLowerCase();
    setExcludeFromNet((prev) =>
      prev.some((x) => x.toLowerCase() === lc) ? prev.filter((x) => x.toLowerCase() !== lc) : [...prev, r],
    );
  };
  const toggleExcludeFromRetention = (r: string) => {
    const lc = r.toLowerCase();
    setExcludeFromRetention((prev) =>
      prev.some((x) => x.toLowerCase() === lc) ? prev.filter((x) => x.toLowerCase() !== lc) : [...prev, r],
    );
  };

  const renderAutoSuggestHint = (neverSaved: boolean, currentLength: number) =>
    neverSaved && currentLength > 0 ? (
      <div className="text-xs bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-900 text-amber-800 dark:text-amber-200 rounded-md px-3 py-2 flex items-start gap-2">
        <AlertTriangle size={14} className="flex-shrink-0 mt-0.5" />
        <span>
          Automatisch voorgesteld op basis van resultaten in dit project. Pas aan en klik op <strong>Opslaan</strong> om je keuze vast te leggen.
        </span>
      </div>
    ) : null;

  const renderResultSelect = (onAdd: (r: string) => void, source: string[] = availableResultsFiltered) => (
    source.length > 0 && (
      <Select onValueChange={onAdd} value="">
        <SelectTrigger className="w-full md:w-80">
          <SelectValue placeholder="Resultaat toevoegen..." />
        </SelectTrigger>
        <SelectContent>
          {source.map((result) => (
            <SelectItem key={result} value={result}>{result}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  );

  // ---- Live data + afgeleide waarden voor het rechter paneel ----
  const { data: resultDist = [], isLoading: distLoading } = useResultDistribution(project.id);

  // Wijzig-detectie: vergelijk de huidige config met de baseline van deze projectload.
  const liveKey = stableStringify({ cfg: currentMappingConfig, hourlyRate, projectType, hoursFactor });
  useEffect(() => {
    if (baselineKey === null) setBaselineKey(liveKey);
  }, [baselineKey, liveKey]);
  const isDirty = baselineKey !== null && liveKey !== baselineKey;

  const handleReset = () => {
    loadFromProject();
    setBaselineKey(null);
  };

  // Categorie-dekking: classificeer elke resultaat-code (gewogen naar volume) precies
  // zoals het dashboard dat doet, met de HUIDIGE config. De 'todo'-bucket = codes die
  // nog in geen enkele categorie vallen — dé onboarding-signaalwaarde.
  const coverage = useMemo(() => {
    const classify = (r: string): string => {
      if (projectType === 'outbound') {
        if (isSale(r, currentMappingConfig)) return 'positief';
        if (isUnreachable(r, currentMappingConfig)) return 'onbereikbaar';
        const cat = categorizeNegativeResult(r, currentMappingConfig);
        return cat === 'argumentated' ? 'neg_arg' : cat === 'not_argumentated' ? 'neg_notarg' : 'todo';
      }
      if (projectType === 'inbound') {
        const c = categorizeInboundResult(r, currentMappingConfig);
        return c === 'retained' ? 'behouden'
          : c === 'lost' ? 'verloren'
          : c === 'partial' ? 'partial'
          : c === 'unreachable' ? 'onbereikbaar'
          : 'todo';
      }
      const lc = r.toLowerCase();
      if ((currentMappingConfig.handled_results ?? []).some((x) => x.toLowerCase() === lc)) return 'afgehandeld';
      if ((currentMappingConfig.not_handled_results ?? []).some((x) => x.toLowerCase() === lc)) return 'niet_afgehandeld';
      return 'todo';
    };

    const labels: Record<ProjectType, { key: string; label: string }[]> = {
      outbound: [
        { key: 'positief', label: 'Positief' },
        { key: 'onbereikbaar', label: 'Niet bereikbaar' },
        { key: 'neg_arg', label: 'Negatief beargumenteerd' },
        { key: 'neg_notarg', label: 'Negatief niet bearg.' },
        { key: 'todo', label: 'Nog niet ingedeeld' },
      ],
      inbound: [
        { key: 'behouden', label: 'Behouden' },
        { key: 'partial', label: 'Gedeeltelijk succes' },
        { key: 'verloren', label: 'Verloren' },
        { key: 'onbereikbaar', label: 'Niet bereikbaar' },
        { key: 'todo', label: 'Nog niet ingedeeld' },
      ],
      inbound_service: [
        { key: 'afgehandeld', label: 'Afgehandeld' },
        { key: 'niet_afgehandeld', label: 'Niet afgehandeld' },
        { key: 'todo', label: 'Nog niet ingedeeld' },
      ],
    };

    const counts: Record<string, number> = {};
    const codes: Record<string, string[]> = {};
    let total = 0;
    for (const { resultaat, cnt } of resultDist) {
      const k = classify(resultaat);
      counts[k] = (counts[k] || 0) + cnt;
      (codes[k] ||= []).push(resultaat);
      total += cnt;
    }
    const rows = labels[projectType].map(({ key, label }) => ({
      key,
      label,
      count: counts[key] || 0,
      pct: total > 0 ? ((counts[key] || 0) / total) * 100 : 0,
    }));
    return { total, rows, todoCount: counts['todo'] || 0, todoCodes: codes['todo'] || [] };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [resultDist, projectType, saleResults, unreachableResults, negativeArgumentated, negativeNotArgumentated, retentionResults, lostResults, partialSuccessResults, handledResults, notHandledResults]);

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-card-foreground flex items-center gap-2">
            <Settings size={20} className="text-muted-foreground" />
            Configuratie: {project.name}
          </h2>
          <p className="text-muted-foreground text-sm">Beheer veldmappings, tarieven en resultaat categorieën.</p>
        </div>
        {isLoading && <Loader2 size={14} className="animate-spin text-muted-foreground" />}
      </div>

      {/* Project Type Selector */}
      <div className="mb-6 p-4 bg-muted/30 rounded-lg border border-border">
        <Label className="text-sm font-semibold mb-3 block">Project Type</Label>
        <Tabs value={projectType} onValueChange={(v) => setProjectType(v as ProjectType)} className="w-full">
          <TabsList className="grid w-full max-w-lg grid-cols-3">
            <TabsTrigger value="outbound" className="flex items-center gap-1 text-xs sm:text-sm">
              <PhoneOutgoing size={14} /> Outbound
            </TabsTrigger>
            <TabsTrigger value="inbound" className="flex items-center gap-1 text-xs sm:text-sm">
              <PhoneIncoming size={14} /> Inbound (Retentie)
            </TabsTrigger>
            <TabsTrigger value="inbound_service" className="flex items-center gap-1 text-xs sm:text-sm">
              <Headphones size={14} /> Klantenservice
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground mt-2">
          {projectType === 'outbound' 
            ? 'Werving van nieuwe donateurs - meet conversie en nieuwe jaarwaarde.'
            : projectType === 'inbound'
            ? 'Behoud van bestaande donateurs - meet retentie ratio en behouden waarde.'
            : 'Klantenservice - meet afgehandeld/niet-afgehandeld ratio zonder financiële waarde.'}
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_22rem] gap-6 items-start">
        {/* LINKER KOLOM: configuratie */}
        <div className="min-w-0">
      <Accordion type="multiple" defaultValue={["results"]} className="space-y-4">
        {/* Results Configuration - Different per project type */}
        {projectType === 'inbound_service' ? (
          <>
            <AccordionItem value="results" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">✅ Afgehandeld ({handledResults.length})</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">Resultaten die als succesvol afgehandeld worden geteld.</p>
                {renderResultBadges(handledResults, (r) => setHandledResults(handledResults.filter(x => x !== r)))}
                {renderResultSelect((r) => setHandledResults([...handledResults, r]))}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="not_handled" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">❌ Niet Afgehandeld ({notHandledResults.length})</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">Resultaten die als niet-afgehandeld worden geteld (terugbellen, doorverbinden, etc.).</p>
                {renderResultBadges(notHandledResults, (r) => setNotHandledResults(notHandledResults.filter(x => x !== r)))}
                {renderResultSelect((r) => setNotHandledResults([...notHandledResults, r]))}
              </AccordionContent>
            </AccordionItem>
          </>
        ) : projectType === 'outbound' ? (
          <>
            <AccordionItem value="results" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">✅ Positieve Resultaten ({saleResults.length})</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">Resultaten die als verkoop/donatie worden geteld.</p>
                {renderResultBadges(saleResults, (r) => setSaleResults(saleResults.filter(x => x !== r)))}
                {renderResultSelect((r) => setSaleResults([...saleResults, r]))}
              </AccordionContent>
            </AccordionItem>

            <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-3 text-xs text-muted-foreground">
              <Ban size={14} className="mt-0.5 shrink-0 text-destructive" />
              <span>
                <strong>Tip:</strong> klik op het <Ban size={11} className="inline mx-0.5" />-icoon naast een result-code in de secties
                {' '}<em>Beargumenteerd</em> of <em>Niet Beargumenteerd</em> om die uit de netto-conversie te halen
                (bv. "overleden" of "te oud" telt dan niet mee in de noemer).
              </span>
            </div>

            <AccordionItem value="unreachable" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">
                <span className="flex items-center gap-2"><PhoneOff size={16} /> Niet Bereikbaar ({unreachableResults.length})</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">Contacten die nooit bereikt zijn (geen gehoor, voicemail, foutief nummer). Deze worden automatisch uit de netto-conversie-noemer gehaald.</p>
                {renderAutoSuggestHint(unreachableNeverSaved, unreachableResults.length)}
                {renderResultBadges(unreachableResults, (r) => setUnreachableResults(unreachableResults.filter(x => x !== r)))}
                {renderResultSelect((r) => setUnreachableResults([...unreachableResults, r]))}
                <Input
                  placeholder="Handmatig resultaat toevoegen..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const el = e.currentTarget;
                      addManualResult(el.value, unreachableResults, setUnreachableResults, 'Niet Bereikbaar', () => { el.value = ''; });
                    }
                  }}
                  className="w-full md:w-80"
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="neg_argumentated" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">
                <span className="flex items-center gap-2"><MessageSquareOff size={16} /> Negatief Beargumenteerd ({negativeArgumentated.length})</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">💬 Bewuste weigering door de prospect zelf (bv. "geen geld", "geen interesse", "te oud"). Klik op <Ban size={10} className="inline" /> per code om uit netto-conversie te halen.</p>
                {renderAutoSuggestHint(negArgNeverSaved, negativeArgumentated.length)}
                {renderResultBadges(
                  negativeArgumentated,
                  (r) => setNegativeArgumentated(negativeArgumentated.filter((x) => x !== r)),
                  { excluded: excludeFromNet, toggle: toggleExcludeFromNet, label: 'netto-conversie' },
                )}
                {renderResultSelect((r) => setNegativeArgumentated([...negativeArgumentated, r]))}
                <Input
                  placeholder="Handmatig resultaat toevoegen..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const el = e.currentTarget;
                      addManualResult(el.value, negativeArgumentated, setNegativeArgumentated, 'Negatief Beargumenteerd', () => { el.value = ''; });
                    }
                  }}
                  className="w-full md:w-80"
                />
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="neg_not_argumentated" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">
                <span className="flex items-center gap-2"><ShieldOff size={16} /> Negatief Niet Beargumenteerd ({negativeNotArgumentated.length})</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">🛡️ Externe factor waar de agent niets aan kon doen (bv. "overleden", "onjuiste NAW", "fax", "verhuisd"). Klik op <Ban size={10} className="inline" /> per code om uit netto-conversie te halen.</p>
                {renderAutoSuggestHint(negNotArgNeverSaved, negativeNotArgumentated.length)}
                {renderResultBadges(
                  negativeNotArgumentated,
                  (r) => setNegativeNotArgumentated(negativeNotArgumentated.filter((x) => x !== r)),
                  { excluded: excludeFromNet, toggle: toggleExcludeFromNet, label: 'netto-conversie' },
                )}
                {renderResultSelect((r) => setNegativeNotArgumentated([...negativeNotArgumentated, r]))}
                <Input
                  placeholder="Handmatig resultaat toevoegen..."
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const el = e.currentTarget;
                      addManualResult(el.value, negativeNotArgumentated, setNegativeNotArgumentated, 'Negatief Niet Beargumenteerd', () => { el.value = ''; });
                    }
                  }}
                  className="w-full md:w-80"
                />
              </AccordionContent>
            </AccordionItem>
          </>
        ) : (
          <>
            <AccordionItem value="results" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">✅ Behouden Resultaten ({retentionResults.length})</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">Resultaten waarbij de donateur volledig behouden blijft.</p>
                {renderResultBadges(retentionResults, (r) => setRetentionResults(retentionResults.filter(x => x !== r)))}
                {renderResultSelect((r) => setRetentionResults([...retentionResults, r]))}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="lost" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">❌ Verloren Resultaten ({lostResults.length})</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">
                  Donateur definitief verloren. Klik op <Ban size={10} className="inline" /> per code om die uit de retentie-ratio-noemer te halen (bv. "overleden" telt niet als gemiste retentie).
                </p>
                {renderResultBadges(
                  lostResults,
                  (r) => setLostResults(lostResults.filter((x) => x !== r)),
                  { excluded: excludeFromRetention, toggle: toggleExcludeFromRetention, label: 'retentie-ratio' },
                )}
                {renderResultSelect((r) => setLostResults([...lostResults, r]))}
              </AccordionContent>
            </AccordionItem>
            <AccordionItem value="partial" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">🔄 Gedeeltelijk Succes ({partialSuccessResults.length})</AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">Resultaten zoals omzetten naar eenmalig.</p>
                {renderResultBadges(partialSuccessResults, (r) => setPartialSuccessResults(partialSuccessResults.filter(x => x !== r)))}
                {renderResultSelect((r) => setPartialSuccessResults([...partialSuccessResults, r]))}
              </AccordionContent>
            </AccordionItem>
          </>
        )}

        {/* Inbound-retention-template: reden-breakdown voor opzeggers.
            Alleen zichtbaar als het project-template 'inbound_retention' is.
            Admin mapt BasiCall result-codes naar de 11 historische reden-
            categorieën (Overleden, Hoge leeftijd, Financiële redenen, etc.). */}
        {project.report_template === 'inbound_retention' && (
          <AccordionItem value="reason_categories" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-semibold">
              📋 Reden-breakdown ({Object.values(reasonCategories).reduce((n, arr) => n + arr.length, 0)} codes in {Object.keys(reasonCategories).length} categorieën)
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">
                Map BasiCall result-codes naar reden-categorieën voor opzeggers. Verschijnt als
                aparte sectie in de retentie-rapportage, matcht historische Hersenstichting-rapport.
              </p>
              {Object.keys(reasonCategories).map((catName) => (
                <div key={catName} className="rounded-md border border-border/60 p-3 space-y-2">
                  <Label className="text-xs font-semibold text-foreground">{catName}</Label>
                  {renderResultBadges(reasonCategories[catName], (r) => {
                    setReasonCategories({
                      ...reasonCategories,
                      [catName]: reasonCategories[catName].filter((x) => x !== r),
                    });
                  })}
                  {renderResultSelect((r) => {
                    setReasonCategories({
                      ...reasonCategories,
                      [catName]: [...reasonCategories[catName], r],
                    });
                  }, availableForReason)}
                </div>
              ))}
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Inbound-service-template: targets voor Bereikbaarheid en Service level.
            Alleen zichtbaar als het project-template 'inbound_service' is. De
            template toont deze als extra kolom naast de gemeten waardes en
            markeert of het target gehaald is. */}
        {project.report_template === 'inbound_service' && (
          <AccordionItem value="service_targets" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-semibold">
              🎯 Service-targets (Bereikbaarheid, Service level)
            </AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">
                Doel-percentages die naast de gemeten waarde verschijnen. Historische Sligro-rapportages
                gebruikten 95% bereikbaarheid en 70% service level (binnen 30 seconden).
              </p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div>
                  <Label className="text-xs text-muted-foreground">Bereikbaarheid-target (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={Math.round(serviceTargetBereikbaarheid * 1000) / 10}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value);
                      if (!isNaN(pct)) setServiceTargetBereikbaarheid(pct / 100);
                    }}
                    className="mt-1"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Afgehandeld / (afgehandeld + niet afgehandeld)
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Service-level-target (%)</Label>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    value={Math.round(serviceTargetServiceLevel * 1000) / 10}
                    onChange={(e) => {
                      const pct = parseFloat(e.target.value);
                      if (!isNaN(pct)) setServiceTargetServiceLevel(pct / 100);
                    }}
                    className="mt-1"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Gesprekken korter dan N seconden / totaal
                  </p>
                </div>
                <div>
                  <Label className="text-xs text-muted-foreground">Drempel (seconden)</Label>
                  <Input
                    type="number"
                    min={1}
                    max={600}
                    step={1}
                    value={serviceTargetSeconds}
                    onChange={(e) => {
                      const s = parseInt(e.target.value, 10);
                      if (!isNaN(s) && s > 0) setServiceTargetSeconds(s);
                    }}
                    className="mt-1"
                  />
                  <p className="mt-1 text-[11px] text-muted-foreground">
                    Standaard 30s (historisch).
                  </p>
                </div>
              </div>
            </AccordionContent>
          </AccordionItem>
        )}

        {/* Flat-template (ANBO / TTG) specific: voicemail / NAWT categories.
            Alleen zichtbaar als het project-template 'flat' is. Deze codes
            worden apart getoond in de flat-rapportage en tellen NIET mee in
            Totaal afgehandeld (denominator voor percentages). */}
        {project.report_template === 'flat' && (
          <>
            <AccordionItem value="flat_voicemail" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">
                📞 Max voicemail ({flatVoicemailResults.length})
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">
                  Resultaat-codes die als "Max voicemail" worden getoond — records die de max aantal
                  voicemail-pogingen bereikten. Apart gerapporteerd, niet in Totaal afgehandeld.
                </p>
                {renderResultBadges(flatVoicemailResults, (r) => setFlatVoicemailResults(flatVoicemailResults.filter(x => x !== r)))}
                {renderResultSelect((r) => setFlatVoicemailResults([...flatVoicemailResults, r]))}
              </AccordionContent>
            </AccordionItem>

            <AccordionItem value="flat_nawt" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">
                ⚠️ NAWT fout ({flatNawtResults.length})
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">
                  Resultaat-codes voor NAW-fouten (naam/adres/woonplaats/telefoon onjuist of onbekend).
                  Apart gerapporteerd, niet in Totaal afgehandeld.
                </p>
                {renderResultBadges(flatNawtResults, (r) => setFlatNawtResults(flatNawtResults.filter(x => x !== r)))}
                {renderResultSelect((r) => setFlatNawtResults([...flatNawtResults, r]))}
              </AccordionContent>
            </AccordionItem>
          </>
        )}

        {/* Column Mappings */}
        <AccordionItem value="columns" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">📋 Kolom Mappings</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Bedrag Kolom</Label>
                <Select value={amountCol} onValueChange={setAmountCol}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                  <SelectContent>
                    {availableFields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
                {amountColMissing ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle size={12} /> Veld "{amountCol}" komt niet voor in de records van dit project. Jaarwaarde blijft €0.
                  </p>
                ) : hasData && amountCol ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle size={12} /> Veld gevonden in raw_data.
                  </p>
                ) : null}
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Frequentie Kolom</Label>
                <Select value={freqCol} onValueChange={setFreqCol}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                  <SelectContent>
                    {availableFields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
                {freqColMissing ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-destructive">
                    <AlertTriangle size={12} /> Veld "{freqCol}" komt niet voor in de records van dit project.
                  </p>
                ) : hasData && freqCol && freqMapMissingCount > 0 ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                    <AlertTriangle size={12} /> {freqMapMissingCount} van {availableFrequencyValues.length} unieke waarden hebben geen match in freq_map.
                  </p>
                ) : hasData && freqCol ? (
                  <p className="mt-1 flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                    <CheckCircle size={12} /> Veld gevonden in raw_data.
                  </p>
                ) : null}
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Financial Settings */}
        <AccordionItem value="financial" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">💰 Financieel</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Standaard Uurtarief (€)</Label>
                <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">BTW Tarief (%)</Label>
                <Input type="number" value={project.vat_rate} disabled className="mt-1 opacity-50" />
              </div>
            </div>
            
            {/* Weekday rates */}
            <div className="mt-4">
              <Label className="text-xs text-muted-foreground mb-2 block">Afwijkende tarieven per weekdag (optioneel)</Label>
              <p className="text-xs text-muted-foreground mb-3">Laat leeg om het standaard uurtarief te gebruiken.</p>
              <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-2">
                {(['maandag', 'dinsdag', 'woensdag', 'donderdag', 'vrijdag', 'zaterdag', 'zondag'] as const).map((day) => (
                  <div key={day} className="space-y-1">
                    <Label className="text-[10px] text-muted-foreground capitalize">{day.slice(0, 2)}</Label>
                    <Input
                      type="number"
                      step="0.01"
                      placeholder={`€${hourlyRate}`}
                      value={weekdayRates[day] ?? ''}
                      onChange={(e) => {
                        const val = e.target.value;
                        setWeekdayRates(prev => ({
                          ...prev,
                          [day]: val === '' ? undefined : parseFloat(val)
                        }));
                      }}
                      className="h-8 text-xs"
                    />
                  </div>
                ))}
              </div>
            </div>

            {/* Global hours factor */}
            <div className="mt-4">
              <Label className="text-xs text-muted-foreground">Globale urenfactor</Label>
              <p className="text-xs text-muted-foreground mb-2">Factor waarmee alle gelogde uren worden vermenigvuldigd (1.0 = geen aanpassing, 0.8 = 20% minder)</p>
              <Input
                type="number"
                step="0.01"
                min="0"
                value={hoursFactor}
                onChange={(e) => setHoursFactor(parseFloat(e.target.value) || 1.0)}
                className="w-32"
              />
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Frequency Map */}
        <AccordionItem value="frequency" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">🔄 Frequentie Mapping ({Object.keys(freqMap).length})</AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
              {Object.entries(freqMap).map(([key, value]) => (
                <div key={key} className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2 text-sm">
                  <span><span className="font-medium">{key}</span> → {value}x</span>
                  <button onClick={() => removeFreqMapping(key)} className="text-muted-foreground hover:text-destructive"><X size={14} /></button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Select value={newFreqKey} onValueChange={setNewFreqKey}>
                <SelectTrigger className="flex-1">
                  <SelectValue placeholder="Selecteer frequentie..." />
                </SelectTrigger>
                <SelectContent>
                  {availableFrequencyValues
                    .filter(f => !Object.keys(freqMap).includes(f))
                    .map(freq => (
                      <SelectItem key={freq} value={freq}>{freq}</SelectItem>
                    ))}
                </SelectContent>
              </Select>
              <Input type="number" value={newFreqValue} onChange={(e) => setNewFreqValue(e.target.value)} placeholder="Mult." className="w-20" />
              <Button onClick={addFreqMapping} size="sm" variant="outline"><Plus size={16} /></Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Config Preview */}
        <AccordionItem value="preview" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            <div className="flex items-center gap-2">
              <Eye size={16} />
              Preview Berekening ({previewRecords?.length || 0} sales)
            </div>
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="flex items-start justify-between mb-4 gap-4">
              <p className="text-xs text-muted-foreground">
                Hieronder zie je hoe wij een paar voorbeeld-sales vertalen naar een jaarwaarde.
                Klopt de kolom <strong>"Wij lezen dit als"</strong>? Dan klopt de jaarwaarde-KPI in het dashboard ook.
                Klopt iets niet → pas de <strong>Frequentie Mapping</strong> hierboven aan.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchPreview()}
                disabled={previewLoading}
                className="flex items-center gap-2 flex-shrink-0"
              >
                <RefreshCw size={14} className={previewLoading ? 'animate-spin' : ''} />
                Ververs
              </Button>
            </div>

            {previewLoading ? (
              <div className="flex items-center justify-center py-8">
                <Loader2 size={24} className="animate-spin text-muted-foreground" />
              </div>
            ) : previewRecords && previewRecords.length > 0 ? (
              <>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Resultaat</TableHead>
                        <TableHead className="text-right">Bedrag</TableHead>
                        <TableHead>Frequentie uit BasiCall</TableHead>
                        <TableHead>Wij lezen dit als</TableHead>
                        <TableHead className="text-right">Per jaar</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {previewRecords.map((record) => {
                        const amount = typeof record.amountRaw === 'number'
                          ? record.amountRaw
                          : record.amountRaw
                            ? parseFloat(String(record.amountRaw).replace(',', '.').replace(/[^0-9.\-]/g, '')) || 0
                            : 0;
                        return (
                          <TableRow key={record.recordId}>
                            <TableCell>
                              <Badge variant="secondary" className="text-xs">{record.resultaat}</Badge>
                            </TableCell>
                            <TableCell className="text-right font-mono">
                              {amount > 0 ? `€ ${amount.toLocaleString('nl-NL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell className="font-mono text-xs">
                              {record.freqRaw ? `"${record.freqRaw}"` : <span className="text-muted-foreground">—</span>}
                            </TableCell>
                            <TableCell>
                              {record.matchedKey ? (
                                <span className="text-xs">
                                  <strong>{getFrequencyLabel(record.frequencyType as FrequencyType)}</strong>
                                  <span className="text-muted-foreground"> (×{record.multiplier})</span>
                                </span>
                              ) : (
                                <span className="text-xs text-destructive flex items-center gap-1">
                                  <AlertTriangle size={12} /> Niet herkend → ×1
                                </span>
                              )}
                            </TableCell>
                            <TableCell className="text-right font-bold">
                              €{record.annualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
                <div className="text-xs text-right pt-2 border-t border-border">
                  <strong>Totaal voorbeeld: €{previewRecords.reduce((s, r) => s + r.annualValue, 0).toLocaleString('nl-NL', { minimumFractionDigits: 2 })} per jaar</strong>
                  <span className="text-muted-foreground"> uit {previewRecords.length} sample {previewRecords.length === 1 ? 'sale' : 'sales'}</span>
                </div>
              </>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <AlertTriangle size={24} className="mb-2" />
                <p className="text-sm">Geen sales records gevonden.</p>
                <p className="text-xs">Controleer of de positieve resultaten correct zijn geconfigureerd.</p>
              </div>
            )}

            {previewRecords && previewRecords.some(r => !r.matchedKey) && (() => {
              const unmatched = Array.from(new Set(
                previewRecords.filter(r => !r.matchedKey).map(r => r.freqRaw).filter(Boolean)
              ));
              return (
                <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <div className="flex items-start gap-2">
                    <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                    <div className="text-xs text-amber-700 dark:text-amber-200">
                      <strong>Waarschuwing:</strong> {unmatched.length === 1 ? 'Deze frequentie-waarde is' : 'Deze frequentie-waarden zijn'} niet herkend:{' '}
                      {unmatched.map((v, i) => (
                        <span key={String(v)}>
                          <code className="bg-amber-500/20 px-1 rounded">{String(v)}</code>
                          {i < unmatched.length - 1 ? ', ' : ''}
                        </span>
                      ))}.
                      Voeg {unmatched.length === 1 ? 'die' : 'ze'} toe aan de <strong>Frequentie Mapping</strong> hierboven met de juiste vermenigvuldiger
                      (per maand = 12, per 2 maanden = 6, per kwartaal = 4, per half jaar = 2, per jaar = 1, eenmalig = 1).
                      Zonder match wordt elke record gerekend als ×1.
                    </div>
                  </div>
                </div>
              );
            })()}
          </AccordionContent>
        </AccordionItem>
      </Accordion>
        </div>{/* einde LINKER kolom */}

        {/* RECHTER KOLOM: sticky live-paneel (opslaan, check, dekking, preview) */}
        <aside className="lg:sticky lg:top-4 self-start space-y-4 lg:max-h-[calc(100vh-1.5rem)] lg:overflow-auto lg:pr-1">
          {/* Opslaan + wijzig-status */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between gap-2 mb-3">
              <span className="text-sm font-semibold">Opslaan</span>
              {isDirty ? (
                <span className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
                  <span className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" /> Niet opgeslagen
                </span>
              ) : (
                <span className="flex items-center gap-1 text-xs text-green-600 dark:text-green-400">
                  <CheckCircle size={12} /> Opgeslagen
                </span>
              )}
            </div>
            <Button onClick={handleSave} disabled={isSaving} className="w-full flex items-center gap-2">
              {isSaving ? <Loader2 size={16} className="animate-spin" /> : <CheckCircle size={16} />}
              {isSaving ? 'Opslaan...' : 'Configuratie opslaan'}
            </Button>
            {isDirty && (
              <button
                type="button"
                onClick={handleReset}
                disabled={isSaving}
                className="mt-2 w-full flex items-center justify-center gap-1 text-xs text-muted-foreground hover:text-destructive transition-colors"
              >
                <RotateCcw size={12} /> Wijzigingen ongedaan maken
              </button>
            )}
          </div>

          {/* Configuratie-check */}
          {hasData && (
            <div className="rounded-lg border border-border bg-muted/30 p-4">
              <div className="text-sm font-semibold mb-2">Configuratie-check</div>
              <div className="space-y-1.5 text-xs">
                <div className="flex items-center gap-2">
                  {amountColMissing ? <AlertTriangle size={14} className="text-destructive shrink-0" /> : <CheckCircle size={14} className="text-green-600 dark:text-green-400 shrink-0" />}
                  <span>Bedrag-veld: <strong className={amountColMissing ? 'text-destructive' : ''}>{amountCol || '—'}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  {freqColMissing ? <AlertTriangle size={14} className="text-destructive shrink-0" /> : <CheckCircle size={14} className="text-green-600 dark:text-green-400 shrink-0" />}
                  <span>Frequentie-veld: <strong className={freqColMissing ? 'text-destructive' : ''}>{freqCol || '—'}</strong></span>
                </div>
                <div className="flex items-center gap-2">
                  {projectType === 'outbound' && saleResults.length === 0 ? (
                    <><AlertTriangle size={14} className="text-destructive shrink-0" /><span className="text-destructive">Geen positieve resultaten ingesteld</span></>
                  ) : projectType === 'inbound_service' && handledResults.length === 0 ? (
                    <><AlertTriangle size={14} className="text-destructive shrink-0" /><span className="text-destructive">Geen afgehandeld-resultaten ingesteld</span></>
                  ) : projectType === 'inbound' && retentionResults.length === 0 && lostResults.length === 0 ? (
                    <><AlertTriangle size={14} className="text-destructive shrink-0" /><span className="text-destructive">Geen behouden/verloren-resultaten ingesteld</span></>
                  ) : (
                    <><CheckCircle size={14} className="text-green-600 dark:text-green-400 shrink-0" /><span>Resultaat-mapping ingesteld</span></>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Categorie-dekking (live, volume-gewogen) */}
          <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
            <div className="flex items-center justify-between mb-1">
              <span className="text-sm font-semibold">Categorie-dekking</span>
              <span className="text-[11px] text-muted-foreground">{coverage.total.toLocaleString('nl-NL')} records</span>
            </div>
            <p className="text-[11px] text-muted-foreground mb-3">Hoe dit project elke resultaatcode telt, gewogen naar volume.</p>
            {distLoading ? (
              <div className="flex items-center justify-center py-4"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
            ) : coverage.total === 0 ? (
              <p className="text-xs text-muted-foreground">Nog geen records voor dit project.</p>
            ) : (
              <div className="space-y-2">
                {coverage.rows.map((row) => (
                  <div key={row.key}>
                    <div className="flex items-center justify-between text-xs mb-0.5">
                      <span className={row.key === 'todo' && row.count > 0 ? 'font-semibold text-fuchsia-600 dark:text-fuchsia-400' : ''}>{row.label}</span>
                      <span className="text-muted-foreground tabular-nums">{row.count.toLocaleString('nl-NL')} · {row.pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 w-full rounded-full bg-muted overflow-hidden">
                      <div className={`h-full rounded-full ${COVERAGE_COLORS[row.key] || 'bg-primary'}`} style={{ width: `${row.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            )}
            {coverage.todoCount > 0 && (
              <div className="mt-3 rounded-md border border-fuchsia-300 dark:border-fuchsia-900 bg-fuchsia-50 dark:bg-fuchsia-950/30 p-2 text-[11px] text-fuchsia-800 dark:text-fuchsia-200">
                <div className="flex items-center gap-1 font-semibold mb-1"><AlertTriangle size={12} /> {coverage.todoCount.toLocaleString('nl-NL')} records nog niet ingedeeld</div>
                <p className="mb-1 opacity-90">Deel deze codes in via de categorieën links:</p>
                <div className="flex flex-wrap gap-1">
                  {coverage.todoCodes.slice(0, 10).map((c) => (
                    <span key={c} className="rounded bg-fuchsia-500/15 px-1.5 py-0.5">{c}</span>
                  ))}
                  {coverage.todoCodes.length > 10 && <span className="opacity-70">+{coverage.todoCodes.length - 10} meer</span>}
                </div>
              </div>
            )}
          </div>

          {/* Jaarwaarde-voorbeeld (compact) — outbound met sales */}
          {projectType === 'outbound' && (
            <div className="rounded-lg border border-border bg-card p-4 shadow-sm">
              <div className="flex items-center justify-between mb-1">
                <span className="text-sm font-semibold flex items-center gap-1.5"><Eye size={14} /> Jaarwaarde-voorbeeld</span>
                <button type="button" onClick={() => refetchPreview()} disabled={previewLoading} className="text-muted-foreground hover:text-foreground transition-colors" title="Ververs">
                  <RefreshCw size={13} className={previewLoading ? 'animate-spin' : ''} />
                </button>
              </div>
              {previewLoading ? (
                <div className="flex items-center justify-center py-4"><Loader2 size={18} className="animate-spin text-muted-foreground" /></div>
              ) : previewRecords && previewRecords.length > 0 ? (
                <>
                  <p className="text-xs text-muted-foreground mb-2">{previewRecords.filter((r) => r.annualValue > 0).length}/{previewRecords.length} sample-sales met jaarwaarde &gt; €0.</p>
                  <div className="space-y-1">
                    {previewRecords.slice(0, 5).map((r) => (
                      <div key={r.recordId} className="flex items-center justify-between gap-2 text-xs">
                        <span className="truncate text-muted-foreground" title={r.resultaat}>{r.resultaat}</span>
                        <span className={`font-mono tabular-nums shrink-0 ${r.annualValue > 0 ? '' : 'text-destructive'}`}>€{r.annualValue.toLocaleString('nl-NL', { maximumFractionDigits: 0 })}</span>
                      </div>
                    ))}
                  </div>
                  <div className="mt-2 pt-2 border-t border-border text-xs flex items-center justify-between">
                    <span className="text-muted-foreground">Totaal voorbeeld</span>
                    <strong>€{previewRecords.reduce((s, r) => s + r.annualValue, 0).toLocaleString('nl-NL', { maximumFractionDigits: 0 })}/jr</strong>
                  </div>
                  {previewRecords.some((r) => !r.matchedKey && r.freqRaw) && (
                    <p className="mt-2 text-[11px] text-amber-600 dark:text-amber-400 flex items-start gap-1"><AlertTriangle size={11} className="mt-0.5 shrink-0" /> Frequentie niet herkend bij sommige sales → controleer de Frequentie-mapping.</p>
                  )}
                </>
              ) : (
                <p className="text-xs text-muted-foreground">Geen sample-sales gevonden. Controleer de positieve resultaten.</p>
              )}
            </div>
          )}
        </aside>
      </div>{/* einde 2-koloms grid */}
    </div>
  );
};