import { useState, useMemo } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Loader2, Save, RotateCcw, Clock, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import { friendlyError } from '@/lib/friendlyError';
import { HoursSource } from '@/types/database';
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
  // Urenbron uit mapping_config.hours_source. Bepaalt of een dag gelogde tijd
  // toont, terugvalt op gesprekstijd, of beide combineert. Default 'auto'.
  hoursSource?: HoursSource;
}

// Eén rij per dag uit de RPC get_daily_hours_breakdown.
interface BreakdownRow {
  day: string;                       // 'YYYY-MM-DD'
  row_id: string | null;             // daily_logged_time.id (null = nog geen logtijd-rij)
  logged_seconds: number | null;     // daily_logged_time.total_seconds
  corrected_seconds: number | null;  // daily_logged_time.corrected_seconds
  gesprekstijd_seconds: number;      // SUM(call_records.gesprekstijd_sec)
}

// Verwerkte weergave-rij voor de tabel.
interface DisplayRow {
  day: string;
  rowId: string | null;
  baselineSeconds: number;           // "origineel" — afhankelijk van hoursSource
  correctedSeconds: number | null;   // persisted correctie
  isFallback: boolean;               // geen echte logtijd-rij → uit gesprekstijd
}

export const HoursCorrection = ({ projectId, startDate, endDate, hoursSource = 'auto' }: HoursCorrectionProps) => {
  const queryClient = useQueryClient();
  // Edits gekeyed op datum (fallback-dagen hebben nog geen row id).
  const [edits, setEdits] = useState<Record<string, { seconds: number | null; note: string }>>({});

  const { data: breakdown, isLoading } = useQuery({
    queryKey: ['daily_hours_breakdown', projectId, startDate, endDate],
    queryFn: async () => {
      const { data, error } = await supabase.rpc('get_daily_hours_breakdown', {
        p_project_id: projectId,
        p_start: startDate,
        p_end: endDate,
      });
      if (error) throw error;
      return (data ?? []) as BreakdownRow[];
    },
    enabled: !!projectId && !!startDate && !!endDate,
  });

  // Bouw de zichtbare rijen op basis van de gekozen urenbron.
  const displayRows = useMemo<DisplayRow[]>(() => {
    const out: DisplayRow[] = [];
    for (const r of breakdown ?? []) {
      const hasLogged = r.row_id != null;
      const talk = Number(r.gesprekstijd_seconds ?? 0);
      const logged = r.logged_seconds ?? 0;

      let include = false;
      let baseline = 0;
      if (hoursSource === 'logged') {
        include = hasLogged;
        baseline = logged;
      } else if (hoursSource === 'gesprekstijd') {
        include = talk > 0 || hasLogged;
        baseline = talk > 0 ? talk : logged;
      } else {
        // auto: logtijd waar die er is, anders gesprekstijd
        include = hasLogged || talk > 0;
        baseline = hasLogged ? logged : talk;
      }
      if (!include) continue;

      out.push({
        day: r.day,
        rowId: r.row_id,
        baselineSeconds: baseline,
        correctedSeconds: r.corrected_seconds,
        isFallback: !hasLogged,
      });
    }
    return out;
  }, [breakdown, hoursSource]);

  const saveMutation = useMutation({
    mutationFn: async ({ day, rowId, baselineSeconds, correctedSeconds, note }: {
      day: string;
      rowId: string | null;
      baselineSeconds: number;
      correctedSeconds: number | null;
      note: string;
    }) => {
      // Niets te persisteren voor een fallback-dag zonder correctie → geen lege rij aanmaken.
      if (!rowId && correctedSeconds === null) return;

      const userId = (await supabase.auth.getUser()).data.user?.id ?? null;
      const correctedAt = correctedSeconds !== null ? new Date().toISOString() : null;
      const correctedBy = correctedSeconds !== null ? userId : null;

      if (rowId) {
        // Bestaande logtijd-rij: alleen correctie-velden bijwerken (total_seconds blijft van de sync).
        const { error } = await supabase
          .from('daily_logged_time')
          .update({
            corrected_seconds: correctedSeconds,
            correction_note: note || null,
            corrected_at: correctedAt,
            corrected_by: correctedBy,
          })
          .eq('id', rowId);
        if (error) throw error;
      } else {
        // Fallback-dag: maak een rij met de gesprekstijd als origineel (total_seconds).
        const { error } = await supabase
          .from('daily_logged_time')
          .upsert({
            project_id: projectId,
            date: day,
            total_seconds: baselineSeconds,
            corrected_seconds: correctedSeconds,
            correction_note: note || null,
            corrected_at: correctedAt,
            corrected_by: correctedBy,
          }, { onConflict: 'project_id,date' });
        if (error) throw error;
      }
    },
    onError: (error) => {
      toast.error(friendlyError(error, 'De urencorrectie kon niet opgeslagen worden.'));
    },
  });

  const formatHours = (seconds: number) => (seconds / 3600).toFixed(2);
  const formatDate = (dateStr: string) => {
    const date = new Date(dateStr);
    return date.toLocaleDateString('nl-NL', { weekday: 'short', day: 'numeric', month: 'short' });
  };

  const hasEdits = Object.keys(edits).length > 0;

  const handleSaveAll = async () => {
    for (const [day, edit] of Object.entries(edits)) {
      const row = displayRows.find((r) => r.day === day);
      if (!row) continue;
      await saveMutation.mutateAsync({
        day,
        rowId: row.rowId,
        baselineSeconds: row.baselineSeconds,
        correctedSeconds: edit.seconds,
        note: edit.note,
      });
    }
    setEdits({});
    queryClient.invalidateQueries({ queryKey: ['daily_hours_breakdown'] });
    queryClient.invalidateQueries({ queryKey: ['logged_time'] });
    toast.success('Uren correctie opgeslagen');
  };

  const handleResetCorrection = (row: DisplayRow) => {
    setEdits({ ...edits, [row.day]: { seconds: null, note: '' } });
  };

  const totalOriginal = useMemo(
    () => displayRows.reduce((sum, r) => sum + r.baselineSeconds, 0),
    [displayRows]
  );
  const totalEffective = useMemo(
    () => displayRows.reduce((sum, r) => {
      const edit = edits[r.day];
      if (edit !== undefined) return sum + (edit.seconds ?? r.baselineSeconds);
      return sum + (r.correctedSeconds ?? r.baselineSeconds);
    }, 0),
    [displayRows, edits]
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (displayRows.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-8 text-muted-foreground">
        <Clock size={24} className="mb-2" />
        <p className="text-sm">Geen gelogde uren of gesprekstijd voor deze periode.</p>
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
            Pas gelogde uren aan per dag. Laat leeg om de originele waarde te gebruiken. Dagen gemarkeerd met "uit gesprekstijd" hebben geen gelogde tijd — de beltijd wordt als basis getoond.
          </p>
        </div>
        {hasEdits && (
          <Button onClick={handleSaveAll} disabled={saveMutation.isPending} size="sm" className="flex items-center gap-2">
            {saveMutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Save size={14} />}
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
            {displayRows.map((row) => {
              const edit = edits[row.day];
              const effectiveSeconds = edit !== undefined
                ? (edit.seconds ?? row.baselineSeconds)
                : (row.correctedSeconds ?? row.baselineSeconds);
              const diff = effectiveSeconds - row.baselineSeconds;
              const hasCorrectionActive = (edit !== undefined ? edit.seconds !== null : row.correctedSeconds !== null);
              const currentNote = edit !== undefined ? edit.note : '';

              return (
                <TableRow key={row.day} className={hasCorrectionActive ? 'bg-primary/5' : ''}>
                  <TableCell className="font-medium text-sm">
                    <div className="flex items-center gap-2">
                      {formatDate(row.day)}
                      {row.isFallback && (
                        <Badge variant="outline" className="text-[10px] font-normal text-muted-foreground">uit gesprekstijd</Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{formatHours(row.baselineSeconds)}</TableCell>
                  <TableCell className="text-right">
                    <Input
                      type="number"
                      step="0.25"
                      className="w-24 text-right font-mono text-sm ml-auto"
                      placeholder={formatHours(row.baselineSeconds)}
                      value={edit !== undefined
                        ? (edit.seconds !== null ? (edit.seconds / 3600).toString() : '')
                        : (row.correctedSeconds !== null ? (row.correctedSeconds / 3600).toString() : '')}
                      onChange={(e) => {
                        const val = e.target.value;
                        const seconds = val ? Math.round(parseFloat(val) * 3600) : null;
                        setEdits({ ...edits, [row.day]: { seconds, note: currentNote } });
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
                        setEdits({ ...edits, [row.day]: { seconds: edit?.seconds ?? row.correctedSeconds, note: e.target.value } });
                      }}
                    />
                  </TableCell>
                  <TableCell>
                    {hasCorrectionActive && (
                      <Button variant="ghost" size="sm" onClick={() => handleResetCorrection(row)} title="Correctie verwijderen">
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

      {displayRows.some((r) => r.correctedSeconds !== null) && (
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
