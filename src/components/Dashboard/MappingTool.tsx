import { useState } from 'react';
import { Settings, CheckCircle } from 'lucide-react';
import { ProjectMapping, RawCallRecord, Project } from '@/types/dashboard';
import { calculateValues } from '@/lib/dataProcessing';

interface MappingToolProps {
  project: Project;
  data: RawCallRecord[];
  mapping: ProjectMapping;
  onSave: (project: Project, mapping: ProjectMapping) => void;
}

export const MappingTool = ({ project, data, mapping, onSave }: MappingToolProps) => {
  const [localMapping, setLocalMapping] = useState(mapping);
  const sampleRecord = data[0] || {};
  const columns = Object.keys(sampleRecord).filter((k) => !k.startsWith('bc_') && k !== 'id');

  const handleSave = () => {
    onSave(project, localMapping);
  };

  return (
    <div className="bg-card rounded-xl shadow-sm border border-border p-6 mb-6">
      <div className="flex justify-between items-center mb-6">
        <div>
          <h2 className="text-lg font-bold text-card-foreground flex items-center gap-2">
            <Settings size={20} className="text-muted-foreground" />
            Configuratie: {project.charAt(0).toUpperCase() + project.slice(1)}
          </h2>
          <p className="text-muted-foreground text-sm">Koppel velden en stel tarieven in.</p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
        <div className="space-y-6">
          <div className="bg-secondary p-4 rounded-lg border border-border">
            <h3 className="text-sm font-semibold text-foreground mb-3 uppercase tracking-wider">
              Financiële Instellingen
            </h3>
            <div className="space-y-4">
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Uurtarief (voor ROI berekening)
                </label>
                <div className="relative">
                  <span className="absolute left-3 top-2 text-muted-foreground">€</span>
                  <input
                    type="number"
                    className="w-full pl-8 bg-card border border-border rounded-md p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                    value={localMapping.hourly_rate}
                    onChange={(e) =>
                      setLocalMapping({ ...localMapping, hourly_rate: parseFloat(e.target.value) })
                    }
                  />
                </div>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Bronveld voor "Bedrag"
                </label>
                <select
                  className="w-full bg-card border border-border rounded-md p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  value={localMapping.amount_col}
                  onChange={(e) => setLocalMapping({ ...localMapping, amount_col: e.target.value })}
                >
                  <option value="">-- Selecteer Kolom --</option>
                  {columns.map((col) => (
                    <option key={col} value={col}>
                      {col} (Voorbeeld: {(sampleRecord as any)[col]})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label className="block text-xs font-medium text-muted-foreground mb-1">
                  Bronveld voor "Frequentie/Termijn"
                </label>
                <select
                  className="w-full bg-card border border-border rounded-md p-2 text-sm focus:ring-2 focus:ring-primary outline-none"
                  value={localMapping.freq_col}
                  onChange={(e) => setLocalMapping({ ...localMapping, freq_col: e.target.value })}
                >
                  <option value="">-- Selecteer Kolom --</option>
                  {columns.map((col) => (
                    <option key={col} value={col}>
                      {col} (Voorbeeld: {(sampleRecord as any)[col]})
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>
        </div>
        <div className="bg-sidebar text-sidebar-foreground p-5 rounded-lg font-mono text-sm overflow-hidden flex flex-col">
          <div className="flex items-center justify-between mb-2 border-b border-sidebar-border pb-2">
            <span className="font-bold">Live Calculator Preview</span>
            <span className="text-xs text-success">Processed via Cloud</span>
          </div>
          <div className="flex-1 overflow-y-auto space-y-3">
            {data.slice(0, 3).map((record, idx) => {
              const { annualValue, isRecurring } = calculateValues(record, localMapping);
              return (
                <div
                  key={idx}
                  className="p-2 hover:bg-sidebar-accent rounded border-l-2 border-transparent hover:border-primary transition-colors"
                >
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <span className="text-muted-foreground">Resultaat:</span>
                    <span>{record.bc_result_naam}</span>
                    <span className="text-muted-foreground">Type:</span>
                    <span className="text-primary">{isRecurring ? 'Doorlopend' : 'Eenmalig'}</span>
                    <span className="text-success font-bold">Jaarwaarde:</span>
                    <span className="text-success font-bold">€ {annualValue.toFixed(2)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
      <div className="mt-6 flex justify-end">
        <button
          onClick={handleSave}
          className="bg-primary hover:bg-primary/90 text-primary-foreground px-6 py-2 rounded-lg font-medium transition-colors flex items-center gap-2"
        >
          <CheckCircle size={18} />
          Mapping Opslaan
        </button>
      </div>
    </div>
  );
};
