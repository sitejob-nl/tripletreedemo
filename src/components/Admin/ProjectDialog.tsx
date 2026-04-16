import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import type { MappingConfig } from "@/types/database";

export interface ProjectFormData {
  name: string;
  project_key: string;
  basicall_project_id: string;
  basicall_token: string;
  hourly_rate: string;
  vat_rate: string;
  is_active: boolean;
  mapping_config: MappingConfig;
  total_to_call: string;
  hours_factor: string;
}

interface ProjectDialogProps {
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
  formData: ProjectFormData;
  setFormData: React.Dispatch<React.SetStateAction<ProjectFormData>>;
  onSave: () => void;
  isSaving: boolean;
  isEditing: boolean;
}

export function ProjectDialog({
  isOpen,
  onOpenChange,
  formData,
  setFormData,
  onSave,
  isSaving,
  isEditing
}: ProjectDialogProps) {
  const updateMappingConfig = (key: keyof MappingConfig, value: any) => {
    setFormData(prev => ({
      ...prev,
      mapping_config: {
        ...prev.mapping_config,
        [key]: value
      }
    }));
  };

  const updateFreqMap = (key: string, value: string) => {
    const numValue = parseInt(value) || 0;
    setFormData(prev => ({
      ...prev,
      mapping_config: {
        ...prev.mapping_config,
        freq_map: {
          ...prev.mapping_config.freq_map,
          [key]: numValue
        }
      }
    }));
  };

  return (
    <Dialog open={isOpen} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {isEditing ? "Project bewerken" : "Nieuw project toevoegen"}
          </DialogTitle>
          <DialogDescription>
            Vul de projectgegevens en BasiCall configuratie in.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* Basic Info */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Basis informatie</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="name">Projectnaam *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData(prev => ({ ...prev, name: e.target.value }))}
                  placeholder="Hersenstichting"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="project_key">Project key *</Label>
                <Input
                  id="project_key"
                  value={formData.project_key}
                  onChange={(e) => setFormData(prev => ({ ...prev, project_key: e.target.value }))}
                  placeholder="hersenstichting"
                />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Switch
                checked={formData.is_active}
                onCheckedChange={(checked) => setFormData(prev => ({ ...prev, is_active: checked }))}
              />
              <Label>Project actief</Label>
            </div>
          </div>

          {/* BasiCall Config */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">BasiCall configuratie</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="basicall_project_id">BasiCall Project ID *</Label>
                <Input
                  id="basicall_project_id"
                  type="number"
                  value={formData.basicall_project_id}
                  onChange={(e) => setFormData(prev => ({ ...prev, basicall_project_id: e.target.value }))}
                  placeholder="1001"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="basicall_token">
                  API Token {isEditing ? "" : "*"}
                </Label>
                <Input
                  id="basicall_token"
                  type="password"
                  value={formData.basicall_token}
                  onChange={(e) => setFormData(prev => ({ ...prev, basicall_token: e.target.value }))}
                  placeholder={isEditing ? "Laat leeg om bestaande token te behouden" : "Verplicht bij nieuw project"}
                  autoComplete="new-password"
                />
                <p className="text-xs text-muted-foreground">
                  Wordt veilig opgeslagen in <code>project_secrets</code> (niet zichtbaar na opslaan).
                </p>
              </div>
            </div>
          </div>

          {/* Financial Settings */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Financiële instellingen</h3>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="hourly_rate">Uurtarief (€)</Label>
                <Input
                  id="hourly_rate"
                  type="number"
                  step="0.01"
                  value={formData.hourly_rate}
                  onChange={(e) => setFormData(prev => ({ ...prev, hourly_rate: e.target.value }))}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="vat_rate">BTW percentage (%)</Label>
                <Input
                  id="vat_rate"
                  type="number"
                  value={formData.vat_rate}
                  onChange={(e) => setFormData(prev => ({ ...prev, vat_rate: e.target.value }))}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="hours_factor">Globale urenfactor</Label>
              <Input
                id="hours_factor"
                type="number"
                step="0.01"
                min="0"
                value={formData.hours_factor}
                onChange={(e) => setFormData(prev => ({ ...prev, hours_factor: e.target.value }))}
              />
              <p className="text-xs text-muted-foreground">
                Factor waarmee gelogde uren worden vermenigvuldigd (1.0 = geen aanpassing).
              </p>
            </div>
          </div>

          {/* Badges / Te Bellen Restant */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Te bellen restant</h3>
            <div className="space-y-2">
              <Label htmlFor="total_to_call">Totaal te bellen (badges)</Label>
              <Input
                id="total_to_call"
                type="number"
                value={formData.total_to_call}
                onChange={(e) => setFormData(prev => ({ ...prev, total_to_call: e.target.value }))}
                placeholder="Bijv. 5000 (laat leeg als onbekend)"
              />
              <p className="text-xs text-muted-foreground">
                Het totale aantal te bellen adressen. Wordt gebruikt voor de voortgangs-KPI.
              </p>
            </div>
          </div>

          {/* Mapping Config */}
          <div className="space-y-4">
            <h3 className="font-semibold text-foreground">Mapping configuratie</h3>
            <p className="text-sm text-muted-foreground">
              Configureer welke kolommen uit BasiCall data gebruikt worden.
            </p>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label htmlFor="amount_col">Bedrag kolom</Label>
                <Input
                  id="amount_col"
                  value={formData.mapping_config.amount_col}
                  onChange={(e) => updateMappingConfig("amount_col", e.target.value)}
                  placeholder="termijnbedrag"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="freq_col">Frequentie kolom</Label>
                <Input
                  id="freq_col"
                  value={formData.mapping_config.freq_col}
                  onChange={(e) => updateMappingConfig("freq_col", e.target.value)}
                  placeholder="frequentie"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reason_col">Opzegreden kolom</Label>
                <Input
                  id="reason_col"
                  value={formData.mapping_config.reason_col || ""}
                  onChange={(e) => updateMappingConfig("reason_col", e.target.value)}
                  placeholder="opzegreden"
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label>Frequentie mapping (term → vermenigvuldiger)</Label>
              <div className="grid grid-cols-4 gap-2">
                {Object.entries(formData.mapping_config.freq_map).map(([key, value]) => (
                  <div key={key} className="flex items-center gap-1">
                    <span className="text-sm text-muted-foreground w-20 truncate">{key}:</span>
                    <Input
                      type="number"
                      value={value}
                      onChange={(e) => updateFreqMap(key, e.target.value)}
                      className="h-8"
                    />
                  </div>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="sale_results">Sale resultaten (komma-gescheiden)</Label>
              <Input
                id="sale_results"
                value={formData.mapping_config.sale_results.join(", ")}
                onChange={(e) => updateMappingConfig(
                  "sale_results", 
                  e.target.value.split(",").map(s => s.trim()).filter(Boolean)
                )}
                placeholder="Sale, Donateur, Toezegging"
              />
            </div>
          </div>
        </div>

        <div className="flex justify-end gap-3">
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Annuleren
          </Button>
          <Button onClick={onSave} disabled={isSaving}>
            {isSaving ? "Opslaan..." : isEditing ? "Bijwerken" : "Toevoegen"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
