import { useState, useEffect } from 'react';
import { Settings, CheckCircle, Plus, X, Loader2, PhoneIncoming, PhoneOutgoing, Headphones, Eye, RefreshCw, AlertTriangle, ShieldOff, MessageSquareOff, PhoneOff } from 'lucide-react';
import { DBProjectBase, MappingConfig, ProjectType } from '@/types/database';
import { UNREACHABLE_RESULTS, NEGATIVE_ARGUMENTATED, NEGATIVE_NOT_ARGUMENTATED } from '@/lib/statsHelpers';
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
  onSave: (projectId: string, hourlyRate: number, mappingConfig: MappingConfig, projectType: ProjectType) => Promise<void>;
  isSaving?: boolean;
}

const EMPTY_VALUE = "__none__";
const AUTO_VALUE = "__auto__";

export const MappingTool = ({ project, onSave, isSaving = false }: MappingToolProps) => {
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

  // Negative categorization state (outbound)
  const [unreachableResults, setUnreachableResults] = useState<string[]>(project.mapping_config.unreachable_results || UNREACHABLE_RESULTS);
  const [negativeArgumentated, setNegativeArgumentated] = useState<string[]>(project.mapping_config.negative_argumentated || NEGATIVE_ARGUMENTATED);
  const [negativeNotArgumentated, setNegativeNotArgumentated] = useState<string[]>(project.mapping_config.negative_not_argumentated || NEGATIVE_NOT_ARGUMENTATED);
  
  // Weekday rates state
  const [weekdayRates, setWeekdayRates] = useState<Record<string, number | undefined>>(
    project.mapping_config.weekday_rates || {}
  );

  const { availableFields, availableResults, availableFrequencyValues, isLoading } = useProjectFieldOptions(project.id, freqCol);

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
    weekday_rates: cleanWeekdayRates(),
    handled_results: handledResults,
    not_handled_results: notHandledResults,
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
    setUnreachableResults(project.mapping_config.unreachable_results || UNREACHABLE_RESULTS);
    setNegativeArgumentated(project.mapping_config.negative_argumentated || NEGATIVE_ARGUMENTATED);
    setNegativeNotArgumentated(project.mapping_config.negative_not_argumentated || NEGATIVE_NOT_ARGUMENTATED);
    setWeekdayRates(project.mapping_config.weekday_rates || {});
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
      weekday_rates: cleanWeekdayRates(),
      handled_results: handledResults,
      not_handled_results: notHandledResults,
    };
    await onSave(project.id, hourlyRate, mappingConfig, projectType);
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

  const allSelected = [...saleResults, ...retentionResults, ...lostResults, ...partialSuccessResults, ...handledResults, ...notHandledResults];
  const availableResultsFiltered = availableResults.filter((r) => !allSelected.includes(r));

  const renderResultBadges = (results: string[], onRemove: (r: string) => void) => (
    <div className="flex flex-wrap gap-2">
      {results.map((result) => (
        <Badge key={result} variant="secondary" className="flex items-center gap-1 px-3 py-1">
          {result}
          <button onClick={() => onRemove(result)} className="ml-1 hover:text-destructive transition-colors">
            <X size={14} />
          </button>
        </Badge>
      ))}
    </div>
  );

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

            <AccordionItem value="unreachable" className="border border-border rounded-lg px-4">
              <AccordionTrigger className="text-sm font-semibold">
                <span className="flex items-center gap-2"><PhoneOff size={16} /> Niet Bereikbaar ({unreachableResults.length})</span>
              </AccordionTrigger>
              <AccordionContent className="space-y-4 pt-4">
                <p className="text-xs text-muted-foreground">Resultaten die niet meetellen voor netto conversie (niet bereikbare contacten).</p>
                {renderResultBadges(unreachableResults, (r) => setUnreachableResults(unreachableResults.filter(x => x !== r)))}
                {renderResultSelect((r) => setUnreachableResults([...unreachableResults, r]))}
                <Input 
                  placeholder="Handmatig resultaat toevoegen..." 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      setUnreachableResults([...unreachableResults, e.currentTarget.value.trim()]);
                      e.currentTarget.value = '';
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
                <p className="text-xs text-muted-foreground">Bewuste weigeringen door de prospect (bijv. geen interesse, geen geld).</p>
                {renderResultBadges(negativeArgumentated, (r) => setNegativeArgumentated(negativeArgumentated.filter(x => x !== r)))}
                {renderResultSelect((r) => setNegativeArgumentated([...negativeArgumentated, r]))}
                <Input 
                  placeholder="Handmatig resultaat toevoegen..." 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      setNegativeArgumentated([...negativeArgumentated, e.currentTarget.value.trim()]);
                      e.currentTarget.value = '';
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
                <p className="text-xs text-muted-foreground">Externe factoren (bijv. overleden, onjuiste gegevens, fax).</p>
                {renderResultBadges(negativeNotArgumentated, (r) => setNegativeNotArgumentated(negativeNotArgumentated.filter(x => x !== r)))}
                {renderResultSelect((r) => setNegativeNotArgumentated([...negativeNotArgumentated, r]))}
                <Input 
                  placeholder="Handmatig resultaat toevoegen..." 
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && e.currentTarget.value.trim()) {
                      setNegativeNotArgumentated([...negativeNotArgumentated, e.currentTarget.value.trim()]);
                      e.currentTarget.value = '';
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
                <p className="text-xs text-muted-foreground">Resultaten waarbij de donateur definitief verloren is.</p>
                {renderResultBadges(lostResults, (r) => setLostResults(lostResults.filter(x => x !== r)))}
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
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Frequentie Kolom</Label>
                <Select value={freqCol} onValueChange={setFreqCol}>
                  <SelectTrigger className="mt-1"><SelectValue placeholder="Selecteer..." /></SelectTrigger>
                  <SelectContent>
                    {availableFields.map((f) => <SelectItem key={f} value={f}>{f}</SelectItem>)}
                  </SelectContent>
                </Select>
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

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2">
          {isSaving ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle size={18} />}
          {isSaving ? 'Opslaan...' : 'Configuratie Opslaan'}
        </Button>
      </div>
    </div>
  );
};