import { useState, useEffect } from 'react';
import { Settings, CheckCircle, Plus, X, Loader2, PhoneIncoming, PhoneOutgoing } from 'lucide-react';
import { DBProject, MappingConfig, ProjectType } from '@/types/database';
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
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface MappingToolProps {
  project: DBProject;
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

  const { availableFields, availableResults, availableFrequencyValues, isLoading } = useProjectFieldOptions(project.id, freqCol);

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

  const allSelected = [...saleResults, ...retentionResults, ...lostResults, ...partialSuccessResults];
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
          <TabsList className="grid w-full max-w-md grid-cols-2">
            <TabsTrigger value="outbound" className="flex items-center gap-2">
              <PhoneOutgoing size={16} /> Outbound (Acquisitie)
            </TabsTrigger>
            <TabsTrigger value="inbound" className="flex items-center gap-2">
              <PhoneIncoming size={16} /> Inbound (Retentie)
            </TabsTrigger>
          </TabsList>
        </Tabs>
        <p className="text-xs text-muted-foreground mt-2">
          {projectType === 'outbound' 
            ? 'Werving van nieuwe donateurs - meet conversie en nieuwe jaarwaarde.'
            : 'Behoud van bestaande donateurs - meet retentie ratio en behouden waarde.'}
        </p>
      </div>

      <Accordion type="single" collapsible defaultValue="results" className="space-y-4">
        {/* Results Configuration - Different for inbound/outbound */}
        {projectType === 'outbound' ? (
          <AccordionItem value="results" className="border border-border rounded-lg px-4">
            <AccordionTrigger className="text-sm font-semibold">✅ Positieve Resultaten ({saleResults.length})</AccordionTrigger>
            <AccordionContent className="space-y-4 pt-4">
              <p className="text-xs text-muted-foreground">Resultaten die als verkoop/donatie worden geteld.</p>
              {renderResultBadges(saleResults, (r) => setSaleResults(saleResults.filter(x => x !== r)))}
              {renderResultSelect((r) => setSaleResults([...saleResults, r]))}
            </AccordionContent>
          </AccordionItem>
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
                <Label className="text-xs text-muted-foreground">Uurtarief (€)</Label>
                <Input type="number" value={hourlyRate} onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">BTW Tarief (%)</Label>
                <Input type="number" value={project.vat_rate} disabled className="mt-1 opacity-50" />
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