import { useState, useEffect } from 'react';
import { Settings, CheckCircle, Plus, X, Loader2, PhoneIncoming, PhoneOutgoing, Headphones, Eye, RefreshCw, AlertTriangle, ShieldOff, MessageSquareOff, PhoneOff, Ban } from 'lucide-react';
import { DBProjectBase, MappingConfig, ProjectType } from '@/types/database';
import { UNREACHABLE_RESULTS, NEGATIVE_ARGUMENTATED, NEGATIVE_NOT_ARGUMENTATED } from '@/lib/statsHelpers';
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

  // Negative categorization state (outbound)
  const [unreachableResults, setUnreachableResults] = useState<string[]>(project.mapping_config.unreachable_results || UNREACHABLE_RESULTS);
  const [negativeArgumentated, setNegativeArgumentated] = useState<string[]>(project.mapping_config.negative_argumentated || NEGATIVE_ARGUMENTATED);
  const [negativeNotArgumentated, setNegativeNotArgumentated] = useState<string[]>(project.mapping_config.negative_not_argumentated || NEGATIVE_NOT_ARGUMENTATED);

  // Per-result exclusions from ratio denominators
  const [excludeFromNet, setExcludeFromNet] = useState<string[]>(project.mapping_config.exclude_from_net || []);
  const [excludeFromRetention, setExcludeFromRetention] = useState<string[]>(project.mapping_config.exclude_from_retention || []);
  
  // Weekday rates state
  const [weekdayRates, setWeekdayRates] = useState<Record<string, number | undefined>>(
    project.mapping_config.weekday_rates || {}
  );
  
  // Hours factor state
  const [hoursFactor, setHoursFactor] = useState<number>(project.hours_factor ?? 1.0);

  const { availableFields, availableResults, availableFrequencyValues, isLoading } = useProjectFieldOptions(project.id, freqCol);

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

  useEffect(() => {
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
    setUnreachableResults(project.mapping_config.unreachable_results || UNREACHABLE_RESULTS);
    setNegativeArgumentated(project.mapping_config.negative_argumentated || NEGATIVE_ARGUMENTATED);
    setNegativeNotArgumentated(project.mapping_config.negative_not_argumentated || NEGATIVE_NOT_ARGUMENTATED);
    setExcludeFromNet(project.mapping_config.exclude_from_net || []);
    setExcludeFromRetention(project.mapping_config.exclude_from_retention || []);
    setWeekdayRates(project.mapping_config.weekday_rates || {});
    setHoursFactor(project.hours_factor ?? 1.0);
  }, [project.id]);

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

  const allReasonResults = Object.values(reasonCategories).flat();
  const allSelected = [...saleResults, ...retentionResults, ...lostResults, ...partialSuccessResults, ...handledResults, ...notHandledResults, ...flatVoicemailResults, ...flatNawtResults, ...allReasonResults];
  const availableResultsFiltered = availableResults.filter((r) => !allSelected.includes(r));

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
      check('NAWT fout', flatNawtResults) ||
      (() => {
        const lc = candidate.toLowerCase();
        for (const [catName, codes] of Object.entries(reasonCategories)) {
          if (codes.some((r) => r.toLowerCase() === lc)) return `Reden: ${catName}`;
        }
        return null;
      })()
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

  const renderResultSelect = (onAdd: (r: string) => void) => (
    availableResultsFiltered.length > 0 && (
      <Select onValueChange={onAdd} value="">
        <SelectTrigger className="w-full md:w-80">
          <SelectValue placeholder="Resultaat toevoegen..." />
        </SelectTrigger>
        <SelectContent>
          {availableResultsFiltered.map((result) => (
            <SelectItem key={result} value={result}>{result}</SelectItem>
          ))}
        </SelectContent>
      </Select>
    )
  );

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
                  })}
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
            <div className="flex items-center justify-between mb-4">
              <p className="text-xs text-muted-foreground">
                Toont hoe de huidige configuratie de eerste 5 sales records berekent.
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchPreview()}
                disabled={previewLoading}
                className="flex items-center gap-2"
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
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-20">Record</TableHead>
                      <TableHead>Resultaat</TableHead>
                      <TableHead className="text-right">Bedrag</TableHead>
                      <TableHead>Freq. Input</TableHead>
                      <TableHead>Match</TableHead>
                      <TableHead className="text-right">Mult.</TableHead>
                      <TableHead className="text-right">Jaarwaarde</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {previewRecords.map((record) => (
                      <TableRow key={record.recordId}>
                        <TableCell className="font-mono text-xs">#{record.recordId}</TableCell>
                        <TableCell>
                          <Badge variant="secondary" className="text-xs">{record.resultaat}</Badge>
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {record.amountRaw ?? '-'}
                        </TableCell>
                        <TableCell className="font-mono text-xs">
                          {record.freqRaw ?? <span className="text-muted-foreground">-</span>}
                        </TableCell>
                        <TableCell>
                          {record.matchedKey ? (
                            <Badge variant="outline" className="text-xs">
                              {record.matchedKey}
                            </Badge>
                          ) : (
                            <Badge variant="destructive" className="text-xs">
                              Geen match
                            </Badge>
                          )}
                        </TableCell>
                        <TableCell className="text-right font-mono">
                          {record.multiplier}x
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          €{record.annualValue.toLocaleString('nl-NL', { minimumFractionDigits: 2 })}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
                <AlertTriangle size={24} className="mb-2" />
                <p className="text-sm">Geen sales records gevonden.</p>
                <p className="text-xs">Controleer of de positieve resultaten correct zijn geconfigureerd.</p>
              </div>
            )}

            {previewRecords && previewRecords.some(r => !r.matchedKey) && (
              <div className="mt-4 p-3 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                <div className="flex items-start gap-2">
                  <AlertTriangle size={16} className="text-amber-500 mt-0.5 flex-shrink-0" />
                  <div className="text-xs text-amber-500">
                    <strong>Waarschuwing:</strong> Sommige records hebben geen frequentie match. 
                    Voeg de ontbrekende frequenties toe aan de Frequentie Mapping om accurate jaarwaarden te berekenen.
                  </div>
                </div>
              </div>
            )}
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      {/* Config-health summary — shows admin whether the config will produce valid numbers */}
      {hasData && (
        <div className="mt-6 p-4 rounded-lg border border-border bg-muted/30">
          <div className="text-sm font-semibold mb-2">Configuratie-check</div>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-2 text-xs">
            <div className="flex items-center gap-2">
              {amountColMissing ? <AlertTriangle size={14} className="text-destructive" /> : <CheckCircle size={14} className="text-green-600 dark:text-green-400" />}
              <span>Bedrag-veld: <strong className={amountColMissing ? "text-destructive" : ""}>{amountCol || '—'}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              {freqColMissing ? <AlertTriangle size={14} className="text-destructive" /> : <CheckCircle size={14} className="text-green-600 dark:text-green-400" />}
              <span>Frequentie-veld: <strong className={freqColMissing ? "text-destructive" : ""}>{freqCol || '—'}</strong></span>
            </div>
            <div className="flex items-center gap-2">
              {projectType === 'outbound' && saleResults.length === 0 ? (
                <><AlertTriangle size={14} className="text-destructive" /><span className="text-destructive">Geen positieve resultaten ingesteld</span></>
              ) : projectType === 'inbound_service' && handledResults.length === 0 ? (
                <><AlertTriangle size={14} className="text-destructive" /><span className="text-destructive">Geen afgehandeld-resultaten ingesteld</span></>
              ) : projectType === 'inbound' && retentionResults.length === 0 && lostResults.length === 0 ? (
                <><AlertTriangle size={14} className="text-destructive" /><span className="text-destructive">Geen behouden/verloren-resultaten ingesteld</span></>
              ) : (
                <><CheckCircle size={14} className="text-green-600 dark:text-green-400" /><span>Resultaat-mapping ingesteld</span></>
              )}
            </div>
          </div>
          {!previewLoading && previewRecords && previewRecords.length > 0 && (
            <div className="mt-3 pt-3 border-t border-border text-xs">
              <strong>Preview:</strong> {previewRecords.filter(r => r.annualValue > 0).length} van {previewRecords.length} sample sales krijgt een jaarwaarde &gt; €0
              {previewRecords.filter(r => r.annualValue > 0).length === 0 && previewRecords.length > 0 && (
                <span className="text-destructive ml-1">— controleer bedrag-/frequentie-kolom.</span>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2">
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
          {isSaving ? 'Opslaan...' : 'Configuratie Opslaan'}
        </Button>
      </div>
    </div>
  );
};