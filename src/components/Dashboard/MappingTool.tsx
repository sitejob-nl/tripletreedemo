import { useState, useEffect } from 'react';
import { Settings, CheckCircle, Plus, X, Loader2 } from 'lucide-react';
import { DBProject, MappingConfig } from '@/types/database';
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

interface MappingToolProps {
  project: DBProject;
  onSave: (projectId: string, hourlyRate: number, mappingConfig: MappingConfig) => Promise<void>;
  isSaving?: boolean;
}

export const MappingTool = ({ project, onSave, isSaving = false }: MappingToolProps) => {
  const [hourlyRate, setHourlyRate] = useState(project.hourly_rate);
  const [amountCol, setAmountCol] = useState(project.mapping_config.amount_col);
  const [freqCol, setFreqCol] = useState(project.mapping_config.freq_col);
  const [reasonCol, setReasonCol] = useState(project.mapping_config.reason_col || '');
  const [saleResults, setSaleResults] = useState<string[]>(project.mapping_config.sale_results || []);
  const [freqMap, setFreqMap] = useState<Record<string, number>>(project.mapping_config.freq_map || {});
  const [newSaleResult, setNewSaleResult] = useState('');
  const [newFreqKey, setNewFreqKey] = useState('');
  const [newFreqValue, setNewFreqValue] = useState('');

  // Reset state when project changes
  useEffect(() => {
    setHourlyRate(project.hourly_rate);
    setAmountCol(project.mapping_config.amount_col);
    setFreqCol(project.mapping_config.freq_col);
    setReasonCol(project.mapping_config.reason_col || '');
    setSaleResults(project.mapping_config.sale_results || []);
    setFreqMap(project.mapping_config.freq_map || {});
  }, [project.id]);

  const handleSave = async () => {
    const mappingConfig: MappingConfig = {
      amount_col: amountCol,
      freq_col: freqCol,
      reason_col: reasonCol,
      freq_map: freqMap,
      sale_results: saleResults,
    };
    await onSave(project.id, hourlyRate, mappingConfig);
  };

  const addSaleResult = () => {
    if (newSaleResult.trim() && !saleResults.includes(newSaleResult.trim())) {
      setSaleResults([...saleResults, newSaleResult.trim()]);
      setNewSaleResult('');
    }
  };

  const removeSaleResult = (result: string) => {
    setSaleResults(saleResults.filter((r) => r !== result));
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

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-card-foreground flex items-center gap-2">
            <Settings size={20} className="text-muted-foreground" />
            Configuratie: {project.name}
          </h2>
          <p className="text-muted-foreground text-sm">
            Beheer veldmappings, tarieven en sales resultaten.
          </p>
        </div>
      </div>

      <Accordion type="single" collapsible defaultValue="financial" className="space-y-4">
        {/* Financial Settings */}
        <AccordionItem value="financial" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            💰 Financiële Instellingen
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Uurtarief (€)</Label>
                <Input
                  type="number"
                  value={hourlyRate}
                  onChange={(e) => setHourlyRate(parseFloat(e.target.value) || 0)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">BTW Tarief (%)</Label>
                <Input
                  type="number"
                  value={project.vat_rate}
                  disabled
                  className="mt-1 opacity-50"
                />
              </div>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Column Mappings */}
        <AccordionItem value="columns" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            📋 Kolom Mappings
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div>
                <Label className="text-xs text-muted-foreground">Bedrag Kolom</Label>
                <Input
                  value={amountCol}
                  onChange={(e) => setAmountCol(e.target.value)}
                  placeholder="bijv. termijnbedrag"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Frequentie Kolom</Label>
                <Input
                  value={freqCol}
                  onChange={(e) => setFreqCol(e.target.value)}
                  placeholder="bijv. frequentie"
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs text-muted-foreground">Opzegreden Kolom</Label>
                <Input
                  value={reasonCol}
                  onChange={(e) => setReasonCol(e.target.value)}
                  placeholder="bijv. opzegreden"
                  className="mt-1"
                />
              </div>
            </div>
            <p className="text-xs text-muted-foreground">
              Tip: De code zoekt automatisch ook naar alternatieve veldnamen (termijnbedrag, Bedrag,
              frequentie, Frequentie).
            </p>
          </AccordionContent>
        </AccordionItem>

        {/* Sale Results */}
        <AccordionItem value="sales" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            ✅ Sales Resultaten ({saleResults.length})
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Resultaatnamen die als "verkoop" worden geteld voor de rapportages.
            </p>
            <div className="flex flex-wrap gap-2">
              {saleResults.map((result) => (
                <Badge
                  key={result}
                  variant="secondary"
                  className="flex items-center gap-1 px-3 py-1"
                >
                  {result}
                  <button
                    onClick={() => removeSaleResult(result)}
                    className="ml-1 hover:text-destructive transition-colors"
                  >
                    <X size={14} />
                  </button>
                </Badge>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newSaleResult}
                onChange={(e) => setNewSaleResult(e.target.value)}
                placeholder="Nieuw resultaat toevoegen..."
                className="flex-1"
                onKeyDown={(e) => e.key === 'Enter' && addSaleResult()}
              />
              <Button onClick={addSaleResult} size="sm" variant="outline">
                <Plus size={16} />
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>

        {/* Frequency Map */}
        <AccordionItem value="frequency" className="border border-border rounded-lg px-4">
          <AccordionTrigger className="text-sm font-semibold">
            🔄 Frequentie Mapping ({Object.keys(freqMap).length})
          </AccordionTrigger>
          <AccordionContent className="space-y-4 pt-4">
            <p className="text-xs text-muted-foreground">
              Vertaal frequentie-tekst naar een jaarlijkse multiplier (bijv. "maandelijks" → 12x
              per jaar).
            </p>
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.entries(freqMap).map(([key, value]) => (
                <div
                  key={key}
                  className="flex items-center justify-between bg-muted/50 rounded-md px-3 py-2 text-sm"
                >
                  <span>
                    <span className="font-medium">{key}</span>
                    <span className="text-muted-foreground"> → {value}x</span>
                  </span>
                  <button
                    onClick={() => removeFreqMapping(key)}
                    className="ml-2 text-muted-foreground hover:text-destructive transition-colors"
                  >
                    <X size={14} />
                  </button>
                </div>
              ))}
            </div>
            <div className="flex gap-2">
              <Input
                value={newFreqKey}
                onChange={(e) => setNewFreqKey(e.target.value)}
                placeholder="Frequentie tekst..."
                className="flex-1"
              />
              <Input
                type="number"
                value={newFreqValue}
                onChange={(e) => setNewFreqValue(e.target.value)}
                placeholder="Multiplier"
                className="w-24"
                onKeyDown={(e) => e.key === 'Enter' && addFreqMapping()}
              />
              <Button onClick={addFreqMapping} size="sm" variant="outline">
                <Plus size={16} />
              </Button>
            </div>
          </AccordionContent>
        </AccordionItem>
      </Accordion>

      <div className="mt-6 flex justify-end">
        <Button onClick={handleSave} disabled={isSaving} className="flex items-center gap-2">
          {isSaving ? (
            <Loader2 size={18} className="animate-spin" />
          ) : (
            <CheckCircle size={18} />
          )}
          {isSaving ? 'Opslaan...' : 'Configuratie Opslaan'}
        </Button>
      </div>
    </div>
  );
};
