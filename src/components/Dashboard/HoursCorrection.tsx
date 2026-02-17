import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Loader2, Save, RotateCcw, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';

interface HoursCorrectionProps {
  projectId: string;
  startDate: string;
  endDate: string;
}

interface LoggedTimeRecord {
  id: string;
  date: string;
  total_seconds: number;
  corrected_seconds: number | null;
  corrected_by: string | null;
  corrected_at: string | null;
  correction_note: string | null;
}

export const HoursCorrection = ({ projectId, startDate, endDate }: HoursCorrectionProps) => {
  const queryClient = useQueryClient();
  const [edits, setEdits] = useState<Record<string, { seconds: number | null; note: string }>>({});

  const { data: records, isLoading } = useQuery({
    queryKey: ['hours_correction', projectId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('daily_logged_time')
        .select('id, date, total_seconds, corrected_seconds, corrected_by, corrected_at, correction_note')
        .eq('project_id', projectId)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true });
      
      if (error) throw error;
      return data as LoggedTimeRecord[];
    },
    enabled: !!projectId && !!startDate && !!endDate,
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, correctedSeconds, note }: { id: string; correctedSeconds: number | null; note: string }) => {
      const { error } = await supabase
        .from('daily_logged_time')
        .update({
          corrected_seconds: correctedSeconds,
          correction_note: note || null,
          corrected_at: correctedSeconds !== null ? new Date().toISOString() : null,
          corrected_by: correctedSeconds !== null ? (await supabase.auth.getUser()).data.user?.id : null,
        })
        .eq('id', id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['hours_correction'] });
      queryClient.invalidateQueries({ queryKey: ['logged_time'] });
      toast.success('Uren correctie opgeslagen');
    },
    onError: (error) => {
      toast.error(`Fout bij opslaan: ${error.message}`);
    },
  });

  const formatHours = (seconds: number) => (seconds / 3600).toFixed(2);
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const hasEdits = Object.keys(edits).length > 0;

  const handleSaveAll = async () => {
    for (const [id, edit] of Object.entries(edits)) {
      await updateMutation.mutateAsync({ id, correctedSeconds: edit.seconds, note: edit.note });
    }
    setEdits({});
  };

  const handleResetCorrection = (record: LoggedTimeRecord) => {
    setEdits({ ...edits, [record.id]: { seconds: null, note: '' } });
  };

  const totalOriginal = useMemo(() => 
    records?.reduce((sum, r) => sum + r.total_seconds, 0) || 0, [records]);
  const totalEffective = useMemo(() => 
    records?.reduce((sum, r) => {
      const edit = edits[r.id];
      if (edit !== undefined) return sum + (edit.seconds ?? r.total_seconds);
      return sum + (r.corrected_seconds ?? r.total_seconds);
    }, 0) || 0, [records, edits]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!records || records.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock size={24} className="mb-2" />
        <p className="text-sm">Geen gelogde uren voor deze periode.</p>
      </div>
    );
  }

  return (
    <div className="bg-card rounded-xl border border-border shadow-sm">
      <div className="flex items-center justify-between p-4 border-b border-border">
        <div>
          <h3 className="font-bold text-foreground flex items-center gap-2">
            <Clock size={18} /> Urencorrectie
          </h3>
          <p className="text-xs text-muted-foreground mt-1">
            Pas gelogde uren aan per dag. Laat leeg om de originele waarde te gebruiken.
          </p>
        </div>
        {hasEdits && (
          <Button onClick={handleSaveAll} disabled={updateMutation.isPending} size="sm" className="flex items-center gap-2">
            {updateMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
            Opslaan
          </Button>
        )}
      </div>

      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Datum</TableHead>
              <TableHead className="text-right">Origineel (uur)</TableHead>
              <TableHead className="text-right">Gecorrigeerd (uur)</TableHead>
              <TableHead className="text-right">Verschil</TableHead>
              <TableHead>Notitie</TableHead>
              <TableHead className="w-10"></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {records.map((record) => {
              const edit = edits[record.id];
              const effectiveSeconds = edit !== undefined 
                ? (edit.seconds ?? record.total_seconds) 
                : (record.corrected_seconds ?? record.total_seconds);
              const diff = effectiveSeconds - record.total_seconds;
              const hasCorrectionActive = (edit !== undefined ? edit.seconds !== null : record.corrected_seconds !== null);
              const currentNote = edit !== undefined ? edit.note : (record.correction_note || '');

              return (
                <TableRow key={record.id} className={hasCorrectionActive ? 'bg-primary/5' : ''}>
                  <TableCell className="font-medium text-sm">{formatDate(record.date)}</TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatHours(record.total_seconds)}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.25"
                      className="w-24 text-right font-mono text-sm ml-auto"
                      placeholder={formatHours(record.total_seconds)}
                      value={edit !== undefined 
                        ? (edit.seconds !== null ? (edit.seconds / 3600).toString() : '') 
                        : (record.corrected_seconds !== null ? (record.corrected_seconds / 3600).toString() : '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        const seconds = val ? Math.round(parseFloat(val) * 3600) : null;
                        setEdits({ ...edits, [record.id]: { seconds, note: currentNote } });
                      }}
                    />
                  </TableCell>
                  <TableCell className={`text-right font-mono text-sm ${diff > 0 ? 'text-green-600' : diff < 0 ? 'text-red-600' : 'text-muted-foreground'}`}>
                    {diff !== 0 ? `${diff > 0 ? '+' : ''}${formatHours(diff)}` : '-'}
                  </TableCell>
                  <TableCell>
                    <Input
                      className="text-xs"
                      placeholder="Reden correctie..."
                      value={currentNote}
                      onChange={(e) => {
                        setEdits({ ...edits, [record.id]: { seconds: edit?.seconds ?? record.corrected_seconds, note: e.target.value } });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {hasCorrectionActive && (
                      <Button variant="ghost" size="sm" onClick={() => handleResetCorrection(record)} title="Correctie verwijderen">
                        <RotateCcw size={14} />
                      </Button>
                    )}
                  </TableCell>
                </TableRow>
              );
            })}
            <TableRow className="bg-muted/50 font-bold">
              <TableCell>Totaal</TableCell>
              <TableCell className="text-right font-mono">{formatHours(totalOriginal)}</TableCell>
              <TableCell className="text-right font-mono">{formatHours(totalEffective)}</TableCell>
              <TableCell className={`text-right font-mono ${totalEffective - totalOriginal > 0 ? 'text-green-600' : totalEffective - totalOriginal < 0 ? 'text-red-600' : ''}`}>
                {totalEffective !== totalOriginal ? `${totalEffective > totalOriginal ? '+' : ''}${formatHours(totalEffective - totalOriginal)}` : '-'}
              </TableCell>
              <TableCell colSpan={2}></TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
      
      {records.some(r => r.corrected_seconds !== null) && (
        <div className="p-3 border-t border-border bg-muted/30">
          <div className="flex items-start gap-2 text-xs text-muted-foreground">
            <AlertTriangle size={14} className="mt-0.5 flex-shrink-0" />
            <span>Gemarkeerde rijen hebben een actieve correctie. De gecorrigeerde waarden worden gebruikt in alle rapportages.</span>
          </div>
        </div>
      )}
    </div>
  );
};
