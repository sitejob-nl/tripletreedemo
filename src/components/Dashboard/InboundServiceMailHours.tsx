import { useEffect, useMemo, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Loader2, Mail, Save } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { supabase } from '@/integrations/supabase/client';
import { friendlyError } from '@/lib/friendlyError';
import type { ReportageWeeklyOverride } from '@/types/database';

interface InboundServiceMailHoursProps {
  projectId: string;
  selectedWeek: string | number;
  reportageOverrides: ReportageWeeklyOverride[];
}

function parseSelectedWeek(value: string | number): { year: number; week: number } | null {
  if (typeof value === 'number') return { year: new Date().getFullYear(), week: value };
  const match = value.match(/^(\d{4})-(\d{1,2})$/);
  if (!match) return null;
  const year = Number(match[1]);
  const week = Number(match[2]);
  return week >= 1 && week <= 53 ? { year, week } : null;
}

function metricNumber(override: ReportageWeeklyOverride | undefined, key: string): number | null {
  const value = override?.metrics?.[key];
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() !== '') {
    const parsed = Number(value.replace(',', '.'));
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

export function InboundServiceMailHours({
  projectId,
  selectedWeek,
  reportageOverrides,
}: InboundServiceMailHoursProps) {
  const queryClient = useQueryClient();
  const week = useMemo(() => parseSelectedWeek(selectedWeek), [selectedWeek]);
  const currentOverride = useMemo(
    () => week
      ? reportageOverrides.find((override) => override.year === week.year && override.week_number === week.week)
      : undefined,
    [reportageOverrides, week],
  );
  const currentHours = metricNumber(currentOverride, 'mailHours');
  const isManual = currentOverride?.metrics?.mailHoursSource === 'manual';
  const [value, setValue] = useState('');

  useEffect(() => {
    setValue(currentHours === null ? '' : String(currentHours));
  }, [currentHours, projectId, selectedWeek]);

  const saveMutation = useMutation({
    mutationFn: async (mailHours: number) => {
      if (!week) throw new Error('Selecteer eerst één rapportageweek.');
      const { error } = await supabase.rpc('upsert_inbound_service_mail_hours', {
        p_project_id: projectId,
        p_year: week.year,
        p_week_number: week.week,
        p_mail_hours: mailHours,
      });
      if (error) throw error;
    },
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey: ['reportage_weekly_overrides', projectId] });
      toast.success(`Mailuren voor week ${week?.week} opgeslagen`);
    },
    onError: (error) => {
      toast.error(friendlyError(error, 'De mailuren konden niet opgeslagen worden. Controleer de invoer en probeer het opnieuw.'));
    },
  });

  if (!week) return null;

  const handleSave = () => {
    const parsed = Number(value.replace(',', '.'));
    if (!Number.isFinite(parsed) || parsed < 0) {
      toast.error('Vul een geldig aantal mailuren van nul of hoger in.');
      return;
    }
    saveMutation.mutate(parsed);
  };

  return (
    <div className="mt-6 rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-2xl">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="flex items-center gap-2 font-bold text-foreground">
              <Mail size={18} aria-hidden="true" /> Mailuren week {week.week}
            </h3>
            {currentHours !== null && (
              <Badge variant="outline">
                {isManual ? 'Handmatig ingevoerd' : 'Overgenomen uit Excel'}
              </Badge>
            )}
          </div>
          <p className="mt-1 text-xs text-muted-foreground">
            BasiCall levert de uren voor e-mailverwerking niet betrouwbaar per campagne. Deze weekwaarde wordt daarom handmatig beheerd en telt op bij de agenturen.
          </p>
        </div>
        <div className="flex items-end gap-2">
          <div className="space-y-1.5">
            <Label htmlFor="inbound-mail-hours" className="text-xs">Aantal uren</Label>
            <Input
              id="inbound-mail-hours"
              type="number"
              min="0"
              step="0.01"
              inputMode="decimal"
              className="w-32"
              placeholder="0,00"
              value={value}
              onChange={(event) => setValue(event.target.value)}
              disabled={saveMutation.isPending}
            />
          </div>
          <Button onClick={handleSave} disabled={saveMutation.isPending || value.trim() === ''}>
            {saveMutation.isPending
              ? <Loader2 size={16} className="mr-2 animate-spin" aria-hidden="true" />
              : <Save size={16} className="mr-2" aria-hidden="true" />}
            Opslaan
          </Button>
        </div>
      </div>
    </div>
  );
}
